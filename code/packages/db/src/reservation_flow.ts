import {
  PrismaClient,
  MealType,
  ReservationRequestStatus,
  Prisma,
  PaymentStatus,
  RequestCreatorType,
} from "../prisma/generated/prisma";
import { z, ZodError } from "zod";

// Helper function to generate reservation number
function generateReservationNumber(mealType: MealType, reservationDate: Date, requestId: number): string {
  // Get first letter of meal type
  const mealTypePrefix = mealType.charAt(0).toUpperCase();

  // Format date to MMDD
  const month = String(reservationDate.getMonth() + 1).padStart(2, '0');
  const day = String(reservationDate.getDate()).padStart(2, '0');
  const dateString = `${month}${day}`;

  // Format requestId to ensure 4 digits
  const requestIdString = String(requestId).padStart(4, '0').slice(-4);

  // Combine all parts with the specified format
  return `${mealTypePrefix}${dateString}-${requestIdString}`;
}

// Input validation schema
const CreateReservationRequestInput = z.object({
  restaurantId: z.number(),
  customerId: z.number(),
  requestName: z.string(),
  contactPhone: z.string(),
  requestedDate: z.date(),
  requestedTime: z.date(),
  adultCount: z.number().min(1),
  childCount: z.number().default(0),
  mealType: z.nativeEnum(MealType),
  specialRequests: z.string().optional(),
  dietaryRequirements: z.string().optional(),
  occasion: z.string().optional(),
});

// TypeScript type for the input
type CreateReservationRequestInputType = z.infer<
  typeof CreateReservationRequestInput
>;

// Return type
type CreateReservationRequestResult =
  | { success: true; requestId: number; status: ReservationRequestStatus }
  | { success: false; error: string; status: ReservationRequestStatus };

export async function createReservationRequest(
  prisma: PrismaClient,
  input: CreateReservationRequestInputType
): Promise<CreateReservationRequestResult> {
  try {
    // Validate input
    CreateReservationRequestInput.parse(input);

    // 1. Create initial reservation request
    const request = await prisma.reservationRequest.create({
      data: {
        restaurantId: input.restaurantId,
        customerId: input.customerId,
        requestName: input.requestName,
        contactPhone: input.contactPhone,
        requestedDate: input.requestedDate,
        requestedTime: input.requestedTime,
        adultCount: input.adultCount,
        childCount: input.childCount,
        mealType: input.mealType,
        status: ReservationRequestStatus.PENDING,
        specialRequests: input.specialRequests,
        dietaryRequirements: input.dietaryRequirements,
        occasion: input.occasion,
        estimatedTotalAmount: 0,
        estimatedServiceCharge: 0,
        estimatedTaxAmount: 0,
        createdBy: RequestCreatorType.CUSTOMER,
      },
    });

    console.log("===>> request created", request);

    // 2. Get the restaurant meal service for the requested date and time
    const mealService = await prisma.restaurantMealService.findFirst({
      where: {
        restaurantId: input.restaurantId,
        mealType: input.mealType,
        serviceStartTime: {
          lte: input.requestedTime,
        },
        serviceEndTime: {
          gte: input.requestedTime,
        },
        isAvailable: true,
      },
    });

    console.log("Found mealService", mealService);

    if (!mealService) {
      await updateRequestStatus(
        prisma,
        request.id,
        ReservationRequestStatus.MEAL_SERVICE_NOT_AVAILABLE,
        "No meal service available for the requested time"
      );
      return {
        success: false,
        error: "No meal service available for the requested time",
        status: ReservationRequestStatus.MEAL_SERVICE_NOT_AVAILABLE,
      };
    }

    // Add this new check for restaurant capacity
    const capacityEntry = await prisma.restaurantCapacity.findFirst({
      where: {
        restaurantId: input.restaurantId,
        serviceId: mealService.id,
        date: input.requestedDate,
        isEnabled: true, 
      },
    });

    if (!capacityEntry) {
      await updateRequestStatus(
        prisma,
        request.id,
        ReservationRequestStatus.MEAL_SERVICE_NOT_AVAILABLE, //TODO: This even be NOT_ENOUGH_SEATS?
        "No capacity configured for the requested date"
      );
      return {
        success: false,
        error: "No meal service available for the requested time",
        status: ReservationRequestStatus.MEAL_SERVICE_NOT_AVAILABLE,
      };
    }

    try {
      return await reserveSeats(prisma, input, request, mealService.id);
    } catch (txError) {
      console.log("Error reserving seats", txError);
      // Update request status on transaction failure
      await prisma.reservationRequest.update({
        where: { id: request.id },
        data: {
          status: ReservationRequestStatus.ERROR,
          rejectionReason:
            txError instanceof Error ? txError.message : "Transaction failed",
          processingCompletedAt: new Date(),
          statusHistory: {
            create: {
              previousStatus: ReservationRequestStatus.PENDING,
              newStatus: ReservationRequestStatus.ERROR,
              changeReason:
                txError instanceof Error
                  ? txError.message
                  : "Transaction failed",
              statusChangedAt: new Date(),
              changedBy: "SYSTEM",
            },
          },
        },
      });

      return {
        success: false,
        error:
          txError instanceof Error ? txError.message : "Transaction failed",
        status: ReservationRequestStatus.ERROR,
      };
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof ZodError
          ? error.errors
              .map((e) => `${e.path.join(".")}: ${e.message}`)
              .join(", ")
          : error instanceof Error
            ? error.message
            : "Unknown error occurred",
      status: ReservationRequestStatus.ERROR,
    };
  }
}

