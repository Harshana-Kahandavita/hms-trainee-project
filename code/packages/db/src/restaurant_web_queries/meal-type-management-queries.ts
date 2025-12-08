import { PrismaClient, Prisma, MealType } from "../../prisma/generated/prisma";
import { z } from "zod";

// Input validation schemas
export const UpdateMealTypeInput = z.object({
  id: z.number(),
  restaurantId: z.number(),
  mealType: z.nativeEnum(MealType),
  isChildEnabled: z.boolean(),
  adultGrossPrice: z.number(),
  adultNetPrice: z.number(),
  childGrossPrice: z.number().optional(),
  childNetPrice: z.number().optional(),
  // Platter fields - optional for updates
  enableAsPlatter: z.boolean().optional(),
  paxPerPlatter: z.number().min(1).optional(),
});

export const CreateMealTypeInput = z.object({
  restaurantId: z.number(),
  mealType: z.nativeEnum(MealType),
  isChildEnabled: z.boolean(),
  adultGrossPrice: z.number(),
  adultNetPrice: z.number(),
  childGrossPrice: z.number().optional(),
  childNetPrice: z.number().optional(),
  // Platter fields - optional
  enableAsPlatter: z.boolean().optional(),
  paxPerPlatter: z.number().min(1).optional(),
});

export type UpdateMealTypeInputType = z.infer<typeof UpdateMealTypeInput>;
export type CreateMealTypeInputType = z.infer<typeof CreateMealTypeInput>;

