import { PrismaClient, Prisma, MealType } from "../../prisma/generated/prisma";
import { z } from "zod";
import { format } from 'date-fns';
import { formatReservationDateTime } from "../reservationDateTimeFormatter";

const GetReservationsQueryInput = z.object({
  date: z.date().optional(),
  searchQuery: z.string().optional(),
  page: z.number().default(1),
  pageSize: z.number().default(10),
  businessId: z.number(),
  restaurantId: z.number(),
  mealType: z.nativeEnum(MealType).optional(),
  dateRange: z.object({
    from: z.date(),
    to: z.date(),
  }).optional(),
  currentMealType: z.nativeEnum(MealType),
});

type GetReservationsQueryInputType = z.infer<typeof GetReservationsQueryInput>;

const getISTDate = () => {
  const now = new Date();
  // Start of day in local timezone
  now.setHours(0, 0, 0, 0);
  return now;
};

export async function getReservations(
  prisma: PrismaClient,
  input: GetReservationsQueryInputType
) {
  try {
    GetReservationsQueryInput.parse(input);
    
    const skip = (input.page - 1) * input.pageSize;
    const istDate = getISTDate();

    // Base where condition for all counts
    const baseWhere: Prisma.ReservationWhereInput = {
      restaurantId: input.restaurantId,
      restaurant: {
        businessId: input.businessId
      },
      status: {
        in: ['CONFIRMED', 'ACCEPTED', 'SEATED', 'COMPLETED', 'CANCELLED']
      },
      ...(input.dateRange ? {
        reservationDate: {
          gte: input.dateRange.from,
          lte: input.dateRange.to,
        },
      } : {
        reservationDate: {
          gte: input.date || istDate,
          lt: new Date((input.date || istDate).getTime() + 24 * 60 * 60 * 1000),
        },
      }),
      ...(input.mealType && {
        mealType: input.mealType as MealType,
      }),
      ...(input.searchQuery && {
        OR: [
          { id: { equals: parseInt(input.searchQuery) || undefined } },
          { reservationName: { contains: input.searchQuery, mode: 'insensitive' } },
        ],
      }),
    };

    const [reservations, displayTotal, statusCounts, totalRevenue] = await Promise.all([
      prisma.reservation.findMany({
        where: baseWhere,
        select: {
          id: true,
          reservationNumber: true,
          reservationName: true,
          contactPhone: true,
          reservationDate: true,
          reservationTime: true,
          mealType: true,
          reservationType: true,
          adultCount: true,
          childCount: true,
          totalAmount: true,
          createdBy: true,
          createdAt: true,
          status: true,
          specialRequests: true,
          customer: {
            select: {
              email: true
            }
          },
          restaurant: {
            select: {
              id: true,
              advancePaymentPercentage: true,
              name: true
            }
          },
          promoCodeUsage: {
            select: {
              originalAmount: true,
              discountAmount: true,
              promoCode: {
                select: {
                  code: true
                }
              }
            }
          },
          financialData: {
            select: {
              totalAfterDiscount: true,
              advancePayment: true,
              balanceDue: true,
              isPaid: true
            }
          }
        },
        skip,
        take: input.pageSize,
        orderBy: [
          { mealType: 'asc' },
          { reservationDate: 'desc' },
          { id: 'desc' },
        ],
      }),
      prisma.reservation.count({
        where: baseWhere
      }),
      prisma.reservation.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: {
          status: true
        }
      }),
      prisma.reservation.aggregate({
        where: baseWhere,
        _sum: {
          totalAmount: true
        }
      })
    ]);

    // Transform status counts into a more usable format
    const counts = {
      confirmedCount: 0,  // Will show as "Pending" in frontend
      acceptedCount: 0,
      seatedCount: 0,
      completedCount: 0,
      totalCount: displayTotal,
      totalRevenue: Number(totalRevenue._sum.totalAmount?.toString() || '0')
    };

    statusCounts.forEach(({ status, _count }) => {
      switch (status) {
        case 'CONFIRMED':
          counts.confirmedCount = _count.status;
          break;
        case 'ACCEPTED':
          counts.acceptedCount = _count.status;
          break;
        case 'SEATED':
          counts.seatedCount = _count.status;
          break;
        case 'COMPLETED':
          counts.completedCount = _count.status;
          break;
      }
    });

    // Fetch meal service data for platter information
    const mealServiceMap = new Map();
    const uniqueServiceKeys = Array.from(new Set(reservations.map(res => `${res.restaurant.id}-${res.mealType}`)));
    
    for (const serviceKey of uniqueServiceKeys) {
      const parts = serviceKey.split('-');
      const restaurantId = parts[0];
      const mealType = parts[1];
      
      if (!restaurantId || !mealType) continue;
      
      const mealService = await prisma.restaurantMealService.findFirst({
        where: {
          restaurantId: parseInt(restaurantId),
          mealType: mealType as MealType,
          isAvailable: true,
        },
        select: {
          id: true,
          platters: {
            select: {
              id: true,
              platterName: true,
              headCount: true,
            },
            where: {
              isActive: true,
            },
          },
        },
      });
      
      if (mealService) {
        mealServiceMap.set(serviceKey, {
          id: mealService.id,
          platters: mealService.platters,
        });
      }
    }

    const formattedReservations = reservations.map(reservation => {
      const serviceKey = `${reservation.restaurant.id}-${reservation.mealType}`;
      const mealServiceData = mealServiceMap.get(serviceKey) || null;

      // Determine if this is a platter-based reservation
      const isPlatterBasedReservation = (mealServiceData?.platters?.length ?? 0) > 0;
      const totalGuests = reservation.adultCount + reservation.childCount;
      const platterCount = isPlatterBasedReservation ? 
        Math.ceil(totalGuests / (mealServiceData?.platters?.[0]?.headCount || 1)) : undefined;
      const paxPerPlatter = isPlatterBasedReservation && mealServiceData?.platters?.[0]?.headCount ? 
        mealServiceData.platters[0].headCount : undefined;

      return {
        ...reservation,
        reservationDate: formatReservationDateTime(reservation.reservationDate, reservation.reservationTime, 'date'),
        // Add platter information
        isPlatterBasedReservation,
        platterCount,
        paxPerPlatter,
      };
    });

    return {
      success: true,
      reservations: formattedReservations,
      total: displayTotal,
      ...counts
    };
  } catch (error) {
    console.error('Error in getReservations:', error);
    throw error;
  }
}

