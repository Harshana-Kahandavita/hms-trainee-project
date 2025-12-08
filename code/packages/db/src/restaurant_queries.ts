import { PrismaClient, MealType, Prisma } from '../prisma/generated/prisma'
import { QueryResult } from './types'

export interface RestaurantOperatingData {
  id: number
  operatingHours: {
    dayOfWeek: string
    isOpen: boolean
    onlineQuota: number
  }[]
  specialClosures: {
    closureStart: Date
    closureEnd: Date
  }[]
}

export interface MealServiceWithCapacity {
  id: number
  mealType: MealType
  serviceStartTime: Date
  serviceEndTime: Date
  isAvailable: boolean
  platters: {
    id: number
    isActive: boolean
    headCount: number
  }[]
  capacityRecord?: {
    totalSeats: number
    bookedSeats: number
  }
}

export interface RestaurantQueryError {
  code: string
  message: string
}

/**
 * Get restaurant operating data including operating hours and special closures
 */
export async function getRestaurantOperatingData(
  prisma: PrismaClient,
  restaurantId: number,
  date: Date
): Promise<QueryResult<RestaurantOperatingData>> {
  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        operatingHours: {
          select: {
            dayOfWeek: true,
            isOpen: true,
            onlineQuota: true
          }
        },
        specialClosures: {
          where: {
            closureStart: { lte: date },
            closureEnd: { gte: date }
          },
          select: {
            closureStart: true,
            closureEnd: true
          }
        }
      }
    })

    if (!restaurant) {
      return {
        success: false,
        error: {
          code: 'RESTAURANT_NOT_FOUND',
          message: `Restaurant with id ${restaurantId} not found`
        }
      }
    }

    return {
      success: true,
      data: restaurant
    }
  } catch (error) {
    console.error('Error fetching restaurant operating data:', error)
    return {
      success: false,
      error: {
        code: 'DB_ERROR',
        message: error instanceof Error ? error.message : 'Unknown database error'
      }
    }
  }
}

/**
 * Get meal services with capacity and platter information
 */
export async function getRestaurantMealServicesWithCapacity(
  prisma: PrismaClient,
  restaurantId: number,
  date: Date
): Promise<QueryResult<MealServiceWithCapacity[]>> {
  try {
    const mealServices = await prisma.restaurantMealService.findMany({
      where: {
        restaurantId,
        isAvailable: true
      },
      include: {
        platters: {
          where: { isActive: true },
          select: {
            id: true,
            isActive: true,
            headCount: true
          }
        },
        RestaurantCapacity: {
          where: { date },
          select: {
            totalSeats: true,
            bookedSeats: true
          }
        }
      }
    })

    const servicesWithCapacity = mealServices.map(service => ({
      id: service.id,
      mealType: service.mealType,
      serviceStartTime: service.serviceStartTime,
      serviceEndTime: service.serviceEndTime,
      isAvailable: service.isAvailable,
      platters: service.platters,
      capacityRecord: service.RestaurantCapacity[0]
    }))

    return {
      success: true,
      data: servicesWithCapacity
    }
  } catch (error) {
    console.error('Error fetching meal services with capacity:', error)
    return {
      success: false,
      error: {
        code: 'DB_ERROR',
        message: error instanceof Error ? error.message : 'Unknown database error'
      }
    }
  }
} 