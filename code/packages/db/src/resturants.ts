import { PrismaClient, MealType, Restaurant, RestaurantOperatingHours, RestaurantSpecialClosure, RestaurantMealService, RestaurantCapacity } from '../prisma/generated/prisma'
import {addMinutes, format, parse, isWithinInterval, setMinutes, setHours} from 'date-fns'

// Types for the request
export interface FindAvailableSlotsRequest {
  restaurantId: number
  date: string // YYYY-MM-DD format
  mealType: MealType
  partySize: number
}

// Types for the response
export interface TimeSlot {
  time: string // HH:mm format
  available: boolean
  availableSeats: number
  reason?: string
}

export interface FindAvailableSlotsResponse {
  restaurantId: number
  date: string
  mealType: MealType
  slots: TimeSlot[]
}

export interface MealTypeAvailability {
  mealType: MealType;
  totalSeats: number;
  bookedSeats: number;
  availableSeats: number;
  isAvailable: boolean;
  serviceStartTime: string;
  serviceEndTime: string;
  mealServiceId: number;
  hasPlatter: boolean;
}

export interface RestaurantAvailabilityResponse {
  restaurantId: number;
  date: string;
  mealTypes: MealTypeAvailability[];
}

export async function findAvailableSlots(
  prisma: PrismaClient,
  request: FindAvailableSlotsRequest
): Promise<FindAvailableSlotsResponse> {
  const { restaurantId, date, mealType, partySize } = request
  const requestDate = new Date(date)
  const dayOfWeek = format(requestDate, 'EEEE').toUpperCase()

  // Get restaurant details with related data
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    include: {
      operatingHours: true,
      specialClosures: true,
      mealServices: {
        where: {
          mealType,
          isAvailable: true
        }
      },
      capacityRecords: {
        where: {
          date: requestDate,
        },
        include: {
          mealService: true,
        },
      },
    },
  })

  if (!restaurant) {
    throw new Error('Restaurant not found')
  }

  console.log("===>> Day of the week", dayOfWeek)

  // Check if restaurant is closed for the day
  const operatingHours = restaurant.operatingHours.find(
    (oh) => oh.dayOfWeek === dayOfWeek
  )

  console.log("===>> Operating hours", operatingHours)

  if (!operatingHours || !operatingHours.isOpen) {
    return {
      restaurantId,
      date,
      mealType,
      slots: [],
    }
  }

  // Check for special closures
  const isSpeciallyClosed = restaurant.specialClosures.some((closure) =>
    isWithinInterval(requestDate, {
      start: closure.closureStart,
      end: closure.closureEnd,
    })
  )

  console.log("===>> Is specially closed", isSpeciallyClosed)

  if (isSpeciallyClosed) {
    return {
      restaurantId,
      date,
      mealType,
      slots: [],
    }
  }

  // Get meal service for the requested meal type
  const mealService = restaurant.mealServices[0]
  console.log("===>> Meal service", mealService)
  if (!mealService) {
    return {
      restaurantId,
      date,
      mealType,
      slots: [],
    }
  }

  // Generate time slots
  const slots: TimeSlot[] = []

  const startHours = mealService.serviceStartTime.getUTCHours();
  const startMinutes = mealService.serviceStartTime.getUTCMinutes();
  let currentTime = setMinutes(setHours(requestDate, startHours), startMinutes);

  const endHours = mealService.serviceEndTime.getUTCHours();
  const endMinutes = mealService.serviceEndTime.getUTCMinutes();
  const endTime = setMinutes(setHours(requestDate, endHours), endMinutes);


  // Find capacity record for the date
  const capacityRecord = restaurant.capacityRecords.find(
    (cr) => cr.serviceId === mealService.id
  )

  console.log("===>> Capacity record", capacityRecord)

  if(!capacityRecord) {
    return {
        restaurantId,
        date,
        mealType,
        slots: [],
      }
  }

  console.log("===>> requestDate, currentTime endTime", requestDate, currentTime, endTime)

  // Generate slots in 30-minute intervals
  while (currentTime < endTime) {
    const timeStr = format(currentTime, 'HH:mm')
    const remainingCapacity = capacityRecord
      ? capacityRecord.totalSeats - capacityRecord.bookedSeats
      : operatingHours.onlineQuota

    const slot: TimeSlot = {
      time: timeStr,
      available: remainingCapacity >= partySize,
      availableSeats: remainingCapacity,
    }

    if (!slot.available) {
      slot.reason = 'Insufficient capacity for the requested party size'
    }

    slots.push(slot)
    currentTime = addMinutes(currentTime, 30)
  }

  return {
    restaurantId,
    date,
    mealType,
    slots,
  }
}

