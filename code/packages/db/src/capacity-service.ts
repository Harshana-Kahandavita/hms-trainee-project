import { PrismaClient } from '../prisma/generated/prisma';
import { addDays, format } from 'date-fns'

// Comprehensive error message mapping for user-friendly responses
const getDescriptiveErrorMessage = (error: unknown, context?: string): string => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorLower = errorMessage.toLowerCase();
  
  // Database connection errors
  if (errorLower.includes('connection') || errorLower.includes('timeout') || errorLower.includes('network')) {
    return "Database connection failed. Please check your internet connection and try again.";
  }
  
  // Capacity specific errors
  if (errorLower.includes('capacity record not found')) {
    return "Capacity information not found for the selected date. Please try again.";
  }
  
  if (errorLower.includes('capacity exceeded')) {
    return "The requested capacity exceeds available space. Please reduce the number of slots.";
  }
  
  if (errorLower.includes('already booked') || errorLower.includes('booked seats')) {
    return "Some slots are already booked. Please adjust the capacity accordingly.";
  }
  
  if (errorLower.includes('meal service not found')) {
    return "The selected meal service is no longer available. Please refresh the page.";
  }
  
  if (errorLower.includes('restaurant not found')) {
    return "Restaurant information not found. Please contact support.";
  }
  
  // Default messages based on context
  switch (context) {
    case 'capacity':
      return "Failed to check or update restaurant capacity. Please try again or contact support if the problem persists.";
    case 'population':
      return "Failed to populate restaurant capacity records. Please try again or contact support if the problem persists.";
    default:
      return "An unexpected error occurred while managing capacity. Please try again or contact support if the problem persists.";
  }
};

interface CapacityPopulationResult {
  restaurantId: number
  recordsAdded: number
}

export async function populateRestaurantCapacity(
  prisma: PrismaClient,
  daysAhead: number,
  defaultTotalSeats: number
): Promise<CapacityPopulationResult[]> {
  const results: CapacityPopulationResult[] = []
  const startDate = new Date()
  startDate.setHours(0, 0, 0, 0)
  const cleanupStartTime = new Date()

  try {
    // Get all restaurants with their operating hours, meal services, and include capacity and onlineQuota
    const restaurants = await prisma.restaurant.findMany({
      include: {
        operatingHours: true,
        mealServices: {
          where: {
            isAvailable: true
          },
          include: {
            schedule: true
          }
        }
      }
    })

    for (const restaurant of restaurants) {
      let recordsAdded = 0

      // Use restaurant's capacity if available, otherwise use default
      const totalSeats = restaurant.capacity || defaultTotalSeats

      // Get online quota from restaurant
      const onlineQuota = restaurant.onlineQuota

      for (let i = 0; i < daysAhead; i++) {
        const targetDate = addDays(startDate, i)
        const dayOfWeek = format(targetDate, 'EEEE').toUpperCase()

        // Check if restaurant is open on this day
        const operatingHours = restaurant.operatingHours.find(
          oh => oh.dayOfWeek === dayOfWeek && oh.isOpen
        )

        if (!operatingHours) continue

        // Use operating hours capacity if available, otherwise use restaurant capacity
        const dayCapacity = operatingHours.capacity || totalSeats
        const dayOnlineQuota = operatingHours.onlineQuota || onlineQuota

        // For each meal service, create or update capacity
        for (const mealService of restaurant.mealServices) {
          // Check if this meal service is available on this day of the week
          const schedule = mealService.schedule;
          
          // If no schedule exists yet, assume available on all days (backward compatibility)
          // Otherwise check if this day is in the availableDays array
          const isDayAvailable = !schedule || schedule.availableDays.includes(dayOfWeek as any);

          const existingCapacity = await prisma.restaurantCapacity.findFirst({
            where: {
              restaurantId: restaurant.id,
              serviceId: mealService.id,
              date: targetDate
            }
          })

          if (!existingCapacity) {
            // Only create new records for days that are available
            if (isDayAvailable) {
              await prisma.restaurantCapacity.create({
                data: {
                  restaurantId: restaurant.id,
                  serviceId: mealService.id,
                  date: targetDate,
                  totalSeats: totalSeats,
                  bookedSeats: 0,
                  isEnabled: true
                }
              })
              recordsAdded++
            }
          } else {
            // Update existing records based on availability
            if (isDayAvailable) {
              // Day is available - enable the record if it's not already enabled
              if (!existingCapacity.isEnabled) {
                await prisma.restaurantCapacity.update({
                  where: {
                    id: existingCapacity.id
                  },
                  data: {
                    isEnabled: true
                  }
                })
              }
            } else {
              // Day is not available - disable the record only if there are no booked seats
              if (existingCapacity.isEnabled && existingCapacity.bookedSeats === 0) {
                await prisma.restaurantCapacity.update({
                  where: {
                    id: existingCapacity.id
                  },
                  data: {
                    isEnabled: false
                  }
                })
              }
              // If there are booked seats, keep the record enabled (special scenario)
            }
          }
        }
      }

      if (recordsAdded > 0) {
        results.push({
          restaurantId: restaurant.id,
          recordsAdded
        })
      }
    }

    // Create cleanup logs for each restaurant that had records added
    // for (const result of results) {
    //   await prisma.cleanupLog.create({
    //     data: {
    //       cleanupType: 'CAPACITY_POPULATION',
    //       restaurantId: result.restaurantId,
    //       recordsRemoved: result.recordsAdded,
    //       cleanupStartTime,
    //       cleanupEndTime: new Date()
    //     }
    //   })
    // }

    return results
  } catch (error) {
    console.error('Error in populateRestaurantCapacity:', error)
    throw new Error(getDescriptiveErrorMessage(error, 'population'))
  }
}

