import { PrismaClient } from "../../prisma/generated/prisma";
import { z } from "zod";

// Input validation schema
const BusinessSearchSchema = z.object({
  businessId: z.number().positive({ message: "Business ID must be positive" })
});

export interface RestaurantResult {
  id: number;
  name: string;
}

export type RestaurantsSearchResponse = {
  success: true;
  data: RestaurantResult[];
} | {
  success: false;
  errorMsg: string;
};

export async function findRestaurantsByBusiness(
  prisma: PrismaClient,
  businessId: number
): Promise<RestaurantsSearchResponse> {
  try {
    // Validate input
    const validationResult = BusinessSearchSchema.safeParse({
      businessId
    });

    if (!validationResult.success) {
      return {
        success: false,
        errorMsg: validationResult.error.errors[0]?.message || "Invalid business ID"
      };
    }

    const restaurants = await prisma.restaurant.findMany({
      where: {
        businessId: businessId
      },
      select: {
        id: true,
        name: true,
      }
    });

    if (!restaurants.length) {
      return {
        success: false,
        errorMsg: "No restaurants found for this business"
      };
    }

    return {
      success: true,
      data: restaurants
    };
  } catch (error) {
    console.error('Error fetching restaurants:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : 'Failed to fetch restaurants'
    };
  }
}
