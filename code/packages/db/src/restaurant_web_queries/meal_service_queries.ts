import { PrismaClient, MealType } from "../../prisma/generated/prisma";
import { z } from "zod";

// Input validation schema
const MealServiceTimeSearchSchema = z.object({
  restaurantId: z.number().positive({ message: "Restaurant ID must be positive" }),
  mealType: z.nativeEnum(MealType, { 
    message: "Invalid meal type" 
  })
});

export interface MealServiceTimeResult {
  id: number;
  restaurantId: number;
  mealType: MealType;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

export type MealServiceTimeResponse = {
  success: true;
  data: MealServiceTimeResult;
} | {
  success: false;
  errorMsg: string;
};

export async function getMealServiceTime(
  prisma: PrismaClient,
  restaurantId: number,
  mealType: MealType
): Promise<MealServiceTimeResponse> {
  try {
    // Validate input
    const validationResult = MealServiceTimeSearchSchema.safeParse({
      restaurantId,
      mealType
    });

    if (!validationResult.success) {
      return {
        success: false,
        errorMsg: validationResult.error.errors[0]?.message || "Invalid input parameters"
      };
    }

    const mealService = await prisma.restaurantMealService.findFirst({
      where: {
        restaurantId: restaurantId,
        mealType: mealType,
      }
    });

    if (!mealService) {
      return {
        success: false,
        errorMsg: "Meal service time not found"
      };
    }
    console.log("***************************")
    console.log(mealService.serviceStartTime.toLocaleTimeString())
    console.log(mealService.serviceEndTime.toLocaleTimeString())
    console.log("***************************")

    return {
      success: true,
      data: {
        id: mealService.id,
        restaurantId: mealService.restaurantId,
        mealType: mealService.mealType,
        startTime: mealService.serviceStartTime.toLocaleTimeString(),
        endTime: mealService.serviceEndTime.toLocaleTimeString(),
        isAvailable: mealService.isAvailable,
      }
    };
  } catch (error) {
    console.error('Error fetching meal service time:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : 'Failed to fetch meal service time'
    };
  }
} 