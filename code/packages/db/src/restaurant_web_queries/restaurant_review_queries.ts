import { PrismaClient } from '../../prisma/generated/prisma';
import { z } from "zod";

// Input validation schema
const RestaurantReviewSchema = z.object({
  restaurantId: z.number().positive({ message: "Restaurant ID must be positive" }),
  page: z.number().min(1).optional().default(1),
  pageSize: z.number().min(1).optional().default(10)
});

// Define the return type structure
export interface RestaurantReviewResult {
  reviews: Array<{
    id: number;
    customerName: string;
    mealRating: number;
    serviceRating: number;
    platformRating: number;
    averageRating: number;
    reviewText: string | null;
    diningDate: Date;
    mealType: string;
    photos: Array<{
      url: string;
      caption: string | null;
    }>;
    createdAt: Date;
    source: 'SYSTEM' | 'GOOGLE';
  }>;
  totalCount: number;
  totalPages: number;
  ratingDistribution: {
    stars: number;
    count: number;
    percentage: number;
  }[];
  overallRating: number;
  recommendPercentage: number;
}

export type RestaurantReviewResponse = {
  success: true;
  data: RestaurantReviewResult;
} | {
  success: false;
  errorMsg: string;
};

// New function to get restaurant details by ID
export async function getRestaurantById(
  prisma: PrismaClient,
  restaurantId: number
): Promise<{ success: boolean; data?: { name: string; metadata?: any }; errorMsg?: string }> {
  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { 
        name: true,
        metadata: true
      }
    });

    if (!restaurant) {
      return {
        success: false,
        errorMsg: 'Restaurant not found'
      };
    }

    return {
      success: true,
      data: restaurant
    };
  } catch (error) {
    console.error('Error fetching restaurant details:', error);
    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : 'Failed to fetch restaurant details'
    };
  }
}

export async function getRestaurantReviewDetails(
  prisma: PrismaClient,
  restaurantId: number,
  page: number = 1,
  pageSize: number = 10
): Promise<RestaurantReviewResponse> {
  try {
    // Validate input
    const validationResult = RestaurantReviewSchema.safeParse({
      restaurantId,
      page,
      pageSize
    });

    if (!validationResult.success) {
      return {
        success: false,
        errorMsg: validationResult.error.errors[0]?.message || "Invalid input parameters"
      };
    }

    const skip = (page - 1) * pageSize;

    // Get total count for pagination info
    const totalCount = await prisma.reservationReview.count({
      where: {
        reservation: {
          restaurantId
        },
        isPublished: true
      }
    });

    // Get reviews with pagination
    const reviews = await prisma.reservationReview.findMany({
      where: {
        reservation: {
          restaurantId: restaurantId
        },
        isPublished: true
      },
      include: {
        customer: {
          select: {
            firstName: true,
            lastName: true
          }
        },
        reservation: {
          select: {
            mealType: true
          }
        },
        photos: {
          where: {
            isApproved: true
          },
          select: {
            photoUrl: true,
            photoCaption: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip,
      take: pageSize
    });

    // Get all ratings for distribution calculation
    const allRatings = await prisma.reservationReview.findMany({
      where: {
        reservation: {
          restaurantId
        },
        isPublished: true
      },
      select: {
        mealRating: true,
        serviceRating: true,
        platformRating: true
      }
    });

    // Calculate rating distribution
    const ratingCounts = {
      5: 0,
      4: 0,
      3: 0,
      2: 0,
      1: 0
    };

    allRatings.forEach(rating => {
      const avgRating = Math.round((rating.mealRating + rating.serviceRating + rating.platformRating) / 3);
      if (avgRating >= 1 && avgRating <= 5) {
        ratingCounts[avgRating as keyof typeof ratingCounts]++;
      }
    });

    // Calculate percentages and create distribution array
    const ratingDistribution = Object.entries(ratingCounts)
      .map(([stars, count]) => ({
        stars: parseInt(stars),
        count,
        percentage: (count / totalCount) * 100
      }))
      .sort((a, b) => b.stars - a.stars); // Sort in descending order by stars

    // Calculate overall rating
    const totalRating = allRatings.reduce((sum, rating) => 
      sum + (rating.mealRating + rating.serviceRating + rating.platformRating) / 3, 0);
    const overallRating = totalRating / allRatings.length;

    // Calculate recommend percentage (4 and 5 star ratings)
    const recommendCount = ratingCounts[4] + ratingCounts[5];
    const recommendPercentage = (recommendCount / totalCount) * 100;

    // Format reviews for API consumption
    const formattedReviews = reviews.map(review => ({
      id: review.id,
      customerName: `${review.customer.firstName} ${review.customer.lastName}`,
      mealRating: review.mealRating,
      serviceRating: review.serviceRating,
      platformRating: review.platformRating,
      averageRating: (review.mealRating + review.serviceRating + review.platformRating) / 3,
      reviewText: review.reviewText,
      diningDate: review.diningDate,
      mealType: review.reservation.mealType,
      photos: review.photos.map(photo => ({
        url: photo.photoUrl,
        caption: photo.photoCaption
      })),
      createdAt: review.createdAt,
      source: 'SYSTEM' as const
    }));

    return {
      success: true,
      data: {
        reviews: formattedReviews,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        ratingDistribution,
        overallRating,
        recommendPercentage
      }
    };
  } catch (error) {
    console.error('Error fetching restaurant reviews:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : 'Failed to fetch restaurant reviews'
    };
  }
} 