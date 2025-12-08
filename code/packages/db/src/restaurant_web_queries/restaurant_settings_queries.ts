import { PrismaClient, MealType, RefundType, DayOfWeek } from "../../prisma/generated/prisma";
import { z } from "zod";

// Comprehensive error message mapping for user-friendly responses
const getDescriptiveErrorMessage = (error: unknown, context?: string): string => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorLower = errorMessage.toLowerCase();
  
  // Database connection errors
  if (errorLower.includes('connection') || errorLower.includes('timeout') || errorLower.includes('network')) {
    return "Database connection failed. Please check your internet connection and try again.";
  }
  
  // Prisma specific errors
  if (errorLower.includes('prisma')) {
    if (errorLower.includes('unique constraint')) {
      return "This record already exists. Please check for duplicates.";
    }
    if (errorLower.includes('foreign key constraint')) {
      return "Related data not found. Please refresh the page and try again.";
    }
    if (errorLower.includes('record not found')) {
      return "The requested data was not found. It may have been deleted or moved.";
    }
    if (errorLower.includes('invalid input')) {
      return "Invalid data provided. Please check your input and try again.";
    }
  }
  
  // Specific business logic errors (these should be passed through as-is)
  if (errorLower.includes('cannot remove') && errorLower.includes('existing reservations')) {
    return errorMessage; // Keep our specific validation messages
  }
  
  if (errorLower.includes('please select at least one available day')) {
    return errorMessage; // Keep our specific validation messages
  }
  
  if (errorLower.includes('meal service not found')) {
    return "The selected meal service is no longer available. Please refresh the page.";
  }
  
  if (errorLower.includes('restaurant not found')) {
    return "Restaurant information not found. Please contact support.";
  }
  
  if (errorLower.includes('special closure not found')) {
    return "The special closure you're trying to modify no longer exists.";
  }
  
  if (errorLower.includes('capacity record not found')) {
    return "Capacity information not found for the selected date. Please try again.";
  }
  
  if (errorLower.includes('invalid time format')) {
    return "Please enter a valid time in HH:MM format (e.g., 14:30).";
  }
  
  if (errorLower.includes('end time must be after start time')) {
    return "End time must be after start time. Please adjust the times.";
  }
  
  if (errorLower.includes('start time must be before end time')) {
    return "Start time must be before end time. Please adjust the times.";
  }
  
  if (errorLower.includes('date is in the past')) {
    return "Cannot set availability for past dates. Please select a future date.";
  }
  
  if (errorLower.includes('capacity exceeded')) {
    return "The requested capacity exceeds available space. Please reduce the number of slots.";
  }
  
  if (errorLower.includes('already booked') || errorLower.includes('booked seats')) {
    return "Some slots are already booked. Please adjust the capacity accordingly.";
  }
  
  // Validation errors
  if (errorLower.includes('validation') || errorLower.includes('invalid')) {
    return "Please check your input and ensure all required fields are filled correctly.";
  }
  
  // Permission errors
  if (errorLower.includes('permission') || errorLower.includes('unauthorized')) {
    return "You don't have permission to perform this action. Please contact your administrator.";
  }
  
  // Default error messages based on context
  switch (context) {
    case 'mealServices':
      return "Failed to update meal service settings. Please try again or contact support if the problem persists.";
    case 'mealAvailability':
      return "Failed to update meal availability. Please try again or contact support if the problem persists.";
    case 'mealCapacity':
      return "Failed to update capacity settings. Please try again or contact support if the problem persists.";
    case 'specialClosures':
      return "Failed to update special closures. Please try again or contact support if the problem persists.";
    case 'cancellationPolicy':
      return "Failed to update cancellation policy. Please try again or contact support if the problem persists.";
    case 'serviceArea':
      return "Failed to update service area settings. Please try again or contact support if the problem persists.";
    case 'fetchData':
      return "Failed to load settings. Please refresh the page or contact support if the problem persists.";
    default:
      return "An unexpected error occurred. Please try again or contact support if the problem persists.";
  }
};

// Input validation schema
const BusinessSearchSchema = z.object({
  businessId: z.number().positive({ message: "Business ID must be positive" })
});

// Define the return type structure
export interface RestaurantSettingsResult {
  business: {
    id: number;
    name: string;
    address: string;
    phone: string;
    email: string;
    website: string | null;
    taxId: string;
    registrationNumber: string;
  };
  restaurants: Array<{
    id: number;
    name: string;
    address: string;
    phone: string;
    description: string | null;
    capacity: number;
    onlineQuota: number;
    thumbnailImage: {
      imageUrl: string;
      altText: string;
    } | null;
    heroImage: {
      imageUrl: string;
      altText: string;
    } | null;
    operatingHours: Array<{
      dayOfWeek: string;
      isOpen: boolean;
      openingTime: Date;
      closingTime: Date;
      capacity: number;
      onlineQuota: number;
    }>;
    images: Array<{
      id: number;
      imageUrl: string;
      imageType: string;
      altText: string;
      displayOrder: number;
    }>;
    locationId: number;
    advancePaymentPercentage: number;
    reservationSupport: string;
    location: {
      id: number;
      city: string;
      postalCode: string;
    };
  }>;
}

export type RestaurantSettingsResponse = {
  success: true;
  data: RestaurantSettingsResult;
} | {
  success: false;
  errorMsg: string;
};

