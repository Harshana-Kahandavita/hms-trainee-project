import { PrismaClient } from '../../prisma/generated/prisma'
import { MealType } from '../../prisma/generated/prisma'

export interface QuotaCountResult {
  onlineBookings: number
  manualBookings: number
  totalBookings: number
}

export interface RestaurantQuotaInfo {
  restaurantId: number
  totalCapacity: number
  onlineQuota: number
  manualQuota: number
}

export interface QuotaAvailabilityResult {
  totalAvailable: number
  onlineAvailable: number
  manualAvailable: number
  currentBookings: QuotaCountResult
  quotaInfo: RestaurantQuotaInfo
}

export class CapacityQuotaQueries {
  constructor(private prisma: PrismaClient) {}

  /**
   * Get restaurant quota configuration
   */
  async getRestaurantQuotaInfo(restaurantId: number): Promise<RestaurantQuotaInfo | null> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        capacity: true,
        onlineQuota: true
      }
    })

    if (!restaurant) {
      return null
    }

    return {
      restaurantId: restaurant.id,
      totalCapacity: restaurant.capacity,
      onlineQuota: restaurant.onlineQuota,
      manualQuota: restaurant.capacity - restaurant.onlineQuota
    }
  }

  /**
   * Count current confirmed reservations by source type for a specific date and meal
   * Note: We only count confirmed reservations because bookedSeats already accounts for all bookings
   */
  async countBookingsBySource(
    restaurantId: number,
    date: Date,
    mealType: MealType
  ): Promise<QuotaCountResult> {
    // Count only confirmed reservations by source
    const [onlineReservations, manualReservations] = await Promise.all([
      // Online reservations (created by customers via guest-web)
      this.prisma.reservation.aggregate({
        where: {
          restaurantId,
          reservationDate: date,
          mealType,
          createdBy: 'CUSTOMER',
          status: { notIn: ['CANCELLED', 'REJECTED'] }
        },
        _sum: {
          adultCount: true,
          childCount: true
        }
      }),
      // Manual reservations (created by restaurant staff)
      this.prisma.reservation.aggregate({
        where: {
          restaurantId,
          reservationDate: date,
          mealType,
          createdBy: 'MERCHANT',
          status: { notIn: ['CANCELLED', 'REJECTED'] }
        },
        _sum: {
          adultCount: true,
          childCount: true
        }
      })
    ])

    // Calculate totals (handle null values from aggregate)
    const onlineBookings = (onlineReservations._sum.adultCount || 0) + (onlineReservations._sum.childCount || 0)
    const manualBookings = (manualReservations._sum.adultCount || 0) + (manualReservations._sum.childCount || 0)
    const totalBookings = onlineBookings + manualBookings

    return {
      onlineBookings,
      manualBookings,
      totalBookings
    }
  }

  /**
   * Get capacity record for restaurant, date, and meal type
   */
  async getCapacityRecord(
    restaurantId: number,
    date: Date,
    mealType: MealType
  ) {
    // First find the meal service
    const mealService = await this.prisma.restaurantMealService.findFirst({
      where: {
        restaurantId,
        mealType,
        isAvailable: true
      }
    })

    if (!mealService) {
      return null
    }

    // Then find the capacity record
    const capacityRecord = await this.prisma.restaurantCapacity.findFirst({
      where: {
        restaurantId,
        serviceId: mealService.id,
        date: date,
        isEnabled: true // Only consider enabled capacity records
      }
    })

    return capacityRecord ? {
      id: capacityRecord.id,
      totalSeats: capacityRecord.totalSeats,
      bookedSeats: capacityRecord.bookedSeats,
      serviceId: mealService.id
    } : null
  }

  /**
   * Get complete quota availability for a restaurant, date, and meal
   */
  async getQuotaAvailability(
    restaurantId: number,
    date: Date,
    mealType: MealType
  ): Promise<QuotaAvailabilityResult | null> {
    // Get restaurant quota info
    const quotaInfo = await this.getRestaurantQuotaInfo(restaurantId)
    if (!quotaInfo) {
      return null
    }

    // Get current booking counts
    const currentBookings = await this.countBookingsBySource(restaurantId, date, mealType)

    // Get capacity record
    const capacityRecord = await this.getCapacityRecord(restaurantId, date, mealType)
    if (!capacityRecord) {
      return null
    }

    // Calculate availability
    const onlineAvailable = Math.max(0, quotaInfo.onlineQuota - currentBookings.onlineBookings)
    const manualAvailable = Math.max(0, quotaInfo.manualQuota - currentBookings.manualBookings)
    const totalAvailable = capacityRecord.totalSeats - capacityRecord.bookedSeats

    return {
      totalAvailable,
      onlineAvailable,
      manualAvailable,
      currentBookings,
      quotaInfo
    }
  }

  /**
   * Update capacity booked seats (maintains existing functionality)
   */
  async updateCapacityBookedSeats(capacityId: number, newBookedSeats: number): Promise<boolean> {
    try {
      await this.prisma.restaurantCapacity.update({
        where: { id: capacityId },
        data: { bookedSeats: newBookedSeats }
      })
      return true
    } catch (error) {
      console.error('Failed to update capacity booked seats:', error)
      return false
    }
  }
} 