import { PrismaClient, CampaignType } from '../../prisma/generated/prisma';
import { QueryResult } from '../types';

export interface GuestPromo {
  id: string;
  description: string;
  code: string;
}

export class GuestPromoQueries {
  constructor(private prisma: PrismaClient) {}

  /**
   * Get a list of active and publicly viewable promo codes for a specific guest user.
   * This function now requires a customerId.
   */
  async getGuestPromos(customerId: number): Promise<QueryResult<GuestPromo[]>> {
    try {
      const now = new Date();
      const promoCodes = await this.prisma.promoCode.findMany({
        where: {
          isActive: true,
          isDeleted: false,
          validFrom: { lte: now },
          validUntil: { gte: now },
          customerMappings: {
            some: {
              customerId: customerId,
              isActive: true,
            },
          },
        },
        select: {
          id: true,
          code: true,
          description: true,
          timesUsed: true,
          usageLimitPerUser: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      const filteredPromoCodes = promoCodes.filter(
        (promo) => promo.timesUsed < promo.usageLimitPerUser
      );

      const formattedPromos: GuestPromo[] = filteredPromoCodes.map(promo => ({
        id: promo.id.toString(), // Ensure ID is a string as expected by frontend mock
        description: promo.description,
        code: promo.code,
      }));

      return {
        success: true,
        data: formattedPromos,
      };
    } catch (error) {
      console.error('Database error in getGuestPromos:', error);
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'DATABASE_ERROR',
        },
      };
    }
  }
}
