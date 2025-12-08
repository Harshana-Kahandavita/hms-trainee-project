import { PrismaClient } from '../prisma/generated/prisma';

export interface RestaurantAdvancePaymentResult {
  advancePaymentPercentage: number;
}

export type RestaurantAdvancePaymentResponse = {
  success: true;
  advancePaymentPercentage: number;
} | {
  success: false;
  errorMsg: string;
};

export async function getRestaurantAdvancePayment(
  prisma: PrismaClient,
  restaurantId: number
): Promise<RestaurantAdvancePaymentResponse> {
  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { advancePaymentPercentage: true }
    });

    if (!restaurant) {
      return {
        success: false,
        errorMsg: 'Restaurant not found'
      };
    }

    return {
      success: true,
      advancePaymentPercentage: restaurant.advancePaymentPercentage
    };
  } catch (error) {
    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : 'Failed to get advance payment percentage'
    };
  }
} 