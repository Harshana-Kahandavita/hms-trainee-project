import {
    PrismaClient,
    Prisma,
    PaymentStatus,
    PaymentChannel,
  } from "../prisma/generated/prisma";
  
  import { z, ZodError } from "zod";

// Input validation schema for payment
const CreateReservationRequestPaymentInput = z.object({
    reservationRequestId: z.number(),
    amount: z.number(),
    paymentProvider: z.string(),
    paymentChannel: z.nativeEnum(PaymentChannel),
    transactionReference: z.string(),
    paymentStatusUrl: z.string().optional(),
  });
  
  // TypeScript type for the payment input
  type CreateReservationRequestPaymentInputType = z.infer<
    typeof CreateReservationRequestPaymentInput
  >;
  
  // Return type for payment creation
  type CreateReservationRequestPaymentResult =
    | { success: true; paymentId: number }
    | { success: false; error: string };
  
  export async function createReservationRequestPayment(
    prisma: PrismaClient,
    input: CreateReservationRequestPaymentInputType
  ): Promise<CreateReservationRequestPaymentResult> {
    try {
      // Validate input
      CreateReservationRequestPaymentInput.parse(input);
      console.log("input: ", JSON.stringify(input, null, 2));
  
      const payment = await prisma.reservationRequestPayment.create({
        data: {
          requestId: input.reservationRequestId,
          amount: input.amount,
          paymentInitiatedAt: new Date(),
          paymentProvider: input.paymentProvider,
          paymentStatus: PaymentStatus.INITIATED,
          paymentChannel: input.paymentChannel,
          transactionReference: input.transactionReference,
          paymentStatusUrl: input.paymentStatusUrl,
        },
      });
  
      return {
        success: true,
        paymentId: payment.id,
      };
    } catch (error) {
      if (error instanceof Error) {
        console.error("Error details:", {
          name: error.name,
          message: error.message,
          stack: error.stack,
          cause: (error as any).cause, // cause is not standard in Error, cast to any
        });
      } else {
        console.error("Unknown error:", error);
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        console.error("Prisma Error Code:", error.code);
        console.error("Prisma Error Meta:", error.meta);
      }

      return {
        success: false,
        error: error instanceof Error ? `${error.name}: ${error.message}` : "Failed to create payment",
      };
    }
  }
  
  const ReservationRequestIdSchema = z
    .union([z.string(), z.number()])
    .transform(val => String(val))
    .refine((val) => !isNaN(Number(val)), {
      message: "Invalid requestId, must be a number",
    })
    .transform((val) => Number(val));

  type GetReservationPaymentDetailResult =
    | { success: true; paymentDetail: any }
    | { success: false; error: string };


  export async function getReservationPaymentDetail(
    prisma: PrismaClient,
    reservationRequestId: number
  ): Promise<GetReservationPaymentDetailResult> {
    try {
      const parsedReservationRequestId = ReservationRequestIdSchema.parse(reservationRequestId);
      const payment = await prisma.reservationRequestPayment.findFirst({
        where: { requestId: parsedReservationRequestId },
        orderBy: { paymentInitiatedAt: 'desc' },
        include: {
          request: {
            include: {
              restaurant: true,
              customer: true,
            },
          },
        },
      });

      if (!payment) {
        return {
          success: false,
          error: 'No payment detail found for the given requestId',
        };
      }
      console.log("payment: with success ", payment);
      return {
        success: true,
        paymentDetail: payment,
      };
    } catch (error) {
      console.error("error: at get detail ", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get payment detail',
      };
    }
  }

  
  const PaymentNotificationStatusInput = z.object({
    id: z.number(),
    paymentStatus: z.nativeEnum(PaymentStatus),
    notifiedAt: z.date(),
    failureReason: z.string().optional(),
    nameOnCard: z.string().optional(),
    maskedCardNumber: z.string().optional(), 
    verifiedAt: z.date().optional(),
  });
  
  
  const PaymentVerificationStatusInput = z.object({
    id: z.number(),
    paymentStatus: z.nativeEnum(PaymentStatus),
    verifiedAt: z.date(),
    failureReason: z.string().optional(),
    nameOnCard: z.string().optional(),
    maskedCardNumber: z.string().optional(), 
  });
  
  
  // TypeScript type for the input
  type UpdatePaymentStatusInputType = z.infer<
    typeof PaymentNotificationStatusInput
  > | z.infer<typeof PaymentVerificationStatusInput>;
  
  // Return type
  type UpdateReservationPaymentStatusResult =
    | { success: true; payment: Prisma.ReservationRequestPaymentGetPayload<{}> }
    | { success: false; error: string };
  
  export async function updateReservationPaymentStatus(
    prisma: PrismaClient,
    input: UpdatePaymentStatusInputType
): Promise<UpdateReservationPaymentStatusResult> {
  try {
    // Validate input based on type
    if ('notifiedAt' in input) {
      PaymentNotificationStatusInput.parse(input);
    } else {
      PaymentVerificationStatusInput.parse(input);
    }

    // Construct base update data
    const updateData: Prisma.ReservationRequestPaymentUpdateInput = {
      paymentStatus: input.paymentStatus,
      failureReason: input.failureReason,
      updatedAt: new Date(),
    };

    // Set the appropriate timestamp based on update type
    if ('notifiedAt' in input) {
      updateData.notifiedAt = input.notifiedAt;
    } else {
      updateData.verifiedAt = input.verifiedAt;
    }

    // Add card details only if provided
    if (input.nameOnCard) {
      updateData.nameOnCard = input.nameOnCard;
    }
    if (input.maskedCardNumber) {
      updateData.maskedCardNumber = input.maskedCardNumber;
    }

    const payment = await prisma.reservationRequestPayment.update({
      where: { id: input.id },
      data: updateData,
    });

    return {
      success: true,
      payment,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update payment status",
    };
  }
}


