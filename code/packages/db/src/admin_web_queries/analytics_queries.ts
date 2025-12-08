import { PrismaClient, MealType } from "../../prisma/generated/prisma";
import { z } from "zod";

const ListAnalyticsOrdersInput = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(10),
  searchQuery: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

type ListAnalyticsOrdersInputType = z.infer<typeof ListAnalyticsOrdersInput>;

export type AnalyticsOrderRow = {
  orderId: string;
  paymentDate: string;
  reservationDate: string;
  merchantName: string;
  buffetType: string;
  adultCount: number;
  childCount: number;
  grandTotal: string;
  discount: string;
  totalIncome: string;
};

export type ListAnalyticsOrdersResult =
  | { success: true; data: AnalyticsOrderRow[]; total: number; page: number; totalPages: number }
  | { success: false; error: string };

export async function getMerchantNames(prisma: PrismaClient): Promise<string[]> {
  try {
    const businesses = await prisma.business.findMany({
      select: {
        name: true
      },
      orderBy: {
        name: 'asc'
      }
    });
    return businesses.map(business => business.name);
  } catch (error) {
    console.error("Error in getMerchantNames:", error);
    return [];
  }
}

export async function listAnalyticsOrders(
  prisma: PrismaClient,
  input: ListAnalyticsOrdersInputType
): Promise<ListAnalyticsOrdersResult> {
  try {
    const validated = ListAnalyticsOrdersInput.parse(input);
    const skip = (validated.page - 1) * validated.limit;

    // Build where clause
    const whereClause: any = {
      status: {
        in: ['CONFIRMED', 'COMPLETED', 'PENDING']
      }
    };

    // Search filter
    if (validated.searchQuery) {
      // Check if the search query matches any meal type
      const mealTypes = Object.values(MealType);
      const isMealType = mealTypes.includes(validated.searchQuery as MealType);

      if (isMealType) {
        whereClause.mealType = validated.searchQuery;
      } else {
        // If not a meal type, treat it as a merchant name
        whereClause.restaurant = {
          business: {
            name: {
              equals: validated.searchQuery,
              mode: 'insensitive'
            }
          }
        };
      }
    }

    // Date filter
    if (validated.fromDate || validated.toDate) {
      whereClause.reservationDate = {};
      if (validated.fromDate) {
        const fromDate = new Date(validated.fromDate);
        fromDate.setHours(0, 0, 0, 0);
        whereClause.reservationDate.gte = fromDate;
      }
      if (validated.toDate) {
        const toDate = new Date(validated.toDate);
        toDate.setHours(23, 59, 59, 999);
        whereClause.reservationDate.lte = toDate;
      }
    }

    const [total, data] = await Promise.all([
      prisma.reservation.count({ where: whereClause }),
      prisma.reservation.findMany({
        skip,
        take: validated.limit,
        where: whereClause,
        select: {
          reservationNumber: true,
          reservationDate: true,
          mealType: true,
          adultCount: true,
          childCount: true,
          totalAmount: true,
          discountAmount: true,
          status: true,
          payments: {
            select: {
              paymentDate: true,
              amount: true,
              paymentStatus: true
            },
            orderBy: {
              paymentDate: 'desc'
            },
            take: 1
          },
          restaurant: {
            select: {
              business: {
                select: {
                  name: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    const result: AnalyticsOrderRow[] = data.map(row => {
      const latestPayment = row.payments[0];
      return {
        orderId: row.reservationNumber,
        paymentDate: latestPayment?.paymentDate ? new Date(latestPayment.paymentDate).toLocaleDateString() : "-",
        reservationDate: row.reservationDate ? new Date(row.reservationDate).toLocaleDateString() : "-",
        merchantName: row.restaurant.business.name,
        buffetType: row.mealType,
        adultCount: row.adultCount,
        childCount: row.childCount,
        grandTotal: `Rs. ${Number(row.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        discount: row.discountAmount ? `Rs. ${Number(row.discountAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "Rs. 0.00",
        totalIncome: `Rs. ${(Number(row.totalAmount) - Number(row.discountAmount || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
      };
    });

    return {
      success: true,
      data: result,
      total,
      page: validated.page,
      totalPages: Math.ceil(total / validated.limit)
    };
  } catch (error) {
    console.error("Error in listAnalyticsOrders:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to fetch analytics orders" };
  }
}

export type AnalyticsSalesSummary = {
  totalOrders: number;
  totalPax: number;
  totalRevenue: number;
  totalCommission: number;
};

export async function getAnalyticsSalesSummary(
  prisma: PrismaClient,
  { fromDate, toDate, searchQuery }: { fromDate?: string; toDate?: string; searchQuery?: string }
): Promise<AnalyticsSalesSummary> {
  // Build where clause
  const whereClause: any = {
    status: {
      in: ['CONFIRMED', 'COMPLETED', 'PENDING']
    }
  };

  // Search filter
  if (searchQuery) {
    // Check if the search query matches any meal type
    const mealTypes = Object.values(MealType);
    const isMealType = mealTypes.includes(searchQuery as MealType);

    if (isMealType) {
      whereClause.mealType = searchQuery;
    } else {
      // If not a meal type, treat it as a merchant name
      whereClause.restaurant = {
        business: {
          name: {
            equals: searchQuery,
            mode: 'insensitive'
          }
        }
      };
    }
  }

  // Date filter
  if (fromDate || toDate) {
    whereClause.reservationDate = {};
    if (fromDate) {
      const fromDateObj = new Date(fromDate);
      fromDateObj.setHours(0, 0, 0, 0);
      whereClause.reservationDate.gte = fromDateObj;
    }
    if (toDate) {
      const toDateObj = new Date(toDate);
      toDateObj.setHours(23, 59, 59, 999);
      whereClause.reservationDate.lte = toDateObj;
    }
  }

  // Fetch all matching reservations
  const reservations = await prisma.reservation.findMany({
    where: whereClause,
    select: {
      adultCount: true,
      childCount: true,
      totalAmount: true,
      discountAmount: true,
      payments: {
        select: {
          amount: true,
          paymentStatus: true
        }
      }
    }
  });

  // Calculate summary
  const totalOrders = reservations.length;
  const totalPax = reservations.reduce((sum, r) => sum + r.adultCount + r.childCount, 0);
  const totalRevenue = reservations.reduce((sum, r) => {
    const netAmount = Number(r.totalAmount) - Number(r.discountAmount || 0);
    return sum + netAmount;
  }, 0);
  const totalCommission = reservations.reduce((sum, r) => {
    // Example: 10% commission rate (replace with your logic or env/config)
    const commissionRate = 0.10;
    const net = Number(r.totalAmount) - Number(r.discountAmount || 0);
    return sum + net * commissionRate;
  }, 0);

  return {
    totalOrders,
    totalPax,
    totalRevenue,
    totalCommission,
  };
} 