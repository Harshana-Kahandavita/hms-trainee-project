import { PrismaClient, MealType, CancellationRequestedBy, CancellationStatus, CancellationReasonCategory, CancellationWindowType, RefundStatus, RefundType, RefundReason } from "../../prisma/generated/prisma";
import { z } from "zod";

// Input validation schema
const RestaurantRefundPolicySearchSchema = z.object({
  restaurantId: z.number().positive({ message: "Restaurant ID must be positive" }),
  mealType: z.nativeEnum(MealType, { 
    message: "Invalid meal type" 
  })
});

export interface RestaurantRefundPolicyResult {
  id: number;
  restaurantId: number;
  mealType: MealType;
  allowedRefundTypes: string[];
  fullRefundBeforeMinutes: number;
  partialRefundBeforeMinutes: number | null;
  partialRefundPercentage: number | null;
  isActive: boolean;
}

export type RestaurantRefundPolicyResponse = {
  success: true;
  data: RestaurantRefundPolicyResult;
} | {
  success: false;
  errorMsg: string;
};

export async function getRestaurantRefundPolicy(
  prisma: PrismaClient,
  restaurantId: number,
  mealType: MealType
): Promise<RestaurantRefundPolicyResponse> {
  try {
    // Validate input
    const validationResult = RestaurantRefundPolicySearchSchema.safeParse({
      restaurantId,
      mealType
    });

    if (!validationResult.success) {
      return {
        success: false,
        errorMsg: validationResult.error.errors[0]?.message || "Invalid input parameters"
      };
    }

    const refundPolicy = await prisma.restaurantRefundPolicy.findUnique({
      where: {
        restaurantId_mealType: {
          restaurantId,
          mealType
        }
      }
    });

    if (!refundPolicy) {
      return {
        success: false,
        errorMsg: "Refund policy not found"
      };
    }

    return {
      success: true,
      data: {
        id: refundPolicy.id,
        restaurantId: refundPolicy.restaurantId,
        mealType: refundPolicy.mealType,
        allowedRefundTypes: refundPolicy.allowedRefundTypes,
        fullRefundBeforeMinutes: refundPolicy.fullRefundBeforeMinutes,
        partialRefundBeforeMinutes: refundPolicy.partialRefundBeforeMinutes,
        partialRefundPercentage: refundPolicy.partialRefundPercentage,
        isActive: refundPolicy.isActive
      }
    };
  } catch (error) {
    console.error('Error fetching restaurant refund policy:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : 'Failed to fetch restaurant refund policy'
    };
  }
}

// interface CreateCancellationRequestInput {
//   reservationId: number;
//   restaurantId: number;
//   reason: string;
//   additionalNotes: string;
//   processedBy: string;
//   refundAmount: number;
//   refundPercentage: number;
//   requestedById: number;
// }

// interface CreateRefundTransactionInput {
//   reservationId: number;
//   restaurantId: number;
//   cancellationId: number;
//   amount: number;
//   processedBy: string;
// }

// export async function createCancellationRequest(
//   prisma: PrismaClient,
//   input: CreateCancellationRequestInput
// ) {
//   try {
//     const cancellationRequest = await prisma.cancellationRequest.create({
//       data: {
//         reservationId: input.reservationId,
//         restaurantId: input.restaurantId,
//         requestedBy: CancellationRequestedBy.MERCHANT,
//         requestedById: input.requestedById,
//         status: CancellationStatus.APPROVED_PENDING_REFUND,
//         reason: input.reason,
//         reasonCategory: CancellationReasonCategory.RESTAURANT_ISSUE,
//         additionalNotes: input.additionalNotes,
//         processedBy: input.processedBy,
//         refundAmount: input.refundAmount,
//         refundPercentage: input.refundPercentage,
//         processedAt: new Date()
//       }
//     });

//     return { success: true, data: cancellationRequest };
//   } catch (error) {
//     return { success: false, error: 'Failed to create cancellation request' };
//   }
// }

// export async function createRefundTransaction(
//   prisma: PrismaClient,
//   input: CreateRefundTransactionInput
// ) {
//   try {
//     const refundTransaction = await prisma.refundTransaction.create({
//       data: {
//         reservationId: input.reservationId,
//         restaurantId: input.restaurantId,
//         cancellationId: input.cancellationId,
//         amount: input.amount,
//         reason: RefundReason.RESERVATION_CANCELLATION,
//         status: RefundStatus.PENDING,
//         processedBy: input.processedBy,
//         createdAt: new Date()
//       }
//     });

//     return { success: true, data: refundTransaction };
//   } catch (error) {
//     return { success: false, error: 'Failed to create refund transaction' };
//   }
// }

// export async function updateReservationStatus(
//   prisma: PrismaClient,
//   reservationId: number
// ) {
//   try {
//     const updatedReservation = await prisma.reservation.update({
//       where: { id: reservationId },
//       data: { status: 'CANCELLED' }
//     });

