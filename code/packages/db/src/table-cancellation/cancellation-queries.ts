import { Prisma } from '../../prisma/generated/prisma'
import type { PrismaClient, TableSlotStatus } from '../../prisma/generated/prisma'
import {
  CancellationStatus,
  TableSetStatus
} from '../../prisma/generated/prisma'
import type { QueryResult } from '../types'
import {
  type ActiveTableSetSummary,
  type CancellationValidationInput,
  type CreateCancellationRequestParams,
  type CreatedCancellationRequest,
  type ReservationCancellationSnapshot
} from './types'

function getClient(prisma: PrismaClient, tx?: Prisma.TransactionClient) {
  return tx ?? prisma
}

function parseOriginalStatuses(originalStatuses: Prisma.JsonValue): Record<number, TableSlotStatus> {
  const parsed: Record<number, TableSlotStatus> = {}
  if (!originalStatuses || typeof originalStatuses !== 'object') {
    return parsed
  }

  const entries = Object.entries(originalStatuses as Record<string, unknown>)
  for (const [slotIdRaw, statusValue] of entries) {
    const slotId = Number(slotIdRaw)
    if (!Number.isFinite(slotId)) {
      continue
    }

    if (typeof statusValue === 'string') {
      parsed[slotId] = statusValue as TableSlotStatus
    }
  }

  return parsed
}

function mapActiveTableSet(tableSet: {
  id: number
  status: TableSetStatus
  slotIds: number[]
  tableIds: number[]
  primaryTableId: number
  originalStatuses: Prisma.JsonValue
  combinedCapacity: number
} | null): ActiveTableSetSummary | undefined {
  if (!tableSet) {
    return undefined
  }

  return {
    id: tableSet.id,
    status: tableSet.status,
    slotIds: tableSet.slotIds,
    tableIds: tableSet.tableIds,
    primaryTableId: tableSet.primaryTableId,
    originalStatuses: parseOriginalStatuses(tableSet.originalStatuses),
    combinedCapacity: tableSet.combinedCapacity
  }
}

export class CancellationQueries {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Load reservation context required for cancellation validation.
   */
  async getReservationSnapshot(
    input: CancellationValidationInput,
    tx?: Prisma.TransactionClient
  ): Promise<QueryResult<ReservationCancellationSnapshot>> {
    if (tx) {
      return this.getReservationSnapshotInternal(tx, input)
    }

    return this.prisma.$transaction(transaction =>
      this.getReservationSnapshotInternal(transaction, input)
    )
  }

  private async getReservationSnapshotInternal(
    client: Prisma.TransactionClient,
    input: CancellationValidationInput
  ): Promise<QueryResult<ReservationCancellationSnapshot>> {
    try {
      const reservation = await client.reservation.findUnique({
        where: { id: input.reservationId },
        include: {
          tableAssignment: {
            select: {
              slotId: true,
              assignedTableId: true,
              assignedSectionId: true,
              slot: {
                select: {
                  id: true
                }
              }
            }
          },
          tableSets: {
            where: {
              status: {
                in: [TableSetStatus.ACTIVE, TableSetStatus.PENDING_MERGE]
              }
            }
          },
          cancellationRequests: {
            where: {
              status: {
                in: [
                  CancellationStatus.PENDING_REVIEW,
                  CancellationStatus.APPROVED_PENDING_REFUND
                ]
              }
            },
            select: {
              id: true,
              status: true
            }
          },
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true
            }
          },
          restaurant: {
            select: {
              id: true,
              refundPolicies: {
                where: { isActive: true },
                select: {
                  id: true,
                  mealType: true,
                  allowedRefundTypes: true,
                  fullRefundBeforeMinutes: true,
                  partialRefundBeforeMinutes: true,
                  partialRefundPercentage: true
                }
              },
              policies: {
                where: { isActive: true },
                select: {
                  id: true,
                  name: true,
                  isRefundAllowed: true
                }
              }
            }
          }
        }
      })

      if (!reservation) {
        return {
          success: false,
          error: {
            code: 'RESERVATION_NOT_FOUND',
            message: 'Reservation not found for cancellation.'
          }
        }
      }

      const activeTableSet = reservation.tableSets.find(set => set.status === TableSetStatus.ACTIVE) ?? null

