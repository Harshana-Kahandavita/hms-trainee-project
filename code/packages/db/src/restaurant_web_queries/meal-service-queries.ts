import { PrismaClient, Prisma, MealType } from "../../prisma/generated/prisma";
import { z } from "zod";

// Input validation schema for adding a meal service
export const AddMealServiceInput = z.object({
  restaurantId: z.number(),
  mealType: z.nativeEnum(MealType),
  isAvailable: z.boolean().default(true),
  adultGrossPrice: z.number(),
  childGrossPrice: z.number(),
  childAgeLimit: z.number(),
  serviceChargePercentage: z.number(),
  taxPercentage: z.number(),
  serviceStartTime: z.date(),
  serviceEndTime: z.date(),
});

// Input type for adding a meal service
export type AddMealServiceInputType = z.infer<typeof AddMealServiceInput>;

export async function addMealService(
  prisma: PrismaClient,
  input: AddMealServiceInputType
) {
  try {
    const validatedInput = AddMealServiceInput.parse(input);

    const mealService = await prisma.restaurantMealService.create({
      data: {
        restaurantId: validatedInput.restaurantId,
        mealType: validatedInput.mealType,
        isAvailable: validatedInput.isAvailable,
        adultGrossPrice: new Prisma.Decimal(validatedInput.adultGrossPrice),
        childGrossPrice: new Prisma.Decimal(validatedInput.childGrossPrice),
        adultNetPrice: new Prisma.Decimal(calculateNetPrice(validatedInput.adultGrossPrice as number, validatedInput.serviceChargePercentage as number, validatedInput.taxPercentage as number)),
        childNetPrice: new Prisma.Decimal(calculateNetPrice(validatedInput.childGrossPrice as number, validatedInput.serviceChargePercentage as number, validatedInput.taxPercentage as number)),
        childAgeLimit: validatedInput.childAgeLimit,
        serviceChargePercentage: new Prisma.Decimal(validatedInput.serviceChargePercentage),
        taxPercentage: new Prisma.Decimal(validatedInput.taxPercentage),
        serviceStartTime: validatedInput.serviceStartTime,
        serviceEndTime: validatedInput.serviceEndTime,
        priceUpdatedAt: new Date(),
      },
    });

    return {
      success: true,
      mealService,
    };
  } catch (error) {
    console.error('Error in addMealService:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add meal service',
    };
  }
}

// Input validation schema for updating a meal service
export const UpdateMealServiceMgtInput = z.object({
  id: z.number(),
  restaurantId: z.number(),
  mealType: z.nativeEnum(MealType),
  isAvailable: z.boolean(),
  adultGrossPrice: z.number(),
  childGrossPrice: z.number(),
  childAgeLimit: z.number(),
  serviceChargePercentage: z.number(),
  taxPercentage: z.number(),
  serviceStartTime: z.date(),
  serviceEndTime: z.date(),
});

// Input type for updating a meal service
export type UpdateMealServiceMgtInputType = z.infer<typeof UpdateMealServiceMgtInput>;

export async function updateMealService(
  prisma: PrismaClient,
  input: UpdateMealServiceMgtInputType
) {
  try {
    const validatedInput = UpdateMealServiceMgtInput.parse(input);

    // First verify the meal service belongs to the restaurant
    const existingService = await prisma.restaurantMealService.findFirst({
      where: {
        id: validatedInput.id,
        restaurantId: validatedInput.restaurantId,
      },
    });

    if (!existingService) {
      return {
        success: false,
        error: 'Meal service not found or does not belong to this restaurant',
      };
    }

    const mealService = await prisma.restaurantMealService.update({
      where: {
        id: validatedInput.id,
        restaurantId: validatedInput.restaurantId,
      },
      data: {
        mealType: validatedInput.mealType,
        isAvailable: validatedInput.isAvailable,
        adultGrossPrice: new Prisma.Decimal(validatedInput.adultGrossPrice),
        childGrossPrice: new Prisma.Decimal(validatedInput.childGrossPrice),
        adultNetPrice: new Prisma.Decimal(calculateNetPrice(validatedInput.adultGrossPrice as number, validatedInput.serviceChargePercentage as number, validatedInput.taxPercentage as number)),
        childNetPrice: new Prisma.Decimal(calculateNetPrice(validatedInput.childGrossPrice as number, validatedInput.serviceChargePercentage as number, validatedInput.taxPercentage as number)),
        childAgeLimit: validatedInput.childAgeLimit,
        serviceChargePercentage: new Prisma.Decimal(validatedInput.serviceChargePercentage),
        taxPercentage: new Prisma.Decimal(validatedInput.taxPercentage),
        serviceStartTime: validatedInput.serviceStartTime,
        serviceEndTime: validatedInput.serviceEndTime,
        priceUpdatedAt: new Date(),
      },
    });

    return {
      success: true,
      mealService,
    };
  } catch (error) {
    console.error('Error in updateMealService:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update meal service',
    };
  }
}

// Helper function to calculate net price
function calculateNetPrice(grossPrice: number, serviceChargePercentage: number, taxPercentage: number): number {
  const serviceChargeAmount = grossPrice * (serviceChargePercentage / 100);
  const taxAmount = grossPrice * (taxPercentage / 100);
  return parseFloat((grossPrice + serviceChargeAmount + taxAmount).toFixed(2));
} 