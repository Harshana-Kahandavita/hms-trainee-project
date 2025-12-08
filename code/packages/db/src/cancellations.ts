import { PrismaClient, CancellationStatus, CancellationRequestedBy, CancellationReasonCategory, RefundStatus } from "../prisma/generated/prisma";
import { z } from "zod";

// Input validation schema
const CancellationRequestSchema = z.object({
  reservationId: z.number().positive(),
  restaurantId: z.number().positive(),
  requestedBy: z.enum(['CUSTOMER', 'MERCHANT', 'SYSTEM']),
  requestedById: z.number().positive(),
  reason: z.string().min(1),
  reasonCategory: z.enum([
    'CHANGE_OF_PLANS',
    'EMERGENCY',
    'WEATHER',
    'RESTAURANT_ISSUE',
    'DOUBLE_BOOKING',
    'SYSTEM_ERROR',
    'OTHER'
  ]),
  additionalNotes: z.string().optional()
});

export type CancellationRequestInput = z.infer<typeof CancellationRequestSchema>;

interface CancellationResult {
  success: boolean;
  cancellationId?: number;
  refundAmount?: number;
  error?: string;
}

export async function processCancellation(
  prisma: PrismaClient,
  input: CancellationRequestInput
): Promise<CancellationResult> {
  try {
    // Validate input
    const validatedInput = CancellationRequestSchema.parse(input);

    // Start transaction
    return await prisma.$transaction(async (tx) => {
      // 1. Get reservation details
      const reservation = await tx.reservation.findUnique({
        where: { id: validatedInput.reservationId },
        include: {
          restaurant: {
            include: {
              refundPolicies: {
                where: {
                  isActive: true,
                }
              }
            }
          }
        }
      });

      if (!reservation) {
        throw new Error('Reservation not found');
      }

      if (reservation.status === 'CANCELLED') {
        throw new Error('Reservation is already cancelled');
      }

      // 2. Calculate refund amount based on policy
      const refundPolicy = reservation.restaurant.refundPolicies.find(
        policy => policy.mealType === reservation.mealType
      );

      if (!refundPolicy) {
        throw new Error('No refund policy found');
      }

      const reservationDateTime = new Date(`${reservation.reservationDate.toISOString().split('T')[0]}T${reservation.reservationTime.toISOString().split('T')[1]}`);
      const minutesUntilReservation = Math.floor((reservationDateTime.getTime() - new Date().getTime()) / (1000 * 60));

      let refundAmount = 0;
      let refundStatus: CancellationStatus;

      if (minutesUntilReservation >= refundPolicy.fullRefundBeforeMinutes) {
        refundAmount = Number(reservation.totalAmount);
        refundStatus = 'APPROVED_PENDING_REFUND';
      } else if (
        refundPolicy.partialRefundBeforeMinutes && 
        minutesUntilReservation >= refundPolicy.partialRefundBeforeMinutes
      ) {
        refundAmount = Number(reservation.totalAmount) * (refundPolicy.partialRefundPercentage || 0) / 100;
        refundStatus = 'APPROVED_PENDING_REFUND';
      } else {
        refundStatus = 'APPROVED_NO_REFUND';
      }

      // 3. Create cancellation request
      const cancellationRequest = await tx.cancellationRequest.create({
        data: {
          ...validatedInput,
          status: refundStatus,
          refundAmount: refundAmount > 0 ? refundAmount : null,
          refundPercentage: refundPolicy.partialRefundPercentage,
          processedAt: new Date(),
          processedBy: 'SYSTEM'
        }
      });

      // 4. Update reservation status
      await tx.reservation.update({
        where: { id: validatedInput.reservationId },
        data: { status: 'CANCELLED' }
      });

      // 5. Create refund transaction if applicable
      if (refundAmount > 0) {
        await tx.refundTransaction.create({
          data: {
            reservationId: validatedInput.reservationId,
            restaurantId: validatedInput.restaurantId,
            cancellationId: cancellationRequest.id,
            amount: refundAmount,
            reason: 'RESERVATION_CANCELLATION',
            status: RefundStatus.PENDING,
            notes: `Cancellation refund: ${refundAmount > Number(reservation.totalAmount) ? 'Full' : 'Partial'}`
          }
        });
      }

      return {
        success: true,
        cancellationId: cancellationRequest.id,
        refundAmount: refundAmount
      };
    });

  } catch (error) {
    console.error('Error processing cancellation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process cancellation'
    };
  }
} 