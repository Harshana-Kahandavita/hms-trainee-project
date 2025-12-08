import { CancellationStatus, CancellationWindowType, PrismaClient } from "../../prisma/generated/prisma";
import { z } from "zod"

// Input validation schema
const ListCancellationsDataInput = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(10),
  searchQuery: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
})

type ListCancellationsDataInputType = z.infer<typeof ListCancellationsDataInput>

export interface CancellationTableRow {
  id: number
  reservationNumber: string
  requestedAt: Date
  restaurantId: number
  restaurantName: string
  totalAmount: number
  advancePaymentPercentage: number
  advancePaymentAmount: number
  refundAmount: number | null
  refundPercentage: number | null
  status: CancellationStatus
  windowType: CancellationWindowType
  refundPolicyId: number | null
  fullRefundBeforeMinutes: number | null
  partialRefundBeforeMinutes: number | null
  partialRefundPercentage: number | null
}

export type ListCancellationsDataResult = 
  | { 
      success: true
      data: CancellationTableRow[]
      totalCount: number
      page: number
      totalPages: number
    }
  | { 
      success: false
      error: string 
    }

export async function listCancellationsData(
  prisma: PrismaClient,
  input: ListCancellationsDataInputType
): Promise<ListCancellationsDataResult> {
  try {
    const validatedInput = ListCancellationsDataInput.parse(input)
    const skip = (validatedInput.page - 1) * validatedInput.limit

    // Get all statuses except REJECTED and CANCELLED
    const validStatuses = Object.values(CancellationStatus).filter(
      status => status !== CancellationStatus.REJECTED && status !== CancellationStatus.CANCELLED
    )

    // Build the where clause
    const whereClause: any = {
      status: {
        in: validStatuses
      }
    }

    // Add date range filter if provided
    if (validatedInput.fromDate || validatedInput.toDate) {
      whereClause.requestedAt = {}
      
      if (validatedInput.fromDate) {
        whereClause.requestedAt.gte = new Date(validatedInput.fromDate)
      }
      
      if (validatedInput.toDate) {
        // Set the end of the day for the toDate
        const toDate = new Date(validatedInput.toDate)
        toDate.setHours(23, 59, 59, 999)
        whereClause.requestedAt.lte = toDate
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
          reservation: {
            reservationNumber: {
              contains: validatedInput.searchQuery,
              mode: 'insensitive'
            }
          }
        }
      ]
    }

    const [totalCount, data] = await Promise.all([
      prisma.cancellationRequest.count({
        where: whereClause
      }),
      prisma.cancellationRequest.findMany({
        skip,
        take: validatedInput.limit,
        where: whereClause,
        select: {
          id: true,
          requestedAt: true,
          status: true,
          refundAmount: true,
          refundPercentage: true,
          windowType: true,
          reservation: {
            select: {
              reservationNumber: true,
              totalAmount: true,
              mealType: true,
            },
          },
          restaurant: {
            select: {
              id: true,
              name: true,
              advancePaymentPercentage: true,
              refundPolicies: {
                where: {
                  isActive: true,
                },
                select: {
                  id: true,
                  mealType: true,
                  fullRefundBeforeMinutes: true,
                  partialRefundBeforeMinutes: true,
                  partialRefundPercentage: true,
                },
                take: 1,
              },
            },
          },
        },
        orderBy: {
          requestedAt: 'desc',
        },
      }),
    ])

    const transformedData: CancellationTableRow[] = data.map((row) => {
      // Calculate advance payment amount
      const advancePaymentAmount = Number(row.reservation.totalAmount) * (row.restaurant.advancePaymentPercentage / 100)
      
      // Find matching refund policy for the reservation's meal type
      const refundPolicy = row.restaurant.refundPolicies.find(
        policy => policy.mealType === row.reservation.mealType
      )

      return {
        id: row.id,
        reservationNumber: row.reservation.reservationNumber,
        requestedAt: row.requestedAt,
        restaurantId: row.restaurant.id,
        restaurantName: row.restaurant.name,
        totalAmount: Number(row.reservation.totalAmount),
        advancePaymentPercentage: row.restaurant.advancePaymentPercentage,
        advancePaymentAmount,
        refundAmount: row.refundAmount ? Number(row.refundAmount) : null,
        refundPercentage: row.refundPercentage,
        status: row.status,
        windowType: row.windowType,
        refundPolicyId: refundPolicy?.id || null,
        fullRefundBeforeMinutes: refundPolicy?.fullRefundBeforeMinutes || null,
        partialRefundBeforeMinutes: refundPolicy?.partialRefundBeforeMinutes || null,
        partialRefundPercentage: refundPolicy?.partialRefundPercentage || null,
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
    console.error('Error in listCancellationsData:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch cancellations data',
    }
  }
} 