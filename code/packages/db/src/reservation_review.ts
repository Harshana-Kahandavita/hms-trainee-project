import { PrismaClient, DiscountType } from '../prisma/generated/prisma';;
import { z } from 'zod';
import { updateStatsAfterReviewChange } from './restaurant_review_stats';
import { createPromoCode, CreatePromoCodeFailure } from './promo_code_flow';
import Decimal from 'decimal.js';

// Salt for masking/unmasking IDs - using default value if not specified
const MASKING_SALT = 'rush-buffet-connect-salt';

/**
 * Masks a reservation ID for secure exposure in client-side code
 *
 * @param id Reservation ID to mask
 * @returns Masked ID string that can be safely exposed to clients
 */
export function maskReservationId(id: number): string {
  // Convert ID to string and add salt
  const dataToMask = `${MASKING_SALT}:${id}:${MASKING_SALT}`;

  // Create a buffer and encode to base64
  const buffer = Buffer.from(dataToMask, 'utf-8');
  const base64 = buffer.toString('base64');

  // Add a prefix to identify this as a masked ID
  return `RID_${base64}`;
}

/**
 * Unmasks a reservation ID that was previously masked
 *
 * @param maskedId The masked ID string
 * @returns The original reservation ID or null if invalid
 */
export function unmaskReservationId(maskedId: string): number | null {
  try {
    // Verify it has our prefix
    if (!maskedId.startsWith('RID_')) {
      return null;
    }

    // Remove prefix
    const base64 = maskedId.substring(4);

    // Decode base64
    const buffer = Buffer.from(base64, 'base64');
    const decodedString = buffer.toString('utf-8');

    // Verify salt and extract ID
    const parts = decodedString.split(':');
    if (parts.length !== 3 || parts[0] !== MASKING_SALT || parts[2] !== MASKING_SALT) {
      return null;
    }

    // Convert back to number
    const id = parseInt(parts[1] || '', 10);
    if (isNaN(id)) {
      return null;
    }

    return id;
  } catch (error) {
    console.error('Error unmasking reservation ID:', error);
    return null;
  }
}

/**
 * Checks if a reservation is eligible for review
 *
 * @param prisma PrismaClient instance
 * @param reservationId Reservation ID to check
 * @returns Object with validation result and masked reservation ID if valid
 */
export async function isReservationReviewable(
  prisma: PrismaClient,
  reservationId: number
): Promise<{
  reviewable: boolean;
  maskedReservationId?: string;
  restaurantName?: string;
  diningDate?: Date;
  reason?: string;
}> {
  try {
    // Check if reservation exists
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        restaurant: {
          select: {
            name: true,
            location: {
              select: {
                city: true
              }
            }
          }
        }
      }
    });

    if (!reservation) {
      return {
        reviewable: false,
        reason: 'Reservation not found'
      };
    }

    // Check if the reservation is completed
    if (reservation.status !== 'COMPLETED') {
      return {
        reviewable: false,
        reason: `Cannot review a reservation in '${reservation.status}' status. Only completed reservations can be reviewed.`
      };
    }

    // Check if a review already exists
    const existingReview = await prisma.reservationReview.findFirst({
      where: { reservationId }
    });

    if (existingReview) {
      return {
        reviewable: false,
        reason: 'A review already exists for this reservation'
      };
    }

    // All checks passed, reservation is reviewable
    return {
      reviewable: true,
      maskedReservationId: maskReservationId(reservationId),
      restaurantName: reservation.restaurant.name,
      diningDate: reservation.reservationDate
    };
  } catch (error) {
    console.error('Error checking reservation reviewability:', error);
    return {
      reviewable: false,
      reason: 'Error verifying reservation'
    };
  }
}

/**
 * Initiates the review process for a reservation
 * If the reservation is in CONFIRMED or PENDING state, updates it to COMPLETED
 *
 * @param prisma PrismaClient instance
 * @param reservationId Reservation ID to check
 * @returns Object with success status, masked ID and feedback URL if reviewable
 */
export async function initiateReview(
  prisma: PrismaClient,
  reservationId: number
): Promise<
  | { success: true; maskedId: string; feedbackUrl: string }
  | { success: false; reason: string }
