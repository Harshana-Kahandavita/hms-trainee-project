import Decimal from 'decimal.js'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import type { PrismaClient } from '../../../prisma/generated/prisma'
import { CancellationWindowType, RefundType } from '../../../prisma/generated/prisma'
import { TableCancellationOrchestrator } from '../table-cancellation-queries'
import type {
  CancellationValidationData,
  ReservationCancellationSnapshot
} from '../types'

const prisma = {} as PrismaClient

function createSnapshot(overrides: Partial<ReservationCancellationSnapshot> = {}): ReservationCancellationSnapshot {
  const baseDate = new Date('2025-12-24T00:00:00.000Z')
  const baseTime = new Date('1970-01-01T18:00:00.000Z')

  return {
    id: 1,
    reservationNumber: 'RT-1224-1234',
    restaurantId: 10,
    status: overrides.status ?? 'CONFIRMED',
    reservationDate: overrides.reservationDate ?? baseDate,
    reservationTime: overrides.reservationTime ?? baseTime,
    reservationType: overrides.reservationType ?? 'TABLE_ONLY',
    mealType: overrides.mealType ?? 'DINNER',
    adultCount: overrides.adultCount ?? 2,
    childCount: overrides.childCount ?? 0,
    advancePaymentAmount: overrides.advancePaymentAmount ?? new Decimal(100),
    totalAmount: overrides.totalAmount ?? new Decimal(200),
    customer: overrides.customer ?? {
      id: 44,
      firstName: 'Test',
      lastName: 'Customer',
      email: 'test@example.com',
      phone: '+1234567890'
    },
    restaurantPolicies: overrides.restaurantPolicies ?? [],
    refundPolicies: overrides.refundPolicies ?? [],
    tableAssignment: overrides.tableAssignment ?? {
      slotId: 50,
      assignedTableId: 5,
      assignedSectionId: 3
    },
    activeTableSet: overrides.activeTableSet,
    pendingCancellationStatuses: overrides.pendingCancellationStatuses ?? []
  }
}

function createService(overrides: {
  snapshotResult?: ReservationCancellationSnapshot
} = {}) {
  const getReservationSnapshot = vi.fn()
  if (overrides.snapshotResult) {
    getReservationSnapshot.mockResolvedValue({ success: true, data: overrides.snapshotResult })
  }

  const queries = {
    getReservationSnapshot,
    createCancellationRequest: vi.fn(),
    updateReservationStatus: vi.fn()
  } as unknown as any

  const tableMergeOperations = {
    releaseSingleSlot: vi.fn(),
    dissolveActiveSet: vi.fn()
  } as unknown as any

  const service = new TableCancellationOrchestrator(prisma, { queries, tableMergeOperations })
  return { service, getReservationSnapshot }
}

describe('TableCancellationOrchestrator.validateCancellation', () => {
  it('rejects when reservation status is not CONFIRMED', async () => {
    const snapshot = createSnapshot({ status: 'PENDING' })
    const { service } = createService({ snapshotResult: snapshot })

    const result = await service.validateCancellation({ reservationId: snapshot.id })

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('RESERVATION_NOT_CONFIRMED')
  })

  it('rejects when reservation is in the past', async () => {
    const pastDate = new Date('2024-01-01T00:00:00.000Z')
    const snapshot = createSnapshot({ reservationDate: pastDate })
    const { service, getReservationSnapshot } = createService()
    getReservationSnapshot.mockResolvedValue({ success: true, data: snapshot })

    const result = await service.validateCancellation({
      reservationId: snapshot.id,
      referenceTime: new Date('2025-01-01T00:00:00.000Z')
    })

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('RESERVATION_IN_PAST')
  })

  it('rejects when pending cancellation exists', async () => {
    const snapshot = createSnapshot({ pendingCancellationStatuses: ['PENDING_REVIEW'] })
    const { service } = createService({ snapshotResult: snapshot })

    const result = await service.validateCancellation({ reservationId: snapshot.id })

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('PENDING_CANCELLATION_EXISTS')
  })

  it('rejects when secondary table attempts cancellation', async () => {
    const snapshot = createSnapshot({
      activeTableSet: {
        id: 99,
        status: 'ACTIVE',
        slotIds: [50, 51],
        tableIds: [5, 6],
        primaryTableId: 7,
        originalStatuses: { 50: 'RESERVED', 51: 'AVAILABLE' },
        combinedCapacity: 8
      },
      tableAssignment: {
        slotId: 50,
        assignedTableId: 5,
        assignedSectionId: 3
      }
    })
    const { service } = createService({ snapshotResult: snapshot })

    const result = await service.validateCancellation({ reservationId: snapshot.id })
    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('SECONDARY_TABLE_CANNOT_CANCEL')
  })

  it('passes validation when rules satisfied', async () => {
    const snapshot = createSnapshot()
    const { service } = createService({ snapshotResult: snapshot })

    const result = await service.validateCancellation({ reservationId: snapshot.id })
    expect(result.success).toBe(true)
    expect(result.data?.snapshot.id).toBe(snapshot.id)
  })
})

