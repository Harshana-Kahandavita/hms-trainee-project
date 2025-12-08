import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PrismaClient } from '../../prisma/generated/prisma'
import { PlatterQueries } from './PlatterQueries'
import { setupTestDatabase, cleanupTestDatabase, seedTestData } from '../__tests__/setup'
import {
  createGetPlattersByMealServiceInput,
  createGetPlatterByIdInput,
  createGetDefaultPlatterInput,
  createTestPlatterData
} from '../__tests__/factories'

describe('PlatterQueries', () => {
  let testDb: PrismaClient
  let queries: PlatterQueries
  let testData: any

  beforeEach(async () => {
    testDb = await setupTestDatabase()
    queries = new PlatterQueries(testDb)
    testData = await seedTestData(testDb)
  })

  afterEach(async () => {
    await cleanupTestDatabase(testDb)
  })

  describe('getPlattersByMealService', () => {
    it('should return empty list when no platters exist', async () => {
      const input = createGetPlattersByMealServiceInput({
        restaurantId: testData.restaurant.id,
        mealServiceId: testData.mealService.id
      })

      const result = await queries.getPlattersByMealService(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.platters).toHaveLength(0)
        expect(result.data.totalCount).toBe(0)
      }
    })

    it('should return platters sorted by default, display order, and creation time', async () => {
      // Create test platters
      const platter1 = await testDb.restaurantPlatter.create({
        data: createTestPlatterData({
          restaurantId: testData.restaurant.id,
          mealServiceId: testData.mealService.id,
          platterName: 'Standard Buffet',
          isDefault: false,
          displayOrder: 2
        })
      })

      const platter2 = await testDb.restaurantPlatter.create({
        data: createTestPlatterData({
          restaurantId: testData.restaurant.id,
          mealServiceId: testData.mealService.id,
          platterName: 'Premium Buffet',
          isDefault: true,
          displayOrder: 1
        })
      })

      const input = createGetPlattersByMealServiceInput({
        restaurantId: testData.restaurant.id,
        mealServiceId: testData.mealService.id
      })

      const result = await queries.getPlattersByMealService(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.platters).toHaveLength(2)
        expect(result.data.platters[0].isDefault).toBe(true) // Default first
        expect(result.data.platters[0].platterName).toBe('Premium Buffet')
        expect(result.data.platters[1].isDefault).toBe(false)
        expect(result.data.platters[1].platterName).toBe('Standard Buffet')
      }
    })

    it('should only return active platters', async () => {
      // Create active and inactive platters
      await testDb.restaurantPlatter.create({
        data: createTestPlatterData({
          restaurantId: testData.restaurant.id,
          mealServiceId: testData.mealService.id,
          platterName: 'Active Platter',
          isActive: true
        })
      })

      await testDb.restaurantPlatter.create({
        data: createTestPlatterData({
          restaurantId: testData.restaurant.id,
          mealServiceId: testData.mealService.id,
          platterName: 'Inactive Platter',
          isActive: false
        })
      })

      const input = createGetPlattersByMealServiceInput({
        restaurantId: testData.restaurant.id,
        mealServiceId: testData.mealService.id
      })

      const result = await queries.getPlattersByMealService(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.platters).toHaveLength(1)
        expect(result.data.platters[0].platterName).toBe('Active Platter')
        expect(result.data.platters[0].isActive).toBe(true)
      }
    })

    it('should handle database errors gracefully', async () => {
      const invalidPrisma = {} as any
      const invalidQueries = new PlatterQueries(invalidPrisma)

      const input = createGetPlattersByMealServiceInput()
      const result = await invalidQueries.getPlattersByMealService(input)

      expect(result.success).toBe(false)
      expect(result.error.code).toBe('DATABASE_ERROR')
    })
  })

  describe('getPlatterById', () => {
    it('should return platter when found and active', async () => {
      const platter = await testDb.restaurantPlatter.create({
        data: createTestPlatterData({
          restaurantId: testData.restaurant.id,
          mealServiceId: testData.mealService.id,
          platterName: 'Test Platter',
          isActive: true
        })
      })

      const input = createGetPlatterByIdInput({ platterId: platter.id })
      const result = await queries.getPlatterById(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.id).toBe(platter.id)
        expect(result.data.platterName).toBe('Test Platter')
        expect(result.data.isActive).toBe(true)
        expect(result.data.adultNetPrice).toBe(30.00)
        expect(result.data.childNetPrice).toBe(18.00)
      }
    })

    it('should return error when platter not found', async () => {
      const input = createGetPlatterByIdInput({ platterId: 999 })
      const result = await queries.getPlatterById(input)

      expect(result.success).toBe(false)
      expect(result.error.code).toBe('PLATTER_NOT_FOUND')
      expect(result.error.message).toContain('No platter found with ID 999')
    })

    it('should return error when platter is not active', async () => {
      const platter = await testDb.restaurantPlatter.create({
        data: createTestPlatterData({
          restaurantId: testData.restaurant.id,
          mealServiceId: testData.mealService.id,
          isActive: false
        })
      })

      const input = createGetPlatterByIdInput({ platterId: platter.id })
      const result = await queries.getPlatterById(input)

      expect(result.success).toBe(false)
      expect(result.error.code).toBe('PLATTER_NOT_ACTIVE')
      expect(result.error.message).toContain('is not active')
    })
  })

  describe('getDefaultPlatter', () => {
    it('should return null when no default platter exists', async () => {
      const input = createGetDefaultPlatterInput({
        restaurantId: testData.restaurant.id,
        mealServiceId: testData.mealService.id
      })

      const result = await queries.getDefaultPlatter(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBeNull()
      }
    })

    it('should return default platter when one exists', async () => {
      // Create non-default platter
      await testDb.restaurantPlatter.create({
        data: createTestPlatterData({
          restaurantId: testData.restaurant.id,
          mealServiceId: testData.mealService.id,
          platterName: 'Regular Platter',
          isDefault: false
        })
      })

      // Create default platter
      const defaultPlatter = await testDb.restaurantPlatter.create({
        data: createTestPlatterData({
          restaurantId: testData.restaurant.id,
          mealServiceId: testData.mealService.id,
          platterName: 'Default Platter',
          isDefault: true
        })
      })

      const input = createGetDefaultPlatterInput({
        restaurantId: testData.restaurant.id,
        mealServiceId: testData.mealService.id
      })

      const result = await queries.getDefaultPlatter(input)

      expect(result.success).toBe(true)
      if (result.success && result.data) {
        expect(result.data.id).toBe(defaultPlatter.id)
        expect(result.data.platterName).toBe('Default Platter')
        expect(result.data.isDefault).toBe(true)
      }
    })

    it('should return first default platter by display order when multiple exist', async () => {
      // Create multiple default platters with different display orders
      await testDb.restaurantPlatter.create({
        data: createTestPlatterData({
          restaurantId: testData.restaurant.id,
          mealServiceId: testData.mealService.id,
          platterName: 'Default Platter 2',
          isDefault: true,
          displayOrder: 2
        })
      })

      const firstDefault = await testDb.restaurantPlatter.create({
        data: createTestPlatterData({
          restaurantId: testData.restaurant.id,
          mealServiceId: testData.mealService.id,
          platterName: 'Default Platter 1',
          isDefault: true,
          displayOrder: 1
        })
      })

      const input = createGetDefaultPlatterInput({
        restaurantId: testData.restaurant.id,
        mealServiceId: testData.mealService.id
      })

      const result = await queries.getDefaultPlatter(input)

      expect(result.success).toBe(true)
      if (result.success && result.data) {
        expect(result.data.id).toBe(firstDefault.id)
        expect(result.data.platterName).toBe('Default Platter 1')
        expect(result.data.displayOrder).toBe(1)
      }
    })
  })

  describe('hasPlatters', () => {
    it('should return false when no platters exist', async () => {
      const result = await queries.hasPlatters(testData.restaurant.id, testData.mealService.id)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(false)
      }
    })

    it('should return true when active platters exist', async () => {
      await testDb.restaurantPlatter.create({
        data: createTestPlatterData({
          restaurantId: testData.restaurant.id,
          mealServiceId: testData.mealService.id,
          isActive: true
        })
      })

      const result = await queries.hasPlatters(testData.restaurant.id, testData.mealService.id)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(true)
      }
    })

    it('should return false when only inactive platters exist', async () => {
      await testDb.restaurantPlatter.create({
        data: createTestPlatterData({
          restaurantId: testData.restaurant.id,
          mealServiceId: testData.mealService.id,
          isActive: false
        })
      })

      const result = await queries.hasPlatters(testData.restaurant.id, testData.mealService.id)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(false)
      }
    })
  })
}) 