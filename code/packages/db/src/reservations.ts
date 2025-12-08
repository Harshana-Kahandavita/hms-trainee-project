import { CancellationReasonCategory, CancellationRequestedBy, PrismaClient } from "../prisma/generated/prisma";


export type ReservationStatus = 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

export interface ReservationData {
  id: number;
  reservationNumber: string;
  totalAmount: number;
  reservationDate: string;
  mealType: string;
  adultCount: number;
  childCount: number;
  restaurantId: number;
  customerId: number;
  reservationName: string;
  contactPhone: string;
  specialRequests: string | null;
  appliedPolicies?: Array<{
    id: number;
    policyId: number;
    wasAccepted: boolean;
    wasSkipped: boolean;
    policy: {
      id: number;
      name: string;
      title: string;
      isOptional: boolean;
    };
  }>;
}

export interface GetReservationByIdResult {
  success: boolean;
  data?: ReservationData;
  error?: string;
}

interface GetReservationsResult {
  success: boolean;
  reservations?: any[];
  error?: string;
}

export async function getReservationsByStatus(
  prisma: PrismaClient,
  customerId: number,
  status: ReservationStatus
): Promise<GetReservationsResult> {
  try {
    const reservations = await prisma.reservation.findMany({
      where: {
        customerId,
        status,
      },
      include: {
        restaurant: {
          select: {
            name: true,
            advancePaymentPercentage: true,
            thumbnailImage: {
              select: {
                imageUrl: true,
              },
            },
          },
        },
      },
      orderBy: {
        reservationDate: status === 'CONFIRMED' ? 'asc' : 'desc',
      },
    });

    console.log("Reservation details from reservations.ts", reservations);
    return {
      success: true,
      reservations: reservations.map(reservation => ({
        id: reservation.id,
        reservationNumber: reservation.reservationNumber,
        hotelName: reservation.restaurant.name,
        imageUrl: reservation.restaurant.thumbnailImage?.imageUrl,
        reservationDate: reservation.reservationDate,
        reservationTime: reservation.reservationTime,
        mealType: reservation.mealType,
        adultCount: reservation.adultCount,
        childCount: reservation.childCount,
        totalPayment: Number(reservation.totalAmount),
        advancePayment: (Number(reservation.totalAmount) * reservation.restaurant.advancePaymentPercentage) / 100,
        status: reservation.status,
      })),
    };
  } catch (error) {
    console.error('Error fetching reservations by status', {
      customerId,
      status,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      success: false,
      error: 'Failed to fetch reservations',
    };
  }
}

interface CancellationResult {
  success: boolean;
  error?: string;
  reservationDetails?: {
    restaurantId: number;
    customerName: string;
    customerEmail: string | null;
    customerContactNumber: string;
    restaurantContactNumber: string;
    restaurantName: string;
    reservationNumber: string;
    reservationDate: string;
    mealType: string;
    numberOfGuests: string;
    totalAmount: string;
    advancePaidAmount: string;
    remainingAmount: string;
    status: string;
    statusCode: string;
    statusDescription: string;
  };
}

export async function cancelReservation(
  prisma: PrismaClient,
  params: {
    reservationId: number;
    reason: string;
    requestedBy: CancellationRequestedBy;
    reasonCategory: CancellationReasonCategory;
  }
): Promise<CancellationResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findFirst({
        where: { id: params.reservationId, status: 'CONFIRMED' },
        include: {
          restaurant: {
            select: {
              id: true,
              name: true,
              phone: true,
              advancePaymentPercentage: true
            }
          },
          customer: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phone: true
            }
          }
        }
      });

      if (!reservation) {
        return {
          success: false,
          error: 'Reservation not found or cannot be cancelled'
        };
      }

      // 2. Create cancellation request
      const cancellationRequest = await tx.cancellationRequest.create({
        data: {
          reservationId: reservation.id,
          restaurantId: reservation.restaurant.id,
          requestedBy: params.requestedBy,
          requestedById: reservation.customerId, // Use the customerId from the reservation
          status: 'APPROVED_PENDING_REFUND',
          reason: params.reason,
          reasonCategory: params.reasonCategory,
          refundAmount: Number(reservation.totalAmount) * (reservation.restaurant.advancePaymentPercentage / 100),
          refundPercentage: reservation.restaurant.advancePaymentPercentage,
          processedAt: new Date(),
          processedBy: 'SYSTEM'
        }
      });

      // 3. Update reservation status
      await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: 'CANCELLED' }
      });

      // 4. Create refund transaction
      await tx.refundTransaction.create({
        data: {
          reservationId: reservation.id,
          restaurantId: reservation.restaurant.id,
          cancellationId: cancellationRequest.id,
          amount: Number(reservation.totalAmount) * (reservation.restaurant.advancePaymentPercentage / 100),
          reason: 'RESERVATION_CANCELLATION',
          status: 'COMPLETED',
          processedAt: new Date(),
          processedBy: 'SYSTEM',
          transactionReference: `REF-${Date.now()}-${reservation.id}`
        }
      });

      return {
        success: true,
        reservationDetails: {
          restaurantId: reservation.restaurant.id,
          customerName: `${reservation.customer.firstName} ${reservation.customer.lastName}`,
          customerEmail: reservation.customer.email,
          customerContactNumber: reservation.customer.phone,
          restaurantContactNumber: reservation.restaurant.phone,
          restaurantName: reservation.restaurant.name,
          reservationNumber: reservation.reservationNumber,
          reservationDate: reservation.reservationDate?.toISOString().split('T')[0] ?? 'N/A',
          mealType: reservation.mealType,
          numberOfGuests: `${reservation.adultCount + reservation.childCount}`,
          totalAmount: reservation.totalAmount.toString(),
          advancePaidAmount: (Number(reservation.totalAmount) * reservation.restaurant.advancePaymentPercentage / 100).toString(),
          remainingAmount: '0',
          status: 'CANCELLED',
          statusCode: 'CANCELLED',
          statusDescription: 'Reservation has been cancelled'
        }
      };
    });
  } catch (error) {
    console.error('Error canceling reservation', {
      reservationId: params.reservationId,
      reason: params.reason,
      requestedBy: params.requestedBy,
      reasonCategory: params.reasonCategory,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      success: false,
      error: 'Failed to cancel reservation'
    };
  }
}

/**
 * Get a single reservation by ID for guest-web operations
 * Includes basic reservation details and applied policies
 */
export async function getReservationById(
  prisma: PrismaClient,
  reservationId: number
): Promise<GetReservationByIdResult> {
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: {
        id: true,
        reservationNumber: true,
        totalAmount: true,
        reservationDate: true,
        mealType: true,
        adultCount: true,
        childCount: true,
        restaurantId: true,
        customerId: true,
        reservationName: true,
        contactPhone: true,
        specialRequests: true,
        appliedPolicies: {
          select: {
            id: true,
            policyId: true,
            wasAccepted: true,
            wasSkipped: true,
            policy: {
              select: {
                id: true,
                name: true,
                title: true,
                isOptional: true
              }
            }
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

    return {
      success: true,
      data: {
        ...reservation,
        totalAmount: Number(reservation.totalAmount),
        reservationDate: reservation.reservationDate?.toISOString().split('T')[0] || ''
      }
    };
  } catch (error) {
    console.error('Failed to get reservation by ID', {
      reservationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve reservation'
    };
  }
} 