async function reserveSeats(
  prisma: PrismaClient,
  input: CreateReservationRequestInputType,
  request: Prisma.ReservationRequestGetPayload<{}>,
  mealServiceId: number
): Promise<CreateReservationRequestResult> {
  return await prisma.$transaction(
    async (tx) => {
      // 3. Try to update capacity with atomic operation
      const totalPartySize = input.adultCount + input.childCount;
      const updatedCapacity = await tx.$executeRaw(Prisma.sql`
        UPDATE restaurant_capacity 
        SET booked_seats = booked_seats + ${totalPartySize}
        WHERE restaurant_id = ${input.restaurantId}
          AND service_id = ${mealServiceId}
          AND date = ${input.requestedDate}
          AND total_seats >= booked_seats + ${totalPartySize}
      `);

      // Check if any rows were updated (updatedCapacity will be the number of affected rows)
      if (updatedCapacity === 0) {
        await updateRequestStatus(
          tx,
          request.id,
          ReservationRequestStatus.SLOTS_NOT_AVAILABLE,
          "Not enough seats available"
        );
        return {
          success: false,
          error: "Not enough seats available",
          status: ReservationRequestStatus.SLOTS_NOT_AVAILABLE,
        };
      }

      // 4. Update request status to processing
      await updateRequestStatus(
        tx,
        request.id,
        ReservationRequestStatus.PROCESSING
      );

      return {
        success: true,
        requestId: request.id,
        status: ReservationRequestStatus.PROCESSING,
      };
    },
    {
      timeout: 10000,
    }
  );
}

async function updateRequestStatus(
  tx: Omit<
    PrismaClient,
    "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
  >,
  requestId: number,
  status: ReservationRequestStatus,
  rejectionReason?: string
) {
  await tx.reservationRequest.update({
    where: {
      id: requestId,
    },
    data: {
      status,
      rejectionReason,
      processingStartedAt:
        status === ReservationRequestStatus.PROCESSING ? new Date() : undefined,
      processingCompletedAt:
        status === ReservationRequestStatus.SLOTS_NOT_AVAILABLE
          ? new Date()
          : undefined,
      statusHistory: {
        create: {
          previousStatus: ReservationRequestStatus.PENDING,
          newStatus: status,
          changeReason: rejectionReason || "Automatic status update",
          statusChangedAt: new Date(),
          changedBy: "SYSTEM",
        },
      },
    },
  });
}

// Input type for completing reservation
type CompleteReservationInputType = {
  requestId: number;
  paymentId: number;
};

// Return type for completing reservation
type CompleteReservationResult =
  | { success: true; reservationId: number }
  | { success: false; error: string };