export async function getRestaurantSettings(
  prisma: PrismaClient,
  businessId: number
): Promise<RestaurantSettingsResponse> {
  try {
    // Validate input
    const validationResult = BusinessSearchSchema.safeParse({
      businessId
    });

    if (!validationResult.success) {
      return {
        success: false,
        errorMsg: validationResult.error.errors[0]?.message || "Invalid input parameters"
      };
    }

    const businessData = await prisma.business.findUnique({
      where: {
        id: businessId
      },
      include: {
        restaurants: {
          include: {
            thumbnailImage: {
              select: {
                imageUrl: true,
                altText: true
              }
            },
            heroImage: {
              select: {
                imageUrl: true,
                altText: true
              }
            },
            operatingHours: {
              select: {
                dayOfWeek: true,
                isOpen: true,
                openingTime: true,
                closingTime: true,
                capacity: true,
                onlineQuota: true
              }
            },
            images: {
              where: {
                isActive: true
              },
              select: {
                id: true,
                imageUrl: true,
                imageType: true,
                altText: true,
                displayOrder: true
              },
              orderBy: {
                displayOrder: 'asc'
              }
            },
            location: {
              select: {
                id: true,
                city: true,
                postalCode: true
              }
            }
          }
        }
      }
    });

    if (!businessData) {
      return {
        success: false,
        errorMsg: "Business not found"
      };
    }

    const result: RestaurantSettingsResult = {
      business: {
        id: businessData.id,
        name: businessData.name,
        address: businessData.address,
        phone: businessData.phone,
        email: businessData.email,
        website: businessData.website,
        taxId: businessData.taxId,
        registrationNumber: businessData.registrationNumber
      },
      restaurants: businessData.restaurants.map(restaurant => ({
        id: restaurant.id,
        name: restaurant.name,
        address: restaurant.address,
        phone: restaurant.phone,
        description: restaurant.description,
        capacity: restaurant.capacity,
        onlineQuota: restaurant.onlineQuota,
        thumbnailImage: restaurant.thumbnailImage,
        heroImage: restaurant.heroImage,
        operatingHours: restaurant.operatingHours,
        images: restaurant.images,
        locationId: restaurant.locationId,
        advancePaymentPercentage: restaurant.advancePaymentPercentage,
        reservationSupport: restaurant.reservationSupport,
        location: restaurant.location
      }))
    };

    return {
      success: true,
      data: result
    };

  } catch (error) {
    console.error('Error fetching restaurant settings:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
    return {
      success: false,
      errorMsg: getDescriptiveErrorMessage(error, 'fetchData')
    };
  }
} 
// Input validation schema
const RestaurantIdSchema = z.object({
  restaurantId: z.number().positive({ message: "Restaurant ID must be positive" })
});

// Define return type structures for each section
export interface MealTypeSettingsResult {
  mealServices: Array<{
    id: number;
    mealType: MealType;
    isAvailable: boolean;
    serviceStartTime: string;
    serviceEndTime: string;
    availableDays: DayOfWeek[];
  }>;
}

export interface SpecialClosuresResult {
  specialClosures: Array<{
    id: number;
    startDate: Date;
    endDate: Date;
    closureType: string;
    description: string | null;
  }>;
}

export interface GeoSettingsResult {
  coordinates: {
    latitude: number;
    longitude: number;
  };
  cityName: string;
  deliveryRadiusKm: number;
  estimatedDeliveryTimeMin: number;
}

export interface ServiceAreaSettingsResult {
  coordinates: {
    latitude: number;
    longitude: number;
  };
  cityName: string;
  stateName: string;
  countryName: string;
  postalCodePattern: string;
  deliveryRadiusKm: number;
  estimatedDeliveryTimeMin: number;
}

// Response types
type SettingsResponse<T> = {
  success: true;
  data: T;
} | {
  success: false;
  errorMsg: string;
};

// Query functions
export async function getMealTypeSettings(
  prisma: PrismaClient,
  restaurantId: number
): Promise<SettingsResponse<MealTypeSettingsResult>> {
  try {
    const validationResult = RestaurantIdSchema.safeParse({ restaurantId });
    if (!validationResult.success) {
      return {
        success: false,
        errorMsg: validationResult.error.errors[0]?.message || "Invalid restaurant ID"
      };
    }

    const mealServices = await prisma.restaurantMealService.findMany({
      where: {
        restaurantId,
      },
      select: {
        id: true,
        mealType: true,
        isAvailable: true,
        serviceStartTime: true,
        serviceEndTime: true,
        schedule: {
          select: {
            availableDays: true
          }
        }
      }
    });

    return {
      success: true,
      data: {
        mealServices: mealServices.map(service => ({
          id: service.id,
          mealType: service.mealType,
          isAvailable: service.isAvailable,
          serviceStartTime: service.serviceStartTime.toLocaleTimeString("sv-SE", {
            hour: "2-digit",
            minute: "2-digit"
          }),
          serviceEndTime: service.serviceEndTime.toLocaleTimeString("sv-SE", {
            hour: "2-digit",
            minute: "2-digit"
          }),
          availableDays: service.schedule?.availableDays || [
            DayOfWeek.MONDAY,
            DayOfWeek.TUESDAY,
            DayOfWeek.WEDNESDAY,
            DayOfWeek.THURSDAY,
            DayOfWeek.FRIDAY,
            DayOfWeek.SATURDAY,
            DayOfWeek.SUNDAY
          ]
        }))
      }
    };
  } catch (error) {
    console.error('Error fetching meal type settings:', error);
    return {
      success: false,
      errorMsg: getDescriptiveErrorMessage(error, 'fetchData')
    };
  }
}

// Add new schema and function for updating meal availability
const UpdateMealAvailabilitySchema = z.object({
  restaurantId: z.number(),
  date: z.string(), // ISO date string
  mealType: z.nativeEnum(MealType),
  isEnabled: z.boolean()
});

export type UpdateMealAvailabilityInput = z.infer<typeof UpdateMealAvailabilitySchema>;

export async function updateMealAvailability(
  prisma: PrismaClient,
  data: UpdateMealAvailabilityInput
): Promise<SettingsResponse<{ success: boolean }>> {
  try {
    const validatedData = UpdateMealAvailabilitySchema.parse(data);

    await prisma.$transaction(async (tx) => {
      // Find the meal service
      const mealService = await tx.restaurantMealService.findFirst({
        where: {
          restaurantId: validatedData.restaurantId,
          mealType: validatedData.mealType
        }
      });

      if (!mealService) {
        throw new Error("Meal service not found");
      }

      // Update or create capacity record for the specific date
      const targetDate = new Date(validatedData.date);
      
      await tx.restaurantCapacity.upsert({
        where: {
          restaurantId_serviceId_date: {
            restaurantId: validatedData.restaurantId,
            serviceId: mealService.id,
            date: targetDate
          }
        },
        update: {
          isEnabled: validatedData.isEnabled
        },
        create: {
          restaurantId: validatedData.restaurantId,
          serviceId: mealService.id,
          date: targetDate,
          totalSeats: 0,
          bookedSeats: 0,
          isEnabled: validatedData.isEnabled
        }
      });
    });

    return {
      success: true,
      data: { success: true }
    };
  } catch (error) {
    console.error('Error updating meal availability:', error);
    return {
      success: false,
      errorMsg: getDescriptiveErrorMessage(error, 'mealAvailability')
    };
  }
}

export async function getSpecialClosures(
  prisma: PrismaClient,
  restaurantId: number
): Promise<SettingsResponse<SpecialClosuresResult>> {
  try {
    const validationResult = RestaurantIdSchema.safeParse({ restaurantId });
    if (!validationResult.success) {
      return {
        success: false,
        errorMsg: validationResult.error.errors[0]?.message || "Invalid restaurant ID"
      };
    }

    const specialClosures = await prisma.restaurantSpecialClosure.findMany({
      where: {
        restaurantId: restaurantId,
      },
      select: {
        id: true,
        closureStart: true,
        closureEnd: true,
        closureType: true,
        description: true,
      },
      orderBy: {
        closureStart: 'asc'
      }
    });

    return {
      success: true,
      data: {
        specialClosures: specialClosures.map(closure => ({
          id: closure.id,
          startDate: closure.closureStart,
          endDate: closure.closureEnd,
          closureType: closure.closureType,
          description: closure.description
        }))
      }
    };
  } catch (error) {
    console.error('Error fetching special closures:', error);
    return {
      success: false,
      errorMsg: getDescriptiveErrorMessage(error, 'fetchData')
    };
  }
}

export async function getGeoSettings(
  prisma: PrismaClient,
  restaurantId: number
): Promise<SettingsResponse<GeoSettingsResult>> {
  try {
    const validationResult = RestaurantIdSchema.safeParse({ restaurantId });
    if (!validationResult.success) {
      return {
        success: false,
        errorMsg: validationResult.error.errors[0]?.message || "Invalid restaurant ID"
      };
    }

    const serviceArea = await prisma.restaurantServiceArea.findFirst({
      where: { 
        restaurantId,
        isActive: true 
      },
      select: {
        city: {
          select: {
            latitude: true,
            longitude: true,
            cityName: true,
          },
        },
        deliveryRadiusKm: true,
        estimatedDeliveryTimeMin: true,
      },
    });

    if (!serviceArea) {
      return {
        success: false,
        errorMsg: "No service area found for this restaurant"
      };
    }

    return {
      success: true,
      data: {
        coordinates: {
          latitude: Number(serviceArea.city.latitude),
          longitude: Number(serviceArea.city.longitude),
        },
        cityName: serviceArea.city.cityName,
        deliveryRadiusKm: Number(serviceArea.deliveryRadiusKm),
        estimatedDeliveryTimeMin: serviceArea.estimatedDeliveryTimeMin
      }
    };
  } catch (error) {
    console.error('Error fetching geo settings:', error);
    return {
      success: false,
      errorMsg: getDescriptiveErrorMessage(error, 'fetchData')
    };
  }
}

export async function getServiceAreaSettings(
  prisma: PrismaClient,
  restaurantId: number
): Promise<SettingsResponse<ServiceAreaSettingsResult>> {
  try {
    const validationResult = RestaurantIdSchema.safeParse({ restaurantId });
    if (!validationResult.success) {
      return {
        success: false,
        errorMsg: validationResult.error.errors[0]?.message || "Invalid restaurant ID"
      };
    }

    const serviceArea = await prisma.restaurantServiceArea.findFirst({
      where: { 
        restaurantId,
        isActive: true 
      },
      select: {
        city: {
          select: {
            latitude: true,
            longitude: true,
            cityName: true,
            stateName: true,
            countryName: true,
            postalCodePattern: true,
          },
        },
        deliveryRadiusKm: true,
        estimatedDeliveryTimeMin: true,
      },
    });

    if (!serviceArea) {
      return {
        success: false,
        errorMsg: "No service area found for this restaurant"
      };
    }

    return {
      success: true,
      data: {
        coordinates: {
          latitude: Number(serviceArea.city.latitude),
          longitude: Number(serviceArea.city.longitude),
        },
        cityName: serviceArea.city.cityName,
        stateName: serviceArea.city.stateName,
        countryName: serviceArea.city.countryName,
        postalCodePattern: serviceArea.city.postalCodePattern,
        deliveryRadiusKm: Number(serviceArea.deliveryRadiusKm),
        estimatedDeliveryTimeMin: serviceArea.estimatedDeliveryTimeMin
      }
    };
  } catch (error) {
    console.error('Error fetching service area settings:', error);
    return {
      success: false,
      errorMsg: getDescriptiveErrorMessage(error, 'fetchData')
    };
  }
}

const CreateServiceAreaSchema = z.object({
  restaurantId: z.number(),
  cityName: z.string(),
  stateName: z.string(),
  countryName: z.string(),
  postalCodePattern: z.string(),
  coordinates: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }),
  deliveryRadiusKm: z.number(),
  estimatedDeliveryTimeMin: z.number(),
})

