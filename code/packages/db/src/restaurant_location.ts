import { PrismaClient } from "../prisma/generated/prisma";
import { z } from "zod";

// Input validation schema
const RestaurantLocationInput = z.object({
  restaurantId: z.number(),
});

// TypeScript type for the input
type RestaurantLocationInputType = z.infer<typeof RestaurantLocationInput>;

// Return type with location details
type RestaurantLocationResult = 
  | { 
      success: true; 
      data: {
        restaurantId: number;
        address: string;
        serviceAreas: Array<{
          cityId: number;
          cityName: string;
          latitude: number;
          longitude: number;
          deliveryRadiusKm: number;
          estimatedDeliveryTimeMin: number;
        }>;
      };
    }
  | { success: false; error: string };

export async function getRestaurantLocation(
  prisma: PrismaClient,
  input: RestaurantLocationInputType
): Promise<RestaurantLocationResult> {
  try {
    // Fetch restaurant with address and service areas
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: input.restaurantId },
      select: {
        address: true,
        serviceAreas: {
          where: { isActive: true },
          select: {
            cityId: true,
            deliveryRadiusKm: true,
            estimatedDeliveryTimeMin: true,
            city: {
              select: {
                cityName: true,
                latitude: true,
                longitude: true,
              },
            },
          },
        },
      },
    });

    if (!restaurant) {
      return { success: false, error: "Restaurant not found" };
    }

    return {
      success: true,
      data: {
        restaurantId: input.restaurantId,
        address: restaurant.address,
        serviceAreas: restaurant.serviceAreas.map(area => ({
          cityId: area.cityId,
          cityName: area.city.cityName,
          latitude: Number(area.city.latitude),
          longitude: Number(area.city.longitude),
          deliveryRadiusKm: Number(area.deliveryRadiusKm),
          estimatedDeliveryTimeMin: area.estimatedDeliveryTimeMin,
        })),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch restaurant location",
    };
  }
} 