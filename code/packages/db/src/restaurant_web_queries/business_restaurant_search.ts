import { PrismaClient } from "../../prisma/generated/prisma";
import { z } from "zod";

// Input validation schema
const BusinessRestaurantSearchSchema = z.object({
  businessId: z.number().positive({ message: "Business ID must be positive" }),
  restaurantIds: z.array(z.number().positive({ message: "Restaurant ID must be positive" }))
});

export interface BusinessRestaurantResult {
  businessId: number;
  businessName: string;
  restaurants: {
    id: number;
    name: string;
    reservationSupport: string;
  }[];
}

export type BusinessRestaurantSearchResponse = {
  success: true;
  data: BusinessRestaurantResult;
} | {
  success: false;
  errorMsg: string;
};

export async function getBusinessRestaurants(
  prisma: PrismaClient,
  businessId: number,
  restaurantIds: number[]
): Promise<BusinessRestaurantSearchResponse> {
  try {
    // Validate input
    const validationResult = BusinessRestaurantSearchSchema.safeParse({
      businessId,
      restaurantIds
    });

    if (!validationResult.success) {
      return {
        success: false,
        errorMsg: validationResult.error.errors[0]?.message || "Invalid input parameters"
      };
    }

    const business = await prisma.business.findUnique({
      where: {
        id: businessId
      },
      include: {
        restaurants: {
          where: {
            id: {
              in: restaurantIds
            }
          },
          select: {
            id: true,
            name: true,
            reservationSupport: true
          }
        }
      }
    });

    if (!business) {
      return {
        success: false,
        errorMsg: "Business not found"
      };
    }

    return {
      success: true,
      data: {
        businessId: business.id,
        businessName: business.name,
        restaurants: business.restaurants
      }
    };
  } catch (error) {
    console.error('Error fetching business restaurants:', error);
    // Add stack trace logging
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : 'Failed to fetch business restaurants'
    };
  }
}
