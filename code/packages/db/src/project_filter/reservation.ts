import { PrismaClient } from '../../prisma/generated/prisma';

export interface ReservationInfo {
  id: number;
  reservationNumber: string;
  restaurantId: number;
  customerId: number;
  requestId: number;
  reservationName: string;
  contactPhone: string;
  reservationDate: Date;
  reservationTime: Date;
  adultCount: number;
  childCount: number;
  mealType: string;
  totalAmount: number;
  serviceCharge: number;
  taxAmount: number;
  advancePaymentAmount: number | null;
  remainingPaymentAmount: number | null;
  status: string;
  specialRequests: string | null;
  dietaryRequirements: string | null;
  occasion: string | null;
  reservationType: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  customer?: {
    id: number;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string;
  };
  restaurant?: {
    id: number;
    name: string;
    address: string;
  };
}

export type GetReservationsByRestaurantIdResult =
  | { success: true; reservations: ReservationInfo[]; totalCount: number }
  | { success: false; error: string };

/**
 * Fetch reservations by restaurant ID
 * @param prisma - Prisma client instance
 * @param restaurantId - Restaurant ID to filter reservations
 * @param includeRelations - Whether to include related data (customer, restaurant)
 * @param options - Optional filters (status, date range, etc.)
 * @returns Reservations filtered by restaurant ID
 */
export async function getReservationsByRestaurantId(
  prisma: PrismaClient,
  restaurantId: number,
  includeRelations: boolean = false,
  options?: {
    status?: string;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
    offset?: number;
  }
): Promise<GetReservationsByRestaurantIdResult> {
  try {
    const where: any = {
      restaurantId: restaurantId,
    };

    // Apply optional filters
    if (options?.status) {
      where.status = options.status;
    }

    if (options?.fromDate || options?.toDate) {
      where.reservationDate = {};
      if (options.fromDate) {
        where.reservationDate.gte = options.fromDate;
      }
      if (options.toDate) {
        where.reservationDate.lte = options.toDate;
      }
    }

    const [reservations, totalCount] = await Promise.all([
      prisma.reservation.findMany({
        where,
        select: {
          id: true,
          reservationNumber: true,
          restaurantId: true,
          customerId: true,
          requestId: true,
          reservationName: true,
          contactPhone: true,
          reservationDate: true,
          reservationTime: true,
          adultCount: true,
          childCount: true,
          mealType: true,
          totalAmount: true,
          serviceCharge: true,
          taxAmount: true,
          advancePaymentAmount: true,
          remainingPaymentAmount: true,
          status: true,
          specialRequests: true,
          dietaryRequirements: true,
          occasion: true,
          reservationType: true,
          createdAt: true,
          updatedAt: true,
          createdBy: true,
          ...(includeRelations && {
            customer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
            restaurant: {
              select: {
                id: true,
                name: true,
                address: true,
              },
            },
          }),
        },
        orderBy: {
          reservationDate: 'desc',
        },
        ...(options?.limit && { take: options.limit }),
        ...(options?.offset && { skip: options.offset }),
      }),
      prisma.reservation.count({ where }),
    ]);

    // Convert Prisma Decimal types to numbers
    const mappedReservations: ReservationInfo[] = reservations.map((reservation) => ({
      ...reservation,
      totalAmount: Number(reservation.totalAmount),
      serviceCharge: Number(reservation.serviceCharge),
      taxAmount: Number(reservation.taxAmount),
      advancePaymentAmount: reservation.advancePaymentAmount
        ? Number(reservation.advancePaymentAmount)
        : null,
      remainingPaymentAmount: reservation.remainingPaymentAmount
        ? Number(reservation.remainingPaymentAmount)
        : null,
    }));

    return {
      success: true,
      reservations: mappedReservations,
      totalCount,
    };
  } catch (error) {
    console.error('Error fetching reservations by restaurant ID:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch reservations',
    };
  }
}

