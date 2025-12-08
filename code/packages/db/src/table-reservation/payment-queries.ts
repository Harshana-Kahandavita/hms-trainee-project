import { PrismaClient, PaymentStatus } from '../../prisma/generated/prisma';

export interface UpdatePaymentStatusByTransactionResult {
    success: boolean;
    updatedCount?: number;
    error?: string;
}

/**
 * Update payment status by request ID and transaction reference
 * Database layer function to update reservation request payment status
 */
export async function updatePaymentStatusByTransaction(
    prisma: PrismaClient,
    input: {
        requestId: number;
        transactionReference: string;
        paymentStatus: PaymentStatus;
        cardBrand?: string;
        maskedCardNumber?: string;
    }
): Promise<UpdatePaymentStatusByTransactionResult> {
    try {
        const updateResult = await prisma.reservationRequestPayment.updateMany({
            where: {
                requestId: input.requestId,
                transactionReference: input.transactionReference
            },
            data: {
                paymentStatus: input.paymentStatus,
                verifiedAt: new Date(),
                nameOnCard: input.cardBrand || null,
                maskedCardNumber: input.maskedCardNumber || null,
                updatedAt: new Date()
            }
        });

        return {
            success: true,
            updatedCount: updateResult.count
        };

    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update payment status'
        };
    }
}