/**
 * Check if a restaurant has available capacity for a given date, meal type, and party size
 */
export type CapacityCheckSuccess = {
  success: true;
  hasCapacity: boolean;
  availableSeats: number;
  totalSeats: number;
  bookedSeats: number;
  capacityRecordExists: boolean;
  mealServiceId: number;
};

export type CapacityCheckFailure = {
  success: false;
  errorMessage: string;
};

export type CapacityCheckResult = CapacityCheckSuccess | CapacityCheckFailure;

export async function checkRestaurantCapacity(
  prisma: PrismaClient,
  restaurantId: number,
  date: Date,
  mealType: string,
  personCount: number
): Promise<CapacityCheckResult> {
  try {
    console.log('Checking capacity for restaurant:', {
      restaurantId,
      date: date.toISOString().split('T')[0],
      mealType,
      personCount
    });

    // Ensure we're working with UTC date
    const requestDate = new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate()
    ));

    // First, check if there are any closures for the selected date
    const closure = await prisma.restaurantSpecialClosure.findFirst({
      where: {
        restaurantId,
        closureStart: {
          lte: requestDate
        },
        closureEnd: {
          gte: requestDate
        }
      }
    });

    if (closure) {
      console.log('Restaurant is closed on the selected date due to special closure:', {
        restaurantId,
        date: requestDate.toISOString().split('T')[0],
        closureType: closure.closureType,
        description: closure.description
      });

      return {
        success: false,
        errorMessage: closure.description || `Restaurant is closed on ${requestDate.toISOString().split('T')[0]} due to ${closure.closureType}`
      };
    }

    // Find the meal service for the requested meal type
    const mealService = await prisma.restaurantMealService.findFirst({
      where: {
        restaurantId,
        mealType: mealType as any, // Type conversion to match enum
        isAvailable: true
      }
    });

    if (!mealService) {
      console.log('No meal service found for the requested meal type:', {
        restaurantId,
        mealType
      });
      return {
        success: false,
        errorMessage: `No meal service available for ${mealType} at restaurant ${restaurantId}`
      };
    }

    // Find capacity record for the given date and service
    const capacityRecord = await prisma.restaurantCapacity.findFirst({
      where: {
        restaurantId,
        serviceId: mealService.id,
        date: requestDate,
        isEnabled: true // Only consider enabled capacity records
      }
    });

    // If no capacity record exists or is disabled
    if (!capacityRecord) {
      console.log('No enabled capacity record found for the requested date:', {
        restaurantId,
        mealType,
        date: requestDate.toISOString().split('T')[0]
      });

      return {
        success: false,
        errorMessage: `This buffet is not available on the selected date on ${requestDate.toISOString().split('T')[0]}`
      };
    }

    // Calculate available seats
    const availableSeats = capacityRecord.totalSeats - capacityRecord.bookedSeats;
    const hasCapacity = availableSeats >= personCount;

    console.log('Capacity check result:', {
      restaurantId,
      date: requestDate.toISOString().split('T')[0],
      mealType,
      capacityRecordId: capacityRecord.id,
      totalSeats: capacityRecord.totalSeats,
      bookedSeats: capacityRecord.bookedSeats,
      availableSeats,
      requestedSeats: personCount,
      hasCapacity
    });

    return {
      success: true,
      hasCapacity,
      availableSeats,
      totalSeats: capacityRecord.totalSeats,
      bookedSeats: capacityRecord.bookedSeats,
      capacityRecordExists: true,
      mealServiceId: mealService.id
    };
  } catch (error) {
    console.error('Error checking restaurant capacity:', error);
    return {
      success: false,
      errorMessage: getDescriptiveErrorMessage(error, 'capacity')
    };
  }
}