export type CreateServiceAreaInput = z.infer<typeof CreateServiceAreaSchema>

export async function createRestaurantServiceArea(
  prisma: PrismaClient,
  data: CreateServiceAreaInput
) {
  const validatedData = CreateServiceAreaSchema.parse(data)

  return await prisma.$transaction(async (tx) => {
    const city = await tx.city.create({
      data: {
        cityName: validatedData.cityName,
        stateName: validatedData.stateName,
        countryName: validatedData.countryName,
        postalCodePattern: validatedData.postalCodePattern,
        latitude: validatedData.coordinates.latitude,
        longitude: validatedData.coordinates.longitude,
        isActive: true,
      },
    })

    const serviceArea = await tx.restaurantServiceArea.create({
      data: {
        restaurantId: validatedData.restaurantId,
        cityId: city.id,
        deliveryRadiusKm: validatedData.deliveryRadiusKm,
        estimatedDeliveryTimeMin: validatedData.estimatedDeliveryTimeMin,
        isActive: true,
        createdBy: 'SYSTEM',
        updatedBy: 'SYSTEM'
      },
      include: {
        city: true,
      },
    })

    // Serialize Decimal values to numbers
    return {
      success: true as const,
      data: {
        ...serviceArea,
        deliveryRadiusKm: Number(serviceArea.deliveryRadiusKm),
        city: {
          ...serviceArea.city,
          latitude: Number(serviceArea.city.latitude),
          longitude: Number(serviceArea.city.longitude),
        }
      }
    }
  })
}

