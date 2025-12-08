import { PrismaClient, Prisma } from "../../prisma/generated/prisma";
import { z } from "zod";

// Input validation schema
const ListPromotionsInput = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(10),
  searchQuery: z.string().optional(),
});

type ListPromotionsInputType = z.infer<typeof ListPromotionsInput>;

export type ListPromotionsResult = 
  | { 
      success: true; 
      promotions: Array<{
        id: number;
        code: string;
        description: string;
        campaignType: 'PLATFORM' | 'MERCHANT';
        discountType: 'PERCENTAGE_OFF' | 'FIXED_AMOUNT_OFF';
        discountValue: number;
        minimumOrderValue: number;
        maximumDiscountAmount: number;
        usageLimitPerUser: number;
        usageLimitTotal: number;
        timesUsed: number;
        isActive: boolean;
        validFrom: string;
        validUntil: string;
        firstOrderOnly?: boolean;
        buffetTypes: string[];
        partySizeLimit: number;
        partySizeLimitPerUser: number;
        partySizeUsed: number;
        restaurantMappings: Array<{ restaurantId: number; restaurantName?: string }>;
      }>;
      totalCount: number;
      page: number;
      totalPages: number;
    }
  | { success: false; error: string };

export async function listPromotions(
  prisma: PrismaClient,
  input: ListPromotionsInputType
): Promise<ListPromotionsResult> {
  try {
    const validatedInput = ListPromotionsInput.parse(input);
    const skip = (validatedInput.page - 1) * validatedInput.limit;

    const searchCondition: Prisma.PromoCodeWhereInput = validatedInput.searchQuery
      ? {
          OR: [
            { code: { contains: validatedInput.searchQuery, mode: Prisma.QueryMode.insensitive } },
            { description: { contains: validatedInput.searchQuery, mode: Prisma.QueryMode.insensitive } },
          ],
          isDeleted: false,
        }
      : {
          isDeleted: false,
        };

    const [totalCount, promotions] = await Promise.all([
      prisma.promoCode.count({
        where: searchCondition
      }),
      prisma.promoCode.findMany({
        where: searchCondition,
        select: {
          id: true,
          code: true,
          description: true,
          campaignType: true,
          discountType: true,
          discountValue: true,
          minimumOrderValue: true,
          maximumDiscountAmount: true,
          usageLimitPerUser: true,
          usageLimitTotal: true,
          timesUsed: true,
          isActive: true,
          validFrom: true,
          validUntil: true,
          firstOrderOnly: true,
          buffetTypes: true,
          partySizeLimit: true,
          partySizeLimitPerUser: true,
          partySizeUsed: true,
          restaurantMappings: {
            select: {
              restaurantId: true,
              restaurant: {
                select: {
                  name: true
                }
              }
            }
          }
        },
        skip,
        take: validatedInput.limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),
    ]);

    const totalPages = Math.ceil(totalCount / validatedInput.limit);

    // Transform the data to match the frontend structure
    const transformedPromotions = promotions.map(promo => ({
      id: promo.id,
      code: promo.code,
      description: promo.description,
      campaignType: promo.campaignType,
      discountType: promo.discountType,
      discountValue: Number(promo.discountValue),
      minimumOrderValue: Number(promo.minimumOrderValue),
      maximumDiscountAmount: Number(promo.maximumDiscountAmount),
      usageLimitPerUser: promo.usageLimitPerUser,
      usageLimitTotal: promo.usageLimitTotal,
      timesUsed: promo.timesUsed,
      isActive: promo.isActive,
      firstOrderOnly: promo.firstOrderOnly || false,
      buffetTypes: promo.buffetTypes || [],
      validFrom: promo.validFrom.toISOString(),
      validUntil: promo.validUntil.toISOString(),
      partySizeLimit: promo.partySizeLimit,
      partySizeLimitPerUser: promo.partySizeLimitPerUser,
      partySizeUsed: promo.partySizeUsed,
      restaurantMappings: promo.restaurantMappings.map(mapping => ({
        restaurantId: mapping.restaurantId,
        restaurantName: mapping.restaurant.name
      }))
    }));

    return {
      success: true,
      promotions: transformedPromotions,
      totalCount,
      page: validatedInput.page,
      totalPages,
    };
  } catch (error) {
    console.error('Error in listPromotions:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch promotions',
    };
  }
}

export async function checkCampaignNameExists(
  prisma: PrismaClient,
  campaignName: string,
  excludeId?: number
): Promise<boolean> {
  const existingPromo = await prisma.promoCode.findFirst({
    where: {
      description: campaignName,
      id: excludeId ? { not: excludeId } : undefined,
      isDeleted: false
    }
  });
  return !!existingPromo;
}

export async function checkPromoCodeExists(
  prisma: PrismaClient,
  code: string,
  excludeId?: number
): Promise<boolean> {
  const existingPromo = await prisma.promoCode.findFirst({
    where: {
      code,
      id: excludeId ? { not: excludeId } : undefined,
      isDeleted: false
    }
  });
  return !!existingPromo;
}

export type CreatePromotionInput = {
  code: string;
  campaignName: string;
  description?: string;
  campaignType: 'PLATFORM' | 'MERCHANT';
  discountType: 'PERCENTAGE_OFF' | 'FIXED_AMOUNT_OFF';
  discountValue: number;
  minimumOrderValue: number;
  maximumDiscountAmount: number;
  usageLimitPerUser: number;
  usageLimitTotal: number;
  validFrom: Date;
  validUntil: Date;
  isActive: boolean;
  restaurantIds?: number[];
  customerIds?: number[];
  partySizeLimit: number;
  partySizeLimitPerUser: number;
  buffetType?: string;
  buffetTypes?: string[];
  firstOrderOnly?: boolean;
  createdBy: string;
};

export type CreatePromotionResult = 
  | { success: true; promotion: { id: number; code: string } }
  | { success: false; error: string; field?: string };

export async function createPromotion(
  prisma: PrismaClient,
  input: CreatePromotionInput
): Promise<CreatePromotionResult> {
  try {
    // Check for existing campaign name
    const campaignNameExists = await checkCampaignNameExists(prisma, input.campaignName);
    if (campaignNameExists) {
      return { 
        success: false, 
        error: 'This campaign name has already been used',
        field: 'campaignName'
      };
    }

    // Check for existing promo code
    const promoCodeExists = await checkPromoCodeExists(prisma, input.code);
    if (promoCodeExists) {
      return { 
        success: false, 
        error: 'This promo code has already been used',
        field: 'code'
      };
    }

    const result = await prisma.$transaction(async (tx) => {
      // Format dates to ISO DateTime
      const validFrom = new Date(input.validFrom);
      validFrom.setHours(0, 0, 0, 0);

      const validUntil = new Date(input.validUntil);
      validUntil.setHours(23, 59, 59, 999);

      // Handle buffet types - if "ALL" is selected, use all meal types
      let buffetTypes = input.buffetTypes || [];
      if (buffetTypes.includes("ALL")) {
        // Get all meal types from the enum
        buffetTypes = ['BREAKFAST', 'BRUNCH', 'LUNCH', 'HIGH_TEA', 'DINNER', 'SPECIAL'];
      }

      // Create the promo code
      const promoCode = await tx.promoCode.create({
        data: {
          code: input.code,
          description: input.description || input.campaignName,
          campaignType: input.campaignType,
          discountType: input.discountType,
          discountValue: input.discountValue,
          minimumOrderValue: input.minimumOrderValue,
          maximumDiscountAmount: input.maximumDiscountAmount,
          usageLimitPerUser: input.usageLimitPerUser,
          usageLimitTotal: input.usageLimitTotal,
          validFrom: validFrom,
          validUntil: validUntil,
          isActive: input.isActive,
          partySizeLimit: input.partySizeLimit,
          partySizeLimitPerUser: input.partySizeLimitPerUser,
          buffetTypes: buffetTypes as any,
          firstOrderOnly: input.firstOrderOnly || false,
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
          isDeleted: false,
          restaurantMappings: {
            create: input.restaurantIds?.map(restaurantId => ({
              restaurantId,
              isActive: true
            })) || []
          }
        }
      });

      return promoCode;
    });

    return { 
      success: true, 
      promotion: { 
        id: result.id, 
        code: result.code 
      } 
    };
  } catch (error) {
    console.error('Error creating promotion:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create promotion'
    };
  }
}

export type UpdatePromotionInput = {
  id: number;
  code: string;
  description: string;
  campaignType: 'PLATFORM' | 'MERCHANT';
  discountType: 'PERCENTAGE_OFF' | 'FIXED_AMOUNT_OFF';
  discountValue: number;
  minimumOrderValue: number;
  maximumDiscountAmount: number;
  usageLimitPerUser: number;
  usageLimitTotal: number;
  validFrom: Date;
  validUntil: Date;
  isActive: boolean;
  restaurantIds?: number[];
  customerIds?: number[];
  partySizeLimit: number;
  partySizeLimitPerUser: number;
  buffetType?: string;
  buffetTypes?: string[];
  firstOrderOnly?: boolean;
  updatedBy: string;
};

export type UpdatePromotionResult = 
  | { success: true; promotion: { id: number; code: string } }
  | { success: false; error: string; field?: string };

export async function updatePromotion(
  prisma: PrismaClient,
  input: UpdatePromotionInput
): Promise<UpdatePromotionResult> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Format dates to ISO DateTime
      const validFrom = new Date(input.validFrom);
      validFrom.setHours(0, 0, 0, 0);

      const validUntil = new Date(input.validUntil);
      validUntil.setHours(23, 59, 59, 999);

      // Handle buffet types - if "ALL" is selected, use all meal types
      let buffetTypes = input.buffetTypes || [];
      if (buffetTypes.includes("ALL")) {
        // Get all meal types from the enum
        buffetTypes = ['BREAKFAST', 'BRUNCH', 'LUNCH', 'HIGH_TEA', 'DINNER', 'SPECIAL'];
      }

      // Update the promo code
      const promoCode = await tx.promoCode.update({
        where: { id: input.id },
        data: {
          code: input.code,
          description: input.description,
          campaignType: input.campaignType,
          discountType: input.discountType,
          discountValue: input.discountValue,
          minimumOrderValue: input.minimumOrderValue,
          maximumDiscountAmount: input.maximumDiscountAmount,
          usageLimitPerUser: input.usageLimitPerUser,
          usageLimitTotal: input.usageLimitTotal,
          validFrom: validFrom,
          validUntil: validUntil,
          isActive: input.isActive,
          partySizeLimit: input.partySizeLimit,
          partySizeLimitPerUser: input.partySizeLimitPerUser,
          buffetTypes: buffetTypes as any,
          firstOrderOnly: input.firstOrderOnly || false,
          updatedBy: input.updatedBy,
          restaurantMappings: {
            deleteMany: {},
            create: input.restaurantIds?.map(restaurantId => ({
              restaurantId,
              isActive: true
            })) || []
          }
        }
      });

      return promoCode;
    });

    return { 
      success: true, 
      promotion: { 
        id: result.id, 
        code: result.code 
      } 
    };
  } catch (error) {
    console.error('Error updating promotion:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update promotion'
    };
  }
}

