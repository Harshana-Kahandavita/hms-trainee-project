import { PrismaClient, ReservationRequestStatus } from '../../prisma/generated/prisma';

export interface UpdateReservationRequestStatusResult {
    success: boolean;
    error?: string;
}

/**
 * Update reservation request status
 * Database layer function to update reservation request status and add status history
 */
export async function updateReservationRequestStatus(
    prisma: PrismaClient,
    input: {
        requestId: number;
        status: ReservationRequestStatus;
        changeReason?: string;
        changedBy?: string;
    }
): Promise<UpdateReservationRequestStatusResult> {
    try {
        // Get current request to track previous status
        const currentRequest = await prisma.reservationRequest.findUnique({
            where: { id: input.requestId },
            select: { status: true }
        });

        if (!currentRequest) {
            return {
                success: false,
                error: 'Reservation request not found'
            };
        }

        // Use transaction to update status and clean up holds if payment failed/cancelled
        await prisma.$transaction(async (tx) => {
            // Update status with history
            await tx.reservationRequest.update({
                where: { id: input.requestId },
                data: {
                    status: input.status,
                    updatedAt: new Date(),
                    processingCompletedAt: 
                        input.status === 'PAYMENT_FAILED' ||
                        input.status === 'CANCELLED' ||
                        input.status === 'COMPLETED' 
                            ? new Date() 
                            : undefined,
                    statusHistory: {
                        create: {
                            previousStatus: currentRequest.status,
                            newStatus: input.status,
                            changeReason: input.changeReason || 'Status update',
                            statusChangedAt: new Date(),
                            changedBy: input.changedBy || 'SYSTEM'
                        }
                    }
                }
            });

            // If payment failed or cancelled, delete any hold records for this request
            if (input.status === 'PAYMENT_FAILED' || input.status === 'CANCELLED') {
                await tx.reservationTableHold.deleteMany({
                    where: { requestId: input.requestId }
                });
            }
        });

        return {
            success: true
        };

    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update reservation request status'
        };
    }
}

