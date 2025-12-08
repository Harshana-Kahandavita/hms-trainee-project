import { PrismaClient } from '../../prisma/generated/prisma'
import {
  GetPlattersByMealServiceInput,
  GetPlatterByIdInput,
  GetDefaultPlatterInput,
  PlatterResult,
  PlatterListResult,
  QueryError,
  QueryResult
} from './types'

export class PlatterQueries {
  constructor(private prisma: PrismaClient) {}

  /**
   * Pure data access: Get all active platters for a specific meal service
   */
  async getPlattersByMealService(input: GetPlattersByMealServiceInput): Promise<QueryResult<PlatterListResult>> {
    try {
      const platters = await this.prisma.restaurantPlatter.findMany({
        where: {
          restaurantId: input.restaurantId,
          mealServiceId: input.mealServiceId,
          isActive: true
        },
        orderBy: [
          { updatedAt: 'desc' }, // Latest updated first
          { displayOrder: 'asc' }, // Then by display order
          { createdAt: 'asc' } // Finally by creation time
        ]
      })

      const transformedPlatters: PlatterResult[] = platters.map(platter => ({
        id: platter.id,
        restaurantId: platter.restaurantId,
        mealServiceId: platter.mealServiceId,
        platterName: platter.platterName,
        platterDescription: platter.platterDescription,
        headCount: platter.headCount,
        adultGrossPrice: Number(platter.adultGrossPrice),
        childGrossPrice: Number(platter.childGrossPrice),
        adultNetPrice: Number(platter.adultNetPrice),
        childNetPrice: Number(platter.childNetPrice),
        isActive: platter.isActive,
        displayOrder: platter.displayOrder,
        isDefault: platter.isDefault,
        features: platter.features,
        images: platter.images,
        createdAt: platter.createdAt,
        updatedAt: platter.updatedAt
      }))

      return {
        success: true,
        data: {
          platters: transformedPlatters,
          totalCount: transformedPlatters.length
        }
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'getPlattersByMealService')
      }
    }
  }

  /**
   * Pure data access: Get specific platter by ID
   */
  async getPlatterById(input: GetPlatterByIdInput): Promise<QueryResult<PlatterResult>> {
    try {
      const platter = await this.prisma.restaurantPlatter.findUnique({
        where: {
          id: input.platterId
        }
      })

      if (!platter) {
        return {
          success: false,
          error: {
            code: 'PLATTER_NOT_FOUND',
            message: `No platter found with ID ${input.platterId}`
          }
        }
      }

      if (!platter.isActive) {
        return {
          success: false,
          error: {
            code: 'PLATTER_NOT_ACTIVE',
            message: `Platter with ID ${input.platterId} is not active`
          }
        }
      }

      return {
        success: true,
        data: {
          id: platter.id,
          restaurantId: platter.restaurantId,
          mealServiceId: platter.mealServiceId,
          platterName: platter.platterName,
          platterDescription: platter.platterDescription,
          headCount: platter.headCount,
          adultGrossPrice: Number(platter.adultGrossPrice),
          childGrossPrice: Number(platter.childGrossPrice),
          adultNetPrice: Number(platter.adultNetPrice),
          childNetPrice: Number(platter.childNetPrice),
          isActive: platter.isActive,
          displayOrder: platter.displayOrder,
          isDefault: platter.isDefault,
          features: platter.features,
          images: platter.images,
          createdAt: platter.createdAt,
          updatedAt: platter.updatedAt
        }
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'getPlatterById')
      }
    }
  }

  /**
   * Pure data access: Get default platter for a meal service
   */
  async getDefaultPlatter(input: GetDefaultPlatterInput): Promise<QueryResult<PlatterResult | null>> {
    try {
      const defaultPlatter = await this.prisma.restaurantPlatter.findFirst({
        where: {
          restaurantId: input.restaurantId,
          mealServiceId: input.mealServiceId,
          isActive: true,
          isDefault: true
        },
        orderBy: {
          displayOrder: 'asc'
        }
      })

      if (!defaultPlatter) {
        return {
          success: true,
          data: null // No default platter is not an error
        }
      }

      return {
        success: true,
        data: {
          id: defaultPlatter.id,
          restaurantId: defaultPlatter.restaurantId,
          mealServiceId: defaultPlatter.mealServiceId,
          platterName: defaultPlatter.platterName,
          platterDescription: defaultPlatter.platterDescription,
          headCount: defaultPlatter.headCount,
          adultGrossPrice: Number(defaultPlatter.adultGrossPrice),
          childGrossPrice: Number(defaultPlatter.childGrossPrice),
          adultNetPrice: Number(defaultPlatter.adultNetPrice),
          childNetPrice: Number(defaultPlatter.childNetPrice),
          isActive: defaultPlatter.isActive,
          displayOrder: defaultPlatter.displayOrder,
          isDefault: defaultPlatter.isDefault,
          features: defaultPlatter.features,
          images: defaultPlatter.images,
          createdAt: defaultPlatter.createdAt,
          updatedAt: defaultPlatter.updatedAt
        }
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'getDefaultPlatter')
      }
    }
  }

  /**
   * Pure data access: Check if meal service has any platters
   */
  async hasPlatters(restaurantId: number, mealServiceId: number): Promise<QueryResult<boolean>> {
    try {
      const count = await this.prisma.restaurantPlatter.count({
        where: {
          restaurantId,
          mealServiceId,
          isActive: true
        }
      })

      return {
        success: true,
        data: count > 0
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'hasPlatters')
      }
    }
  }

  /**
   * Error handling utility - following same pattern as ManualReservationQueries
   */
  private handleDatabaseError(error: any, operation: string): QueryError {
    const queryError: QueryError = {
      code: 'DATABASE_ERROR',
      message: `Database operation failed: ${operation}`,
      details: error
    }

    // Handle specific Prisma errors
    if (error.code === 'P2002') {
      queryError.code = 'UNIQUE_CONSTRAINT_VIOLATION'
      queryError.message = 'Unique constraint violation'
    } else if (error.code === 'P2025') {
      queryError.code = 'RECORD_NOT_FOUND'
      queryError.message = 'Record not found'
    } else if (error.code === 'P2003') {
      queryError.code = 'FOREIGN_KEY_CONSTRAINT_VIOLATION'
      queryError.message = 'Foreign key constraint violation'
    } else if (error.code === 'P2014') {
      queryError.code = 'INVALID_ID'
      queryError.message = 'Invalid ID provided'
    }

    return queryError
  }
} 