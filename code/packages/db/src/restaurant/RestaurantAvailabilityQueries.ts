import { PrismaClient } from '../../prisma/generated/prisma'
import { QueryResult } from '../types'
import { MealServiceAvailabilityData } from './types'

export class RestaurantAvailabilityQueries {
  constructor(private prisma: PrismaClient) {}

  /**
   * Get the last available capacity date for a restaurant and meal type
   */
  async getLastCapacityDate(input: {
    restaurantId: number
    mealType: string
  }): Promise<QueryResult<{ lastDate: string | null }>> {
    try {
      const { restaurantId, mealType } = input

      // First find the meal service ID
      const mealService = await this.prisma.restaurantMealService.findFirst({
        where: {
          restaurantId,
          mealType: mealType as any,
          isAvailable: true
        },
        select: { id: true }
      })

      if (!mealService) {
        return {
          success: false,
          error: { 
            code: 'MEAL_SERVICE_NOT_FOUND',
            message: 'Meal service not found or not available' 
          }
        }
      }

      // Find the last date with capacity data
      const lastCapacity = await this.prisma.restaurantCapacity.findFirst({
        where: {
          restaurantId,
          serviceId: mealService.id,
          isEnabled: true
        },
        orderBy: {
          date: 'desc'
        },
        select: {
          date: true
        }
      })

      let lastDate: string | null = null
      if (lastCapacity && lastCapacity.date) {
        const isoString = lastCapacity.date.toISOString().split('T')[0]
        lastDate = isoString || null
      }

      return {
        success: true,
        data: { lastDate }
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'getLastCapacityDate')
      }
    }
  }

  /**
   * Get all availability data in a single optimized query
   */
  async getMealServiceAvailability(input: {
    restaurantId: number
    mealType: string
    startDate: string
    endDate: string
  }): Promise<QueryResult<MealServiceAvailabilityData>> {
    try {
      const { restaurantId, mealType, startDate, endDate } = input
      
      const startDateObj = new Date(startDate)
      const endDateObj = new Date(endDate)

      const availabilityData = await this.prisma.restaurantMealService.findFirst({
        where: {
          restaurantId,
          mealType: mealType as any,
          isAvailable: true
        },
        include: {
          schedule: true,
          RestaurantCapacity: {
            where: {
              date: {
                gte: startDateObj,
                lte: endDateObj
              }
            }
          },
          restaurant: {
            include: {
              operatingHours: {
                where: { isOpen: true }
              },
              specialClosures: {
                where: {
                  closureStart: { lte: endDateObj },
                  closureEnd: { gte: startDateObj }
                }
              }
            }
          }
        }
      })

      if (!availabilityData) {
        return {
          success: false,
          error: { 
            code: 'MEAL_SERVICE_NOT_FOUND',
            message: 'Meal service not found or not available' 
          }
        }
      }



      return {
        success: true,
        data: {
          mealService: availabilityData,
          operatingHours: availabilityData.restaurant.operatingHours,
          specialClosures: availabilityData.restaurant.specialClosures,
          capacityData: availabilityData.RestaurantCapacity
        }
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'getMealServiceAvailability')
      }
    }
  }

  private handleDatabaseError(error: any, operation: string) {
    console.error(`Database error in ${operation}:`, error)
    return {
      code: 'DATABASE_ERROR',
      message: `Database operation failed: ${operation}. ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
} 