import { PrismaClient } from "../../prisma/generated/prisma";

export type ListRestaurantsResult = 
  | { 
      success: true; 
      restaurants: Array<{
        id: number;
        name: string;
        reservationSupport: string;
      }>;
    }
  | { success: false; error: string };

export async function listRestaurants(
  prisma: PrismaClient
): Promise<ListRestaurantsResult> {
  try {
    const restaurants = await prisma.restaurant.findMany({
      select: {
        id: true,
        name: true,
        reservationSupport: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return {
      success: true,
      restaurants,
    };
  } catch (error) {
    console.error('Error fetching restaurants:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch restaurants'
    };
  }
} 