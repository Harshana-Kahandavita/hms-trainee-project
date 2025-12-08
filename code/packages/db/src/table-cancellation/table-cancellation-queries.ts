import Decimal from 'decimal.js'
import { differenceInMinutes } from 'date-fns'
import type { Prisma, PrismaClient } from '../../prisma/generated/prisma'
import {
  CancellationWindowType,
  RefundType
} from '../../prisma/generated/prisma'
import type { QueryResult } from '../types'
import { CancellationQueries } from './cancellation-queries'
import { TableMergeOperations } from './table-merge-operations'
import {
  type CancellationValidationData,
  type CancellationValidationInput,
  type CreateCancellationRequestParams,
  type CreatedCancellationRequest,
  type RefundCalculationInput,
  type RefundQuote,
  type ReleaseMergedTableSlotsParams,
  type ReleaseSingleTableSlotParams,
  type ReservationCancellationSnapshot
} from './types'

interface TableCancellationDependencies {
  queries?: CancellationQueries
  tableMergeOperations?: TableMergeOperations
}

function combineReservationDateTime(date: Date, time: Date): Date {
  const isoDate = date.toISOString().split('T')[0]
  const timePart = time.toISOString().split('T')[1]
  return new Date(`${isoDate}T${timePart}`)
}

function hasPendingCancellation(statuses: string[]): boolean {
  return statuses.length > 0
}

function isRefundAllowedByPolicy(policies: ReservationCancellationSnapshot['restaurantPolicies']): {
  allowed: boolean
  blockingPolicyId?: number
} {
  const blockingPolicy = policies.find(policy => policy.isRefundAllowed === false)
  return {
    allowed: !blockingPolicy,
    blockingPolicyId: blockingPolicy?.id
  }
}

export class TableCancellationOrchestrator {
  private readonly queries: CancellationQueries
  private readonly tableMergeOperations: TableMergeOperations

  constructor(
    private readonly prisma: PrismaClient,
    dependencies: TableCancellationDependencies = {}
  ) {
    this.queries = dependencies.queries ?? new CancellationQueries(prisma)
    this.tableMergeOperations = dependencies.tableMergeOperations ?? new TableMergeOperations(prisma)
  }

  /**
   * Validate reservation cancellation eligibility based on core business rules.
   */
  async validateCancellation(
    input: CancellationValidationInput,
    tx?: Prisma.TransactionClient
  ): Promise<QueryResult<CancellationValidationData>> {
    const snapshotResult = await this.queries.getReservationSnapshot(input, tx)

    if (!snapshotResult.success || !snapshotResult.data) {
      return {
        success: false,
        error: snapshotResult.error ?? {
          code: 'CANCELLATION_VALIDATION_FAILED',
          message: 'Unable to load reservation context for cancellation.'
        }
      }
    }

    const snapshot = snapshotResult.data

    if (snapshot.status === 'CANCELLED') {
      return {
        success: false,
        error: {
          code: 'RESERVATION_ALREADY_CANCELLED',
          message: 'Reservation has already been cancelled.'
        }
      }
    }

    // Allow cancellations for CONFIRMED and SEATED statuses
    // Block COMPLETED and CANCELLED (CANCELLED already checked above)
    const allowedStatuses = ['CONFIRMED', 'SEATED']
    if (!allowedStatuses.includes(snapshot.status)) {
      return {
        success: false,
        error: {
          code: 'RESERVATION_NOT_CANCELLABLE',
          message: `Only ${allowedStatuses.join(' or ').toLowerCase()} reservations can be cancelled. Current status: ${snapshot.status}`
        }
      }
    }

    const reservationDateTime = combineReservationDateTime(
      snapshot.reservationDate,
      snapshot.reservationTime
    )
    const referenceTime = input.referenceTime ?? new Date()

    if (reservationDateTime <= referenceTime) {
      return {
        success: false,
        error: {
          code: 'RESERVATION_IN_PAST',
          message: 'Reservation start time has already passed.'
        }
      }
    }

    if (hasPendingCancellation(snapshot.pendingCancellationStatuses)) {
      return {
        success: false,
        error: {
          code: 'PENDING_CANCELLATION_EXISTS',
          message: 'Reservation already has a pending cancellation request.'
        }
      }
    }

    // Note: We don't validate table set status during cancellation validation
    // Table sets (merged or pending) will be dissolved during the cancellation process
    // No need to check if primary table matches - cancellation should work regardless

    return {
      success: true,
      data: {
        snapshot,
        reservationDateTime
      }
    }
  }

