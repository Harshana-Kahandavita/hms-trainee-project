import { PrismaClient } from "../../prisma/generated/prisma";
import { z } from "zod"

// Input validation schema
const ListFinanceDataInput = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(10),
  searchQuery: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
})

type ListFinanceDataInputType = z.infer<typeof ListFinanceDataInput>

export interface FinanceTableRow {
  reservationNumber: string
  paymentDate: Date | null
  businessId: number
  businessName: string
  restaurantId: number
  restaurantName: string
  taxPercentage: number
  serviceChargePercentage: number
  totalAmount: number
  discountAmount: number | null
  advancePaymentPercentage: number
  adultCount: number
  childCount: number
  adultGrossPrice: number
  childGrossPrice: number
  adultNetPrice: number
  childNetPrice: number
  serviceCharge: number
  taxAmount: number
  promoCodeId: number | null
  hasPromoCodeUsage: boolean
  // Financial data fields
  netBuffetPrice: number
  totalBeforeDiscount: number
  totalAfterDiscount: number
  advancePayment: number
  balanceDue: number
  isPaid: boolean
  // Additional fields for payouts
  merchantInitiatedDiscount: number | null
  platformInitiatedDiscount: number | null
  promoCodeType: string | null
  discount?: number
}

export type ListFinanceDataResult = 
  | { 
      success: true
      data: FinanceTableRow[]
      totalCount: number
      page: number
      totalPages: number
    }
  | { 
      success: false
      error: string 
    }

export async function listFinanceData(
  prisma: PrismaClient,
  input: ListFinanceDataInputType
): Promise<ListFinanceDataResult> {
  try {
    const validatedInput = ListFinanceDataInput.parse(input)
    const skip = (validatedInput.page - 1) * validatedInput.limit

    // Build the where clause
    const whereClause: any = {
      status: {
        in: ['CONFIRMED', 'PENDING', 'ACCEPTED', 'SEATED', 'COMPLETED']
      },
      payments: {
        some: {
          paymentStatus: 'COMPLETED'
        }
      }
    }

    // Add date range filter if provided
    if (validatedInput.fromDate || validatedInput.toDate) {
      if (!whereClause.payments) {
        whereClause.payments = { some: {} };
      }
      
      if (validatedInput.fromDate) {
        whereClause.payments.some.paymentDate = whereClause.payments.some.paymentDate || {};
        whereClause.payments.some.paymentDate.gte = new Date(validatedInput.fromDate);
      }
      
      if (validatedInput.toDate) {
        // Set the end of the day for the toDate
        const toDate = new Date(validatedInput.toDate);
        toDate.setHours(23, 59, 59, 999);
        whereClause.payments.some.paymentDate = whereClause.payments.some.paymentDate || {};
        whereClause.payments.some.paymentDate.lte = toDate;
      }
    }

    // Add search query filter if provided
    if (validatedInput.searchQuery) {
      whereClause.OR = [
        {
          restaurant: {
            name: {
              contains: validatedInput.searchQuery,
              mode: 'insensitive'
            }
          }
        },
        {
          reservationNumber: {
            contains: validatedInput.searchQuery,
            mode: 'insensitive'
          }
        }
      ]
    }

    const [totalCount, data] = await Promise.all([
      prisma.reservation.count({
        where: whereClause
      }),
      prisma.reservation.findMany({
        skip,
        take: validatedInput.limit,
        where: whereClause,
        select: {
          reservationNumber: true,
          adultCount: true,
          childCount: true,
          totalAmount: true,
          serviceCharge: true,
          taxAmount: true,
          discountAmount: true,
          promoCodeId: true,
          payments: {
            select: {
              paymentDate: true,
            },
            take: 1,
          },
          promoCodeUsage: {
            select: {
              id: true,
            },
            take: 1,
          },
          financialData: {
            select: {
              netBuffetPrice: true,
              totalBeforeDiscount: true,
              discount: true,
              totalAfterDiscount: true,
              advancePayment: true,
              balanceDue: true,
              isPaid: true,
            }
          },
          restaurant: {
            select: {
              id: true,
              name: true,
              businessId: true,
              advancePaymentPercentage: true,
              business: {
                select: {
                  name: true,
                },
              },
              mealServices: {
                select: {
                  taxPercentage: true,
                  serviceChargePercentage: true,
                  adultGrossPrice: true,
                  childGrossPrice: true,
                  adultNetPrice: true,
                  childNetPrice: true,
                  mealType: true,
                },
                take: 1,
              },
            },
          },
          promoCode: {
            select: {
              campaignType: true,
            }
          }
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
    ])

    const transformedData: FinanceTableRow[] = data.map((row) => {
      // Calculate merchant and platform initiated discounts
      let merchantInitiatedDiscount = null;
      let platformInitiatedDiscount = null;
      let promoCodeType = null;

      if (row.promoCodeId && row.discountAmount) {
        promoCodeType = row.promoCode?.campaignType || null;
        if (promoCodeType === 'MERCHANT') {
          merchantInitiatedDiscount = Number(row.discountAmount);
        } else if (promoCodeType === 'PLATFORM') {
          platformInitiatedDiscount = Number(row.discountAmount);
        }
      }

      return {
        reservationNumber: row.reservationNumber,
        paymentDate: row.payments[0]?.paymentDate || null,
        businessId: row.restaurant.businessId,
        businessName: row.restaurant.business.name,
        restaurantId: row.restaurant.id,
        restaurantName: row.restaurant.name,
        taxPercentage: Number(row.restaurant.mealServices[0]?.taxPercentage || 0),
        serviceChargePercentage: Number(row.restaurant.mealServices[0]?.serviceChargePercentage || 0),
        totalAmount: Number(row.totalAmount),
        discountAmount: row.discountAmount ? Number(row.discountAmount) : null,
        advancePaymentPercentage: row.restaurant.advancePaymentPercentage,
        adultCount: row.adultCount,
        childCount: row.childCount,
        adultGrossPrice: Number(row.restaurant.mealServices[0]?.adultGrossPrice || 0),
        childGrossPrice: Number(row.restaurant.mealServices[0]?.childGrossPrice || 0),
        adultNetPrice: Number(row.restaurant.mealServices[0]?.adultNetPrice || 0),
        childNetPrice: Number(row.restaurant.mealServices[0]?.childNetPrice || 0),
        serviceCharge: Number(row.serviceCharge),
        taxAmount: Number(row.taxAmount),
        promoCodeId: row.promoCodeId,
        hasPromoCodeUsage: row.promoCodeUsage.length > 0,
        // Add financial data fields
        netBuffetPrice: row.financialData ? Number(row.financialData.netBuffetPrice) : 0,
        totalBeforeDiscount: row.financialData ? Number(row.financialData.totalBeforeDiscount) : 0,
        totalAfterDiscount: row.financialData ? Number(row.financialData.totalAfterDiscount) : 0,
        advancePayment: row.financialData ? Number(row.financialData.advancePayment) : 0,
        balanceDue: row.financialData ? Number(row.financialData.balanceDue) : 0,
        isPaid: row.financialData?.isPaid ?? false,
        // Add new fields for payouts
        merchantInitiatedDiscount,
        platformInitiatedDiscount,
        promoCodeType
      }
    })

    return {
      success: true,
      data: transformedData,
      totalCount,
      page: validatedInput.page,
      totalPages: Math.ceil(totalCount / validatedInput.limit),
    }
  } catch (error) {
    console.error('Error in listFinanceData:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch finance data',
    }
  }
}
