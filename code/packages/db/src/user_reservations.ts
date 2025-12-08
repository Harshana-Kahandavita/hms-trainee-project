import { PrismaClient } from "../prisma/generated/prisma";
import { z, ZodError } from "zod";
import { formatReservationDateTime } from "./reservationDateTimeFormatter";

const toPlainNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  if (typeof value === "object" && value !== null && "toNumber" in value) {
    try {
      return Number((value as { toNumber: () => number }).toNumber());
    } catch {
      return null;
    }
  }

  return Number(value);
};

// Input validation schema
const GetUserReservationsInput = z.object({
  phoneNumber: z.string(),
  // Optional filters
  status: z.string().optional(),
  fromDate: z.date().optional(),
  toDate: z.date().optional(),
});

type GetUserReservationsInputType = z.infer<typeof GetUserReservationsInput>;

// Add proper type for the return data
export type UserReservationData = {
  id: number;
  reservationNumber: string;
  restaurant: {
    id: number;
    name: string;
    address: string;
    advancePaymentPercentage: number;
    business: {
      email: string;
    };
    thumbnailImage: {
      imageUrl: string;
      altText: string;
    } | null;
  };
  displayValues: {
    reservationDate: string;
    reservationTime: string;
    mealType: string;
    guests: {
      adults: number;
      children: number;
      total: number;
    };
    payments: {
      totalPayment: number;
      advancePayment: number;
      balanceDue: number;
      discountAmount: number | null;
      finalAmount: number | null;
      netBuffetPrice: number | null;
    };
    promoCode?: {
      code: string;
      discountType: string;
      discountValue: number;
    } | null;
  };
  status: string;
  // Add meal service information for edit dialog
  mealService?: {
    id: number;
    isChildEnabled: boolean;
    childNetPrice: number | null;
    childAgeLimit: number;
    serviceStartTime: Date;
  } | null;
  // Add optional review field
  review?: {
    id: number;
    mealRating: number;
    serviceRating: number;
    platformRating: number;
    reviewText: string | null;
    isPublished: boolean;
  } | null;
  // Add special requests field
  specialRequests?: string | null;
  // Add platter-related fields
  isPlatterBasedReservation: boolean;
  platterCount?: number | null;
  paxPerPlatter?: number | null;
  // Add reservation type field
  reservationType: string;
  // Add table assignment for table reservations
  tableAssignment?: {
    tableStartTime: Date | null;
    tableEndTime: Date | null;
    sectionName?: string | null;
    tableName?: string | null;
  } | null;
  // Add applied policies information
  appliedPolicies?: Array<{
    id: number;
    policyId: number;
    wasAccepted: boolean;
    wasSkipped: boolean;
    selectedOptionId?: number | null;
    policy: {
      id: number;
      name: string;
      title: string;
      isOptional: boolean;
      requiresPayment: boolean;
      paymentType?: string | null;
      paymentValue?: number | null;
      paymentHandledByOptions: boolean;
      policyOptions: Array<{
        id: number;
        optionName: string;
        requiresPayment: boolean;
        additionalPrice: number;
        additionalPriceType: string;
      }>;
    };
  }>;
};

type GetUserReservationsResult = {
  success: boolean;
  reservations?: UserReservationData[];
  error?: string;
};

