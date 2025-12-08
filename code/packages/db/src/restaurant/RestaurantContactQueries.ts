import { PrismaClient } from '../../prisma/generated/prisma';

export interface RestaurantContactInfo {
  id: number;
  name: string;
  phone: string;
  address: string;
}

export type RestaurantContactResponse = 
  | { success: true; data: RestaurantContactInfo }
  | { success: false; error: string };

export class RestaurantContactQueries {
  constructor(private prisma: PrismaClient) {}

  async getRestaurantContactInfo(restaurantId: number): Promise<RestaurantContactResponse> {
    try {
      const restaurant = await this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: {
          id: true,
          name: true,
          phone: true,
          address: true,
        },
      });

      if (!restaurant) {
        return {
          success: false,
          error: 'Restaurant not found',
        };
      }

      return {
        success: true,
        data: restaurant,
      };
    } catch (error) {
      console.error('Error fetching restaurant contact info:', error);
      return {
        success: false,
        error: 'Failed to fetch restaurant contact information',
      };
    }
  }
}