  /**
   * Apply three-tier refund logic using advance payment, business policy, and refund windows.
   */
  async calculateRefund(
    input: RefundCalculationInput
  ): Promise<QueryResult<RefundQuote>> {
    const { validation } = input
    const referenceTime = input.referenceTime ?? new Date()
    const snapshot = validation.snapshot
    
    // For table reservations, use totalAmount instead of advancePaymentAmount
    // For buffet reservations, continue using advancePaymentAmount
    const isTableReservation = snapshot.reservationType === 'TABLE_ONLY'
    const refundableAmount = isTableReservation
      ? new Decimal(snapshot.totalAmount.toString())
      : snapshot.advancePaymentAmount
        ? new Decimal(snapshot.advancePaymentAmount.toString())
        : new Decimal(0)

    if (refundableAmount.lte(0)) {
      return {
        success: true,
        data: {
          windowType: CancellationWindowType.NO_REFUND,
          percentage: 0,
          amount: 0,
          minutesUntilReservation: Math.max(0, differenceInMinutes(validation.reservationDateTime, referenceTime)),
          isRefundAllowed: false,
          reason: isTableReservation ? 'NO_TOTAL_AMOUNT_COLLECTED' : 'NO_ADVANCE_PAYMENT_COLLECTED'
        }
      }
    }

    const policyGate = isRefundAllowedByPolicy(snapshot.restaurantPolicies)
    if (!policyGate.allowed) {
      return {
        success: true,
        data: {
          windowType: CancellationWindowType.NO_REFUND,
          percentage: 0,
          amount: 0,
          minutesUntilReservation: Math.max(0, differenceInMinutes(validation.reservationDateTime, referenceTime)),
          isRefundAllowed: false,
          policyId: policyGate.blockingPolicyId,
          reason: 'REFUND_DISABLED_BY_POLICY'
        }
      }
    }

    // For table reservations, use the first available refund policy (not filtered by mealType)
    // This follows the requirement that table reservations should not consider mealType for RestaurantRefundPolicy
    const refundPolicy = snapshot.refundPolicies[0]
    const minutesUntilReservation = Math.max(0, differenceInMinutes(validation.reservationDateTime, referenceTime))

    if (!refundPolicy) {
      return {
        success: true,
        data: {
          windowType: CancellationWindowType.NO_REFUND,
          percentage: 0,
          amount: 0,
          minutesUntilReservation,
          isRefundAllowed: true,
          reason: 'REFUND_POLICY_NOT_FOUND'
        }
      }
    }

    if (
      refundPolicy.allowedRefundTypes.includes(RefundType.FULL) &&
      minutesUntilReservation >= refundPolicy.fullRefundBeforeMinutes
    ) {
      return {
        success: true,
        data: {
          windowType: CancellationWindowType.FREE,
          percentage: 100,
          amount: Number(refundableAmount.toFixed(2)),
          minutesUntilReservation,
          isRefundAllowed: true,
          policyId: refundPolicy.id
        }
      }
    }

    if (
      refundPolicy.allowedRefundTypes.includes(RefundType.PARTIAL) &&
      refundPolicy.partialRefundBeforeMinutes !== null &&
      refundPolicy.partialRefundPercentage !== null &&
      minutesUntilReservation >= refundPolicy.partialRefundBeforeMinutes
    ) {
      const percentage = refundPolicy.partialRefundPercentage
      const amount = refundableAmount.mul(percentage).div(100)

      return {
        success: true,
        data: {
          windowType: CancellationWindowType.PARTIAL,
          percentage,
          amount: Number(amount.toFixed(2)),
          minutesUntilReservation,
          isRefundAllowed: true,
          policyId: refundPolicy.id
        }
      }
    }

    return {
      success: true,
      data: {
        windowType: CancellationWindowType.NO_REFUND,
        percentage: 0,
        amount: 0,
        minutesUntilReservation,
        isRefundAllowed: true,
        policyId: refundPolicy.id,
        reason: 'OUTSIDE_REFUND_WINDOW'
      }
    }
  }

