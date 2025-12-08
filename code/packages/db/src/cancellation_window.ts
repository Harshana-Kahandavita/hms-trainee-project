import { PrismaClient, MealType } from "../prisma/generated/prisma";

export interface CancellationWindowResult {
  windowType: 'FREE' | 'PARTIAL' | 'NO_REFUND';
  message: string;
  refundPercentage?: number;
  refundAmount?: number;
  policyDetails: {
    fullRefundBeforeMinutes: number;
    partialRefundBeforeMinutes: number | null;
    partialRefundPercentage: number | null;
  };
}

export type CancellationWindowResponse = {
  success: true;
  data: CancellationWindowResult;
} | {
  success: false;
  errorMsg: string;
};

export async function getCancellationWindow(
  prisma: PrismaClient,
  reservationId: number,
  advancePaymentAmount: number
): Promise<CancellationWindowResponse> {
  try {
    // First get the reservation with restaurant and meal details
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        restaurant: {
          include: {
            refundPolicies: true
          }
        }
      }
    });

    if (!reservation) {
      return {
        success: false,
        errorMsg: 'Reservation not found'
      };
    }

    const policy = reservation.restaurant.refundPolicies.find(
      p => p.mealType === reservation.mealType
    );

    if (!policy) {
      return {
        success: false,
        errorMsg: 'Refund policy not found'
      };
    }

    const currentTime = getCurrentISTTime();
    const timeDifferenceMinutes = Math.floor(
      (new Date(reservation.reservationDate).getTime() - currentTime.getTime()) / (1000 * 60)
    );

    let windowType: 'FREE' | 'PARTIAL' | 'NO_REFUND';
    let message: string;
    let refundPercentage: number | undefined;
    let refundAmount: number | undefined;

    if (timeDifferenceMinutes >= policy.fullRefundBeforeMinutes) {
      windowType = 'FREE';
      message = 'Your cancellation falls within the Free Cancellation Window. You\'re eligible for a full refund of your advance payment.';
      refundPercentage = 100;
      refundAmount = advancePaymentAmount;
    } else if (
      policy.partialRefundBeforeMinutes && 
      policy.partialRefundPercentage && 
      timeDifferenceMinutes >= policy.partialRefundBeforeMinutes
    ) {
      windowType = 'PARTIAL';
      refundPercentage = policy.partialRefundPercentage;
      refundAmount = (advancePaymentAmount * policy.partialRefundPercentage) / 100;
      message = `Your cancellation falls within the Partial Refund Window. A ${policy.partialRefundPercentage}% refund will be processed.`;
    } else {
      windowType = 'NO_REFUND';
      message = 'This reservation is within the No Refund Window. Please contact support for assistance.';
    }

    return {
      success: true,
      data: {
        windowType,
        message,
        refundPercentage,
        refundAmount,
        policyDetails: {
          fullRefundBeforeMinutes: policy.fullRefundBeforeMinutes,
          partialRefundBeforeMinutes: policy.partialRefundBeforeMinutes,
          partialRefundPercentage: policy.partialRefundPercentage
        }
      }
    };

  } catch (error) {
    console.error('Error in getCancellationWindow:', error);
    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : 'Failed to check cancellation window'
    };
  }
}

function getCurrentISTTime(): Date {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const utc = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  return new Date(utc + istOffset);
} 