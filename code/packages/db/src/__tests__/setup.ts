import { PrismaClient } from '../../prisma/generated/prisma'
import { execSync } from 'child_process'
import { randomBytes } from 'crypto'

let testDb: PrismaClient

export async function setupTestDatabase(): Promise<PrismaClient> {
  // Generate unique database name for this test run
  const testDbName = `test_manual_reservation_${randomBytes(8).toString('hex')}`
  
  // Create test database URL
  const originalUrl = process.env.DATABASE_URL
  if (!originalUrl) {
    throw new Error('DATABASE_URL environment variable is required for testing')
  }

  const testDatabaseUrl = originalUrl.replace(
    /\/[^\/]+(\?|$)/,
    `/${testDbName}$1`
  )

  // Set test database URL
  process.env.DATABASE_URL = testDatabaseUrl

  // Create new Prisma client
  testDb = new PrismaClient({
    datasources: {
      db: {
        url: testDatabaseUrl
      }
    }
  })

  // Run migrations
  try {
    execSync('npx prisma migrate deploy', { 
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: testDatabaseUrl }
    })
  } catch (error) {
    console.error('Failed to run migrations:', error)
    throw error
  }

  // Connect to database
  await testDb.$connect()

  return testDb
}

export async function cleanupTestDatabase(prisma: PrismaClient): Promise<void> {
  try {
    // Clean up test data in reverse dependency order
    
    // Clean up promo code related tables first (they depend on reservations and customers)
    await prisma.promoCodeUsage.deleteMany()
    await prisma.promoCodeCustomerMapping.deleteMany()
    await prisma.promoCodeRestaurantMapping.deleteMany()
    await prisma.promoCode.deleteMany()
    
    // Clean up reservations and requests
    await prisma.reservation.deleteMany()
    await prisma.reservationRequest.deleteMany()
    
    // Clean up customers
    await prisma.customer.deleteMany()
    
    // Clean up restaurant related data
    await prisma.restaurantCapacity.deleteMany()
    // Delete restaurant platters before meal services due to foreign key constraint
    await prisma.restaurantPlatter.deleteMany()
    await prisma.restaurantMealService.deleteMany()
    await prisma.restaurant.deleteMany()
    
    // Clean up business and location data
    await prisma.business.deleteMany()
    await prisma.location.deleteMany()

    // Disconnect
    await prisma.$disconnect()
  } catch (error) {
    console.error('Error during cleanup:', error)
    // Still try to disconnect
    await prisma.$disconnect()
  }
}

export async function seedTestData(prisma: PrismaClient): Promise<{
  restaurant: any
  mealService: any
  customer: any
  capacityRecord: any
}> {
  // Create test business
  const business = await prisma.business.create({
    data: {
      name: 'Test Business',
      address: '123 Business St',
      phone: '1234567890',
      email: 'business@test.com',
      website: 'https://test.com',
      taxId: 'TX12345',
      registrationNumber: 'RN12345'
    }
  })

  // Create test location
  const location = await prisma.location.create({
    data: {
      city: 'Test City',
      state: 'Test State',
      postalCode: '12345'
    }
  })

  // Create test restaurant
  const restaurant = await prisma.restaurant.create({
    data: {
      businessId: business.id,
      name: 'Test Restaurant',
      locationId: location.id,
      address: '123 Test Street',
      phone: '+1234567890',
      capacity: 100,
      onlineQuota: 80
    }
  })

  // Create test meal service
  const mealService = await prisma.restaurantMealService.create({
    data: {
      restaurantId: restaurant.id,
      mealType: 'LUNCH',
      serviceStartTime: new Date('2024-01-01T12:00:00Z'),
      serviceEndTime: new Date('2024-01-01T15:00:00Z'),
      adultGrossPrice: 110,
      childGrossPrice: 55,
      adultNetPrice: 100,
      childNetPrice: 50,
      childAgeLimit: 12,
      isChildEnabled: true,
      serviceChargePercentage: 10,
      taxPercentage: 8,
      priceUpdatedAt: new Date(),
      isAvailable: true
    }
  })

  // Create test capacity for today
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const capacityRecord = await prisma.restaurantCapacity.create({
    data: {
      restaurantId: restaurant.id,
      serviceId: mealService.id,
      date: today,
      totalSeats: 100,
      bookedSeats: 20
    }
  })

  // Create test customer
  const customer = await prisma.customer.create({
    data: {
      firstName: 'Test',
      lastName: 'Customer',
      phone: '+1234567890',
      email: 'test@customer.com'
    }
  })

  return {
    restaurant,
    mealService,
    customer,
    capacityRecord
  }
} 