export type UpdatePromotionStatusInput = {
  id: number;
  isActive: boolean;
  updatedBy: string;
};

export type UpdatePromotionStatusResult = 
  | { success: true; promotion: { id: number; code: string; isActive: boolean } }
  | { success: false; error: string };

export async function updatePromotionStatus(
  prisma: PrismaClient,
  input: UpdatePromotionStatusInput
): Promise<UpdatePromotionStatusResult> {
  try {
    const promotion = await prisma.promoCode.update({
      where: { id: input.id },
      data: {
        isActive: input.isActive,
        updatedBy: input.updatedBy,
      },
      select: {
        id: true,
        code: true,
        isActive: true,
      }
    });

    return { success: true, promotion };
  } catch (error) {
    console.error('Error updating promotion status:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update promotion status'
    };
  }
}

export type DeletePromotionResult = 
  | { success: true; message: string }
  | { success: false; error: string };

export async function deletePromotion(
  prisma: PrismaClient,
  id: number
): Promise<DeletePromotionResult> {
  try {
    // First check if the promo code exists and has any usage
    const promoCode = await prisma.promoCode.findUnique({
      where: { id },
      include: {
        usageRecords: true,
        reservations: true,
        reservationRequests: true,
        restaurantMappings: true,
        customerMappings: true,
      }
    });

    if (!promoCode) {
      return {
        success: false,
        error: 'Promotion code not found'
      };
    }

    // Update the promo code to set isDeleted to true
      await prisma.promoCode.update({
        where: { id },
      data: { 
        isDeleted: true,
        isActive: false
      }
    });

    return {
      success: true,
      message: 'Promotion has been marked as deleted'
    };
  } catch (error) {
    console.error('Error marking promotion as deleted:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to mark promotion as deleted'
    };
  }
}

export type MealType = 'BREAKFAST' | 'BRUNCH' | 'LUNCH' | 'HIGH_TEA' | 'DINNER' | 'SPECIAL';

export async function getAllMealTypes(): Promise<MealType[]> {
  // Return all meal types from the enum
  return ['BREAKFAST', 'BRUNCH', 'LUNCH', 'HIGH_TEA', 'DINNER', 'SPECIAL'];
} 