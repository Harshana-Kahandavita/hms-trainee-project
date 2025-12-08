import type {
  CancellationReasonCategory,
  CancellationRequestedBy,
  CancellationWindowType,
  MealType,
  ReservationType,
  TableSetStatus,
  TableSlotStatus,
  RefundType
} from '../../prisma/generated/prisma'
import type { Decimal } from 'decimal.js'

export interface CancellationValidationInput {
  reservationId: number
  referenceTime?: Date
}

export interface CustomerSummary {
  id: number
  firstName: string
  lastName: string
  email: string | null
  phone?: string | null
}

export interface ReservationPolicySummary {
  id: number
  name: string
  isRefundAllowed: boolean
}

export interface RefundPolicySummary {
  id: number
  mealType: MealType
  allowedRefundTypes: RefundType[]
  fullRefundBeforeMinutes: number
  partialRefundBeforeMinutes: number | null
  partialRefundPercentage: number | null
}

export interface TableAssignmentSummary {
  slotId: number | null
  assignedTableId: number | null
  assignedSectionId: number | null
}

export interface ActiveTableSetSummary {
  id: number
  status: TableSetStatus
  slotIds: number[]
  tableIds: number[]
  primaryTableId: number
  originalStatuses: Record<number, TableSlotStatus>
  combinedCapacity: number
}

export interface ReservationCancellationSnapshot {
  id: number
  reservationNumber: string
  restaurantId: number
  status: string
  reservationDate: Date
  reservationTime: Date
  reservationType: ReservationType
  mealType: MealType
  adultCount: number
  childCount: number
  advancePaymentAmount: Decimal | null
  totalAmount: Decimal
  customer: CustomerSummary
  restaurantPolicies: ReservationPolicySummary[]
  refundPolicies: RefundPolicySummary[]
  tableAssignment?: TableAssignmentSummary
  activeTableSet?: ActiveTableSetSummary
  pendingCancellationStatuses: string[]
}

export interface CancellationValidationData {
  snapshot: ReservationCancellationSnapshot
  reservationDateTime: Date
}

export interface RefundCalculationInput {
  validation: CancellationValidationData
  referenceTime?: Date
}

export interface RefundQuote {
  windowType: CancellationWindowType
  percentage: number
  amount: number
  minutesUntilReservation: number
  isRefundAllowed: boolean
  policyId?: number
  reason?: string
}

export interface ReleaseSingleTableSlotParams {
  reservationId: number
  slotId: number
}

export interface ReleaseMergedTableSlotsParams {
  tableSetId: number
  reservationId: number
  dissolvedBy: string
  tableSet: ActiveTableSetSummary
}

export interface CreateCancellationRequestParams {
  reservationId: number
  restaurantId: number
  requestedBy: CancellationRequestedBy
  requestedById: number
  reason: string
  reasonCategory: CancellationReasonCategory
  additionalNotes?: string
  refund: RefundQuote
  tableSetId?: number
  mergedTableCount: number
  releasedSlotIds: number[]
  processedBy: string
  processedAt?: Date
}

export interface CreatedCancellationRequest {
  id: number
  reservationId: number
  refundAmount: number | null
  status: string
  windowType: CancellationWindowType
  mergedTableCount: number
  releasedSlotIds: number[]
}