export async function updateMealType(
  prisma: PrismaClient,
  input: UpdateMealTypeInputType
) {
  try {
    // Format prices to always have 2 decimal places
    const formatPrice = (price: number): Prisma.Decimal => {
      // Convert to string with 2 decimal places
      const formattedPrice = price.toFixed(2);
      // Convert to Prisma.Decimal for database storage
      return new Prisma.Decimal(formattedPrice);
    };

    const adultGrossPrice = formatPrice(input.adultGrossPrice);
    const adultNetPrice = formatPrice(input.adultNetPrice);
    const childGrossPrice = input.childGrossPrice ? formatPrice(input.childGrossPrice) : undefined;
    const childNetPrice = input.childNetPrice ? formatPrice(input.childNetPrice) : undefined;

    // Validate that net prices are greater than or equal to gross prices
    if (adultNetPrice.lessThan(adultGrossPrice)) {
      return {
        success: false,
        error: 'Adult net price must be greater than or equal to gross price'
      };
    }

    if (input.isChildEnabled && childGrossPrice && childNetPrice) {
      if (childNetPrice.lessThan(childGrossPrice)) {
        return {
          success: false,
          error: 'Kids net price must be greater than or equal to gross price'
        };
      }
    }

    // Validate platter configuration if enabling platter
    if (input.enableAsPlatter) {
      if (!input.paxPerPlatter || input.paxPerPlatter < 1) {
        return {
          success: false,
          error: 'Pax per platter must be at least 1 when platter is enabled'
        };
      }
    }

    // Check if meal service exists
    const existingMealService = await prisma.restaurantMealService.findUnique({
      where: { id: input.id },
      include: {
        platters: {
          where: { isDefault: true }
        }
      }
    });

    if (!existingMealService) {
      return {
        success: false,
        error: 'Meal service not found'
      };
    }

    // Update meal service and handle platter operations in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update the meal service
      const updatedMealService = await tx.restaurantMealService.update({
        where: { id: input.id },
        data: {
          mealType: input.mealType,
          isChildEnabled: input.isChildEnabled,
          adultGrossPrice: adultGrossPrice,
          adultNetPrice: adultNetPrice,
          childGrossPrice: childGrossPrice ?? adultGrossPrice,
          childNetPrice: childNetPrice ?? adultNetPrice,
          priceUpdatedAt: new Date(),
        },
      });

      let platterResult = null;
      const existingPlatter = existingMealService.platters[0]; // Get the default platter if exists

      if (input.enableAsPlatter && input.paxPerPlatter) {
        // Platter is being enabled
        const mealTypeName = input.mealType.charAt(0).toUpperCase() + 
                           input.mealType.slice(1).toLowerCase();
        const defaultPlatterName = `${mealTypeName} Platter (${input.paxPerPlatter} people)`;
        
        if (existingPlatter) {
          // Update existing platter
          platterResult = await tx.restaurantPlatter.update({
            where: { id: existingPlatter.id },
            data: {
              platterName: defaultPlatterName,
              platterDescription: `Updated ${mealTypeName.toLowerCase()} platter serving ${input.paxPerPlatter} people`,
              headCount: input.paxPerPlatter,
              // For platters, both adult and child prices are the same (total platter price)
              adultGrossPrice: adultGrossPrice,
              childGrossPrice: adultGrossPrice,
              adultNetPrice: adultNetPrice,
              childNetPrice: adultNetPrice,
              isActive: true,
              updatedBy: 'SYSTEM',
            },
          });
        } else {
          // Create new platter
          platterResult = await tx.restaurantPlatter.create({
            data: {
              restaurantId: input.restaurantId,
              mealServiceId: updatedMealService.id,
              platterName: defaultPlatterName,
              platterDescription: `Default ${mealTypeName.toLowerCase()} platter serving ${input.paxPerPlatter} people`,
              headCount: input.paxPerPlatter,
              // For platters, both adult and child prices are the same (total platter price)
              adultGrossPrice: adultGrossPrice,
              childGrossPrice: adultGrossPrice,
              adultNetPrice: adultNetPrice,
              childNetPrice: adultNetPrice,
              isActive: true,
              displayOrder: 1,
              isDefault: true,
              createdBy: 'SYSTEM',
              updatedBy: 'SYSTEM',
            },
          });
        }
      } else if (input.enableAsPlatter === false && existingPlatter) {
        // Platter is being disabled - deactivate existing platter
        platterResult = await tx.restaurantPlatter.update({
          where: { id: existingPlatter.id },
          data: {
            isActive: false,
            updatedBy: 'SYSTEM',
          },
        });
      }

      return {
        mealService: updatedMealService,
        platter: platterResult,
      };
    });

    // Convert Decimal values to strings with exactly 2 decimal places
    return {
      success: true,
      mealType: {
        ...result.mealService,
        adultGrossPrice: result.mealService.adultGrossPrice.toFixed(2),
        adultNetPrice: result.mealService.adultNetPrice.toFixed(2),
        childGrossPrice: result.mealService.childGrossPrice.toFixed(2),
        childNetPrice: result.mealService.childNetPrice.toFixed(2),
        serviceChargePercentage: result.mealService.serviceChargePercentage.toFixed(2),
        taxPercentage: result.mealService.taxPercentage.toFixed(2),
      },
      platter: result.platter ? {
        ...result.platter,
        adultGrossPrice: result.platter.adultGrossPrice.toFixed(2),
        childGrossPrice: result.platter.childGrossPrice.toFixed(2),
        adultNetPrice: result.platter.adultNetPrice.toFixed(2),
        childNetPrice: result.platter.childNetPrice.toFixed(2),
      } : result.platter
    };
  } catch (error) {
    console.error('Error updating meal type:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update meal type'
    };
  }
}