> {
  try {
    // Check if reservation exists
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId }
    });

    if (!reservation) {
      return {
        success: false,
        reason: 'Reservation not found'
      };
    }

    // Check if a review already exists regardless of reservation status
    const existingReview = await prisma.reservationReview.findFirst({
      where: { reservationId }
    });

    if (existingReview) {
      return {
        success: false,
        reason: 'A review already exists for this reservation'
      };
    }

    // If the reservation is in CONFIRMED or PENDING state, update it to COMPLETED
    if (reservation.status === 'CONFIRMED' || reservation.status === 'PENDING') {
      await prisma.reservation.update({
        where: { id: reservationId },
        data: {
          status: 'COMPLETED',
          lastModifiedAt: new Date(),
          lastModifiedBy: 'REVIEW_SYSTEM'
        }
      });
    }
    // If it's not in COMPLETED, CONFIRMED, or PENDING state, it can't be reviewed
    else if (reservation.status !== 'COMPLETED') {
      return {
        success: false,
        reason: `Cannot review a reservation in '${reservation.status}' status. Only completed, confirmed, or pending reservations can be reviewed.`
      };
    }

    // Get the masked ID for the reservation
    const maskedId = maskReservationId(reservationId);

    // Get the feedback URL from environment variables and append the masked ID
    const feedbackBaseUrl = process.env.FEEDBACK_URL || 'http://localhost:3000/feedback/';
    const feedbackUrl = `${feedbackBaseUrl}${maskedId}`;

    // All checks passed, reservation is reviewable
    return {
      success: true,
      maskedId,
      feedbackUrl
    };
  } catch (error) {
    console.error('Error initiating review process:', error);
    return {
      success: false,
      reason: 'Error processing reservation'
    };
  }
}

// Input validation schema
const AddReviewSchema = z.object({
  reservationId: z.number().positive(),
  mealRating: z.number().min(1).max(5),
  serviceRating: z.number().min(1).max(5),
  platformRating: z.number().min(1).max(5),
  reviewText: z.string().min(5).optional(),
  photoUrls: z.array(z.string().url()).optional(),
  photosCaptions: z.array(z.string()).optional()
});

export type AddReviewInput = z.infer<typeof AddReviewSchema>;

// Function to generate a random 6-letter promo code
function generatePromoCode(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return result;
}

export type AddReviewResponse = {
  success: true;
  reviewId: number;
  promoCode?: string;
} | {
  success: false;
  errorMsg: string;
};

/**
 * Adds a new review for a reservation
 *
 * @param prisma PrismaClient instance
 * @param input Review data including ratings and text
 * @returns Success response with review ID or error message
 */
export async function addReservationReview(
  prisma: PrismaClient,
  input: AddReviewInput
): Promise<AddReviewResponse> {
  try {
    // Validate input
    const validationResult = AddReviewSchema.safeParse(input);
    if (!validationResult.success) {
      return {
        success: false,
        errorMsg: validationResult.error.errors[0]?.message || "Invalid review data"
      };
    }

    // Verify that the reservation exists
    const reservation = await prisma.reservation.findUnique({
      where: {
        id: input.reservationId
      },
      include: {
        restaurant: {
          select: {
            id: true
          }
        }
      }
    });

    if (!reservation) {
      return {
        success: false,
        errorMsg: "Reservation not found"
      };
    }

    // Get the customerId from the reservation
    const customerId = reservation.customerId;

    // Verify that the reservation status is COMPLETED to allow reviews
    if (reservation.status !== 'COMPLETED') {
      return {
        success: false,
        errorMsg: "Reviews can only be added for completed reservations"
      };
    }

    // Check if a review already exists for this reservation
    const existingReview = await prisma.reservationReview.findFirst({
      where: { reservationId: input.reservationId }
    });

    if (existingReview) {
      return {
        success: false,
        errorMsg: "A review already exists for this reservation"
      };
    }

    // Variable to store the created review ID
    let createdReviewId: number;

    // Use a transaction to ensure all operations succeed or fail together
    createdReviewId = await prisma.$transaction(async (tx) => {
      // Create the review
      const review = await tx.reservationReview.create({
        data: {
          reservationId: input.reservationId,
          customerId: customerId,
          mealRating: input.mealRating,
          serviceRating: input.serviceRating,
          platformRating: input.platformRating,
          reviewText: input.reviewText || '',
          isVerified: true, // Auto-verify since it's tied to a valid reservation
          isPublished: true, // will auto publish for now
          diningDate: reservation.reservationDate, // Use the reservation date as the dining date
          moderationStatus: 'PENDING', // Initial status
        }
      });

      // Add photos if provided
      if (input.photoUrls && input.photoUrls.length > 0) {
        const photoData = input.photoUrls.map((url, index) => ({
          reviewId: review.id,
          photoUrl: url,
          photoCaption: input.photosCaptions?.[index] || '',
          uploadedAt: new Date(),
          isApproved: false // Photos require approval
        }));

        await tx.reservationReviewPhoto.createMany({
          data: photoData
        });
      }

      // Create a notification for the restaurant about the new review
      const restaurantId = reservation.restaurantId;

      await tx.notification.create({
        data: {
          restaurantId,
          type: 'REVIEW_POSTED',
          title: 'New Review Posted',
          message: `A customer has posted a new review for their recent visit`,
          metadata: {
            reservationId: input.reservationId,
            reviewId: review.id,
            ratings: {
              meal: input.mealRating,
              service: input.serviceRating,
              platform: input.platformRating
            }
          }
        }
      });

      return review.id;
    });

    // Since the review is auto-published, update the restaurant's review statistics
    // This needs to be done outside the transaction with the full prisma client
    await updateStatsAfterReviewChange(prisma, createdReviewId);

    // Generate a unique promo code for the customer
    let promoCode = generatePromoCode();
    let codeExists = true;

    // Ensure the generated code doesn't already exist
    while (codeExists) {
      const existingCode = await prisma.promoCode.findUnique({
        where: { code: promoCode }
      });

      if (!existingCode) {
        codeExists = false;
      } else {
        promoCode = generatePromoCode();
      }
    }

    // Create a new promo code as a reward for submitting a review
    const now = new Date();
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + 1); // Valid for 1 month

    const promoCodeResult = await createPromoCode(prisma, {
      code: promoCode,
      description: 'Thank you for your feedback! Enjoy a discount on your next visit.',
      discountType: DiscountType.PERCENTAGE_OFF,
      discountValue: new Decimal(10), // 10% discount
      minimumOrderValue: new Decimal(0),
      maximumDiscountAmount: new Decimal(5000), // Max discount of 5000
      usageLimitPerUser: 1,
      usageLimitTotal: 1,
      partySizeLimit: 5,
      partySizeLimitPerUser: 5,
      validFrom: now,
      validUntil: expiryDate,
      isActive: true,
      createdBy: 'REVIEW_SYSTEM',
      customerIds: [customerId] // Map to the customer who submitted the review
    });

    if (!promoCodeResult.success) {
      console.error('Failed to create promo code:', (promoCodeResult as CreatePromoCodeFailure).error);
      // Return success for the review but without promo code
      return {
        success: true,
        reviewId: createdReviewId
      };
    }

    return {
      success: true,
      reviewId: createdReviewId,
      promoCode: promoCodeResult.promoCode.code
    };
  } catch (error) {
    console.error('Error adding reservation review:', error);
    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : 'Failed to add reservation review'
    };
  }
}

