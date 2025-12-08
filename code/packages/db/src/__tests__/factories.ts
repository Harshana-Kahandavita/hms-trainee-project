import {
  GetMealServiceInput,
  GetCapacityInput,
  UpsertCustomerInput,
  CreateReservationRequestInput
} from '../manual-reservation/types'
import { MealType, RequestCreatorType } from '../../prisma/generated/prisma'

export function createGetMealServiceInput(overrides: Partial<GetMealServiceInput> = {}): GetMealServiceInput {
  return {
    restaurantId: 1,
    mealType: 'LUNCH',
    ...overrides
  }
}

export function createGetCapacityInput(overrides: Partial<GetCapacityInput> = {}): GetCapacityInput {
  return {
    restaurantId: 1,
    date: new Date(),
    serviceId: 1,
    ...overrides
  }
}

export function createUpsertCustomerInput(overrides: Partial<UpsertCustomerInput> = {}): UpsertCustomerInput {
  return {
    firstName: 'John',
    lastName: 'Doe',
    phone: '+1234567890',
    email: 'john.doe@example.com',
    ...overrides
  }
}

export function createReservationRequestInput(overrides: Partial<CreateReservationRequestInput> = {}): CreateReservationRequestInput {
  return {
    restaurantId: 1,
    customerId: 1,
    requestName: 'John Doe',
    contactPhone: '+1234567890',
    requestedDate: new Date(),
    requestedTime: new Date(),
    adultCount: 2,
    childCount: 1,
    mealType: MealType.LUNCH,
    estimatedTotalAmount: 250,
    estimatedServiceCharge: 25,
    estimatedTaxAmount: 20,
    createdBy: RequestCreatorType.MERCHANT,
    requiresAdvancePayment: false,
    ...overrides
  }
}

// Helper function to create a date for testing
export function createTestDate(daysFromNow: number = 0): Date {
  const date = new Date()
  date.setDate(date.getDate() + daysFromNow)
  date.setHours(0, 0, 0, 0)
  return date
}

// Helper function to create unique phone numbers for testing
export function createUniquePhone(): string {
  const timestamp = Date.now().toString()
  return `+1${timestamp.slice(-10)}`
}

// Helper function to create unique email addresses for testing
export function createUniqueEmail(prefix: string = 'test'): string {
  const timestamp = Date.now()
  return `${prefix}${timestamp}@example.com`
}

// Platter-related factories
export function createGetPlattersByMealServiceInput(overrides: Partial<{
  restaurantId: number
  mealServiceId: number
}> = {}): { restaurantId: number; mealServiceId: number } {
  return {
    restaurantId: 1,
    mealServiceId: 1,
    ...overrides
  }
}

export function createGetPlatterByIdInput(overrides: Partial<{
  platterId: number
}> = {}): { platterId: number } {
  return {
    platterId: 1,
    ...overrides
  }
}

export function createGetDefaultPlatterInput(overrides: Partial<{
  restaurantId: number
  mealServiceId: number
}> = {}): { restaurantId: number; mealServiceId: number } {
  return {
    restaurantId: 1,
    mealServiceId: 1,
    ...overrides
  }
}

// Helper function to create test platter data with unique IDs
let platterIdCounter = 1
export function createTestPlatterData(overrides: Partial<{
  id: number
  restaurantId: number
  mealServiceId: number
  platterName: string
  platterDescription: string | null
  headCount: number
  adultNetPrice: number
  childNetPrice: number
  isActive: boolean
  isDefault: boolean
  displayOrder: number | null
  features: any
  images: any
}> = {}): any {
  const uniqueId = platterIdCounter++
  return {
    id: uniqueId,
    restaurantId: 1,
    mealServiceId: 1,
    platterName: `Premium Buffet ${uniqueId}`,
    platterDescription: 'Deluxe buffet experience with premium dishes',
    headCount: 4,
    adultGrossPrice: 35.00,
    childGrossPrice: 20.00,
    adultNetPrice: 30.00,
    childNetPrice: 18.00,
    isActive: true,
    isDefault: true,
    displayOrder: 1,
    features: { includes: ['appetizers', 'main_course', 'desserts'] },
    images: { urls: ['image1.jpg', 'image2.jpg'] },
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test-user',
    updatedBy: 'test-user',
    ...overrides
  }
} 