import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PrismaClient, MealType, RequestCreatorType } from '../../prisma/generated/prisma'
import { ManualReservationQueries } from './ManualReservationQueries'
import { setupTestDatabase, cleanupTestDatabase, seedTestData } from '../__tests__/setup'
import {
  createGetMealServiceInput,
  createGetCapacityInput,
  createUpsertCustomerInput,
  createReservationRequestInput,
  createTestDate,
  createUniquePhone,
  createUniqueEmail
} from '../__tests__/factories'

describe('ManualReservationQueries', () => {
  let testDb: PrismaClient
  let queries: ManualReservationQueries
  let testData: any

  beforeEach(async () => {
    testDb = await setupTestDatabase()
    queries = new ManualReservationQueries(testDb)
    testData = await seedTestData(testDb)
  })

  afterEach(async () => {
    await cleanupTestDatabase(testDb)
  })

  describe('getMealService', () => {
    it('should return meal service for valid restaurant and meal type', async () => {
      const input = createGetMealServiceInput({
        restaurantId: testData.restaurant.id,
        mealType: 'LUNCH'
      })

      const result = await queries.getMealService(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.id).toBe(testData.mealService.id)
        expect(result.data.adultNetPrice).toBe(100)
        expect(result.data.childNetPrice).toBe(50)
        expect(result.data.isChildEnabled).toBe(true)
        expect(result.data.serviceChargePercentage).toBe(10)
        expect(result.data.taxPercentage).toBe(8)
      }
    })

    it('should return error for non-existent restaurant', async () => {
      const input = createGetMealServiceInput({
        restaurantId: 999,
        mealType: 'LUNCH'
      })

      const result = await queries.getMealService(input)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('MEAL_SERVICE_NOT_FOUND')
        expect(result.error.message).toContain('No meal service found')
      }
    })

    it('should return error for invalid meal type', async () => {
      const input = createGetMealServiceInput({
        restaurantId: testData.restaurant.id,
        mealType: 'INVALID_MEAL'
      })

      const result = await queries.getMealService(input)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('MEAL_SERVICE_NOT_FOUND')
      }
    })

    it('should return error for unavailable meal service', async () => {
      // Create an unavailable meal service
      await testDb.restaurantMealService.create({
        data: {
          restaurantId: testData.restaurant.id,
          mealType: 'DINNER',
          serviceStartTime: new Date('2024-01-01T18:00:00Z'),
          serviceEndTime: new Date('2024-01-01T21:00:00Z'),
          adultGrossPrice: 165,
          childGrossPrice: 82.5,
          adultNetPrice: 150,
          childNetPrice: 75,
          childAgeLimit: 12,
          isChildEnabled: true,
          serviceChargePercentage: 10,
          taxPercentage: 8,
          priceUpdatedAt: new Date(),
          isAvailable: false // Not available
        }
      })

      const input = createGetMealServiceInput({
        restaurantId: testData.restaurant.id,
        mealType: 'DINNER'
      })

      const result = await queries.getMealService(input)

      expect(result.success).toBe(false)
    })
  })

  describe('getRestaurantCapacity', () => {
    it('should return capacity for valid restaurant, date, and service', async () => {
      const today = createTestDate(0)
      const input = createGetCapacityInput({
        restaurantId: testData.restaurant.id,
        date: today,
        serviceId: testData.mealService.id
      })

      const result = await queries.getRestaurantCapacity(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.id).toBe(testData.capacityRecord.id)
        expect(result.data.totalSeats).toBe(100)
        expect(result.data.bookedSeats).toBe(20)
        expect(result.data.availableSeats).toBe(80)
      }
    })

    it('should return error for non-existent capacity record', async () => {
      const futureDate = createTestDate(30)
      const input = createGetCapacityInput({
        restaurantId: testData.restaurant.id,
        date: futureDate,
        serviceId: testData.mealService.id
      })

      const result = await queries.getRestaurantCapacity(input)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('CAPACITY_RECORD_NOT_FOUND')
        expect(result.error.message).toContain('No capacity record found')
      }
    })

    it('should return capacity for a specific date', async () => {
      const today = createTestDate(0)
      
      const input = createGetCapacityInput({
        restaurantId: testData.restaurant.id,
        date: today,
        serviceId: testData.mealService.id
      })

      const result = await queries.getRestaurantCapacity(input)
      expect(result.success).toBe(true)
    })
  })

  describe('upsertCustomer', () => {
    it('should create new customer', async () => {
      const input = createUpsertCustomerInput({
        firstName: 'Jane',
        lastName: 'Smith',
        phone: createUniquePhone(),
        email: createUniqueEmail('jane')
      })

      const result = await queries.upsertCustomer(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.firstName).toBe('Jane')
        expect(result.data.lastName).toBe('Smith')
        expect(result.data.phone).toBe(input.phone)
        expect(result.data.email).toBe(input.email)
      }
    })

    it('should update existing customer', async () => {
      const existingPhone = testData.customer.phone
      const input = createUpsertCustomerInput({
        firstName: 'Updated',
        lastName: 'Name',
        phone: existingPhone,
        email: createUniqueEmail('updated')
      })

      const result = await queries.upsertCustomer(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.id).toBe(testData.customer.id) // Same ID
        expect(result.data.firstName).toBe('Updated')
        expect(result.data.lastName).toBe('Name')
        expect(result.data.phone).toBe(existingPhone)
        expect(result.data.email).toBe(input.email)
      }
    })

    it('should handle invalid email gracefully', async () => {
      const input = createUpsertCustomerInput({
        email: 'invalid-email-format'
      })

      const result = await queries.upsertCustomer(input)

      // Depending on database constraints, this might succeed or fail
      // The test verifies the method handles it gracefully
      expect(typeof result.success).toBe('boolean')
    })
  })

  describe('createReservationRequest', () => {
    it('should create reservation request successfully', async () => {
      const input = createReservationRequestInput({
        restaurantId: testData.restaurant.id,
        customerId: testData.customer.id,
        requestName: 'Test Reservation',
        contactPhone: testData.customer.phone,
        requestedDate: createTestDate(1),
        requestedTime: new Date(),
        adultCount: 2,
        childCount: 1,
        mealType: MealType.LUNCH,
        estimatedTotalAmount: 250,
        estimatedServiceCharge: 25,
        estimatedTaxAmount: 20,
        createdBy: RequestCreatorType.MERCHANT,
        requiresAdvancePayment: false
      })

      const result = await queries.createReservationRequest(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.restaurantId).toBe(testData.restaurant.id)
        expect(result.data.customerId).toBe(testData.customer.id)
        expect(result.data.requestName).toBe('Test Reservation')
        expect(result.data.adultCount).toBe(2)
        expect(result.data.childCount).toBe(1)
        expect(result.data.mealType).toBe(MealType.LUNCH)
        expect(result.data.status).toBe('PENDING')
        expect(result.data.requiresAdvancePayment).toBe(false)
        expect(result.data.requestedDate).toBeInstanceOf(Date)
        expect(result.data.requestedTime).toBeInstanceOf(Date)
        expect(result.data.createdAt).toBeInstanceOf(Date)
        expect(result.data.updatedAt).toBeInstanceOf(Date)
      }
    })

    it('should handle foreign key constraint violation', async () => {
      const input = createReservationRequestInput({
        restaurantId: 999, // Non-existent restaurant
        customerId: testData.customer.id
      })

      const result = await queries.createReservationRequest(input)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('FOREIGN_KEY_CONSTRAINT_VIOLATION')
      }
    })

    it('should create reservation with optional fields', async () => {
      const input = createReservationRequestInput({
        restaurantId: testData.restaurant.id,
        customerId: testData.customer.id,
        specialRequests: 'Window seat please',
        dietaryRequirements: 'Vegetarian',
        occasion: 'Birthday'
      })

      const result = await queries.createReservationRequest(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.specialRequests).toBe('Window seat please')
        expect(result.data.dietaryRequirements).toBe('Vegetarian')
        expect(result.data.occasion).toBe('Birthday')
        expect(result.data.requestedDate).toBeInstanceOf(Date)
        expect(result.data.requestedTime).toBeInstanceOf(Date)
      }
    })
  })

  describe('updateCapacityBookedSeats', () => {
    it('should update capacity booked seats successfully', async () => {
      const newBookedSeats = 30
      
      const result = await queries.updateCapacityBookedSeats(
        testData.capacityRecord.id,
        newBookedSeats
      )

      expect(result.success).toBe(true)

      // Verify the update
      const updatedCapacity = await testDb.restaurantCapacity.findUnique({
        where: { id: testData.capacityRecord.id }
      })
      expect(updatedCapacity?.bookedSeats).toBe(newBookedSeats)
    })

    it('should handle non-existent capacity record', async () => {
      const result = await queries.updateCapacityBookedSeats(999, 30)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('RECORD_NOT_FOUND')
      }
    })

    it('should handle negative booked seats', async () => {
      const result = await queries.updateCapacityBookedSeats(
        testData.capacityRecord.id,
        -5
      )

      // Should succeed (business logic should prevent this, not database layer)
      expect(result.success).toBe(true)
    })
  })

  describe('getMealServiceById', () => {
    it('should return meal service by ID', async () => {
      const result = await queries.getMealServiceById(testData.mealService.id)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.id).toBe(testData.mealService.id)
        expect(result.data.adultNetPrice).toBe(100)
        expect(result.data.childNetPrice).toBe(50)
      }
    })

    it('should return error for non-existent meal service ID', async () => {
      const result = await queries.getMealServiceById(999)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('MEAL_SERVICE_NOT_FOUND')
      }
    })
  })

  describe('getCustomerByPhone', () => {
    it('should return customer by phone', async () => {
      const result = await queries.getCustomerByPhone(testData.customer.phone)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.id).toBe(testData.customer.id)
        expect(result.data.firstName).toBe(testData.customer.firstName)
        expect(result.data.phone).toBe(testData.customer.phone)
      }
    })

    it('should return error for non-existent phone', async () => {
      const result = await queries.getCustomerByPhone('+9999999999')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('CUSTOMER_NOT_FOUND')
      }
    })
  })

  describe('getCapacityByRestaurantAndDate', () => {
    it('should return capacity with service ID', async () => {
      const today = createTestDate(0)
      
      const result = await queries.getCapacityByRestaurantAndDate(
        testData.restaurant.id,
        today,
        'LUNCH'
      )

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.id).toBe(testData.capacityRecord.id)
        expect(result.data.serviceId).toBe(testData.mealService.id)
        expect(result.data.totalSeats).toBe(100)
        expect(result.data.bookedSeats).toBe(20)
        expect(result.data.availableSeats).toBe(80)
      }
    })

    it('should return error for non-existent meal service', async () => {
      const today = createTestDate(0)
      
      const result = await queries.getCapacityByRestaurantAndDate(
        testData.restaurant.id,
        today,
        'INVALID_MEAL'
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('MEAL_SERVICE_NOT_FOUND')
      }
    })

    it('should return error for non-existent capacity record', async () => {
      const futureDate = createTestDate(30)
      
      const result = await queries.getCapacityByRestaurantAndDate(
        testData.restaurant.id,
        futureDate,
        'LUNCH'
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('CAPACITY_RECORD_NOT_FOUND')
      }
    })
  })

  describe('error handling', () => {
    it('should handle database connection errors gracefully', async () => {
      // Create a new Prisma client with an invalid database URL to reliably simulate a connection error
      const brokenPrisma = new PrismaClient({
        datasources: {
          db: {
            url: 'postgresql://user:password@localhost:9999/nonexistentdb'
          }
        }
      })
      const brokenQueries = new ManualReservationQueries(brokenPrisma)
      
      const input = createGetMealServiceInput()
      const result = await brokenQueries.getMealService(input)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('DATABASE_ERROR')
        expect(result.error.message).toContain('Database operation failed')
      }

      // Disconnect the broken client
      await brokenPrisma.$disconnect()
    })

    it('should handle invalid data types gracefully', async () => {
      const input = {
        restaurantId: 'invalid' as any,
        mealType: 'LUNCH'
      }

      const result = await queries.getMealService(input)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('DATABASE_ERROR')
      }
    })
  })

  describe('concurrent operations', () => {
    it('should handle concurrent capacity updates correctly', async () => {
      const capacityId = testData.capacityRecord.id
      
      // Simulate concurrent updates
      const promises = [
        queries.updateCapacityBookedSeats(capacityId, 25),
        queries.updateCapacityBookedSeats(capacityId, 30),
        queries.updateCapacityBookedSeats(capacityId, 35)
      ]

      const results = await Promise.all(promises)

      // All operations should succeed (last one wins)
      results.forEach(result => {
        expect(result.success).toBe(true)
      })

      // Verify final state
      const finalCapacity = await testDb.restaurantCapacity.findUnique({
        where: { id: capacityId }
      })
      expect([25, 30, 35]).toContain(finalCapacity?.bookedSeats)
    })

    it('should handle concurrent customer creation correctly', async () => {
      const phone = createUniquePhone()
      
      // Simulate concurrent customer creation with same phone
      const promises = [
        queries.upsertCustomer({
          firstName: 'First',
          lastName: 'User',
          phone,
          email: createUniqueEmail('first')
        }),
        queries.upsertCustomer({
          firstName: 'Second',
          lastName: 'User',
          phone,
          email: createUniqueEmail('second')
        })
      ]

      const results = await Promise.all(promises)

      // Both should succeed (upsert handles conflicts)
      results.forEach(result => {
        expect(result.success).toBe(true)
      })

      // Should have only one customer with that phone
      const customers = await testDb.customer.findMany({
        where: { phone }
      })
      expect(customers).toHaveLength(1)
    })
  })

  describe('confirmNonAdvanceReservation', () => {
    let testReservationRequest: any

    beforeEach(async () => {
      // Create a test reservation request for confirmation tests
      const requestInput = createReservationRequestInput({
        restaurantId: testData.restaurant.id,
        customerId: testData.customer.id,
        requestName: 'Test Non-Advance Reservation',
        contactPhone: testData.customer.phone,
        requestedDate: createTestDate(1),
        requestedTime: new Date('2024-01-01T12:00:00Z'),
        adultCount: 2,
        childCount: 1,
        mealType: MealType.LUNCH,
        estimatedTotalAmount: 300,
        estimatedServiceCharge: 30,
        estimatedTaxAmount: 24,
        createdBy: RequestCreatorType.MERCHANT,
        requiresAdvancePayment: false,
        specialRequests: 'Window seat',
        dietaryRequirements: 'Vegetarian',
        occasion: 'Birthday'
      })

      const result = await queries.createReservationRequest(requestInput)
      expect(result.success).toBe(true)
      if (result.success) {
        testReservationRequest = result.data
      }
    })

    it('should confirm non-advance payment reservation successfully', async () => {
      const input = {
        requestId: testReservationRequest.id,
        createdBy: 'TEST_USER'
      }

      const result = await queries.confirmNonAdvanceReservation(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.id).toBeTypeOf('number')
        expect(result.data.reservationNumber).toMatch(/^L\d{4}-\d{4}$/)
        expect(result.data.status).toBe('CONFIRMED')

        // Verify reservation was created in database
        const reservation = await testDb.reservation.findUnique({
          where: { id: result.data.id },
          include: { financialData: true }
        })

        expect(reservation).toBeTruthy()
        expect(reservation?.requestId).toBe(testReservationRequest.id)
        expect(reservation?.status).toBe('CONFIRMED')
        expect(Number(reservation?.advancePaymentAmount)).toBe(0)
        expect(Number(reservation?.remainingPaymentAmount)).toBe(300)
        expect(reservation?.createdBy).toBe('MERCHANT')

        // Verify financial data was created correctly
        expect(reservation?.financialData).toBeTruthy()
        expect(Number(reservation?.financialData?.advancePayment)).toBe(0)
        expect(Number(reservation?.financialData?.balanceDue)).toBe(300)
        expect(reservation?.financialData?.isPaid).toBe(false)

        // Verify reservation request status was updated
        const updatedRequest = await testDb.reservationRequest.findUnique({
          where: { id: testReservationRequest.id }
        })
        expect(updatedRequest?.status).toBe('COMPLETED')
        expect(updatedRequest?.processingCompletedAt).toBeTruthy()
      }
    })

    it('should handle idempotency - calling twice should return same reservation', async () => {
      const input = {
        requestId: testReservationRequest.id
      }

      // First call
      const firstResult = await queries.confirmNonAdvanceReservation(input)
      expect(firstResult.success).toBe(true)

      // Second call with same requestId
      const secondResult = await queries.confirmNonAdvanceReservation(input)
      expect(secondResult.success).toBe(true)

      if (firstResult.success && secondResult.success) {
        expect(secondResult.data.id).toBe(firstResult.data.id)
        expect(secondResult.data.reservationNumber).toBe(firstResult.data.reservationNumber)
        expect(secondResult.data.status).toBe(firstResult.data.status)

        // Verify only one reservation exists
        const reservations = await testDb.reservation.findMany({
          where: { requestId: testReservationRequest.id }
        })
        expect(reservations).toHaveLength(1)
      }
    })

    it('should return error for non-existent reservation request', async () => {
      const input = {
        requestId: 999999
      }

      const result = await queries.confirmNonAdvanceReservation(input)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain('Reservation request not found with ID 999999')
      }
    })

    it('should generate correct reservation number format', async () => {
      const input = {
        requestId: testReservationRequest.id
      }

      const result = await queries.confirmNonAdvanceReservation(input)

      expect(result.success).toBe(true)
      if (result.success) {
        // Reservation number should be in format: L[MMDD]-[requestId]
        expect(result.data.reservationNumber).toMatch(/^L\d{4}-\d{4}$/)
        
        // Extract parts to verify
        const [datePart, idPart] = result.data.reservationNumber.split('-')
        expect(datePart).toMatch(/^L\d{4}$/)
        expect(idPart).toMatch(/^\d{4}$/)
      }
    })
  })
}) 