// Schema for updating service area - reuse the same schema as for creation
export type UpdateServiceAreaInput = CreateServiceAreaInput;

export async function updateRestaurantServiceArea(
  prisma: PrismaClient,
  data: UpdateServiceAreaInput
) {
  const validatedData = CreateServiceAreaSchema.parse(data);

  try {
    return await prisma.$transaction(async (tx) => {
      // Find existing service area
      const existingServiceArea = await tx.restaurantServiceArea.findFirst({
        where: {
          restaurantId: validatedData.restaurantId,
          isActive: true
        },
        include: {
          city: true
        }
      });

      if (!existingServiceArea) {
        throw new Error("No active service area found for this restaurant");
      }

      // Update existing city
      await tx.city.update({
        where: {
          id: existingServiceArea.cityId
        },
        data: {
          cityName: validatedData.cityName,
          stateName: validatedData.stateName,
          countryName: validatedData.countryName,
          postalCodePattern: validatedData.postalCodePattern,
          latitude: validatedData.coordinates.latitude,
          longitude: validatedData.coordinates.longitude,
          updatedAt: new Date()
        }
      });

      // Update service area
      const updatedServiceArea = await tx.restaurantServiceArea.update({
        where: {
          restaurantId_cityId: {
            restaurantId: existingServiceArea.restaurantId,
            cityId: existingServiceArea.cityId
          }
        },
        data: {
          deliveryRadiusKm: validatedData.deliveryRadiusKm,
          estimatedDeliveryTimeMin: validatedData.estimatedDeliveryTimeMin,
          updatedAt: new Date(),
          updatedBy: 'SYSTEM'
        },
        include: {
          city: true
        }
      });

      // Serialize Decimal values to numbers
      return {
        success: true as const,
        data: {
          cityName: updatedServiceArea.city.cityName,
          stateName: updatedServiceArea.city.stateName,
          countryName: updatedServiceArea.city.countryName,
          postalCodePattern: updatedServiceArea.city.postalCodePattern,
          coordinates: {
            latitude: Number(updatedServiceArea.city.latitude),
            longitude: Number(updatedServiceArea.city.longitude),
          },
          deliveryRadiusKm: Number(updatedServiceArea.deliveryRadiusKm),
          estimatedDeliveryTimeMin: updatedServiceArea.estimatedDeliveryTimeMin
        }
      };
    });
  } catch (error) {
    console.error('Error updating service area:', error);
    return {
      success: false as const,
      error: getDescriptiveErrorMessage(error, 'serviceArea')
    };
  }
}

const UpdateMealServiceSchema = z.object({
  restaurantId: z.number(),
  mealServices: z.array(z.object({
    mealType: z.nativeEnum(MealType),
    isAvailable: z.boolean(),
    serviceStartTime: z.string(),
    serviceEndTime: z.string(),
    availableDays: z.array(z.nativeEnum(DayOfWeek)).optional(),
  }))
});

export type UpdateMealServiceInput = z.infer<typeof UpdateMealServiceSchema>;