  /**
   * Release single table slot for non-merged reservations.
   */
  async releaseSingleTableSlot(
    params: ReleaseSingleTableSlotParams,
    tx?: Prisma.TransactionClient
  ) {
    return this.tableMergeOperations.releaseSingleSlot(params, tx)
  }

  /**
   * Release merged table slots and dissolve the active table set.
   */
  async releaseMergedTableSlots(
    params: ReleaseMergedTableSlotsParams,
    tx?: Prisma.TransactionClient
  ) {
    return this.tableMergeOperations.dissolveActiveSet(params, tx)
  }

  /**
   * Persist cancellation request record with refund info and table set metadata.
   */
  async createCancellationRequest(
    params: CreateCancellationRequestParams,
    tx?: Prisma.TransactionClient
  ): Promise<QueryResult<CreatedCancellationRequest>> {
    return this.queries.createCancellationRequest(params, tx)
  }

  /**
   * Update reservation status after successful cancellation.
   */
  async updateReservationStatus(
    reservationId: number,
    status: string,
    tx: Prisma.TransactionClient | undefined,
    expectedStatus?: string
  ): Promise<QueryResult<void>> {
    return this.queries.updateReservationStatus(reservationId, status, tx, expectedStatus)
  }
}

export interface ReservationTransactionReferences {
  paymentTransactionReference: string | null
  refundTransactionReference: string | null
}

const TRANSACTION_REFERENCE_NULLS: ReservationTransactionReferences = {
  paymentTransactionReference: null,
  refundTransactionReference: null
}

async function fetchReservationIdentifiers(
  prisma: PrismaClient,
  where: { id: number } | { reservationNumber: string }
) {
  return prisma.reservation.findFirst({
    where,
    select: {
      id: true,
      requestId: true
    }
  })
}

async function resolveReservationTransactionReferences(
  prisma: PrismaClient,
  identifiers: { reservationId: number; requestId: number | null }
): Promise<ReservationTransactionReferences> {
  const [reservationPayment, requestPayment, refund] = await Promise.all([
    prisma.reservationPayment.findFirst({
      where: { reservationId: identifiers.reservationId },
      orderBy: { paymentDate: 'desc' },
      select: { transactionReference: true }
    }),
    identifiers.requestId
      ? prisma.reservationRequestPayment.findFirst({
          where: { requestId: identifiers.requestId },
          orderBy: { paymentInitiatedAt: 'desc' },
          select: { transactionReference: true }
        })
      : Promise.resolve<{ transactionReference: string | null } | null>(null),
    prisma.refundTransaction.findFirst({
      where: { reservationId: identifiers.reservationId },
      orderBy: { createdAt: 'desc' },
      select: { transactionReference: true }
    })
  ])

  const paymentTransactionReference =
    reservationPayment?.transactionReference?.trim() ||
    requestPayment?.transactionReference?.trim() ||
    null

  return {
    paymentTransactionReference,
    refundTransactionReference: refund?.transactionReference?.trim() ?? null
  }
}

export async function getReservationTransactionReferences(
  prisma: PrismaClient,
  reservationId: number
): Promise<ReservationTransactionReferences> {
  const reservation = await fetchReservationIdentifiers(prisma, { id: reservationId })

  if (!reservation) {
    return TRANSACTION_REFERENCE_NULLS
  }

  return resolveReservationTransactionReferences(prisma, {
    reservationId: reservation.id,
    requestId: reservation.requestId
  })
}

export async function getReservationTransactionReferencesByNumber(
  prisma: PrismaClient,
  reservationNumber: string
): Promise<ReservationTransactionReferences> {
  const reservation = await fetchReservationIdentifiers(prisma, { reservationNumber })

  if (!reservation) {
    return TRANSACTION_REFERENCE_NULLS
  }

  return resolveReservationTransactionReferences(prisma, {
    reservationId: reservation.id,
    requestId: reservation.requestId
  })
}

export function createTableCancellationOrchestrator(
  prisma: PrismaClient,
  dependencies: TableCancellationDependencies = {}
) {
  return new TableCancellationOrchestrator(prisma, dependencies)
}

export type { CancellationValidationData, RefundQuote }
