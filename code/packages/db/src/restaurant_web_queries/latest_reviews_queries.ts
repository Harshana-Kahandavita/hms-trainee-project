import { PrismaClient } from "../../prisma/generated/prisma";
import { z } from "zod";

// Input validation schema
const LatestReviewsSchema = z.object({
  page: z.number().min(1).optional().default(1),
  pageSize: z.number().min(1).optional().default(10)
});

// Define the return type structure
export interface LatestReviewResult {
  reviews: Array<{
    id: number;
    customerName: string;
    restaurantName: string;
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
  }>;
  totalCount: number;
  totalPages: number;
  overallRating: number;
  totalReviews: number;
}

export type LatestReviewsResponse = {
  success: true;
  data: LatestReviewResult;
} | {
  success: false;
  errorMsg: string;
};

export async function getRestaurantsWithCapacityForDay(prisma: PrismaClient, date: Date) {
  return prisma.restaurant.findMany({
    select: {
      id: true,
      name: true,
      capacity: true,
      capacityRecords: {
        where: {
          date: date
        },
        select: {
          totalSeats: true,
          mealService: {
            select: {
              mealType: true,
              serviceStartTime: true,
              serviceEndTime: true
            }
          }
        }
      }
    },
    orderBy: {
      reviewStats: {
        avgServiceRating: 'desc'
      }
    }
  });
}

export async function getRestaurantsOrderedByReviewStats(prisma: PrismaClient) {
  return prisma.restaurant.findMany({
    select: {
      id: true,
      name: true
    },
    orderBy: {
      reviewStats: {
        avgServiceRating: 'desc'
      }
    }
  });
}

export async function getLatestReviews(
  prisma: PrismaClient,
  page: number = 1,
  pageSize: number = 10
): Promise<LatestReviewsResponse> {
  try {
    // Validate input
    const validationResult = LatestReviewsSchema.safeParse({
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
        isPublished: true
      }
    });

    // Get reviews with pagination
    const reviews = await prisma.reservationReview.findMany({
      where: {
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
            mealType: true,
            restaurant: {
              select: {
                name: true
              }
            }
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

    // Calculate overall rating
    const allRatings = await prisma.reservationReview.findMany({
      where: {
        isPublished: true
      },
      select: {
        mealRating: true,
        serviceRating: true,
        platformRating: true
      }
    });

    const totalRating = allRatings.reduce((sum, rating) => 
      sum + (rating.mealRating + rating.serviceRating + rating.platformRating) / 3, 0);
    const overallRating = totalRating / (allRatings.length || 1);

    // Format reviews for API consumption
    const formattedReviews = reviews.map(review => ({
      id: review.id,
      customerName: `${review.customer.firstName} ${review.customer.lastName}`,
      restaurantName: review.reservation.restaurant.name,
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
      createdAt: review.createdAt
    }));

    return {
      success: true,
      data: {
        reviews: formattedReviews,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        overallRating: Number(overallRating.toFixed(1)),
        totalReviews: totalCount
      }
    };
  } catch (error) {
    console.error('Error fetching latest reviews:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : 'Failed to fetch latest reviews'
    };
  }
} 