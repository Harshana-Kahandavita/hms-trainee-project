import { PrismaClient } from "../../prisma/generated/prisma";
import { z } from "zod";

// Input validation schema
const ModificationPaymentStatusInput = z.object({
  modificationId: z.number(),
});

// TypeScript type for the input
type ModificationPaymentStatusInputType = z.infer<typeof ModificationPaymentStatusInput>;

// Return type with payment status URL
type ModificationPaymentStatusResult = 
  | { 
      success: true; 
      data: {
        modificationId: number;
        paymentId: number;
        paymentStatus: string;
        statusUrl: string | null;
      };
    }
  | { success: false; error: string };

export async function getModificationPaymentStatusUrl(
  prisma: PrismaClient,
  input: ModificationPaymentStatusInputType
): Promise<ModificationPaymentStatusResult> {
  try {
    // Validate input
    const validatedInput = ModificationPaymentStatusInput.parse(input);
    
    // Fetch payment record for the modification
    const payment = await prisma.reservationPayment.findFirst({
      where: { 
        modificationId: validatedInput.modificationId 
      },
      select: {
        id: true,
        paymentStatus: true,
        paymentNotes: true,
      },
    });

    if (!payment) {
      return { success: false, error: "Payment record not found for this modification" };
    }

    // Extract status URL from payment notes if available
    let statusUrl: string | null = null;
    if (payment.paymentNotes) {
      try {
        // Attempt to parse JSON from paymentNotes
        const notesData = JSON.parse(payment.paymentNotes);
        statusUrl = notesData.statusUrl || null;
      } catch (e) {
        // If not JSON, check if it contains a URL
        const urlMatch = payment.paymentNotes.match(/https?:\/\/[^\s]+/);
        statusUrl = urlMatch ? urlMatch[0] : null;
      }
    }

    return {
      success: true,
      data: {
        modificationId: validatedInput.modificationId,
        paymentId: payment.id,
        paymentStatus: payment.paymentStatus,
        statusUrl: statusUrl,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch payment status URL",
    };
  }
}