export async function createMealType(
  prisma: PrismaClient,
  input: CreateMealTypeInputType
) {
  try {
    // Format prices to always have 2 decimal places
    const formatPrice = (price: number): Prisma.Decimal => {
      // Convert to string with 2 decimal places
      const formattedPrice = price.toFixed(2);
      // Convert to Prisma.Decimal for database storage
      return new Prisma.Decimal(formattedPrice);
    };

    const adultGrossPrice = formatPrice(input.adultGrossPrice);
    const adultNetPrice = formatPrice(input.adultNetPrice);
    const childGrossPrice = input.childGrossPrice ? formatPrice(input.childGrossPrice) : undefined;
    const childNetPrice = input.childNetPrice ? formatPrice(input.childNetPrice) : undefined;

    // Validate that net prices are greater than or equal to gross prices
    if (adultNetPrice.lessThan(adultGrossPrice)) {
      return {
        success: false,
        error: 'Adult net price must be greater than or equal to gross price'
      };
    }

    if (input.isChildEnabled && childGrossPrice && childNetPrice) {
      if (childNetPrice.lessThan(childGrossPrice)) {
        return {
          success: false,
          error: 'Kids net price must be greater than or equal to gross price'
        };
      }
    }

    // Validate platter configuration if enabled
    if (input.enableAsPlatter) {
      if (!input.paxPerPlatter || input.paxPerPlatter < 1) {
        return {
          success: false,
          error: 'Pax per platter must be at least 1 when platter is enabled'
        };
      }
    }

    // Check if meal type already exists
    const existingMealType = await prisma.restaurantMealService.findFirst({
      where: {
        restaurantId: input.restaurantId,
        mealType: input.mealType,
      },
    });

    if (existingMealType) {
      return {
        success: false,
        error: `${input.mealType} service already exists for this restaurant`,
      };
    }

    // Create meal service, capacity record, and platter (if enabled) in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const mealService = await tx.restaurantMealService.create({
        data: {
          restaurantId: input.restaurantId,
          mealType: input.mealType,
          isChildEnabled: input.isChildEnabled,
          adultGrossPrice: adultGrossPrice,
          adultNetPrice: adultNetPrice,
          childGrossPrice: childGrossPrice ?? adultGrossPrice,
          childNetPrice: childNetPrice ?? adultNetPrice,
          priceUpdatedAt: new Date(),
          serviceStartTime: new Date('2024-01-01T08:00:00Z'),
          serviceEndTime: new Date('2024-01-01T22:00:00Z'),
          childAgeLimit: 12,
          isAvailable: true,
        },
      });

      // Create capacity record for today only if it doesn't exist
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Check if capacity record already exists for today
      const existingCapacity = await tx.restaurantCapacity.findUnique({
        where: {
          restaurantId_serviceId_date: {
            restaurantId: input.restaurantId,
            serviceId: mealService.id,
            date: today
          }
        }
      });

      // Only create if it doesn't exist
      if (!existingCapacity) {
        // Get restaurant capacity from the restaurant table
        const restaurant = await tx.restaurant.findUnique({
          where: { id: input.restaurantId },
          select: { capacity: true }
        });
        
        const defaultCapacity = restaurant?.capacity || 100; // Fallback to 100 if not found

        await tx.restaurantCapacity.create({
          data: {
            restaurantId: input.restaurantId,
            serviceId: mealService.id,
            date: today,
            totalSeats: defaultCapacity,
            bookedSeats: 0,
          },
        });
      }

      // Create platter if enabled
      let createdPlatter = null;
      if (input.enableAsPlatter && input.paxPerPlatter) {
        // Generate a default platter name based on meal type and pax count
        const mealTypeName = input.mealType.charAt(0).toUpperCase() + 
                           input.mealType.slice(1).toLowerCase();
        const defaultPlatterName = `${mealTypeName} Platter (${input.paxPerPlatter} people)`;
        
        createdPlatter = await tx.restaurantPlatter.create({
          data: {
            restaurantId: input.restaurantId,
            mealServiceId: mealService.id,
            platterName: defaultPlatterName,
            platterDescription: `Default ${mealTypeName.toLowerCase()} platter serving ${input.paxPerPlatter} people`,
            headCount: input.paxPerPlatter,
            // For platters, both adult and child prices are the same (total platter price)
            adultGrossPrice: adultGrossPrice,
            childGrossPrice: adultGrossPrice,
            adultNetPrice: adultNetPrice,
            childNetPrice: adultNetPrice,
            isActive: true,
            displayOrder: 1,
            isDefault: true,
            createdBy: 'SYSTEM',
            updatedBy: 'SYSTEM',
          },
        });
      }

      return {
        mealService,
        platter: createdPlatter,
      };
    });

    return {
      success: true,
      mealType: {
        ...result.mealService,
        adultGrossPrice: result.mealService.adultGrossPrice.toFixed(2),
        adultNetPrice: result.mealService.adultNetPrice.toFixed(2),
        childGrossPrice: result.mealService.childGrossPrice.toFixed(2),
        childNetPrice: result.mealService.childNetPrice.toFixed(2),
        serviceChargePercentage: result.mealService.serviceChargePercentage.toFixed(2),
        taxPercentage: result.mealService.taxPercentage.toFixed(2),
      },
      platter: result.platter ? {
        ...result.platter,
        adultGrossPrice: result.platter.adultGrossPrice.toFixed(2),
        childGrossPrice: result.platter.childGrossPrice.toFixed(2),
        adultNetPrice: result.platter.adultNetPrice.toFixed(2),
        childNetPrice: result.platter.childNetPrice.toFixed(2),
      } : result.platter,
    };
  } catch (error) {
    console.error('Error creating meal type:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create meal type'
    };
  }
}

