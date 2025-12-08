import { PrismaClient } from '../../prisma/generated/prisma';
import { z } from 'zod';
import { updateStatsAfterReviewChange } from '../restaurant_review_stats';

// Schema for validating the review ID
const ToggleReviewPublishStateSchema = z.object({
  reviewId: z.number().int().positive(),
});

interface ToggleReviewPublishStateResult {
  success: boolean;
  error?: string;
  review?: {
    id: number;
    isPublished: boolean;
  };
}

/**
 * Toggle the published state of a review (hide/unhide)
 * 
 * @param prisma The Prisma client instance
 * @param reviewId The ID of the review to toggle
 * @returns Result object with success status and updated review
 */
export async function toggleReviewPublishState(
  prisma: PrismaClient,
  reviewId: number
): Promise<ToggleReviewPublishStateResult> {
  try {
    // Validate input
    const validation = ToggleReviewPublishStateSchema.safeParse({ reviewId });
    if (!validation.success) {
      return {
        success: false,
        error: 'Invalid review ID',
      };
    }

    // Find the current review to get its current published state
    const review = await prisma.reservationReview.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      return {
        success: false,
        error: 'Review not found',
      };
    }

    // Toggle the isPublished state
    const updatedReview = await prisma.reservationReview.update({
      where: { id: reviewId },
      data: {
        isPublished: !review.isPublished,
      },
      select: {
        id: true,
        isPublished: true,
      },
    });

    // Update statistics for the restaurant
    const reservation = await prisma.reservation.findUnique({
      where: { id: review.reservationId },
      select: { restaurantId: true },
    });

    if (reservation) {
      // Use the dedicated function to update restaurant review stats
      await updateStatsAfterReviewChange(prisma, reviewId);
    }

    return {
      success: true,
      review: updatedReview,
    };
  } catch (error) {
    console.error('Error toggling review publish state:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    };
  }
} 