//     return { success: true, data: updatedReservation };
//   } catch (error) {
//     return { success: false, error: 'Failed to update reservation status' };
//   }
// }

// Input validation schema
const CancellationRequestInput = z.object({
  reservationId: z.number().positive(),
  restaurantId: z.number().positive(),
  reason: z.string().min(1),
  additionalNotes: z.string().optional(),
  processedBy: z.string(),
  refundAmount: z.number().min(0),
  refundPercentage: z.number().min(0).max(100),
  requestedById: z.number().positive(),
  mealType: z.nativeEnum(MealType),
  windowType: z.enum(['FREE', 'PARTIAL', 'NO_REFUND'])
});

type CancellationRequestInputType = z.infer<typeof CancellationRequestInput>;

type CancellationResponse = {
  success: true;
  data: {
    cancellationId: number;
    refundId: number;
    refundPolicy: RestaurantRefundPolicyResult;
  };
} | {
  success: false;
  error: string;
};

export async function handleReservationCancellation(
  prisma: PrismaClient,
  input: CancellationRequestInputType
): Promise<CancellationResponse> {
  try {
    return await prisma.$transaction(async (tx) => {
      // 1. Get reservation details with proper select
      const reservation = await tx.reservation.findUnique({
        where: { id: input.reservationId },
        select: {
          id: true,
          reservationDate: true,
          reservationTime: true,
          mealType: true,
          adultCount: true,
          childCount: true,
          status: true
        }
      });

      if (!reservation) {
        throw new Error('Reservation not found');
      }

      // 2. Get meal service
      const mealService = await tx.restaurantMealService.findFirst({
        where: {
          restaurantId: input.restaurantId,
          mealType: input.mealType
        },
        select: {
          id: true,
          mealType: true
        }
      });

      if (!mealService) {
        throw new Error('Meal service not found');
      }

      // 3. Calculate total seats to reverse
      const totalSeatsToReverse = reservation.adultCount + reservation.childCount;

      // 4. Update capacity using Prisma's update method
      const updatedCapacity = await tx.restaurantCapacity.updateMany({
        where: {
          restaurantId: input.restaurantId,
          serviceId: mealService.id,
          date: reservation.reservationDate,
        },
        data: {
          bookedSeats: {
            decrement: totalSeatsToReverse
          }
        }
      });

      if (updatedCapacity.count === 0) {
        throw new Error('Failed to update capacity');
      }

      // 5. Create cancellation request
      const cancellation = await tx.cancellationRequest.create({
        data: {
          reservationId: input.reservationId,
          restaurantId: input.restaurantId,
          requestedBy: CancellationRequestedBy.CUSTOMER,
          requestedById: input.requestedById,
          status: CancellationStatus.APPROVED_PENDING_REFUND,
          reason: input.reason,
          reasonCategory: CancellationReasonCategory.CHANGE_OF_PLANS,
          additionalNotes: input.additionalNotes || '',
          processedBy: input.processedBy,
          processedAt: new Date(),
          refundAmount: input.refundAmount,
          refundPercentage: input.refundPercentage,
          windowType: input.windowType === 'FREE' 
            ? CancellationWindowType.FREE 
            : input.windowType === 'PARTIAL' 
              ? CancellationWindowType.PARTIAL 
              : CancellationWindowType.NO_REFUND
        }
      });

      // 6. Create refund transaction
      const refund = await tx.refundTransaction.create({
        data: {
          reservationId: input.reservationId,
          restaurantId: input.restaurantId,
          cancellationId: cancellation.id,
          amount: input.refundAmount,
          reason: RefundReason.RESERVATION_CANCELLATION,
          status: RefundStatus.PENDING,
          processedBy: input.processedBy,
          createdAt: new Date()
        }
      });

      // 7. Update reservation status
      await tx.reservation.update({
        where: { id: input.reservationId },
        data: { status: 'CANCELLED' }
      });

      // 8. Get refund policy for response
      const refundPolicy = await tx.restaurantRefundPolicy.findUnique({
        where: {
          restaurantId_mealType: {
            restaurantId: input.restaurantId,
            mealType: input.mealType
          }
        }
      });

      if (!refundPolicy) {
        throw new Error('Refund policy not found');
      }

      return {
        success: true,
        data: {
          cancellationId: cancellation.id,
          refundId: refund.id,
          refundPolicy: {
            id: refundPolicy.id,
            restaurantId: refundPolicy.restaurantId,
            mealType: refundPolicy.mealType,
            allowedRefundTypes: refundPolicy.allowedRefundTypes,
            fullRefundBeforeMinutes: refundPolicy.fullRefundBeforeMinutes,
            partialRefundBeforeMinutes: refundPolicy.partialRefundBeforeMinutes,
            partialRefundPercentage: refundPolicy.partialRefundPercentage,
            isActive: refundPolicy.isActive
          }
        }
      };
    });
  } catch (error) {
    console.error('Cancellation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process cancellation'
    };
  }
}