// Helper function to check if a meal service has booked seats for upcoming dates on specific days
async function checkBookedSeatsForRemovedDays(
  prisma: any, // Use any to handle both PrismaClient and transaction types
  restaurantId: number,
  mealServiceId: number,
  currentAvailableDays: DayOfWeek[],
  newAvailableDays: DayOfWeek[]
): Promise<{ hasBookedSeats: boolean; conflictingDates: string[] }> {
  // Find days that are being removed
  const removedDays = currentAvailableDays.filter(day => !newAvailableDays.includes(day));
  
  if (removedDays.length === 0) {
    return { hasBookedSeats: false, conflictingDates: [] };
  }

  // Check for actual reservations (not just capacity records) for the removed days
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get meal service details to match reservation meal types
  const mealService = await prisma.restaurantMealService.findUnique({
    where: { id: mealServiceId },
    select: { mealType: true }
  });

  if (!mealService) {
    return { hasBookedSeats: false, conflictingDates: [] };
  }

  // Check for actual reservations on the removed days
  const existingReservations = await prisma.reservation.findMany({
    where: {
      restaurantId,
      mealType: mealService.mealType,
      reservationDate: {
        gte: today
      },
      status: {
        not: 'CANCELLED'
      }
    },
    select: {
      reservationDate: true
    }
  });

  // Filter reservations that fall on removed days
  const conflictingDates: string[] = [];
  
  for (const reservation of existingReservations) {
    const dayOfWeek = reservation.reservationDate.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
    // Ensure the day is a valid DayOfWeek before checking
    const validDayOfWeek = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].includes(dayOfWeek) ? dayOfWeek as DayOfWeek : null;
    
    if (validDayOfWeek && removedDays.includes(validDayOfWeek)) {
      const dateStr = reservation.reservationDate.toISOString().split('T')[0];
      if (dateStr && !conflictingDates.includes(dateStr)) {
        conflictingDates.push(dateStr);
      }
    }
  }

  return {
    hasBookedSeats: conflictingDates.length > 0,
    conflictingDates
  };
}

// Helper function to update capacity records based on available days changes
async function updateCapacityRecordsForAvailableDays(
  prisma: any, // Use any to handle both PrismaClient and transaction types
  restaurantId: number,
  mealServiceId: number,
  newAvailableDays: DayOfWeek[]
): Promise<void> {
  // Get all upcoming capacity records for this meal service
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const capacityRecords = await prisma.restaurantCapacity.findMany({
    where: {
      restaurantId,
      serviceId: mealServiceId,
      date: {
        gte: today
      }
    }
  });

  // Update each record based on whether its day is in the new available days
  for (const record of capacityRecords) {
    const dayOfWeek = record.date.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase() as DayOfWeek;
    const shouldBeEnabled = newAvailableDays.includes(dayOfWeek);
    
    // Only update if the isEnabled status needs to change
    if (record.isEnabled !== shouldBeEnabled) {
      // If we're disabling a day, make sure there are no booked seats
      if (!shouldBeEnabled && record.bookedSeats > 0) {
        // Skip disabling this record as it has booked seats
        continue;
      }
      
      await prisma.restaurantCapacity.update({
        where: {
          id: record.id
        },
        data: {
          isEnabled: shouldBeEnabled
        }
      });
    }
  }
}

export async function updateRestaurantMealServices(
  prisma: PrismaClient,
  data: UpdateMealServiceInput
) {
  const validatedData = UpdateMealServiceSchema.parse(data);

  try {
    console.log('Received meal service data for update:', validatedData.mealServices.map(s => ({
      mealType: s.mealType,
      startTime: s.serviceStartTime,
      endTime: s.serviceEndTime,
      availableDays: s.availableDays
    })));

    // Convert HH:MM format to Date object
    const timeStringToDate = (timeString: string): Date => {
      try {
        console.log(`Converting time string: ${timeString} to Date object`);
        const [hours, minutes] = timeString.split(':').map(Number);
        
        // Create a Date object with today's date and the specified time
        const date = new Date();
        date.setHours(hours || 0, minutes || 0, 0, 0);
        
        console.log(`Created date: ${date.toISOString()} for DB storage`);
        return date;
      } catch (error) {
        console.error('Error parsing time string:', error);
        // Default to current time if parsing fails
        return new Date();
      }
    };

    const result = await prisma.$transaction(async (tx) => {
      // Get all existing meal services for the restaurant
      const existingServices = await tx.restaurantMealService.findMany({
        where: {
          restaurantId: validatedData.restaurantId,
        },
        select: {
          id: true,
          mealType: true,
          schedule: true
        }
      });

      // Create a map of existing services for quick lookup
      const existingServiceMap = new Map(
        existingServices.map(service => [service.mealType, service])
      );

      // Validate available days changes before updating
      for (const service of validatedData.mealServices) {
        if (service.availableDays && service.availableDays.length === 0) {
          throw new Error(`Please select at least one available day for ${service.mealType.replace(/_/g, ' ')}`);
        }

        const existingService = existingServiceMap.get(service.mealType);
        if (existingService && service.availableDays) {
          const currentAvailableDays = existingService.schedule?.availableDays || [];
          
          // Check if removing days would conflict with existing reservations
          const bookingCheck = await checkBookedSeatsForRemovedDays(
            tx,
            validatedData.restaurantId,
            existingService.id,
            currentAvailableDays,
            service.availableDays
          );

          if (bookingCheck.hasBookedSeats) {
            const daysBeingRemoved = currentAvailableDays.filter(day => !service.availableDays!.includes(day));
            const dayNames = daysBeingRemoved.map(day => day.toLowerCase().replace(/^\w/, c => c.toUpperCase()));
            const conflictCount = bookingCheck.conflictingDates.length;
            
            throw new Error(
              `Cannot remove ${dayNames.join(', ')} from ${service.mealType.replace(/_/g, ' ')} service because there ${conflictCount === 1 ? 'is an existing reservation' : `are ${conflictCount} existing reservations`} on ${conflictCount === 1 ? 'this day' : 'these days'}. Please cancel or modify the affected reservations first.`
            );
          }
        }
      }

      // Update meal services and their schedules
      const mealServices = await Promise.all(
        validatedData.mealServices.map(async service => {
          const existingService = existingServiceMap.get(service.mealType);
          
          if (existingService) {
            // Update existing service
            const updatedService = await tx.restaurantMealService.update({
              where: {
                id: existingService.id,
              },
              data: {
                isAvailable: service.isAvailable,
                serviceStartTime: timeStringToDate(service.serviceStartTime),
                serviceEndTime: timeStringToDate(service.serviceEndTime),
              },
              select: {
                id: true,
                mealType: true,
                isAvailable: true,
                serviceStartTime: true,
                serviceEndTime: true,
              }
            });

            // Update or create schedule if availableDays is provided
            if (service.availableDays) {
              if (existingService.schedule) {
                await tx.restaurantMealServiceSchedule.update({
                  where: {
                    mealServiceId: existingService.id
                  },
                  data: {
                    availableDays: service.availableDays
                  }
                });
              } else {
                await tx.restaurantMealServiceSchedule.create({
                  data: {
                    mealServiceId: existingService.id,
                    availableDays: service.availableDays
                  }
                });
              }

              // Update capacity records based on new available days
              await updateCapacityRecordsForAvailableDays(
                tx,
                validatedData.restaurantId,
                existingService.id,
                service.availableDays
              );
            }

            return updatedService;
          }
          
          return undefined;
        })
      );

      // Return serialized objects with non-nullable fields
      return mealServices
        .filter((service): service is NonNullable<typeof service> => service !== undefined)
        .map(service => {
          const result = {
            id: service.id,
            mealType: service.mealType,
            isAvailable: service.isAvailable ?? false,
            serviceStartTime: service.serviceStartTime.toISOString(),
            serviceEndTime: service.serviceEndTime.toISOString(),
          };
          
          console.log('Saved meal service in DB:', {
            mealType: service.mealType,
            rawStartTime: service.serviceStartTime,
            rawEndTime: service.serviceEndTime,
            returnedStartTime: result.serviceStartTime,
            returnedEndTime: result.serviceEndTime
          });
          
          return result;
        });
    });

    return {
      success: true as const,
      data: result
    };
  } catch (error) {
    console.error('Error updating meal services:', error);
    return {
      success: false as const,
      error: getDescriptiveErrorMessage(error, 'mealServices')
    };
  }
}


