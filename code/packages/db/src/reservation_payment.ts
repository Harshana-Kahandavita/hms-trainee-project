import { PrismaClient } from '../prisma/generated/prisma';

export interface PaymentDetailsResult {
  success: boolean;
  data?: {
    reservationId: number;
    totalAmount: string;
    advancePaidAmount: string;
    remainingAmount: string;
    businessName: string;
    businessEmail: string;
    businessPhone: string;
    advancePaymentPercentage: number;
    specialRequests?: string;
    // Platter-related fields
    isPlatterBasedReservation?: boolean;
    platterCount?: number;
    paxPerPlatter?: number;
  };
  error?: string;
}

export async function getReservationPaymentDetailsQuery(
  prisma: PrismaClient,
  reservationNumber: string,
  advancePaidAmount: string
): Promise<PaymentDetailsResult> {
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { 
        reservationNumber 
      },
      include: {
        promoCodeUsage: true,
        restaurant: {
          include: {
            business: true
          }
        }
      }
    });

    if (!reservation) {
      return {
        success: false,
        error: 'Reservation not found'
      };
    }

    // Fetch meal service and platter information
    const mealService = await prisma.restaurantMealService.findFirst({
      where: {
        restaurantId: reservation.restaurantId,
        mealType: reservation.mealType,
        isAvailable: true,
      },
      include: {
        platters: {
          where: {
            isActive: true,
          },
          select: {
            id: true,
            platterName: true,
            headCount: true,
          },
        },
      },
    });

    // Determine if this is a platter-based reservation
    const isPlatterBasedReservation = (mealService?.platters?.length ?? 0) > 0;
    const totalGuests = reservation.adultCount + reservation.childCount;
    const platterCount = isPlatterBasedReservation ? 
      Math.ceil(totalGuests / (mealService?.platters?.[0]?.headCount || 1)) : undefined;
    const paxPerPlatter = isPlatterBasedReservation && mealService?.platters?.[0]?.headCount ? 
      mealService.platters[0].headCount : undefined;

    // If promo code was used, use originalAmount from promoCodeUsage
    const totalAmount = reservation.promoCodeUsage?.[0]?.originalAmount?.toNumber() ?? 
      reservation.totalAmount.toNumber();

    // Calculate remaining amount
    const remainingAmount = totalAmount - parseFloat(advancePaidAmount);

    return {
      success: true,
      data: {
        reservationId: reservation.id,
        totalAmount: Number(totalAmount).toFixed(2),
        advancePaidAmount: Number(parseFloat(advancePaidAmount)).toFixed(2),
        remainingAmount: Number(remainingAmount).toFixed(2),
        businessName: reservation.restaurant.business.name,
        businessEmail: reservation.restaurant.business.email,
        businessPhone: reservation.restaurant.business.phone,
        advancePaymentPercentage: reservation.restaurant.advancePaymentPercentage,
        specialRequests: reservation.specialRequests || undefined,
        // Platter-related fields
        isPlatterBasedReservation,
        platterCount,
        paxPerPlatter,
      }
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch payment details'
    };
  }
} 