export type UpdateCapacitySuccess = {
  success: true;
  updatedCapacity: {
    totalSeats: number;
    bookedSeats: number;
    availableSeats: number;
  };
};

export type UpdateCapacityFailure = {
  success: false;
  errorMessage: string;
};

export type UpdateCapacityResult = UpdateCapacitySuccess | UpdateCapacityFailure;

export async function updateRestaurantCapacity(
  prisma: PrismaClient,
  restaurantId: number,
  date: Date,
  mealType: string,
  personCount: number
): Promise<UpdateCapacityResult> {
  try {
    console.log('Updating capacity for restaurant:', {
      restaurantId,
      date: date.toISOString().split('T')[0],
      mealType,
      personCount
    });

    // Ensure we're working with UTC date
    const requestDate = new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate()
    ));

    // Find the meal service for the requested meal type
    const mealService = await prisma.restaurantMealService.findFirst({
      where: {
        restaurantId,
        mealType: mealType as any, // Type conversion to match enum
        isAvailable: true
      }
    });

    if (!mealService) {
      return {
        success: false,
        errorMessage: `No meal service available for ${mealType} at restaurant ${restaurantId}`
      };
    }

    // Find capacity record for the given date and service
    const capacityRecord = await prisma.restaurantCapacity.findFirst({
      where: {
        restaurantId,
        serviceId: mealService.id,
        date: requestDate,
        isEnabled: true
      }
    });

    // If no capacity record exists or is disabled, return error
    if (!capacityRecord) {
      return {
        success: false,
        errorMessage: `This buffet is not available on the selected date on ${requestDate.toISOString().split('T')[0]}`
      };
    }

    // Calculate new booked seats
    const newBookedSeats = capacityRecord.bookedSeats + personCount;

    // Check if this would exceed total capacity
    if (newBookedSeats > capacityRecord.totalSeats) {
      return {
        success: false,
        errorMessage: `Cannot book ${personCount} seats. Only ${capacityRecord.totalSeats - capacityRecord.bookedSeats} seats available`
      };
    }

    // Update the capacity record
    const updatedCapacity = await prisma.restaurantCapacity.update({
      where: { id: capacityRecord.id },
      data: {
        bookedSeats: newBookedSeats
      }
    });

    return {
      success: true,
      updatedCapacity: {
        totalSeats: updatedCapacity.totalSeats,
        bookedSeats: updatedCapacity.bookedSeats,
        availableSeats: updatedCapacity.totalSeats - updatedCapacity.bookedSeats
      }
    };

  } catch (error) {
    console.error('Error updating restaurant capacity:', error);
    return {
      success: false,
      errorMessage: getDescriptiveErrorMessage(error, 'capacity')
    };
  }
}