// Function to complete reservation
export async function completeReservation(
  prisma: PrismaClient,
  input: CompleteReservationInputType
): Promise<CompleteReservationResult> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        // 1. Get the request payment and reservation request (outside transaction)
        const [requestPayment, reservationRequest] = await Promise.all([
          tx.reservationRequestPayment.findUnique({
            where: {
              id: input.paymentId,
              paymentStatus: PaymentStatus.COMPLETED,
            },
          }),
          tx.reservationRequest.findUnique({
            where: {
              id: input.requestId,
              status: ReservationRequestStatus.PROCESSING,
            },
          }),
        ]);

        if (!requestPayment) {
          throw new Error("Completed payment not found");
        }

        if (!reservationRequest) {
          throw new Error("Processing reservation request not found");
        }

        // Generate reservation number
        const reservationNumber = generateReservationNumber(
          reservationRequest.mealType,
          reservationRequest.requestedDate,
          reservationRequest.id
        );

        // 3. Create new reservation entry
        const reservation = await tx.reservation.create({
          data: {
            reservationNumber,
            restaurantId: reservationRequest.restaurantId,
            customerId: reservationRequest.customerId,
            requestId: reservationRequest.id,
            reservationName: reservationRequest.requestName,
            contactPhone: reservationRequest.contactPhone,
            reservationDate: reservationRequest.requestedDate,
            reservationTime: reservationRequest.requestedTime,
            adultCount: reservationRequest.adultCount,
            childCount: reservationRequest.childCount,
            mealType: reservationRequest.mealType,
            totalAmount: requestPayment.amount,
            serviceCharge: reservationRequest.estimatedServiceCharge,
            taxAmount: reservationRequest.estimatedTaxAmount,
            status: "CONFIRMED",
            specialRequests: reservationRequest.specialRequests,
            dietaryRequirements: reservationRequest.dietaryRequirements,
            occasion: reservationRequest.occasion,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: RequestCreatorType.SYSTEM,
          },
        });

        // 2. Create reservation payment
        const reservationPayment = await tx.reservationPayment.create({
          data: {
            reservationId: reservation.id,
            amount: requestPayment.amount,
            paymentDate: new Date(),
            paymentStatus: requestPayment.paymentStatus,
            paymentChannel: requestPayment.paymentChannel,
            transactionReference: requestPayment.transactionReference,
            paymentNotes: `Created from request payment ${requestPayment.id}`,
            processedBy: "SYSTEM",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

        

        // 4. Update reservation payment with reservation ID
        await tx.reservationPayment.update({
          where: { id: reservationPayment.id },
          data: {
            reservationId: reservation.id,
          },
        });

        // 5. Update ReservationRequest to COMPLETED and add status history
        await tx.reservationRequest.update({
          where: { id: input.requestId },
          data: {
            status: ReservationRequestStatus.COMPLETED,
            processingCompletedAt: new Date(),
            statusHistory: {
              create: {
                previousStatus: reservationRequest.status,
                newStatus: ReservationRequestStatus.COMPLETED,
                changeReason: "Payment successful and reservation created",
                statusChangedAt: new Date(),
                changedBy: "SYSTEM", // Note: This field is still String in the schema
              },
            },
          },
        });

        return { success: true, reservationId: reservation.id };
      },
      {
        timeout: 10000, // 10 second timeout
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable, // Highest isolation level
      }
    );
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to complete reservation",
    };
  }
}

// Input type for handling reservation failure
type HandleReservationFailureInput = {
  requestId: number;
  failureType: 'TIMEOUT' | 'PAYMENT_FAILED';
  failureReason: string;
};

// Return type for handling reservation failure
type HandleReservationFailureResult = {
  success: boolean;
  error?: string;
  status: ReservationRequestStatus;
};

