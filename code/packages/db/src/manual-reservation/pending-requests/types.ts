import { MealType, ReservationRequestStatus } from '../../../prisma/generated/prisma'

// Query input types
export interface GetPendingRequestsInput {
  restaurantId: number
  page: number
  limit: number
  statusFilter?: ReservationRequestStatus[]
}

export interface FilteredRequestsInput {
  restaurantId: number
  statusFilter?: ReservationRequestStatus[]
  dateFrom?: Date
  dateTo?: Date
  page: number
  limit: number
}

// Query result types
export interface PendingRequestResult {
  id: number
  contactPhone: string
  requestedDate: Date
  requestedTime: Date
  adultCount: number
  childCount: number
  mealType: MealType
  estimatedTotalAmount: number
  status: ReservationRequestStatus
  createdAt: Date
  customer: {
    firstName: string
    lastName: string
    phone: string
  }
  paymentLink: {
    token: string
    status: string
    expiresAt: Date
  } | null
}

export interface RequestDetailsResult extends PendingRequestResult {
  specialRequests?: string | null
  dietaryRequirements?: string | null
  occasion?: string | null
  estimatedServiceCharge: number
  estimatedTaxAmount: number
  requiresAdvancePayment: boolean
  customer: {
    firstName: string
    lastName: string
    email: string | null
    phone: string
  }
  paymentLink: {
    token: string
    status: string
    expiresAt: Date
  } | null
}

export interface RequestCountsResult {
  total: number
  pending: number
  processing: number
  merchantInitiated: number
  pendingPayment: number
}

export interface PaginatedPendingRequestsResult {
  requests: PendingRequestResult[]
  totalCount: number
  currentPage: number
  totalPages: number
}