// Define the input schema for creating a special closure
export const CreateSpecialClosureSchema = z.object({
  restaurantId: z.number().int().positive(),
  closureStart: z.string(), // ISO date string
  closureEnd: z.string(),   // ISO date string
  closureType: z.string(),
  description: z.string().optional(),
  createdBy: z.string()
});

export type CreateSpecialClosureInput = z.infer<typeof CreateSpecialClosureSchema>;

export async function createSpecialClosure(
  prisma: PrismaClient,
  data: CreateSpecialClosureInput
): Promise<SettingsResponse<{ id: number }>> {
  try {
    const validatedData = CreateSpecialClosureSchema.parse(data);

    const closure = await prisma.restaurantSpecialClosure.create({
      data: {
        restaurantId: validatedData.restaurantId,
        closureStart: new Date(validatedData.closureStart),
        closureEnd: new Date(validatedData.closureEnd),
        closureType: validatedData.closureType,
        description: validatedData.description,
        createdBy: validatedData.createdBy
      },
      select: {
        id: true
      }
    });

    return {
      success: true,
      data: { id: closure.id }
    };
  } catch (error) {
    console.error('Error creating special closure:', error);
    return {
      success: false,
      errorMsg: getDescriptiveErrorMessage(error, 'specialClosures')
    };
  }
}

// Add this schema for delete operation
export const DeleteSpecialClosureSchema = z.object({
  closureId: z.number().int().positive(),
  restaurantId: z.number().int().positive() // For security, ensure the closure belongs to this restaurant
});

export type DeleteSpecialClosureInput = z.infer<typeof DeleteSpecialClosureSchema>;

export async function deleteSpecialClosure(
  prisma: PrismaClient,
  data: DeleteSpecialClosureInput
): Promise<SettingsResponse<{ success: boolean }>> {
  try {
    const validatedData = DeleteSpecialClosureSchema.parse(data);

    // Check if the closure exists and belongs to the restaurant
    const existingClosure = await prisma.restaurantSpecialClosure.findFirst({
      where: {
        id: validatedData.closureId,
        restaurantId: validatedData.restaurantId
      }
    });

    if (!existingClosure) {
      return {
        success: false,
        errorMsg: "Special closure not found or does not belong to this restaurant"
      };
    }

    // Delete the closure
    await prisma.restaurantSpecialClosure.delete({
      where: {
        id: validatedData.closureId
      }
    });

    return {
      success: true,
      data: { success: true }
    };
  } catch (error) {
    console.error('Error deleting special closure:', error);
    return {
      success: false,
      errorMsg: getDescriptiveErrorMessage(error, 'specialClosures')
    };
  }
}

// Cancellation Policy Settings
export interface CancellationPolicySettingsResult {
  policies: Array<{
    id: number;
    mealType: string;
    allowedRefundTypes: RefundType[];
    fullRefundBeforeMinutes: number;
    partialRefundBeforeMinutes: number | null;
    partialRefundPercentage: number | null;
    isActive: boolean;
  }>;
  mealTypeConfigurations: {
    [mealType: string]: {
      noRefund: {
        enabled: boolean;
        windowDuration: string;
        refundPercentage: string;
      };
      partialRefund: {
        enabled: boolean;
        windowDuration: string;
        refundPercentage: string;
      };
      fullRefund: {
        enabled: boolean;
        windowDuration: string;
        refundPercentage: string;
      };
    };
  };
  availableMealTypes: string[];
}

