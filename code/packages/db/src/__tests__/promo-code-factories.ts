import {
  PromoCodeValidationData,
  PromoCodeUsageRecord,
  PromoCodeRestaurantMappingRecord,
  PromoCodeCustomerMappingRecord,
  RecordPromoCodeUsageInput
} from '../manual-reservation/types'
import { DiscountType, CampaignType, MealType } from '../../prisma/generated/prisma'

// Helper function to create unique promo codes
let promoCodeCounter = 1
export function createUniquePromoCode(): string {
  const timestamp = Date.now().toString().slice(-6)
  return `PROMO${promoCodeCounter++}_${timestamp}`
}

// Factory for creating promo code data
export function createPromoCodeData(overrides: Partial<{
  code: string
  description: string
  discountType: DiscountType
  discountValue: number
  minimumOrderValue: number
  maximumDiscountAmount: number
  usageLimitPerUser: number
  usageLimitTotal: number
  timesUsed: number
  partySizeLimit: number
  partySizeLimitPerUser: number
  partySizeUsed: number
  buffetTypes: MealType[]
  firstOrderOnly: boolean
  campaignType: CampaignType
  isActive: boolean
  isDeleted: boolean
  validFrom: Date
  validUntil: Date
}> = {}): any {
  return {
    code: (overrides.code || createUniquePromoCode()).toUpperCase(),
    description: 'Test promo code for buffet discount',
    discountType: DiscountType.PERCENTAGE_OFF,
    discountValue: 15,
    minimumOrderValue: 30,
    maximumDiscountAmount: 50,
    usageLimitPerUser: 3,
    usageLimitTotal: 500,
    timesUsed: 0,
    partySizeLimit: 8,
    partySizeLimitPerUser: 12,
    partySizeUsed: 0,
    buffetTypes: [MealType.LUNCH, MealType.DINNER],
    firstOrderOnly: false,
    campaignType: CampaignType.PLATFORM,
    isActive: true,
    isDeleted: false,
    validFrom: new Date(Date.now() - 86400000), // Yesterday
    validUntil: new Date(Date.now() + 86400000 * 365), // Next year
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test-admin',
    updatedBy: 'test-admin',
    ...overrides
  }
}

// Factory for creating promo code usage input
export function createPromoCodeUsageInput(overrides: Partial<RecordPromoCodeUsageInput> = {}): RecordPromoCodeUsageInput {
  return {
    promoCodeId: 1,
    customerId: 1,
    reservationId: 1,
    requestId: 1,
    originalAmount: 100,
    discountAmount: 15,
    partySize: 2,
    appliedBy: 'MANUAL_RESERVATION',
    ...overrides
  }
}

// Factory for creating promo code usage record
export function createPromoCodeUsage(overrides: Partial<{
  promoCodeId: number
  customerId: number
  reservationId: number
  originalRequestId: number
  originalAmount: number
  discountAmount: number
  partySize: number
  appliedBy: string
}> = {}): any {
  return {
    promoCodeId: 1,
    customerId: 1,
    reservationId: 1,
    originalRequestId: 1,
    originalAmount: 100,
    discountAmount: 15,
    partySize: 2,
    appliedBy: 'CUSTOMER',
    appliedAt: new Date(),
    ...overrides
  }
}

// Factory for creating promo code restaurant mapping
export function createPromoCodeRestaurantMapping(overrides: Partial<{
  promoCodeId: number
  restaurantId: number
  isActive: boolean
}> = {}): any {
  return {
    promoCodeId: 1,
    restaurantId: 1,
    isActive: true,
    ...overrides
  }
}

// Factory for creating promo code customer mapping
export function createPromoCodeCustomerMapping(overrides: Partial<{
  promoCodeId: number
  customerId: number
  isActive: boolean
}> = {}): any {
  return {
    promoCodeId: 1,
    customerId: 1,
    isActive: true,
    ...overrides
  }
}

// Factory for creating validation data input
export function createPromoCodeValidationInput(overrides: Partial<{
  code: string
  restaurantId: number
  customerId?: number
}> = {}): { code: string; restaurantId: number; customerId?: number } {
  return {
    code: 'TEST_CODE',
    restaurantId: 1,
    ...overrides
  }
} 