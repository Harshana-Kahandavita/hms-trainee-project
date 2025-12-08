import { MealType, Customer, ReservationRequest, RequestCreatorType, ReservationType } from '../../prisma/generated/prisma'

// Query input types
export interface GetMealServiceInput {
  restaurantId: number
  mealType: string
}

export interface GetCapacityInput {
  restaurantId: number
  date: Date
  serviceId: number
}

export interface UpsertCustomerInput {
  firstName: string
  lastName: string
  phone: string
  email?: string | null
}

export interface CreateReservationRequestInput {
  restaurantId: number
  customerId: number
  requestName: string
  contactPhone: string
  requestedDate: Date
  requestedTime: Date
  adultCount: number
  childCount: number
  mealType: MealType
  estimatedTotalAmount: number
  estimatedServiceCharge: number
  estimatedTaxAmount: number
  createdBy: RequestCreatorType
  specialRequests?: string
  dietaryRequirements?: string
  occasion?: string
  requiresAdvancePayment?: boolean
  reservationType?: ReservationType // Reservation type to determine capacity validation
}

// Query result types
export interface MealServiceResult {
  id: number
  adultNetPrice: number
  childNetPrice: number
  isChildEnabled: boolean
  serviceChargePercentage: number
  taxPercentage: number
}

export interface CapacityResult {
  id: number
  totalSeats: number
  bookedSeats: number
  availableSeats: number
}

export interface CustomerResult extends Customer {}

export interface ManualReservationRestaurantSettings {
  id: number
  advancePaymentPercentage: number
}

export interface ReservationRequestResult {
  id: number
  restaurantId: number
  customerId: number
  requestName: string
  contactPhone: string
  requestedDate: Date
  requestedTime: Date
  adultCount: number
  childCount: number
  mealType: MealType
  status: string
  specialRequests?: string | null
  dietaryRequirements?: string | null
  occasion?: string | null
  estimatedTotalAmount: number
  estimatedServiceCharge: number
  estimatedTaxAmount: number
  createdBy: RequestCreatorType
  requiresAdvancePayment: boolean
  createdAt: Date
  updatedAt: Date
}

// Error types
export interface QueryError {
  code: string
  message: string
  details?: any
}

// Success/Error result types
export type QueryResult<T> = {
  success: true
  data: T
} | {
  success: false
  error: QueryError
}

// Add platter-related input types
export interface GetPlattersByMealServiceInput {
  restaurantId: number
  mealServiceId: number
}

export interface GetPlatterByIdInput {
  platterId: number
}

export interface GetDefaultPlatterInput {
  restaurantId: number
  mealServiceId: number
}

// Add platter result types
export interface PlatterResult {
  id: number
  restaurantId: number
  mealServiceId: number
  platterName: string
  platterDescription: string | null
  headCount: number
  adultGrossPrice: number
  childGrossPrice: number
  adultNetPrice: number
  childNetPrice: number
  isActive: boolean
  displayOrder: number | null
  isDefault: boolean
  features: any | null
  images: any | null
  createdAt: Date
  updatedAt: Date
}

export interface PlatterListResult {
  platters: PlatterResult[]
  totalCount: number
}

// Add platter display types for business logic
export interface PlatterDisplay {
  id: number
  name: string
  description: string | null
  headCount: number
  adultNetPrice: number
  childNetPrice: number
  features: any[]
  images: any[]
  isDefault: boolean
  displayOrder: number | null
} 

// Promo Code Database Types for Manual Reservation
export interface PromoCodeValidationData {
  id: number
  code: string
  description: string
  discountType: 'PERCENTAGE_OFF' | 'FIXED_AMOUNT_OFF'
  discountValue: number
  minimumOrderValue: number
  maximumDiscountAmount: number
  usageLimitPerUser: number
  usageLimitTotal: number
  timesUsed: number
  partySizeLimit: number
  partySizeLimitPerUser: number
  partySizeUsed: number
  buffetTypes: string[]
  firstOrderOnly: boolean
  campaignType: 'PLATFORM' | 'MERCHANT'
  isActive: boolean
  isDeleted: boolean
  validFrom: Date
  validUntil: Date
  // Additional computed fields
  customerReservationCount: number
  isRestaurantEligible: boolean
  isCustomerEligible: boolean
  usageRecords: PromoCodeUsageRecord[]
  restaurantMappings: PromoCodeRestaurantMappingRecord[]
  customerMappings: PromoCodeCustomerMappingRecord[]
}

export interface PromoCodeUsageRecord {
  id: number
  promoCodeId: number
  customerId: number
  reservationId: number
  originalRequestId: number
  originalAmount: number
  discountAmount: number
  partySize: number
  appliedBy: string
  appliedAt: Date
}

export interface PromoCodeRestaurantMappingRecord {
  id: number
  promoCodeId: number
  restaurantId: number
  isActive: boolean
}

export interface PromoCodeCustomerMappingRecord {
  id: number
  promoCodeId: number
  customerId: number
  isActive: boolean
}

export interface RecordPromoCodeUsageInput {
  promoCodeId: number
  customerId: number
  reservationId: number
  requestId: number
  originalAmount: number
  discountAmount: number
  partySize: number
  appliedBy: string
}

// Extend existing CreateReservationRequestInput to support promo codes
export interface CreateReservationRequestWithPromoCodeInput extends CreateReservationRequestInput {
  promoCodeId?: number
  estimatedDiscountAmount?: number
  eligiblePromoPartySize?: number // Track how many people the promo was applied to
}

export interface ConfirmNonAdvanceReservationInput {
  requestId: number
  createdBy?: string
}

export interface ReservationConfirmationResult {
  id: number
  reservationNumber: string
  status: string
}

export interface ReservationNotificationData {
  reservationId: number
  reservationNumber: string
  reservationDate: Date
  mealType: MealType
  adultCount: number
  childCount: number
  totalAmount: number
  restaurantId: number
  customer: {
    firstName: string
    lastName: string
    phone: string
    email: string | null
  }
  restaurant: {
    name: string
    phone: string | null
    business: {
      name: string | null
      phone: string | null
      email: string | null
    } | null
  }
  // Platter-related fields
  isPlatterBasedReservation?: boolean
  platterCount?: number
  paxPerPlatter?: number
}

export interface AdvancePaymentNotificationData {
  reservationId: number
  reservationNumber: string
  reservationDate: Date
  mealType: MealType
  adultCount: number
  childCount: number
  totalAmount: number
  advancePaymentAmount: number
  remainingAmount: number
  restaurantId: number
  customer: {
    firstName: string
    lastName: string
    phone: string
    email: string | null
  }
  restaurant: {
    name: string
    phone: string | null
    business: {
      name: string | null
      phone: string | null
      email: string | null
    } | null
  }
  // Platter-related fields
  isPlatterBasedReservation?: boolean
  platterCount?: number
  paxPerPlatter?: number
} 