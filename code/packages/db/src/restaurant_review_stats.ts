import { PrismaClient } from '../prisma/generated/prisma';

/**
 * Restaurant review statistics model
 */
export interface RestaurantReviewStatsData {
  restaurantId: number;
  totalReviews: number;
  avgServiceRating: number;
  avgMealRating: number;
  avgPlatformRating: number;
  serviceRatingCounts: {
    "1": number;
    "2": number;
    "3": number;
    "4": number;
    "5": number;
  };
}

/**
 * Calculate review statistics for a specific restaurant
 * 
 * @param prisma PrismaClient instance
 * @param restaurantId ID of the restaurant to calculate stats for
 * @returns Review statistics or null if restaurant has no reviews
 */
export async function calculateRestaurantReviewStats(
  prisma: PrismaClient,
  restaurantId: number
): Promise<RestaurantReviewStatsData | null> {
  // First check if the restaurant exists
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId }
  });

  if (!restaurant) {
    return null;
  }

  // Get all published reviews for this restaurant
  const reviews = await prisma.reservationReview.findMany({
    where: {
      isPublished: true,
      reservation: {
        restaurantId
      }
    },
    select: {
      serviceRating: true,
      mealRating: true,
      platformRating: true
    }
  });

  if (reviews.length === 0) {
    return {
      restaurantId,
      totalReviews: 0,
      avgServiceRating: 0,
      avgMealRating: 0,
      avgPlatformRating: 0,
      serviceRatingCounts: {
        "1": 0,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0
      }
    };
  }

  // Calculate averages
  const totalServiceRating = reviews.reduce((sum, review) => sum + review.serviceRating, 0);
  const totalMealRating = reviews.reduce((sum, review) => sum + review.mealRating, 0);
  const totalPlatformRating = reviews.reduce((sum, review) => sum + review.platformRating, 0);

  // Count service ratings distribution
  const serviceRatingCounts = {
    "1": reviews.filter(r => r.serviceRating === 1).length,
    "2": reviews.filter(r => r.serviceRating === 2).length,
    "3": reviews.filter(r => r.serviceRating === 3).length,
    "4": reviews.filter(r => r.serviceRating === 4).length,
    "5": reviews.filter(r => r.serviceRating === 5).length
  };

  return {
    restaurantId,
    totalReviews: reviews.length,
    avgServiceRating: parseFloat((totalServiceRating / reviews.length).toFixed(2)),
    avgMealRating: parseFloat((totalMealRating / reviews.length).toFixed(2)),
    avgPlatformRating: parseFloat((totalPlatformRating / reviews.length).toFixed(2)),
    serviceRatingCounts
  };
}

/**
 * Get review statistics for a restaurant from the cached stats
 * If stats don't exist, calculate them and store them
 * 
 * @param prisma PrismaClient instance
 * @param restaurantId ID of the restaurant
 * @returns Restaurant review statistics
 */
export async function getRestaurantReviewStats(
  prisma: PrismaClient,
  restaurantId: number
): Promise<RestaurantReviewStatsData | null> {
  // Check if stats exist in database
  const existingStats = await prisma.restaurantReviewStats.findUnique({
    where: { restaurantId }
  });

  if (existingStats) {
    // Return existing stats in the required format
    return {
      restaurantId: existingStats.restaurantId,
      totalReviews: existingStats.totalReviews,
      avgServiceRating: Number(existingStats.avgServiceRating),
      avgMealRating: Number(existingStats.avgMealRating),
      avgPlatformRating: Number(existingStats.avgPlatformRating),
      serviceRatingCounts: {
        "1": existingStats.serviceRating1Count,
        "2": existingStats.serviceRating2Count,
        "3": existingStats.serviceRating3Count,
        "4": existingStats.serviceRating4Count,
        "5": existingStats.serviceRating5Count
      }
    };
  }

  // If stats don't exist, calculate and store them
  const calculatedStats = await calculateRestaurantReviewStats(prisma, restaurantId);
  if (calculatedStats) {
    await updateRestaurantReviewStats(prisma, calculatedStats);
  }

  return calculatedStats;
}

/**
 * Get review statistics for all restaurants
 * 
 * @param prisma PrismaClient instance
 * @returns Array of review statistics for all restaurants
 */
export async function getAllRestaurantReviewStats(
  prisma: PrismaClient
): Promise<RestaurantReviewStatsData[]> {
  // Get all restaurant IDs
  const restaurants = await prisma.restaurant.findMany({
    select: { id: true }
  });

  // Calculate stats for each restaurant
  const statsPromises = restaurants.map(restaurant => 
    getRestaurantReviewStats(prisma, restaurant.id)
  );

  // Wait for all stats to be calculated and filter out nulls
  const allStats = await Promise.all(statsPromises);
  return allStats.filter((stats): stats is RestaurantReviewStatsData => stats !== null);
}

/**
 * Update review statistics for a restaurant
 * This creates or updates the RestaurantReviewStats record
 * 
 * @param prisma PrismaClient instance
 * @param stats Calculated review statistics
 */
export async function updateRestaurantReviewStats(
  prisma: PrismaClient,
  stats: RestaurantReviewStatsData
): Promise<void> {
  await prisma.restaurantReviewStats.upsert({
    where: { restaurantId: stats.restaurantId },
    update: {
      totalReviews: stats.totalReviews,
      avgServiceRating: stats.avgServiceRating,
      avgMealRating: stats.avgMealRating,
      avgPlatformRating: stats.avgPlatformRating,
      serviceRating1Count: stats.serviceRatingCounts["1"],
      serviceRating2Count: stats.serviceRatingCounts["2"],
      serviceRating3Count: stats.serviceRatingCounts["3"],
      serviceRating4Count: stats.serviceRatingCounts["4"],
      serviceRating5Count: stats.serviceRatingCounts["5"],
      lastUpdated: new Date()
    },
    create: {
      restaurantId: stats.restaurantId,
      totalReviews: stats.totalReviews,
      avgServiceRating: stats.avgServiceRating,
      avgMealRating: stats.avgMealRating,
      avgPlatformRating: stats.avgPlatformRating,
      serviceRating1Count: stats.serviceRatingCounts["1"],
      serviceRating2Count: stats.serviceRatingCounts["2"],
      serviceRating3Count: stats.serviceRatingCounts["3"],
      serviceRating4Count: stats.serviceRatingCounts["4"],
      serviceRating5Count: stats.serviceRatingCounts["5"],
      lastUpdated: new Date()
    }
  });
}

/**
 * Update review statistics after a review is published or unpublished
 * 
 * @param prisma PrismaClient instance
 * @param reviewId ID of the review that was modified
 */
export async function updateStatsAfterReviewChange(
  prisma: PrismaClient,
  reviewId: number
): Promise<void> {
  // Get the review with reservation and restaurant info
  const review = await prisma.reservationReview.findUnique({
    where: { id: reviewId },
    include: {
      reservation: {
        select: {
          restaurantId: true
        }
      }
    }
  });

  if (!review || !review.reservation) {
    console.error(`Cannot update stats: Review #${reviewId} or its reservation not found`);
    return;
  }

  const restaurantId = review.reservation.restaurantId;
  
  // Calculate and update stats
  const stats = await calculateRestaurantReviewStats(prisma, restaurantId);
  if (stats) {
    await updateRestaurantReviewStats(prisma, stats);
    console.log(`Updated review stats for Restaurant ID ${restaurantId} after review change`);
  }
} 