export async function getMealTypes(
  prisma: PrismaClient,
  restaurantId: number
) {
  try {
    const mealTypes = await prisma.restaurantMealService.findMany({
      where: {
        restaurantId: restaurantId,
      },
      include: {
        platters: {
          where: {
            isActive: true,
            isDefault: true,
          },
          take: 1, // Get only the default platter for each meal service
        },
      },
    });

    return {
      success: true,
      mealTypes: mealTypes.map(mt => {
        const defaultPlatter = mt.platters[0]; // Get the first (default) platter if it exists
        
        return {
          ...mt,
          adultGrossPrice: mt.adultGrossPrice.toString(),
          adultNetPrice: mt.adultNetPrice.toString(),
          childGrossPrice: mt.childGrossPrice.toString(),
          childNetPrice: mt.childNetPrice.toString(),
          serviceChargePercentage: mt.serviceChargePercentage.toString(),
          taxPercentage: mt.taxPercentage.toString(),
          // Add platter information
          enableAsPlatter: !!defaultPlatter,
          paxPerPlatter: defaultPlatter?.headCount,
          // Convert platters array with serialized Decimal fields
          platters: mt.platters.map(platter => ({
            ...platter,
            adultGrossPrice: platter.adultGrossPrice.toString(),
            childGrossPrice: platter.childGrossPrice.toString(),
            adultNetPrice: platter.adultNetPrice.toString(),
            childNetPrice: platter.childNetPrice.toString(),
          }))
        };
      })
    };
  } catch (error) {
    console.error('Error fetching meal types:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch meal types'
    };
  }
}

// export async function getAvailableMealTypes(
//   prisma: PrismaClient,
//   restaurantId: number
// ): Promise<{
//   success: boolean;
//   error?: string;
//   availableMealTypes: MealType[];
// }> {
//   try {
//     const existingMealTypes = await prisma.restaurantMealService.findMany({
//       where: {
//         restaurantId: restaurantId,
//       },
//       select: {
//         mealType: true,
//       },
//     });

//     const existingTypes = existingMealTypes.map(mt => mt.mealType);
//     const allMealTypes = Object.values(MealType);
//     const availableMealTypes = allMealTypes.filter(type => !existingTypes.includes(type));

//     return {
//       success: true,
//       availableMealTypes,
//     };
//   } catch (error) {
//     console.error('Error fetching available meal types:', error);
//     return {
//       success: false,
//       error: error instanceof Error ? error.message : 'Failed to get available meal types',
//       availableMealTypes: [],
//     };
//   }
// }

/**
 * Get available meal types for service management
 * This function compares all meal types from the enum with the existing meal types
 * for a given restaurant and returns the ones that haven't been added yet
 */
export async function getAvailableMealTypesForService(
  prisma: PrismaClient,
  restaurantId: number
): Promise<{
  success: boolean;
  error?: string;
  availableMealTypes: MealType[];
}> {
  try {
    // Get all existing meal types for this restaurant
    const existingMealTypes = await prisma.restaurantMealService.findMany({
      where: {
        restaurantId: restaurantId,
      },
      select: {
        mealType: true,
      },
    });

    // Extract just the meal type values
    const existingTypeValues = existingMealTypes.map(mt => mt.mealType);
    
    // Get all possible meal types from the enum
    const allMealTypes = Object.values(MealType);
    
    // Filter out types that already exist for this restaurant
    const availableMealTypes = allMealTypes.filter(type => !existingTypeValues.includes(type));
    
    console.log('Available meal types for service:', {
      restaurantId,
      existingTypeValues,
      allMealTypes,
      availableMealTypes
    });

    return {
      success: true,
      availableMealTypes,
    };
  } catch (error) {
    console.error('Error fetching available meal types for service:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get available meal types for service',
      availableMealTypes: [],
    };
  }
} 