// Helper function to check if a restaurant is available for a specific slot
export async function checkSlotAvailability(
  prisma: PrismaClient,
  restaurantId: number,
  date: string,
  time: string,
  mealType: MealType,
  partySize: number
): Promise<boolean> {
  const availableSlots = await findAvailableSlots(prisma, {
    restaurantId,
    date,
    mealType,
    partySize,
  })

  const slot = availableSlots.slots.find((s) => s.time === time)
  return slot?.available ?? false
}

/**
 * Get available seats for each meal type for a given restaurant and date
 */
export async function getAvailableSeatsByMealType(
  prisma: PrismaClient,
  restaurantId: number,
  date: string
): Promise<RestaurantAvailabilityResponse> {
  const requestDate = new Date(date)
  const dayOfWeek = format(requestDate, 'EEEE').toUpperCase()

  // Get restaurant with all necessary data
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    include: {
      operatingHours: true,
      specialClosures: true,
      mealServices: {
        where: {
          isAvailable: true
        },
        include: {
          platters: {
            where: { isActive: true }
          }
        }
      },
      capacityRecords: {
        where: { date: requestDate },
      },
    },
  })

  if (!restaurant) {
    throw new Error('Restaurant not found')
  }

  // Check if restaurant is closed for the day
  const operatingHours = restaurant.operatingHours.find(
    (oh) => oh.dayOfWeek === dayOfWeek
  )

  if (!operatingHours || !operatingHours.isOpen) {
    return {
      restaurantId,
      date,
      mealTypes: [],
    }
  }

  // Check for special closures
  const isSpeciallyClosed = restaurant.specialClosures.some((closure) =>
    isWithinInterval(requestDate, {
      start: closure.closureStart,
      end: closure.closureEnd,
    })
  )

  if (isSpeciallyClosed) {
    return {
      restaurantId,
      date,
      mealTypes: [],
    }
  }

  // Process each meal service
  const mealTypes: MealTypeAvailability[] = restaurant.mealServices.map(service => {
    const capacityRecord = restaurant.capacityRecords.find(
      record => record.serviceId === service.id
    )

    if (capacityRecord) {
      const availableSeats = capacityRecord.totalSeats - capacityRecord.bookedSeats
      
      return {
        mealType: service.mealType,
        totalSeats: capacityRecord.totalSeats,
        bookedSeats: capacityRecord.bookedSeats,
        availableSeats,
        isAvailable: service.isAvailable && availableSeats > 0,
        serviceStartTime: service.serviceStartTime.toLocaleTimeString(),
        serviceEndTime: service.serviceEndTime.toLocaleTimeString(),
        mealServiceId: service.id,
        hasPlatter: service.platters.length > 0
      }
    } else {
      // If no capacity record exists, use operating hours quota
      return {
        mealType: service.mealType,
        totalSeats: operatingHours.onlineQuota,
        bookedSeats: 0,
        availableSeats: operatingHours.onlineQuota,
        isAvailable: service.isAvailable,
        serviceStartTime: service.serviceStartTime.toLocaleTimeString(),
        serviceEndTime: service.serviceEndTime.toLocaleTimeString(),
        mealServiceId: service.id,
        hasPlatter: service.platters.length > 0
      }
    }
  })

  return {
    restaurantId,
    date,
    mealTypes,
  }
}