      const snapshot: ReservationCancellationSnapshot = {
        id: reservation.id,
        reservationNumber: reservation.reservationNumber,
        restaurantId: reservation.restaurantId,
        status: reservation.status,
        reservationDate: reservation.reservationDate,
        reservationTime: reservation.reservationTime,
        reservationType: reservation.reservationType,
        mealType: reservation.mealType,
        adultCount: reservation.adultCount,
        childCount: reservation.childCount,
        advancePaymentAmount: reservation.advancePaymentAmount,
        totalAmount: reservation.totalAmount,
        customer: reservation.customer,
        restaurantPolicies: reservation.restaurant.policies,
        refundPolicies: reservation.restaurant.refundPolicies,
        tableAssignment: reservation.tableAssignment
          ? {
              slotId: reservation.tableAssignment.slotId,
              assignedTableId: reservation.tableAssignment.assignedTableId,
              assignedSectionId: reservation.tableAssignment.assignedSectionId
            }
          : undefined,
        activeTableSet: mapActiveTableSet(activeTableSet),
        pendingCancellationStatuses: reservation.cancellationRequests.map(request => request.status)
      }

      return {
        success: true,
        data: snapshot
      }
    } catch (error) {
      console.error('❌ Failed to load reservation snapshot for cancellation:', error)
      return {
        success: false,
        error: {
          code: 'RESERVATION_LOOKUP_FAILED',
          message: 'Unable to load reservation for cancellation. Please try again.'
        }
      }
    }
  }

  /**
   * Acquire a row-level lock on the reservation record to prevent concurrent updates.
   */
  async lockReservationForUpdate(
    reservationId: number,
    tx?: Prisma.TransactionClient
  ): Promise<QueryResult<void>> {
    if (!tx) {
      console.error('❌ lockReservationForUpdate invoked without transaction context.')
      return {
        success: false,
        error: {
          code: 'RESERVATION_LOCK_FAILED',
          message: 'Reservation lock requires an active transaction context.'
        }
      }
    }

    const reservation = await tx.$queryRaw<
      Array<{ reservation_id: number }>
    >(Prisma.sql`
      SELECT "reservation_id"
      FROM "reservations"
      WHERE "reservation_id" = ${reservationId}
      FOR UPDATE
    `)

    if (reservation.length === 0) {
      return {
        success: false,
        error: {
          code: 'RESERVATION_LOCK_FAILED',
          message: 'Reservation not found or already cancelled.'
        }
      }
    }

    return { success: true }
  }

  /**
   * Persist cancellation request with computed refund metadata.
   */
  async createCancellationRequest(
    params: CreateCancellationRequestParams,
    tx?: Prisma.TransactionClient
  ): Promise<QueryResult<CreatedCancellationRequest>> {
    if (tx) {
      return this.createCancellationRequestInternal(tx, params)
    }

    return this.prisma.$transaction(transaction =>
      this.createCancellationRequestInternal(transaction, params)
    )
  }

  private async createCancellationRequestInternal(
    client: Prisma.TransactionClient,
    params: CreateCancellationRequestParams
  ): Promise<QueryResult<CreatedCancellationRequest>> {
    try {
      const now = params.processedAt ?? new Date()
      const status = params.refund.amount > 0
        ? CancellationStatus.APPROVED_PENDING_REFUND
        : CancellationStatus.APPROVED_NO_REFUND

      const cancellation = await client.cancellationRequest.create({
        data: {
          reservationId: params.reservationId,
          restaurantId: params.restaurantId,
          requestedBy: params.requestedBy,
          requestedById: params.requestedById,
          reason: params.reason,
          reasonCategory: params.reasonCategory,
          additionalNotes: params.additionalNotes ?? null,
          status,
          refundAmount: params.refund.amount > 0 ? params.refund.amount : null,
          refundPercentage: params.refund.percentage,
          refundNotes: params.refund.reason ?? null,
          windowType: params.refund.windowType,
          tableSetId: params.tableSetId ?? null,
          mergedTableCount: params.mergedTableCount,
          releasedSlotIds: params.releasedSlotIds,
          slotReleaseCompletedAt: params.releasedSlotIds.length > 0 ? now : null,
          processedAt: now,
          processedBy: params.processedBy
        },
        select: {
          id: true,
          reservationId: true,
          refundAmount: true,
          status: true,
          windowType: true,
          mergedTableCount: true,
          releasedSlotIds: true
        }
      })

      return {
        success: true,
        data: {
          ...cancellation,
          refundAmount: cancellation.refundAmount ? Number(cancellation.refundAmount) : null
        }
      }
    } catch (error) {
      console.error('❌ Failed to create cancellation request:', error)
      return {
        success: false,
        error: {
          code: 'CANCELLATION_REQUEST_FAILED',
          message: 'Unable to create cancellation request. Please try again.'
        }
      }
    }
  }

  /**
   * Update reservation status after cancellation processing.
   */
  async updateReservationStatus(
    reservationId: number,
    status: string,
    tx?: Prisma.TransactionClient,
    expectedStatus?: string
  ): Promise<QueryResult<void>> {
    if (tx) {
      return this.updateReservationStatusInternal(tx, reservationId, status, expectedStatus)
    }

    return this.prisma.$transaction(transaction =>
      this.updateReservationStatusInternal(transaction, reservationId, status, expectedStatus)
    )
  }

  private async updateReservationStatusInternal(
    client: Prisma.TransactionClient,
    reservationId: number,
    status: string,
    expectedStatus?: string
  ): Promise<QueryResult<void>> {
    try {
      const result = await client.reservation.updateMany({
        where: {
          id: reservationId,
          ...(expectedStatus ? { status: expectedStatus } : {})
        },
        data: { status }
      })

      if (result.count === 0) {
        return {
          success: false,
          error: {
            code: expectedStatus ? 'RESERVATION_STATUS_CONFLICT' : 'RESERVATION_STATUS_UPDATE_FAILED',
            message: expectedStatus
              ? `Reservation status changed from ${expectedStatus}. Please refresh and try again.`
              : 'Unable to update reservation status during cancellation.'
          }
        }
      }

      return { success: true }
    } catch (error) {
      console.error('❌ Failed to update reservation status during cancellation:', error)
      return {
        success: false,
        error: {
          code: 'RESERVATION_STATUS_UPDATE_FAILED',
          message: 'Unable to update reservation status during cancellation.'
        }
      }
    }
  }

  /**
   * Get basic reservation information for cancellation authorization
   * Returns minimal fields needed to validate ownership and determine userId
   */
  async getReservationBasicInfo(
    reservationId: number,
    tx?: Prisma.TransactionClient
  ): Promise<QueryResult<{
    id: number
    customerId: number
    createdBy: string
    reservationType: string
  }>> {
    try {
      const client = getClient(this.prisma, tx)

      const reservation = await client.reservation.findUnique({
        where: { id: reservationId },
        select: {
          id: true,
          customerId: true,
          createdBy: true,
          reservationType: true
        }
      })

      if (!reservation) {
        return {
          success: false,
          error: {
            code: 'RESERVATION_NOT_FOUND',
            message: `Reservation with ID ${reservationId} not found`
          }
        }
      }

      return {
        success: true,
        data: {
          id: reservation.id,
          customerId: reservation.customerId,
          createdBy: reservation.createdBy,
          reservationType: reservation.reservationType
        }
      }
    } catch (error) {
      console.error('❌ Failed to get reservation basic info:', error)
      return {
        success: false,
        error: {
          code: 'QUERY_FAILED',
          message: 'Failed to fetch reservation information'
        }
      }
    }
  }

  /**
   * Get reservation details for merchant cancellation display
   * Returns full reservation information for merchant portal UI
   */
  async getReservationForMerchantCancellation(
    reservationId: number,
    restaurantId: number,
    tx?: Prisma.TransactionClient
  ): Promise<QueryResult<{
    id: number
    reservationNumber: string
    customerName: string
    customerEmail: string | null
    customerPhone: string
    reservationDate: string
    reservationTime: string
    adultCount: number
    childCount: number
    totalAmount: number
    advancePaymentAmount: number | null
    status: string
    restaurantName: string
    merchantEmail: string | null
  }>> {
    try {
      const client = getClient(this.prisma, tx)

      const reservation = await client.reservation.findFirst({
        where: {
          id: reservationId,
          restaurantId,
          reservationType: 'TABLE_ONLY'
        },
        include: {
          customer: true,
          restaurant: {
            include: {
              business: true
            }
          }
        }
      })

      if (!reservation) {
        return {
          success: false,
          error: {
            code: 'RESERVATION_NOT_FOUND',
            message: 'Reservation not found or access denied'
          }
        }
      }

      const reservationDateStr = reservation.reservationDate.toISOString().split('T')[0] || ''
      const reservationTimeStr = reservation.reservationTime 
        ? reservation.reservationTime.toISOString().split('T')[1]?.substring(0, 5) || '00:00'
        : '00:00'

      return {
        success: true,
        data: {
          id: reservation.id,
          reservationNumber: reservation.reservationNumber,
          customerName: `${reservation.customer.firstName} ${reservation.customer.lastName}`,
          customerEmail: reservation.customer.email,
          customerPhone: reservation.customer.phone,
          reservationDate: reservationDateStr,
          reservationTime: reservationTimeStr,
          adultCount: reservation.adultCount,
          childCount: reservation.childCount,
          totalAmount: Number(reservation.totalAmount),
          advancePaymentAmount: reservation.advancePaymentAmount ? Number(reservation.advancePaymentAmount) : null,
          status: reservation.status,
          restaurantName: reservation.restaurant.name,
          merchantEmail: reservation.restaurant.business.email
        }
      }
    } catch (error) {
      console.error('❌ Failed to get reservation for merchant cancellation:', error)
      return {
        success: false,
        error: {
          code: 'QUERY_FAILED',
          message: 'Failed to fetch reservation information'
        }
      }
    }
  }
}