/**
 * Updates the moderation status of a review
 *
 * @param prisma PrismaClient instance
 * @param reviewId ID of the review to moderate
 * @param approved Whether the review is approved
 * @param moderationNotes Optional notes from the moderator
 * @param moderatedBy User who performed the moderation
 * @returns Success response or error message
 */
export async function moderateReview(
  prisma: PrismaClient,
  reviewId: number,
  approved: boolean,
  moderationNotes?: string,
  moderatedBy: string = 'SYSTEM'
): Promise<{ success: boolean; errorMsg?: string }> {
  try {
    const review = await prisma.reservationReview.findUnique({
      where: { id: reviewId }
    });

    if (!review) {
      return {
        success: false,
        errorMsg: "Review not found"
      };
    }

    // Update the review with moderation status
    await prisma.reservationReview.update({
      where: { id: reviewId },
      data: {
        moderationStatus: approved ? 'APPROVED' : 'REJECTED',
        isPublished: approved,
        moderationNotes,
        moderatedAt: new Date(),
        moderatedBy
      }
    });

    // If the review was approved, update the restaurant's review statistics
    if (approved) {
      await updateStatsAfterReviewChange(prisma, reviewId);
    }

    return { success: true };
  } catch (error) {
    console.error('Error moderating review:', error);
    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : 'Failed to moderate review'
    };
  }
}

/**
 * Gets all reviews for a restaurant with pagination
 *
 * @param prisma PrismaClient instance
 * @param restaurantId ID of the restaurant
 * @param page Page number (1-based)
 * @param pageSize Number of reviews per page
 * @returns Paginated list of reviews
 */
export async function getRestaurantReviews(
  prisma: PrismaClient,
  restaurantId: number,
  page: number = 1,
  pageSize: number = 10
): Promise<{
  success: boolean;
  reviews?: any[];
  totalCount?: number;
  totalPages?: number;
  errorMsg?: string;
}> {
  try {
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

    const reviews = await prisma.reservationReview.findMany({
      where: {
        reservation: {
          restaurantId
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
        photos: {
          where: {
            isApproved: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip,
      take: pageSize
    });

    // Transform the data for API consumption
    const formattedReviews = reviews.map(review => ({
      id: review.id,
      customerName: `${review.customer.firstName} ${review.customer.lastName}`,
      mealRating: review.mealRating,
      serviceRating: review.serviceRating,
      platformRating: review.platformRating,
      averageRating: (review.mealRating + review.serviceRating + review.platformRating) / 3,
      reviewText: review.reviewText,
      diningDate: review.diningDate,
      photos: review.photos.map(photo => ({
        url: photo.photoUrl,
        caption: photo.photoCaption
      })),
      createdAt: review.createdAt
    }));

    return {
      success: true,
      reviews: formattedReviews,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize)
    };
  } catch (error) {
    console.error('Error fetching restaurant reviews:', error);
    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : 'Failed to fetch restaurant reviews'
    };
  }
}
