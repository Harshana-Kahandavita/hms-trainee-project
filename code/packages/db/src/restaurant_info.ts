import { PrismaClient } from '../prisma/generated/prisma';
import { z } from 'zod';

// Input validation schema
const RestaurantIdSchema = z.number().int().positive();

// Response type
export type RestaurantInfoResponse = 
  | {
      success: true;
      data: {
        restaurant: {
          id: number;
          name: string;
          reservationSupport: string;
          advancePaymentPercentage: number;
        };
      };
    }
  | {
      success: false;
      errorMsg: string;
    };

export async function getRestaurantInfo(
  prisma: PrismaClient,
  restaurantId: number
): Promise<RestaurantInfoResponse> {
  try {
    // Validate input
    const validationResult = RestaurantIdSchema.safeParse(restaurantId);
    if (!validationResult.success) {
      return {
        success: false,
        errorMsg: validationResult.error.errors[0]?.message || "Invalid restaurant ID"
      };
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        name: true,
        reservationSupport: true,
        advancePaymentPercentage: true
      }
    });

    if (!restaurant) {
      return {
        success: false,
        errorMsg: "Restaurant not found"
      };
    }

    return {
      success: true,
      data: {
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          reservationSupport: restaurant.reservationSupport,
          advancePaymentPercentage: restaurant.advancePaymentPercentage
        }
      }
    };
  } catch (error) {
    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : "Failed to fetch restaurant info"
    };
  }
}
