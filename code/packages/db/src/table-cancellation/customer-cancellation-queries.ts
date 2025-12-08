import type { Prisma, PrismaClient } from '../../prisma/generated/prisma'
import type { QueryResult } from '../types'

/**
 * Reservation details for customer cancellation preview
 * Includes ReservationBusinessPolicy data for refund restrictions
 */
export interface CancellationReservationDetails {
  id: number
  reservationNumber: string
  restaurantId: number
  customerId: number
  status: string
  reservationDate: Date
  reservationTime: Date
  totalAmount: Prisma.Decimal
  remainingPaymentAmount: Prisma.Decimal | null
  reservationType: string
  mealType: string
  adultCount: number
  childCount: number
  advancePaymentAmount: Prisma.Decimal | null
  restaurant: {
    id: number
    name: string
    business?: {
      email: string
    } | null
    refundPolicies: Array<{
      id: number
      mealType: string
      allowedRefundTypes: string[]
      fullRefundBeforeMinutes: number
      partialRefundBeforeMinutes: number | null
      partialRefundPercentage: number | null
      isActive: boolean
    }>
    policies: Array<{
      id: number
      name: string
      isRefundAllowed: boolean
    }>
  }
  customer: {
    id: number
    firstName: string
    lastName: string
    email: string | null
    phone: string
  }
  tableAssignment?: {
    slotId: number | null
    assignedTableId: number | null
    assignedSectionId: number | null
    slot?: {
      id: number
      table?: {
        id: number
        tableName: string
        section?: {
          id: number
          sectionName: string
        } | null
      } | null
    } | null
  } | null
  tableSets: Array<{
    id: number
    status: string
    tableIds: number[]
    slotIds: number[]
    primaryTableId: number
    originalStatuses: Prisma.JsonValue
    combinedCapacity: number
  }>
  cancellationRequests?: Array<{
    id: number
    status: string
  }>
}

/**
 * Get reservation details for customer cancellation with authorization check
 */
export async function getReservationForCustomerCancellation(
  prisma: PrismaClient,
  params: {
    reservationId: number
    customerId?: number
  },
  tx?: Prisma.TransactionClient
): Promise<CancellationReservationDetails | null> {
  try {
    const client = tx ?? prisma

    const whereClause: Prisma.ReservationWhereInput = {
      id: params.reservationId,
      ...(params.customerId !== undefined ? { customerId: params.customerId } : {})
    }

    const reservation = await client.reservation.findFirst({
      where: whereClause,
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            business: {
              select: {
                email: true
              }
            },
            refundPolicies: {
              where: {
                isActive: true
              },
              select: {
                id: true,
                mealType: true,
                allowedRefundTypes: true,
                fullRefundBeforeMinutes: true,
                partialRefundBeforeMinutes: true,
                partialRefundPercentage: true,
                isActive: true
              }
            },
            policies: {
              where: {
                isActive: true
              },
              select: {
                id: true,
                name: true,
                isRefundAllowed: true
              }
            }
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
        tableAssignment: {
          select: {
            slotId: true,
            assignedTableId: true,
            assignedSectionId: true,
            slot: {
              select: {
                id: true,
                table: {
                  select: {
                    id: true,
                    tableName: true,
                    section: {
                      select: {
                        id: true,
                        sectionName: true
                      }
                    }
                  }
                }
              }
            }
          }
        },
        tableSets: {
          where: {
            status: {
              in: ['ACTIVE', 'PENDING_MERGE']
            }
          },
          select: {
            id: true,
            status: true,
            tableIds: true,
            slotIds: true,
            primaryTableId: true,
            originalStatuses: true,
            combinedCapacity: true
          }
        },
        cancellationRequests: {
          where: {
            status: {
              in: ['PENDING_REVIEW', 'APPROVED_PENDING_REFUND']
            }
          },
          select: {
            id: true,
            status: true
          }
        }
      }
    })

    return reservation as CancellationReservationDetails | null
  } catch (error) {
    console.error('❌ Failed to get reservation for customer cancellation:', error)
    return null
  }
}
