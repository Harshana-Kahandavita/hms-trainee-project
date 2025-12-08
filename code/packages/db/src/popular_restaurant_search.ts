import { Prisma, DayOfWeek, PrismaClient } from '../prisma/generated/prisma'
import { getRestaurantReviewStats } from './restaurant_review_stats';

export interface PopularBuffet {
  id: number
  name: string
  businessName: string
  averageRating: number
  startingPrice: number
  thumbnailUrl: string | null
}

export type PopularBuffetsResponse = {
  success: true;
  buffets: PopularBuffet[];
  hasMore: boolean;
} | {
  success: false;
  errorMsg: string;
};

type RestaurantWithRelations = {
  id: number;
  name: string;
  business: {
    name: string;
  };
  thumbnailImage: {
    imageUrl: string;
  } | null;
  mealServices: {
    adultGrossPrice: Prisma.Decimal;
  }[];
  reviewStats: {
    avgServiceRating: Prisma.Decimal;
  } | null;
  reservations: {
    reviews: {
      mealRating: number;
      serviceRating: number;
      platformRating: number;
    }[];
  }[];
};

export async function findPopularBuffets(
  prisma: PrismaClient,
  page: number = 1,
  pageSize: number = 8
): Promise<PopularBuffetsResponse> {
  try {
    console.log('[PopularBuffets] Starting search', { page, pageSize });
    const skip = (page - 1) * pageSize;
    const now = new Date();

    // Calculate current day and time for availability checks
    const currentDay = now.toLocaleString('en-US', { weekday: 'long' }).toUpperCase() as DayOfWeek;
    const currentTime = new Date(1970, 0, 1, now.getHours(), now.getMinutes(), now.getSeconds());

    console.log('[PopularBuffets] Time parameters', { currentDay, currentTime }, now);

    const whereConditions: Prisma.RestaurantWhereInput = {
      AND: [
        // Filter out restaurants with active special closures
        {
          specialClosures: {
            none: {
              closureStart: { lte: now },
              closureEnd: { gte: now }
            }
          }
        },
        // Filter for restaurants currently open based on regular hours
        {
          operatingHours: {
            some: {
              dayOfWeek: currentDay,
              isOpen: true,
              openingTime: { lte: currentTime },
              closingTime: { gte: currentTime }
            }
          }
        }
      ]
    };

    const totalCount = await prisma.restaurant.count({ where: whereConditions });
    console.log('[PopularBuffets] Total restaurants found:', totalCount);

    const restaurants = await prisma.restaurant.findMany({
      skip,
      take: pageSize,
      where: whereConditions,
      select: {
        id: true,
        name: true,
        business: {
          select: {
            name: true
          }
        },
        thumbnailImage: {
          select: {
            imageUrl: true
          }
        },
        reviewStats: {
          select: {
            avgServiceRating: true
          }
        },
        mealServices: {
          select: {
            adultGrossPrice: true
          },
          take: 1,
          orderBy: {
            adultGrossPrice: 'asc'
          }
        },
        reservations: {
          select: {
            reviews: {
              select: {
                mealRating: true,
                serviceRating: true,
                platformRating: true
              }
            }
          }
        }
      },
      orderBy: {
        reservations: {
          _count: 'desc'
        }
      }
    });

    console.log('[PopularBuffets] Fetched restaurants count:', restaurants.length);

    const hasMore = totalCount > (page * pageSize);

    // Process restaurants and handle async operations
    const buffetsPromises = restaurants.map(async (restaurant: RestaurantWithRelations) => {
      // Determine the average rating
      let averageRating = 0;

      // First priority: Use the avgServiceRating from RestaurantReviewStats if available
      if (restaurant.reviewStats && restaurant.reviewStats.avgServiceRating !== null && restaurant.reviewStats.avgServiceRating !== undefined) {
        averageRating = Number(restaurant.reviewStats.avgServiceRating);
      } else {
        // Second priority: Get stats from getRestaurantReviewStats function
        const reviewStats = await getRestaurantReviewStats(prisma, restaurant.id);
        if (reviewStats) {
          averageRating = reviewStats.avgServiceRating;
        }
      }

      return {
        id: restaurant.id,
        name: restaurant.name,
        businessName: restaurant.business.name,
        averageRating: Number(averageRating.toFixed(1)),
        startingPrice: Number(restaurant.mealServices[0]?.adultGrossPrice || 0),
        thumbnailUrl: restaurant.thumbnailImage?.imageUrl || null
      };
    });

    // Wait for all promises to resolve
    const buffets = await Promise.all(buffetsPromises);

    const result: { success: true; buffets: PopularBuffet[]; hasMore: boolean } = {
      success: true as const,
      buffets,
      hasMore
    };

    console.log('[PopularBuffets] Search completed', {
      resultCount: result.buffets.length,
      hasMore: result.hasMore
    });

    return result;
  } catch (error) {
    console.error('[PopularBuffets] Error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : 'Failed to fetch buffets'
    };
  }
}


