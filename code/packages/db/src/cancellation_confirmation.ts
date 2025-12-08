import { PrismaClient, CancellationRequestedBy, CancellationStatus, CancellationReasonCategory, RefundStatus, RefundReason } from "../prisma/generated/prisma";
import { z } from "zod";

// Input validation schema
const CancellationConfirmationSchema = z.object({
  reservationId: z.number().positive(),
  customerId: z.number().positive(),
  restaurantId: z.number().positive(),
  reason: z.string().min(1),
  additionalNotes: z.string().optional()
});

export type CancellationConfirmationInput = z.infer<typeof CancellationConfirmationSchema>;

export type CancellationConfirmationResult = {
  success: true;
  cancellationId: number;
  refundTransactionId: number;
} | {
  success: false;
  error: string;
};

export async function processCancellationConfirmation(
  prisma: PrismaClient,
  input: CancellationConfirmationInput
): Promise<CancellationConfirmationResult> {
  try {
    console.log('Starting cancellation confirmation process', input);

    return await prisma.$transaction(async (tx) => {
      // 1. Verify reservation exists and can be cancelled
      console.log('Fetching reservation details', { reservationId: input.reservationId });
      const reservation = await tx.reservation.findUnique({
        where: { id: input.reservationId },
        include: {
          cancellationRequests: true
        }
      });

      if (!reservation) {
        console.error('Reservation not found', { reservationId: input.reservationId });
        throw new Error("Reservation not found");
      }

      console.log('Found reservation', {
        reservationId: input.reservationId,
        status: reservation.status,
        existingRequests: reservation.cancellationRequests.length
      });

      if (reservation.status === "CANCELLED") {
        console.error('Reservation already cancelled', { reservationId: input.reservationId });
        throw new Error("Reservation is already cancelled");
      }

      if (reservation.cancellationRequests.some(req => 
        req.status === CancellationStatus.PENDING_REVIEW || 
        req.status === CancellationStatus.APPROVED_PENDING_REFUND
      )) {
        console.error('Existing cancellation request found', {
          reservationId: input.reservationId,
          existingRequests: reservation.cancellationRequests
        });
        throw new Error("A cancellation request is already in progress");
      }

      // 2. Create cancellation request
      console.log('Creating cancellation request', {
        reservationId: input.reservationId,
        status: CancellationStatus.APPROVED_PENDING_REFUND
      });
      
      const cancellationRequest = await tx.cancellationRequest.create({
        data: {
          reservationId: input.reservationId,
          restaurantId: input.restaurantId,
          requestedBy: CancellationRequestedBy.CUSTOMER,
          requestedById: input.customerId,
          status: CancellationStatus.APPROVED_PENDING_REFUND,
          reason: input.reason,
          reasonCategory: CancellationReasonCategory.CHANGE_OF_PLANS,
          additionalNotes: input.additionalNotes,
          requestedAt: new Date()
        }
      });

      console.log('Created cancellation request', {
        cancellationId: cancellationRequest.id
      });

      // 3. Create refund transaction
      console.log('Creating refund transaction', {
        reservationId: input.reservationId,
        amount: reservation.totalAmount
      });

      const refundTransaction = await tx.refundTransaction.create({
        data: {
          reservationId: input.reservationId,
          restaurantId: input.restaurantId,
          cancellationId: cancellationRequest.id,
          amount: reservation.totalAmount,
          reason: RefundReason.RESERVATION_CANCELLATION,
          status: RefundStatus.PENDING,
          notes: `Cancellation refund for reservation ${reservation.reservationNumber}`,
          createdAt: new Date()
        }
      });

      console.log('Created refund transaction', {
        refundTransactionId: refundTransaction.id
      });

      // 4. Update reservation status
      console.log('Updating reservation status to CANCELLED', {
        reservationId: input.reservationId
      });

      await tx.reservation.update({
        where: { id: input.reservationId },
        data: { status: "CANCELLED" }
      });

      console.log('Successfully completed cancellation process', {
        reservationId: input.reservationId,
        cancellationId: cancellationRequest.id,
        refundTransactionId: refundTransaction.id
      });

      return {
        success: true,
        cancellationId: cancellationRequest.id,
        refundTransactionId: refundTransaction.id
      };
    });
  } catch (error) {
    console.error('Error processing cancellation confirmation', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      input
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process cancellation'
    };
  }
} 