export async function getCancellationPolicySettings(
  prisma: PrismaClient,
  restaurantId: number
): Promise<SettingsResponse<CancellationPolicySettingsResult>> {
  try {
    const validationResult = RestaurantIdSchema.safeParse({ restaurantId });
    if (!validationResult.success) {
      return {
        success: false,
        errorMsg: validationResult.error.errors[0]?.message || "Invalid restaurant ID"
      };
    }

    // Get available meal types for this restaurant
    const availableMealTypes = await prisma.restaurantMealService.findMany({
      where: {
        restaurantId,
        isAvailable: true
      },
      select: {
        mealType: true
      }
    });

    const refundPolicies = await prisma.restaurantRefundPolicy.findMany({
      where: {
        restaurantId,
        isActive: true
      },
      select: {
        id: true,
        mealType: true,
        allowedRefundTypes: true,
        fullRefundBeforeMinutes: true,
        partialRefundBeforeMinutes: true,
        partialRefundPercentage: true,
        isActive: true,
      },
      orderBy: {
        mealType: 'asc'
      }
    });

    // Transform policies to match frontend interface
    const policies = refundPolicies.map(policy => ({
      id: policy.id,
      mealType: policy.mealType,
      allowedRefundTypes: policy.allowedRefundTypes,
      fullRefundBeforeMinutes: policy.fullRefundBeforeMinutes,
      partialRefundBeforeMinutes: policy.partialRefundBeforeMinutes,
      partialRefundPercentage: policy.partialRefundPercentage,
      isActive: policy.isActive,
    }));

    // Create meal-type-specific configurations
    const mealTypeConfigurations: {
      [mealType: string]: {
        noRefund: { enabled: boolean; windowDuration: string; refundPercentage: string; };
        partialRefund: { enabled: boolean; windowDuration: string; refundPercentage: string; };
        fullRefund: { enabled: boolean; windowDuration: string; refundPercentage: string; };
      };
    } = {};

    const availableMealTypeNames = availableMealTypes.map(mt => mt.mealType);

    // Initialize configurations for all available meal types
    availableMealTypeNames.forEach(mealType => {
      mealTypeConfigurations[mealType] = {
        noRefund: {
          enabled: false,
          windowDuration: "0",
          refundPercentage: "0"
        },
        partialRefund: {
          enabled: false,
          windowDuration: "0",
          refundPercentage: "0"
        },
        fullRefund: {
          enabled: false,
          windowDuration: "0",
          refundPercentage: "100"
        }
      };
    });

    // Update configurations based on existing policies
    policies.forEach(policy => {
      const config = mealTypeConfigurations[policy.mealType];
      if (!config) return;

      if (policy.allowedRefundTypes.includes(RefundType.NONE)) {
        config.noRefund.enabled = true;
        config.noRefund.windowDuration = policy.fullRefundBeforeMinutes.toString();
      }

      if (policy.allowedRefundTypes.includes(RefundType.PARTIAL)) {
        config.partialRefund.enabled = true;
        config.partialRefund.windowDuration = (policy.partialRefundBeforeMinutes || 60).toString();
        config.partialRefund.refundPercentage = (policy.partialRefundPercentage || 50).toString();
      }

      if (policy.allowedRefundTypes.includes(RefundType.FULL)) {
        config.fullRefund.enabled = true;
        config.fullRefund.windowDuration = policy.fullRefundBeforeMinutes.toString();
      }
    });
    console.log('policies', policies);
    console.log('mealTypeConfigurations', mealTypeConfigurations);
    console.log('availableMealTypes', availableMealTypes);

    return {
      success: true,
      data: {
        policies,
        mealTypeConfigurations,
        availableMealTypes: availableMealTypeNames
      }
    };
  } catch (error) {
    console.error('Error fetching cancellation policy settings:', error);
    return {
      success: false,
      errorMsg: getDescriptiveErrorMessage(error, 'fetchData')
    };
  }
}

// Schema for creating/updating cancellation policies
const CancellationPolicySchema = z.object({
  restaurantId: z.number().int().positive(),
  mealTypeConfigurations: z.record(
    z.string(), // meal type as key
    z.object({
      noRefund: z.object({
        enabled: z.boolean(),
        windowDuration: z.string(),
        refundPercentage: z.string(),
      }),
      partialRefund: z.object({
        enabled: z.boolean(),
        windowDuration: z.string(),
        refundPercentage: z.string(),
      }),
      fullRefund: z.object({
        enabled: z.boolean(),
        windowDuration: z.string(),
        refundPercentage: z.string(),
      }),
    })
  )
});

export type CancellationPolicyInput = z.infer<typeof CancellationPolicySchema>;

export async function updateCancellationPolicySettings(
  prisma: PrismaClient,
  data: CancellationPolicyInput
): Promise<SettingsResponse<{ success: boolean }>> {
  try {
    const validatedData = CancellationPolicySchema.parse(data);

    await prisma.$transaction(async (tx) => {
      // Delete existing policies for this restaurant
      await tx.restaurantRefundPolicy.deleteMany({
        where: {
          restaurantId: validatedData.restaurantId
        }
      });

      // Create new policies for each meal type configuration
      for (const [mealType, config] of Object.entries(validatedData.mealTypeConfigurations)) {
        const allowedRefundTypes: RefundType[] = [];
        
        if (config.noRefund.enabled) {
          allowedRefundTypes.push(RefundType.NONE);
        }
        if (config.partialRefund.enabled) {
          allowedRefundTypes.push(RefundType.PARTIAL);
        }
        if (config.fullRefund.enabled) {
          allowedRefundTypes.push(RefundType.FULL);
        }

        if (allowedRefundTypes.length > 0) {
          await tx.restaurantRefundPolicy.create({
            data: {
              restaurantId: validatedData.restaurantId,
              mealType: mealType as MealType,
              allowedRefundTypes: allowedRefundTypes,
              fullRefundBeforeMinutes: parseInt(config.fullRefund.windowDuration),
              partialRefundBeforeMinutes: config.partialRefund.enabled 
                ? parseInt(config.partialRefund.windowDuration) 
                : null,
              partialRefundPercentage: config.partialRefund.enabled 
                ? parseInt(config.partialRefund.refundPercentage) 
                : null,
              isActive: true,
              createdBy: 'SYSTEM',
              updatedBy: 'SYSTEM'
            }
          });
        }
      }
    });

    return {
      success: true,
      data: { success: true }
    };
  } catch (error) {
    console.error('Error updating cancellation policy settings:', error);
    return {
      success: false,
      errorMsg: getDescriptiveErrorMessage(error, 'cancellationPolicy')
    };
  }
}