describe('TableCancellationOrchestrator.calculateRefund', () => {
  let service: TableCancellationOrchestrator

  beforeEach(() => {
    const base = createService()
    service = base.service
  })

  function createValidation(overrides: Partial<ReservationCancellationSnapshot>): CancellationValidationData {
    const snapshot = createSnapshot(overrides)
    const reservationDateTime = new Date('2025-12-24T18:00:00.000Z')
    return { snapshot, reservationDateTime }
  }

  it('returns no refund when no advance payment collected', async () => {
    const validation = createValidation({ advancePaymentAmount: new Decimal(0) })
    const result = await service.calculateRefund({ validation })

    expect(result.success).toBe(true)
    expect(result.data?.windowType).toBe(CancellationWindowType.NO_REFUND)
    expect(result.data?.amount).toBe(0)
    expect(result.data?.isRefundAllowed).toBe(false)
  })

  it('returns no refund when policy disables refunds', async () => {
    const validation = createValidation({
      restaurantPolicies: [{ id: 45, name: 'Table Policy', isRefundAllowed: false }],
      refundPolicies: []
    })
    const result = await service.calculateRefund({ validation })

    expect(result.success).toBe(true)
    expect(result.data?.policyId).toBe(45)
    expect(result.data?.isRefundAllowed).toBe(false)
    expect(result.data?.windowType).toBe(CancellationWindowType.NO_REFUND)
  })

  it('returns full refund inside free window', async () => {
    const validation = createValidation({
      refundPolicies: [{
        id: 77,
        mealType: 'DINNER',
        allowedRefundTypes: [RefundType.FULL, RefundType.PARTIAL],
        fullRefundBeforeMinutes: 1440,
        partialRefundBeforeMinutes: 720,
        partialRefundPercentage: 50
      }]
    })

    const result = await service.calculateRefund({
      validation,
      referenceTime: new Date('2025-12-23T16:00:00.000Z')
    })

    expect(result.success).toBe(true)
    expect(result.data?.windowType).toBe(CancellationWindowType.FREE)
    expect(result.data?.percentage).toBe(100)
    expect(result.data?.amount).toBe(100)
  })

  it('returns partial refund inside partial window', async () => {
    const validation = createValidation({
      refundPolicies: [{
        id: 88,
        mealType: 'DINNER',
        allowedRefundTypes: [RefundType.FULL, RefundType.PARTIAL],
        fullRefundBeforeMinutes: 2000,
        partialRefundBeforeMinutes: 720,
        partialRefundPercentage: 40
      }]
    })

    const result = await service.calculateRefund({
      validation,
      referenceTime: new Date('2025-12-24T06:00:00.000Z')
    })

    expect(result.success).toBe(true)
    expect(result.data?.windowType).toBe(CancellationWindowType.PARTIAL)
    expect(result.data?.percentage).toBe(40)
    expect(result.data?.amount).toBe(40)
  })

  it('returns no refund when outside policy windows', async () => {
    const validation = createValidation({
      refundPolicies: [{
        id: 90,
        mealType: 'DINNER',
        allowedRefundTypes: [RefundType.FULL, RefundType.PARTIAL],
        fullRefundBeforeMinutes: 1440,
        partialRefundBeforeMinutes: 720,
        partialRefundPercentage: 50
      }]
    })

    const result = await service.calculateRefund({
      validation,
      referenceTime: new Date('2025-12-24T17:30:00.000Z')
    })

    expect(result.success).toBe(true)
    expect(result.data?.windowType).toBe(CancellationWindowType.NO_REFUND)
    expect(result.data?.amount).toBe(0)
    expect(result.data?.reason).toBe('OUTSIDE_REFUND_WINDOW')
  })
})
