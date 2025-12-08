import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PrismaClient, MealType, DiscountType, CampaignType } from '../../prisma/generated/prisma'
import { PromoCodeQueries } from './PromoCodeQueries'
import { setupTestDatabase, cleanupTestDatabase, seedTestData } from '../__tests__/setup'
import {
  createPromoCodeData,
  createPromoCodeUsageInput,
  createPromoCodeRestaurantMapping,
  createPromoCodeCustomerMapping,
  createPromoCodeUsage
} from '../__tests__/promo-code-factories'

describe('PromoCodeQueries', () => {
  let testDb: PrismaClient
  let queries: PromoCodeQueries
  let testData: any

  beforeEach(async () => {
    testDb = await setupTestDatabase()
    queries = new PromoCodeQueries(testDb)
    testData = await seedTestData(testDb)
  })

  afterEach(async () => {
    await cleanupTestDatabase(testDb)
  })

  describe('getPromoCodeWithValidationData', () => {
    it('should return promo code with validation data when found and active', async () => {
      // Create test promo code
      const promoCode = await testDb.promoCode.create({
        data: createPromoCodeData({
          code: 'SAVE20',
          description: '20% off buffet',
          discountType: DiscountType.PERCENTAGE_OFF,
          discountValue: 20,
          minimumOrderValue: 50,
          maximumDiscountAmount: 100,
          usageLimitPerUser: 5,
          usageLimitTotal: 1000,
          timesUsed: 10,
          partySizeLimit: 10,
          partySizeLimitPerUser: 20,
          partySizeUsed: 50,
          buffetTypes: [MealType.LUNCH, MealType.DINNER],
          firstOrderOnly: false,
          campaignType: CampaignType.PLATFORM,
          isActive: true,
          isDeleted: false,
          validFrom: new Date(Date.now() - 86400000), // Yesterday
          validUntil: new Date(Date.now() + 86400000 * 365) // Next year
        })
      })

      // Create restaurant mapping
      await testDb.promoCodeRestaurantMapping.create({
        data: createPromoCodeRestaurantMapping({
          promoCodeId: promoCode.id,
          restaurantId: testData.restaurant.id,
          isActive: true
        })
      })

      const result = await queries.getPromoCodeWithValidationData(
        'SAVE20',
        testData.restaurant.id
      )

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.id).toBe(promoCode.id)
        expect(result.data.code).toBe('SAVE20')
        expect(result.data.description).toBe('20% off buffet')
        expect(result.data.discountType).toBe('PERCENTAGE_OFF')
        expect(result.data.discountValue).toBe(20)
        expect(result.data.minimumOrderValue).toBe(50)
        expect(result.data.maximumDiscountAmount).toBe(100)
        expect(result.data.usageLimitPerUser).toBe(5)
        expect(result.data.usageLimitTotal).toBe(1000)
        expect(result.data.timesUsed).toBe(10)
        expect(result.data.partySizeLimit).toBe(10)
        expect(result.data.partySizeLimitPerUser).toBe(20)
        expect(result.data.partySizeUsed).toBe(50)
        expect(result.data.buffetTypes).toEqual([MealType.LUNCH, MealType.DINNER])
        expect(result.data.firstOrderOnly).toBe(false)
        expect(result.data.campaignType).toBe('PLATFORM')
        expect(result.data.isActive).toBe(true)
        expect(result.data.isDeleted).toBe(false)
        expect(result.data.customerReservationCount).toBe(0)
        expect(result.data.isRestaurantEligible).toBe(true)
        expect(result.data.isCustomerEligible).toBe(true)
        expect(result.data.usageRecords).toEqual([])
        expect(result.data.restaurantMappings).toHaveLength(1)
        expect(result.data.customerMappings).toEqual([])
      }
    })

    it('should return promo code with customer validation data when customer provided', async () => {
      // Create test promo code
      const promoCode = await testDb.promoCode.create({
        data: createPromoCodeData({
          code: 'FIRST10',
          firstOrderOnly: true
        })
      })

      // Create customer mapping
      await testDb.promoCodeCustomerMapping.create({
        data: createPromoCodeCustomerMapping({
          promoCodeId: promoCode.id,
          customerId: testData.customer.id,
          isActive: true
        })
      })

      // Create reservation request first
      const reservationRequest = await testDb.reservationRequest.create({
        data: {
          restaurantId: testData.restaurant.id,
          customerId: testData.customer.id,
          requestName: 'Test Reservation',
          contactPhone: testData.customer.phone,
          requestedDate: new Date(),
          requestedTime: new Date(),
          adultCount: 2,
          childCount: 0,
          mealType: MealType.LUNCH,
          estimatedTotalAmount: 100,
          estimatedServiceCharge: 10,
          estimatedTaxAmount: 8,
          status: 'PENDING',
          createdBy: 'CUSTOMER'
        }
      })

      // Create usage record
      const reservation = await testDb.reservation.create({
        data: {
          reservationNumber: 'RES123',
          restaurantId: testData.restaurant.id,
          customerId: testData.customer.id,
          requestId: reservationRequest.id,
          reservationName: 'Test Reservation',
          contactPhone: testData.customer.phone,
          reservationDate: new Date(),
          reservationTime: new Date(),
          adultCount: 2,
          childCount: 0,
          mealType: MealType.LUNCH,
          totalAmount: 100,
          serviceCharge: 10,
          taxAmount: 8,
          status: 'CONFIRMED',
          createdBy: 'CUSTOMER'
        }
      })

      await testDb.promoCodeUsage.create({
        data: createPromoCodeUsage({
          promoCodeId: promoCode.id,
          customerId: testData.customer.id,
          reservationId: reservation.id,
          originalRequestId: reservationRequest.id,
          originalAmount: 100,
          discountAmount: 10,
          partySize: 2,
          appliedBy: 'CUSTOMER'
        })
      })

      const result = await queries.getPromoCodeWithValidationData(
        'FIRST10',
        testData.restaurant.id,
        testData.customer.id
      )

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.customerReservationCount).toBe(1)
        expect(result.data.isCustomerEligible).toBe(true)
        expect(result.data.usageRecords).toHaveLength(1)
        expect(result.data.usageRecords[0]?.customerId).toBe(testData.customer.id)
        expect(result.data.usageRecords[0]?.originalAmount).toBe(100)
        expect(result.data.usageRecords[0]?.discountAmount).toBe(10)
        expect(result.data.customerMappings).toHaveLength(1)
      }
    })

    it('should handle case-insensitive promo code lookup', async () => {
      await testDb.promoCode.create({
        data: createPromoCodeData({
          code: 'SAVE20'
        })
      })

      const result = await queries.getPromoCodeWithValidationData(
        'save20', // lowercase
        testData.restaurant.id
      )

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.code).toBe('SAVE20')
      }
    })

    it('should return error when promo code not found', async () => {
      const result = await queries.getPromoCodeWithValidationData(
        'NONEXISTENT',
        testData.restaurant.id
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('PROMO_CODE_NOT_FOUND')
        expect(result.error.message).toBe('Promo code not found or expired')
      }
    })

    it('should return error when promo code is inactive', async () => {
      await testDb.promoCode.create({
        data: createPromoCodeData({
          code: 'INACTIVE',
          isActive: false
        })
      })

      const result = await queries.getPromoCodeWithValidationData(
        'INACTIVE',
        testData.restaurant.id
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('PROMO_CODE_NOT_FOUND')
        expect(result.error.message).toBe('Promo code not found or expired')
      }
    })

    it('should return error when promo code is deleted', async () => {
      await testDb.promoCode.create({
        data: createPromoCodeData({
          code: 'DELETED',
          isDeleted: true
        })
      })

      const result = await queries.getPromoCodeWithValidationData(
        'DELETED',
        testData.restaurant.id
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('PROMO_CODE_NOT_FOUND')
      }
    })

    it('should return error when promo code is expired', async () => {
      await testDb.promoCode.create({
        data: createPromoCodeData({
          code: 'EXPIRED',
          validFrom: new Date('2023-01-01'),
          validUntil: new Date('2023-12-31') // Past date
        })
      })

      const result = await queries.getPromoCodeWithValidationData(
        'EXPIRED',
        testData.restaurant.id
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('PROMO_CODE_NOT_FOUND')
      }
    })

    it('should return error when promo code is not yet valid', async () => {
      await testDb.promoCode.create({
        data: createPromoCodeData({
          code: 'FUTURE',
          validFrom: new Date(Date.now() + 86400000), // Tomorrow
          validUntil: new Date(Date.now() + 86400000 * 365) // Next year
        })
      })

      const result = await queries.getPromoCodeWithValidationData(
        'FUTURE',
        testData.restaurant.id
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('PROMO_CODE_NOT_FOUND')
      }
    })

    it('should handle platform campaign type correctly', async () => {
      const promoCode = await testDb.promoCode.create({
        data: createPromoCodeData({
          code: 'PLATFORM20',
          campaignType: CampaignType.PLATFORM
        })
      })

      const result = await queries.getPromoCodeWithValidationData(
        'PLATFORM20',
        testData.restaurant.id
      )

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.isRestaurantEligible).toBe(true) // Platform campaigns are eligible for all restaurants
        expect(result.data.campaignType).toBe('PLATFORM')
      }
    })

    it('should handle merchant campaign type correctly', async () => {
      const promoCode = await testDb.promoCode.create({
        data: createPromoCodeData({
          code: 'MERCHANT20',
          campaignType: CampaignType.MERCHANT
        })
      })

      const result = await queries.getPromoCodeWithValidationData(
        'MERCHANT20',
        testData.restaurant.id
      )

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.isRestaurantEligible).toBe(false) // No restaurant mapping
        expect(result.data.campaignType).toBe('MERCHANT')
      }
    })

    it('should handle database errors gracefully', async () => {
      const invalidPrisma = {} as any
      const invalidQueries = new PromoCodeQueries(invalidPrisma)

      const result = await invalidQueries.getPromoCodeWithValidationData(
        'TEST',
        1
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('DATABASE_ERROR')
      }
    })
  })

  describe('recordPromoCodeUsage', () => {
    it('should record promo code usage and update counters successfully', async () => {
      // Create test promo code
      const promoCode = await testDb.promoCode.create({
        data: createPromoCodeData({
          code: 'USAGE_TEST',
          timesUsed: 5,
          partySizeUsed: 20
        })
      })

      // Create test reservation request first
      const reservationRequest = await testDb.reservationRequest.create({
        data: {
          restaurantId: testData.restaurant.id,
          customerId: testData.customer.id,
          requestName: 'Test Request',
          contactPhone: testData.customer.phone,
          requestedDate: new Date(),
          requestedTime: new Date(),
          adultCount: 2,
          childCount: 1,
          mealType: MealType.LUNCH,
          estimatedTotalAmount: 150,
          estimatedServiceCharge: 15,
          estimatedTaxAmount: 12,
          createdBy: 'MERCHANT',
          status: 'PENDING',
          requiresAdvancePayment: false
        }
      })

      // Create test reservation
      const reservation = await testDb.reservation.create({
        data: {
          reservationNumber: 'RES456',
          restaurantId: testData.restaurant.id,
          customerId: testData.customer.id,
          requestId: reservationRequest.id,
          reservationName: 'Test Reservation',
          contactPhone: testData.customer.phone,
          reservationDate: new Date(),
          reservationTime: new Date(),
          adultCount: 2,
          childCount: 1,
          mealType: MealType.LUNCH,
          totalAmount: 150,
          serviceCharge: 15,
          taxAmount: 12,
          status: 'CONFIRMED',
          createdBy: 'CUSTOMER'
        }
      })

      const usageInput = createPromoCodeUsageInput({
        promoCodeId: promoCode.id,
        customerId: testData.customer.id,
        reservationId: reservation.id,
        requestId: reservationRequest.id,
        originalAmount: 150,
        discountAmount: 30,
        partySize: 3,
        appliedBy: 'MANUAL_RESERVATION'
      })

      const result = await queries.recordPromoCodeUsage(usageInput)

      expect(result.success).toBe(true)

      // Verify usage record was created
      const usageRecord = await testDb.promoCodeUsage.findFirst({
        where: {
          promoCodeId: promoCode.id,
          customerId: testData.customer.id,
          reservationId: reservation.id
        }
      })

      expect(usageRecord).not.toBeNull()
      if (usageRecord) {
        expect(Number(usageRecord.originalAmount)).toBe(150)
        expect(Number(usageRecord.discountAmount)).toBe(30)
        expect(usageRecord.partySize).toBe(3)
        expect(usageRecord.appliedBy).toBe('MANUAL_RESERVATION')
      }

      // Verify promo code counters were updated
      const updatedPromoCode = await testDb.promoCode.findUnique({
        where: { id: promoCode.id }
      })

      expect(updatedPromoCode).not.toBeNull()
      if (updatedPromoCode) {
        expect(updatedPromoCode.timesUsed).toBe(6) // 5 + 1
        expect(updatedPromoCode.partySizeUsed).toBe(23) // 20 + 3
      }
    })

    it('should handle transaction rollback on error', async () => {
      const usageInput = createPromoCodeUsageInput({
        promoCodeId: 999, // Non-existent promo code
        customerId: testData.customer.id,
        reservationId: 999, // Non-existent reservation
        requestId: 1,
        originalAmount: 100,
        discountAmount: 10,
        partySize: 2,
        appliedBy: 'TEST'
      })

      const result = await queries.recordPromoCodeUsage(usageInput)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('FOREIGN_KEY_CONSTRAINT_VIOLATION')
      }
    })
  })

  describe('getPromoCodeUsageByCustomer', () => {
    it('should return usage records for specific customer and promo code', async () => {
      const promoCode = await testDb.promoCode.create({
        data: createPromoCodeData({ code: 'CUSTOMER_USAGE' })
      })

      // Create reservation requests first
      const request1 = await testDb.reservationRequest.create({
        data: {
          restaurantId: testData.restaurant.id,
          customerId: testData.customer.id,
          requestName: 'Request 1',
          contactPhone: testData.customer.phone,
          requestedDate: new Date(),
          requestedTime: new Date(),
          adultCount: 2,
          childCount: 0,
          mealType: MealType.LUNCH,
          estimatedTotalAmount: 100,
          estimatedServiceCharge: 10,
          estimatedTaxAmount: 8,
          createdBy: 'CUSTOMER',
          status: 'PENDING',
          requiresAdvancePayment: false
        }
      })

      const request2 = await testDb.reservationRequest.create({
        data: {
          restaurantId: testData.restaurant.id,
          customerId: testData.customer.id,
          requestName: 'Request 2',
          contactPhone: testData.customer.phone,
          requestedDate: new Date(),
          requestedTime: new Date(),
          adultCount: 4,
          childCount: 2,
          mealType: MealType.DINNER,
          estimatedTotalAmount: 300,
          estimatedServiceCharge: 30,
          estimatedTaxAmount: 24,
          createdBy: 'CUSTOMER',
          status: 'PENDING',
          requiresAdvancePayment: false
        }
      })

      // Create multiple reservations and usage records
      const reservation1 = await testDb.reservation.create({
        data: {
          reservationNumber: 'RES001',
          restaurantId: testData.restaurant.id,
          customerId: testData.customer.id,
          requestId: request1.id,
          reservationName: 'Test 1',
          contactPhone: testData.customer.phone,
          reservationDate: new Date(),
          reservationTime: new Date(),
          adultCount: 2,
          childCount: 0,
          mealType: MealType.LUNCH,
          totalAmount: 100,
          serviceCharge: 10,
          taxAmount: 8,
          status: 'CONFIRMED',
          createdBy: 'CUSTOMER'
        }
      })

      const reservation2 = await testDb.reservation.create({
        data: {
          reservationNumber: 'RES002',
          restaurantId: testData.restaurant.id,
          customerId: testData.customer.id,
          requestId: request2.id,
          reservationName: 'Test 2',
          contactPhone: testData.customer.phone,
          reservationDate: new Date(),
          reservationTime: new Date(),
          adultCount: 4,
          childCount: 2,
          mealType: MealType.DINNER,
          totalAmount: 300,
          serviceCharge: 30,
          taxAmount: 24,
          status: 'CONFIRMED',
          createdBy: 'CUSTOMER'
        }
      })

      // Create usage records with explicit timestamps to ensure proper ordering
      const now = new Date()
      const earlier = new Date(now.getTime() - 60000) // 1 minute earlier
      
      await testDb.promoCodeUsage.create({
        data: {
          ...createPromoCodeUsage({
            promoCodeId: promoCode.id,
            customerId: testData.customer.id,
            reservationId: reservation1.id,
            originalRequestId: request1.id,
            originalAmount: 100,
            discountAmount: 10,
            partySize: 2
          }),
          appliedAt: earlier // Earlier timestamp
        }
      })

      await testDb.promoCodeUsage.create({
        data: {
          ...createPromoCodeUsage({
            promoCodeId: promoCode.id,
            customerId: testData.customer.id,
            reservationId: reservation2.id,
            originalRequestId: request2.id,
            originalAmount: 300,
            discountAmount: 60,
            partySize: 6
          }),
          appliedAt: now // Later timestamp (should be first in results)
        }
      })

      const result = await queries.getPromoCodeUsageByCustomer(
        promoCode.id,
        testData.customer.id
      )

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(2)
        expect(Number(result.data[0]?.originalAmount)).toBe(300) // Most recent first
        expect(Number(result.data[0]?.discountAmount)).toBe(60)
        expect(result.data[0]?.partySize).toBe(6)
        expect(Number(result.data[1]?.originalAmount)).toBe(100)
        expect(Number(result.data[1]?.discountAmount)).toBe(10)
        expect(result.data[1]?.partySize).toBe(2)
      }
    })

    it('should return empty array when no usage records exist', async () => {
      const promoCode = await testDb.promoCode.create({
        data: createPromoCodeData({ code: 'NO_USAGE' })
      })

      const result = await queries.getPromoCodeUsageByCustomer(
        promoCode.id,
        testData.customer.id
      )

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(0)
      }
    })
  })

  describe('getCustomerReservationCount', () => {
    it('should return correct reservation count excluding cancelled and rejected', async () => {
      // Create reservation requests first
      const request1 = await testDb.reservationRequest.create({
        data: {
          restaurantId: testData.restaurant.id,
          customerId: testData.customer.id,
          requestName: 'Request 1',
          contactPhone: testData.customer.phone,
          requestedDate: new Date(),
          requestedTime: new Date(),
          adultCount: 2,
          childCount: 0,
          mealType: MealType.LUNCH,
          estimatedTotalAmount: 100,
          estimatedServiceCharge: 10,
          estimatedTaxAmount: 8,
          createdBy: 'CUSTOMER',
          status: 'PENDING',
          requiresAdvancePayment: false
        }
      })

      const request2 = await testDb.reservationRequest.create({
        data: {
          restaurantId: testData.restaurant.id,
          customerId: testData.customer.id,
          requestName: 'Request 2',
          contactPhone: testData.customer.phone,
          requestedDate: new Date(),
          requestedTime: new Date(),
          adultCount: 2,
          childCount: 0,
          mealType: MealType.LUNCH,
          estimatedTotalAmount: 100,
          estimatedServiceCharge: 10,
          estimatedTaxAmount: 8,
          createdBy: 'CUSTOMER',
          status: 'PENDING',
          requiresAdvancePayment: false
        }
      })

      // Create multiple reservations with different statuses
      await testDb.reservation.createMany({
        data: [
          {
            reservationNumber: 'RES_CONFIRMED',
            restaurantId: testData.restaurant.id,
            customerId: testData.customer.id,
            requestId: request1.id,
            reservationName: 'Confirmed',
            contactPhone: testData.customer.phone,
            reservationDate: new Date(),
            reservationTime: new Date(),
            adultCount: 2,
            childCount: 0,
            mealType: MealType.LUNCH,
            totalAmount: 100,
            serviceCharge: 10,
            taxAmount: 8,
            status: 'CONFIRMED',
            createdBy: 'CUSTOMER'
          },
          {
            reservationNumber: 'RES_PENDING',
            restaurantId: testData.restaurant.id,
            customerId: testData.customer.id,
            requestId: request2.id,
            reservationName: 'Pending',
            contactPhone: testData.customer.phone,
            reservationDate: new Date(),
            reservationTime: new Date(),
            adultCount: 2,
            childCount: 0,
            mealType: MealType.LUNCH,
            totalAmount: 100,
            serviceCharge: 10,
            taxAmount: 8,
            status: 'PENDING',
            createdBy: 'CUSTOMER'
          }
        ]
      })

      const result = await queries.getCustomerReservationCount(testData.customer.id)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(2) // Only CONFIRMED and PENDING
      }
    })

    it('should return zero for customer with no reservations', async () => {
      const result = await queries.getCustomerReservationCount(999) // Non-existent customer

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(0)
      }
    })
  })

  describe('getPromoCodeRestaurantMappings', () => {
    it('should return active restaurant mappings for promo code', async () => {
      const promoCode = await testDb.promoCode.create({
        data: createPromoCodeData({ code: 'RESTAURANT_MAP' })
      })

      await testDb.promoCodeRestaurantMapping.create({
        data: createPromoCodeRestaurantMapping({
          promoCodeId: promoCode.id,
          restaurantId: testData.restaurant.id,
          isActive: true
        })
      })

      const result = await queries.getPromoCodeRestaurantMappings(promoCode.id)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(1)
        expect(result.data[0]?.restaurantId).toBe(testData.restaurant.id)
        expect(result.data[0]?.isActive).toBe(true)
      }
    })

    it('should return empty array when no active mappings exist', async () => {
      const promoCode = await testDb.promoCode.create({
        data: createPromoCodeData({ code: 'NO_MAPPINGS' })
      })

      const result = await queries.getPromoCodeRestaurantMappings(promoCode.id)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(0)
      }
    })
  })

  describe('getPromoCodeCustomerMappings', () => {
    it('should return active customer mappings for promo code', async () => {
      const promoCode = await testDb.promoCode.create({
        data: createPromoCodeData({ code: 'CUSTOMER_MAP' })
      })

      await testDb.promoCodeCustomerMapping.create({
        data: createPromoCodeCustomerMapping({
          promoCodeId: promoCode.id,
          customerId: testData.customer.id,
          isActive: true
        })
      })

      const result = await queries.getPromoCodeCustomerMappings(promoCode.id)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(1)
        expect(result.data[0]?.customerId).toBe(testData.customer.id)
        expect(result.data[0]?.isActive).toBe(true)
      }
    })

    it('should return empty array when no active mappings exist', async () => {
      const promoCode = await testDb.promoCode.create({
        data: createPromoCodeData({ code: 'NO_CUSTOMER_MAP' })
      })

      const result = await queries.getPromoCodeCustomerMappings(promoCode.id)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(0)
      }
    })
  })
}) 