// Add new schema and function for updating meal capacity slots
const UpdateMealCapacitySlotsSchema = z.object({
  restaurantId: z.number(),
  date: z.string(), // ISO date string
  mealType: z.nativeEnum(MealType),
  remainingSlots: z.number().min(0)
});

export type UpdateMealCapacitySlotsInput = z.infer<typeof UpdateMealCapacitySlotsSchema>;

export async function updateMealCapacitySlots(
  prisma: PrismaClient,
  data: UpdateMealCapacitySlotsInput
): Promise<SettingsResponse<{ 
  totalSeats: number;
  bookedSlots: number;
  remainingSlots: number;
}>> {
  try {
    const validatedData = UpdateMealCapacitySlotsSchema.parse(data);

    const result = await prisma.$transaction(async (tx) => {
      // Find the meal service
      const mealService = await tx.restaurantMealService.findFirst({
        where: {
          restaurantId: validatedData.restaurantId,
          mealType: validatedData.mealType
        }
      });

      if (!mealService) {
        throw new Error("Meal service not found");
      }

      const targetDate = new Date(validatedData.date);
      
      // Find existing capacity record
      let capacityRecord = await tx.restaurantCapacity.findUnique({
        where: {
          restaurantId_serviceId_date: {
            restaurantId: validatedData.restaurantId,
            serviceId: mealService.id,
            date: targetDate
          }
        }
      });

      // If no record exists, create one with default values
      if (!capacityRecord) {
        capacityRecord = await tx.restaurantCapacity.create({
          data: {
            restaurantId: validatedData.restaurantId,
            serviceId: mealService.id,
            date: targetDate,
            totalSeats: 0,
            bookedSeats: 0,
            isEnabled: true
          }
        });
      }

      // Calculate new total seats based on the formula: Total Quota = Booked Slots + Remaining Slots
      const newTotalSeats = capacityRecord.bookedSeats + validatedData.remainingSlots;

      // Update the capacity record
      const updatedCapacity = await tx.restaurantCapacity.update({
        where: {
          restaurantId_serviceId_date: {
            restaurantId: validatedData.restaurantId,
            serviceId: mealService.id,
            date: targetDate
          }
        },
        data: {
          totalSeats: newTotalSeats
        }
      });

      return {
        totalSeats: updatedCapacity.totalSeats,
        bookedSlots: updatedCapacity.bookedSeats,
        remainingSlots: validatedData.remainingSlots
      };
    });

    return {
      success: true,
      data: result
    };
  } catch (error) {
    console.error('Error updating meal capacity slots:', error);
    return {
      success: false,
      errorMsg: getDescriptiveErrorMessage(error, 'mealCapacity')
    };
  }
}

// Add function to get meal capacity data
const GetMealCapacitySchema = z.object({
  restaurantId: z.number(),
  date: z.string(), // ISO date string
  mealType: z.nativeEnum(MealType)
});

export type GetMealCapacityInput = z.infer<typeof GetMealCapacitySchema>;

export async function getMealCapacity(
  prisma: PrismaClient,
  data: GetMealCapacityInput
): Promise<SettingsResponse<{ 
  totalSeats: number;
  bookedSlots: number;
  remainingSlots: number;
}>> {
  try {
    const validatedData = GetMealCapacitySchema.parse(data);

    const result = await prisma.$transaction(async (tx) => {
      // Find the meal service
      const mealService = await tx.restaurantMealService.findFirst({
        where: {
          restaurantId: validatedData.restaurantId,
          mealType: validatedData.mealType
        }
      });

      if (!mealService) {
        throw new Error("Meal service not found");
      }

      const targetDate = new Date(validatedData.date);
      
      // Find existing capacity record
      let capacityRecord = await tx.restaurantCapacity.findUnique({
        where: {
          restaurantId_serviceId_date: {
            restaurantId: validatedData.restaurantId,
            serviceId: mealService.id,
            date: targetDate
          }
        }
      });

      // If no record exists, create one with default values
      if (!capacityRecord) {
        // Get restaurant capacity from the restaurant table
        const restaurant = await tx.restaurant.findUnique({
          where: { id: validatedData.restaurantId },
          select: { capacity: true }
        });
        
        const defaultCapacity = restaurant?.capacity || 100; // Fallback to 100 if not found
        
        capacityRecord = await tx.restaurantCapacity.create({
          data: {
            restaurantId: validatedData.restaurantId,
            serviceId: mealService.id,
            date: targetDate,
            totalSeats: defaultCapacity,
            bookedSeats: 0,  // Default booked seats
            isEnabled: true
          }
        });
      }

      const remainingSlots = capacityRecord.totalSeats - capacityRecord.bookedSeats;

      return {
        totalSeats: capacityRecord.totalSeats,
        bookedSlots: capacityRecord.bookedSeats,
        remainingSlots: remainingSlots
      };
    });

    return {
      success: true,
      data: result
    };
  } catch (error) {
    console.error('Error getting meal capacity:', error);
    return {
      success: false,
      errorMsg: getDescriptiveErrorMessage(error, 'mealCapacity')
    };
  }
}