export async function handleReservationFailure(
  prisma: PrismaClient,
  input: HandleReservationFailureInput
): Promise<HandleReservationFailureResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      // 1. Get the reservation request with its current status
      const request = await tx.reservationRequest.findUnique({
        where: { id: input.requestId },
        include: {
          reservation: true,
        },
      });

      if (!request) {
        throw new Error('Reservation request not found');
      }

      if (request.status !== ReservationRequestStatus.PROCESSING) {
        throw new Error(`Invalid request status: ${request.status}`);
      }

      // 2. Get the meal service for the requested date and time
      const mealService = await tx.restaurantMealService.findFirst({
        where: {
          restaurantId: request.restaurantId,
          mealType: request.mealType,
          serviceStartTime: {
            lte: request.requestedTime,
          },
          serviceEndTime: {
            gte: request.requestedTime,
          },
        },
      });

      if (!mealService) {
        throw new Error('Meal service not found');
      }

      // 3. Release the seats back to capacity
      const totalPartySize = request.adultCount + request.childCount;
      const updatedCapacity = await tx.$executeRaw(Prisma.sql`
        UPDATE restaurant_capacity 
        SET booked_seats = booked_seats - ${totalPartySize}
        WHERE restaurant_id = ${request.restaurantId}
          AND service_id = ${mealService.id}
          AND date = ${request.requestedDate}
          AND booked_seats >= ${totalPartySize}
      `);

      if (updatedCapacity === 0) {
        throw new Error('Failed to release seats');
      }

      // 4. Update the request status based on failure type
      const newStatus = input.failureType === 'TIMEOUT' 
        ? ReservationRequestStatus.TIMEOUT 
        : ReservationRequestStatus.PAYMENT_FAILED;

      await tx.reservationRequest.update({
        where: { id: input.requestId },
        data: {
          status: newStatus,
          rejectionReason: input.failureReason,
          processingCompletedAt: new Date(),
        },
      });

      return {
        success: true,
        status: newStatus,
      };
    }, {
      timeout: 10000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      status: ReservationRequestStatus.ERROR,
    };
  }
}

// Input validation schema for initial reservation request
const CreateInitialReservationRequestInput = z.object({
  restaurantId: z.number(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string(),
  email: z.string(),
  date: z.string(),
  mealType: z.nativeEnum(MealType),
  adults: z.number().min(1),
  children: z.number().min(0).default(0),
  estimatedTotalAmount: z.number(),
  estimatedServiceCharge: z.number(),
  estimatedTaxAmount: z.number(),
  createdBy: z.nativeEnum(RequestCreatorType),
  specialRequests: z.string().optional(),
  dietaryRequirements: z.string().optional(),
  occasion: z.string().optional(),
  requiresAdvancePayment: z.boolean().default(true)
});

type CreateInitialReservationRequestInputType = z.infer<typeof CreateInitialReservationRequestInput>;

type CreateInitialReservationRequestResult = {
  success: true;
  requestId: number;
  customerId: number;
} | {
  success: false;
  error: string;
};

export async function createInitialReservationRequest(
  prisma: PrismaClient,
  input: CreateInitialReservationRequestInputType
): Promise<CreateInitialReservationRequestResult> {
  try {
    // Validate input
    CreateInitialReservationRequestInput.parse(input);

    // Create or find customer
    const customer = await prisma.customer.upsert({
      where: { phone: input.phone },
      update: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email
      },
      create: {
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        email: input.email
      }
    });

    // Create reservation request
    const request = await prisma.reservationRequest.create({
      data: {
        restaurantId: input.restaurantId,
        customerId: customer.id,
        requestName: `${input.firstName}${input.lastName ? ' ' + input.lastName : ''}`,
        contactPhone: input.phone,
        requestedDate: new Date(input.date),
        requestedTime: new Date(input.date), // Using same date for time as it's not provided
        adultCount: input.adults,
        childCount: input.children,
        mealType: input.mealType,
        status: ReservationRequestStatus.PENDING,
        specialRequests: input.specialRequests,
        dietaryRequirements: input.dietaryRequirements,
        occasion: input.occasion,
        estimatedTotalAmount: input.estimatedTotalAmount,
        estimatedServiceCharge: input.estimatedServiceCharge,
        estimatedTaxAmount: input.estimatedTaxAmount,
        createdBy: input.createdBy,
        requiresAdvancePayment: input.requiresAdvancePayment
      }
    });

    return {
      success: true,
      requestId: request.id,
      customerId: customer.id
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create reservation request'
    };
  }
}