export async function getUserReservations(
  prisma: PrismaClient,
  input: GetUserReservationsInputType
): Promise<GetUserReservationsResult> {
  try {
    // Validate input
    GetUserReservationsInput.parse(input);

    // Find reservations by phone number instead of customerId
    const reservations = await prisma.reservation.findMany({
      where: {
        contactPhone: input.phoneNumber,
        ...(input.status && { status: input.status }),
        ...(input.fromDate && {
          reservationDate: {
            gte: input.fromDate,
          },
        }),
        ...(input.toDate && {
          reservationDate: {
            lte: input.toDate,
          },
        }),
      },
      select: {
        id: true,
        reservationNumber: true,
        reservationDate: true,
        reservationTime: true,
        mealType: true,
        adultCount: true,
        childCount: true,
        totalAmount: true,
        advancePaymentAmount: true,
        remainingPaymentAmount: true,
        status: true,
        specialRequests: true,
        reservationType: true,
        restaurant: {
          select: {
            id: true,
            name: true,
            address: true,
            advancePaymentPercentage: true,
            business: {
              select: {
                email: true,
              },
            },
            thumbnailImage: {
              select: {
                imageUrl: true,
                altText: true,
              },
            },
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
        },
        promoCodeUsage: {
          select: {
            originalAmount: true,
            discountAmount: true,
            promoCode: {
              select: {
                code: true,
                discountType: true,
                discountValue: true,
              },
            },
          },
          take: 1,
        },
        financialData: {
          select: {
            netBuffetPrice: true,
          },
        },
        reviews: {
          select: {
            id: true,
            mealRating: true,
            serviceRating: true,
            platformRating: true,
            reviewText: true,
            isPublished: true,
            createdAt: true,
          },
          take: 1,
        },
        tableAssignment: {
          select: {
            tableStartTime: true,
            tableEndTime: true,
            assignedSection: {
              select: {
                sectionName: true,
              },
            },
            assignedTable: {
              select: {
                tableName: true,
                section: {
                  select: {
                    sectionName: true,
                  },
                },
              },
            },
          },
        },
        appliedPolicies: {
          select: {
            id: true,
            policyId: true,
            wasAccepted: true,
            wasSkipped: true,
            selectedOptionId: true,
            policy: {
              select: {
                id: true,
                name: true,
                title: true,
                isOptional: true,
                requiresPayment: true,
                paymentType: true,
                paymentValue: true,
                paymentHandledByOptions: true,
                policyOptions: {
                  select: {
                    id: true,
                    optionName: true,
                    requiresPayment: true,
                    additionalPrice: true,
                    additionalPriceType: true,
                  },
                },
              },
            },
          },
        },
        // Include table sets (merged tables)
        tableSets: {
          where: {
            status: {
              in: ['ACTIVE', 'PENDING_MERGE']
            }
          },
          select: {
            id: true,
            tableIds: true,
            slotIds: true,
            primaryTableId: true,
            status: true,
            combinedCapacity: true
          }
        },
      },
      orderBy: {
        reservationDate: 'desc',
      },
    });

    // Fetch meal service information for each reservation
    const reservationIds = reservations.map(res => res.id);
    const mealServiceMap = new Map();
    
    // Get unique restaurant-mealType combinations
    const uniqueServiceKeys = Array.from(new Set(reservations.map(res => `${res.restaurant.id}-${res.mealType}`)));
    
    // Fetch meal service information for unique combinations
    for (const serviceKey of uniqueServiceKeys) {
      const parts = serviceKey.split('-');
      const restaurantId = parts[0];
      const mealType = parts[1];
      
      if (!restaurantId || !mealType) continue;
      
      const mealService = await prisma.restaurantMealService.findFirst({
        where: {
          restaurantId: parseInt(restaurantId),
          mealType: mealType as any,
          isAvailable: true,
        },
        select: {
          id: true,
          isChildEnabled: true,
          childNetPrice: true,
          childAgeLimit: true,
          serviceStartTime: true,
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
          isChildEnabled: mealService.isChildEnabled,
          childNetPrice: mealService.childNetPrice ? Number(mealService.childNetPrice.toNumber()) : null,
          childAgeLimit: mealService.childAgeLimit,
          serviceStartTime: mealService.serviceStartTime,
          platters: mealService.platters,
        });
      }
    }

    // Fetch table names for all merged tables
    const allTableIdsSet = new Set<number>();
    reservations.forEach(res => {
      if (res.tableSets && res.tableSets.length > 0) {
        res.tableSets.forEach((tableSet: any) => {
          (tableSet.tableIds as number[]).forEach(id => allTableIdsSet.add(id));
        });
      }
    });
    
    // Fetch all table names at once
    const tableNamesMap = new Map<number, string>();
    if (allTableIdsSet.size > 0) {
      const tables = await prisma.restaurantTable.findMany({
        where: {
          id: { in: Array.from(allTableIdsSet) }
        },
        select: {
          id: true,
          tableName: true
        }
      });
      
      tables.forEach(table => {
        tableNamesMap.set(table.id, table.tableName);
      });
    }

    return {
      success: true,
      reservations: reservations.map(res => {
        // Calculate the base amount (original amount if promo code used, otherwise total amount)
        const baseAmount = Number(res.totalAmount.toNumber().toFixed(2));
        const discountAmount = res.promoCodeUsage?.[0]?.discountAmount
          ? Number(res.promoCodeUsage[0].discountAmount.toNumber())
          : null;
        const finalAmount = discountAmount ? 
          Number((baseAmount - discountAmount).toFixed(2)) : 
          baseAmount;
        
        // Calculate advance payment based on the base amount
        const advancePayment = res.advancePaymentAmount ? 
          Number(res.advancePaymentAmount.toNumber().toFixed(2)) : 
          Number(((baseAmount * res.restaurant.advancePaymentPercentage) / 100).toFixed(2));
        
        // Debug logging for table reservations
        if (res.reservationType === 'TABLE_ONLY') {
          console.log(`Table reservation ${res.reservationNumber} payment calculation:`, {
            advancePaymentAmountFromDB: res.advancePaymentAmount?.toNumber(),
            baseAmount,
            advancePaymentPercentage: res.restaurant.advancePaymentPercentage,
            calculatedAdvancePayment: advancePayment,
            totalAmount: res.totalAmount.toNumber(),
            remainingPaymentAmount: res.remainingPaymentAmount?.toNumber()
          });
        }
        
        // Calculate balance due based on the total payment (baseAmount), not the final amount
        const balanceDue = res.remainingPaymentAmount ? 
          Number(res.remainingPaymentAmount.toNumber().toFixed(2)) : 
          Number((baseAmount - advancePayment).toFixed(2));

        // Extract review data if it exists
        const reviewData = res.reviews?.[0] ? {
            id: res.reviews[0].id,
            mealRating: res.reviews[0].mealRating,
            serviceRating: res.reviews[0].serviceRating,
            platformRating: res.reviews[0].platformRating,
            reviewText: res.reviews[0].reviewText,
            isPublished: res.reviews[0].isPublished,
            createdAt: res.reviews[0].createdAt,
        } : null;

        const promoCodeData = res.promoCodeUsage?.[0]?.promoCode ? {
          code: res.promoCodeUsage[0].promoCode.code,
          discountType: res.promoCodeUsage[0].promoCode.discountType,
          discountValue: Number(res.promoCodeUsage[0].promoCode.discountValue.toNumber()),
        } : null;

        // Get meal service data for this reservation
        const serviceKey = `${res.restaurant.id}-${res.mealType}`;
        const mealServiceData = mealServiceMap.get(serviceKey) || null;

        // Determine if this is a platter-based reservation
        const isPlatterBasedReservation = mealServiceData?.platters?.length > 0 || false;
        const platterCount = isPlatterBasedReservation ? Math.ceil((res.adultCount + res.childCount) / (mealServiceData?.platters?.[0]?.headCount || 1)) : null;
        const paxPerPlatter = isPlatterBasedReservation && platterCount && mealServiceData?.platters?.[0]?.headCount ? 
          mealServiceData.platters[0].headCount : null;

        return {
          id: res.id,
          reservationNumber: res.reservationNumber,
          restaurant: {
            id: res.restaurant.id,
            name: res.restaurant.name,
            address: res.restaurant.address,
            advancePaymentPercentage: res.restaurant.advancePaymentPercentage,
            business: res.restaurant.business,
            thumbnailImage: res.restaurant.thumbnailImage,
          },
          displayValues: {
            reservationDate: formatReservationDateTime(res.reservationDate, res.reservationTime, 'date'),
            reservationTime: (() => {
              // For table reservations, use assigned table start time
              if ((res.reservationType === 'TABLE_ONLY' || res.reservationType === 'BUFFET_AND_TABLE') && res.tableAssignment?.tableStartTime) {
                return res.tableAssignment.tableStartTime.toLocaleTimeString();
              }
              // For buffet-only reservations, use meal service start time
              if (mealServiceData?.serviceStartTime) {
                return mealServiceData.serviceStartTime.toLocaleTimeString();
              }
              // Fallback to reservation time
              return 'NaN';
            })(),
            mealType: res.mealType,
            guests: {
              adults: res.adultCount,
              children: res.childCount,
              total: res.adultCount + res.childCount
            },
            payments: {
              totalPayment: baseAmount,
              advancePayment: advancePayment,
              balanceDue: balanceDue,
              discountAmount: discountAmount,
              finalAmount: finalAmount,
              netBuffetPrice: res.financialData?.netBuffetPrice
                ? Number(res.financialData.netBuffetPrice.toNumber())
                : null
            },
            promoCode: promoCodeData
          },
          status: res.status,
          mealService: mealServiceData,
          review: reviewData,
          specialRequests: res.specialRequests,
          // Add platter-related fields
          isPlatterBasedReservation,
          platterCount,
          paxPerPlatter,
          // Add reservation type
          reservationType: res.reservationType,
          // Add table assignment with merged table support
          tableAssignment: res.tableAssignment ? {
            tableStartTime: res.tableAssignment.tableStartTime,
            tableEndTime: res.tableAssignment.tableEndTime,
            sectionName: res.tableAssignment.assignedTable?.section?.sectionName || 
                          res.tableAssignment.assignedSection?.sectionName || null,
            tableName: (() => {
              // Check if reservation has merged tables (table sets)
              if (res.tableSets && res.tableSets.length > 0) {
                // Get all unique table IDs from all active table sets
                const allTableIds = new Set<number>();
                res.tableSets.forEach((tableSet: any) => {
                  (tableSet.tableIds as number[]).forEach(id => allTableIds.add(id));
                });
                
                // Build comma-separated list from the map
                const tableNames = Array.from(allTableIds)
                  .map(id => tableNamesMap.get(id))
                  .filter(name => name !== undefined)
                  .sort()
                  .join(', ');
                
                return tableNames || res.tableAssignment?.assignedTable?.tableName || null;
              }
              
              // No merged tables, use the assigned table name
              return res.tableAssignment?.assignedTable?.tableName || null;
            })(),
          } : null,
          // Add applied policies information
          appliedPolicies: res.appliedPolicies?.map((policy: any) => ({
            id: policy.id,
            policyId: policy.policyId,
            wasAccepted: policy.wasAccepted,
            wasSkipped: policy.wasSkipped,
            selectedOptionId: policy.selectedOptionId,
            policy: {
              id: policy.policy.id,
              name: policy.policy.name,
              title: policy.policy.title,
              isOptional: policy.policy.isOptional,
              requiresPayment: policy.policy.requiresPayment,
              paymentType: policy.policy.paymentType,
              paymentValue: toPlainNumber(policy.policy.paymentValue),
              paymentHandledByOptions: policy.policy.paymentHandledByOptions,
              policyOptions: policy.policy.policyOptions?.map((option: any) => ({
                id: option.id,
                optionName: option.optionName,
                requiresPayment: option.requiresPayment,
                additionalPrice: toPlainNumber(option.additionalPrice) ?? 0,
                additionalPriceType: option.additionalPriceType,
              })) || [],
            },
          })) || undefined,
        };
      }),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof ZodError
        ? error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
        : error instanceof Error
          ? error.message
          : 'Unknown error occurred',
    };
  }
} 