export async function completeReservation(
  prisma: PrismaClient,
  reservationId: string
) {
  try {
    const reservation = await prisma.reservation.update({
      where: {
        id: parseInt(reservationId)
      },
      data: {
        status: 'COMPLETED',
        updatedAt: new Date()
      }
    });

    return {
      success: true
    };
  } catch (error) {
    console.error('Error completing reservation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to complete reservation'
    };
  }
}

export async function reviewReservation(
  prisma: PrismaClient,
  reservationId: string
) {
  try {
    await prisma.reservation.update({
      where: {
        id: parseInt(reservationId)
      },
      data: {
        status: 'REVIEWED',
        updatedAt: new Date()
      }
    });

    return {
      success: true
    };
  } catch (error) {
    console.error('Error reviewing reservation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to review reservation'
    };
  }
}

export async function acceptReservation(
  prisma: PrismaClient,
  reservationId: string
) {
  try {
    await prisma.reservation.update({
      where: {
        id: parseInt(reservationId)
      },
      data: {
        status: 'ACCEPTED',
        updatedAt: new Date()
      }
    });

    return {
      success: true
    };
  } catch (error) {
    console.error('Error accepting reservation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to accept reservation'
    };
  }
}

export async function seatReservation(
  prisma: PrismaClient,
  reservationId: string
) {
  try {
    await prisma.reservation.update({
      where: {
        id: parseInt(reservationId)
      },
      data: {
        status: 'SEATED',
        updatedAt: new Date()
      }
    });

    return {
      success: true
    };
  } catch (error) {
    console.error('Error seating reservation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to seat reservation'
    };
  }
}

export async function pendingReservation(
  prisma: PrismaClient,
  reservationId: string
) {
  try {
    await prisma.reservation.update({
      where: {
        id: parseInt(reservationId)
      },
      data: {
        status: 'CONFIRMED',
        updatedAt: new Date()
      }
    });

    return {
      success: true
    };
  } catch (error) {
    console.error('Error setting reservation to pending:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set reservation to pending'
    };
  }
}

export async function getRestaurantMealServices(
  prisma: PrismaClient,
  restaurantId: number
) {
  try {
    const mealServices = await prisma.restaurantMealService.findMany({
      where: {
        restaurantId,
        isAvailable: true,
      },
      select: {
        mealType: true,
        serviceStartTime: true,
        serviceEndTime: true,
      },
      orderBy: {
        serviceStartTime: 'asc',
      },
    });

    return {
      success: true,
      mealServices,
    };
  } catch (error) {
    console.error('Error fetching restaurant meal services:', error);
    throw error;
  }
} 


export async function getAvailableMealTypes(
  prisma: PrismaClient,
  restaurantId: number
) {
  try {
    const availableMealTypes = await prisma.restaurantMealService.findMany({
      where: {
        restaurantId,
        isAvailable: true,
      },
      select: {
        mealType: true,
      },
      distinct: ['mealType'],
      orderBy: {
        mealType: 'asc',
      },
    });

    return {
      success: true,
      mealTypes: availableMealTypes.map(service => service.mealType),
    };
  } catch (error) {
    console.error('Error fetching available meal types:', error);
    throw error;
  }
}

export async function getMealServices(
  prisma: PrismaClient,
  restaurantId: number
) {
  try {
    const mealServices = await prisma.restaurantMealService.findMany({
      where: {
        restaurantId,
        isAvailable: true,
      },
      select: {
        id: true,
        mealType: true,
        adultGrossPrice: true,
        childGrossPrice: true,
        adultNetPrice: true,
        childNetPrice: true,
        childAgeLimit: true,
        serviceChargePercentage: true,
        taxPercentage: true,
        serviceStartTime: true,
        serviceEndTime: true,
        isAvailable: true,
      },
      orderBy: {
        serviceStartTime: 'asc',
      },
    });

    return {
      success: true,
      mealServices,
    };
  } catch (error) {
    console.error('Error in getMealServices:', error);
    throw error;
  }
}