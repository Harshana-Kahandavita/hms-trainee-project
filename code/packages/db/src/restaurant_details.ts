import { PrismaClient, MealType } from "../prisma/generated/prisma";
import { z } from "zod";
import { getRestaurantReviewStats } from "./restaurant_review_stats";

// Input validation schema
const RestaurantIdSchema = z.number().positive({
  message: "Restaurant ID must be positive"
});

export interface RestaurantDetailsResult {
  id: number;
  name: string;
  businessName: string;
  address: string;
  phone: string;
  description: string | null;
  capacity: number;
  city: string;
  cityLatitude: number | null;
  cityLongitude: number | null;
  thumbnailImageUrl: string | null;
  reservationSupport: string;
  images: {
    id: number;
    imageUrl: string;
    imageType: string;
    altText: string;
    caption: string | null;
    displayOrder: number;
  }[];
  cuisines: string[];
  mealServices: {
    id: number;
    mealType: string;
    adultGrossPrice: number;
    childGrossPrice: number;
    adultNetPrice: number;
    childNetPrice: number;
    childAgeLimit: number;
    serviceStartTime: string;
    serviceEndTime: string;
  }[];
  operatingHours: {
    dayOfWeek: string;
    isOpen: boolean;
    openingTime: Date;
    closingTime: Date;
  }[];
  reviews: {
    id: number;
    mealRating: number;
    serviceRating: number;
    platformRating: number;
    reviewText: string;
    customerName: string;
    diningDate: Date;
  }[];
  averageRating: number;
}

export type RestaurantDetailsResponse = {
  success: true;
  restaurant: RestaurantDetailsResult;
} | {
  success: false;
  errorMsg: string;
};

export async function getRestaurantDetails(
  prisma: PrismaClient,
  restaurantId: number
): Promise<RestaurantDetailsResponse> {
  try {
    // Validate input
    const validationResult = RestaurantIdSchema.safeParse(restaurantId);
    if (!validationResult.success) {
      return {
        success: false,
        errorMsg: validationResult.error.errors[0]?.message || "Invalid restaurant ID"
      };
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: {
        business: true,
        location: true,
        thumbnailImage: true,
        reviewStats: true,
        images: {
          where: {
            isActive: true
          },
          orderBy: {
            displayOrder: 'asc'
          }
        },
        cuisines: {
          include: {
            cuisine: true
          }
        },
        mealServices: {
          where: {
            isAvailable: true
          }
        },
        operatingHours: true,
        reservations: {
          include: {
            reviews: {
              where: {
                isPublished: true
              },
              include: {
                customer: true
              }
            }
          }
        }
      }
    });

    if (!restaurant) {
      return {
        success: false,
        errorMsg: "Restaurant not found"
      };
    }

    // Determine the average rating
    let averageRating = 0;
    
    // First priority: Use the avgServiceRating from RestaurantReviewStats if available
    if (restaurant.reviewStats && restaurant.reviewStats.avgServiceRating !== null && restaurant.reviewStats.avgServiceRating !== undefined) {
      averageRating = Number(restaurant.reviewStats.avgServiceRating);
    } else {
      // Second priority: Get stats from getRestaurantReviewStats function
      const reviewStats = await getRestaurantReviewStats(prisma, restaurantId);
      if (reviewStats) {
        averageRating = reviewStats.avgServiceRating;
      }
    }

    const cityRecord = await prisma.city.findFirst({
      where: {
        cityName: restaurant.location.city,
        stateName: restaurant.location.state,
      },
      select: {
        latitude: true,
        longitude: true,
      },
    });

    return {
      success: true,
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        businessName: restaurant.business.name,
        address: restaurant.address,
        phone: restaurant.phone,
        description: restaurant.description,
        capacity: restaurant.capacity,
        city: restaurant.location.city,
        cityLatitude: cityRecord ? Number(cityRecord.latitude) : null,
        cityLongitude: cityRecord ? Number(cityRecord.longitude) : null,
        thumbnailImageUrl: restaurant.thumbnailImage?.imageUrl || null,
        reservationSupport: restaurant.reservationSupport,
        images: restaurant.images.map(image => ({
          id: image.id,
          imageUrl: image.imageUrl,
          imageType: image.imageType,
          altText: image.altText,
          caption: image.caption,
          displayOrder: image.displayOrder
        })),
        cuisines: restaurant.cuisines.map(rc => rc.cuisine.cuisineName),
        mealServices: restaurant.mealServices.map(service => ({
          id: service.id,
          mealType: service.mealType,
          adultGrossPrice: Number(service.adultGrossPrice),
          childGrossPrice: Number(service.childGrossPrice),
          adultNetPrice: Number(service.adultNetPrice),
          childNetPrice: Number(service.childNetPrice),
          childAgeLimit: service.childAgeLimit,
          serviceStartTime: service.serviceStartTime.toLocaleTimeString("sv-SE", {
            hour: "2-digit",
            minute: "2-digit"
          }),
          serviceEndTime: service.serviceEndTime.toLocaleTimeString("sv-SE", {
            hour: "2-digit",
            minute: "2-digit"
          }),
        })),
        operatingHours: restaurant.operatingHours.map(hours => ({
          dayOfWeek: hours.dayOfWeek,
          isOpen: hours.isOpen,
          openingTime: hours.openingTime,
          closingTime: hours.closingTime,
        })),
        reviews: restaurant.reservations
          .flatMap(reservation => reservation.reviews)
          .filter(review => review.isPublished)
          .map(review => ({
            id: review.id,
            mealRating: review.mealRating,
            serviceRating: review.serviceRating,
            platformRating: review.platformRating,
            reviewText: review.reviewText || '',
            customerName: `${review.customer.firstName} ${review.customer.lastName}`,
            diningDate: review.diningDate,
          })),
        averageRating,
      }
    };
  } catch (error) {
    console.error('Error fetching restaurant details:', error);
    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : 'Failed to fetch restaurant details'
    };
  }
}

export type MealPriceCalculationResult = {
  baseAmount: number;
  taxAmount: number;
  serviceCharge: number;
  totalAmount: number;
  taxPercentage: number;
  serviceChargePercentage: number;
};

export async function calculateMealPrice(
  prisma: PrismaClient,
  restaurantId: number,
  mealType: string,
  partySize: number
): Promise<MealPriceCalculationResult | null> {
  try {
    const mealService = await prisma.restaurantMealService.findFirst({
      where: {
        restaurantId: restaurantId,
        mealType: mealType.toUpperCase() as MealType,
        isAvailable: true
      }
    });

    if (!mealService) return null;

    const baseAmount = Number(mealService.adultGrossPrice) * partySize;
    const serviceCharge = baseAmount * (Number(mealService.serviceChargePercentage) / 100);
    const taxAmount = baseAmount * (Number(mealService.taxPercentage) / 100);
    const totalAmount = baseAmount + serviceCharge + taxAmount;

    return {
      baseAmount: Math.round(baseAmount),
      serviceCharge: Math.round(serviceCharge),
      taxAmount: Math.round(taxAmount),
      totalAmount: Math.round(totalAmount),
      taxPercentage: Number(mealService.taxPercentage),
      serviceChargePercentage: Number(mealService.serviceChargePercentage)
    };
  } catch (error) {
    console.error('Error calculating meal price:', error);
    return null;
  }
}

export interface RestaurantEmailResult {
  success: boolean;
  email?: string;
  error?: string;
}

export async function getRestaurantEmail(
  prisma: PrismaClient,
  restaurantId: number
): Promise<RestaurantEmailResult> {
  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        business: {
          select: {
            email: true
          }
        }
      }
    });

    if (!restaurant || !restaurant.business?.email) {
      return {
        success: false,
        error: "Restaurant or business email not found"
      };
    }

    return {
      success: true,
      email: restaurant.business.email
    };
  } catch (error) {
    console.error('Error fetching restaurant email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch restaurant email'
    };
  }
}

export async function getUpcomingMealService(
  prisma: PrismaClient,
  restaurantId: number,
  reservationDate?: string // Optional parameter, defaults to today if not provided
): Promise<{ success: boolean; mealType?: string; error?: string }> {
  try {
    // Validate input
    const validationResult = RestaurantIdSchema.safeParse(restaurantId);
    if (!validationResult.success) {
      return {
        success: false,
        error: validationResult.error.errors[0]?.message || "Invalid restaurant ID"
      };
    }

    // Get all available meal services for the restaurant
    const mealServices = await prisma.restaurantMealService.findMany({
      where: {
        restaurantId: restaurantId,
        isAvailable: true
      },
      select: {
        mealType: true,
        serviceStartTime: true,
        serviceEndTime: true
      },
      orderBy: {
        serviceStartTime: 'asc'
      }
    });

    if (mealServices.length === 0) {
      return {
        success: false,
        error: "No meal services found for this restaurant"
      };
    }

    // Get refund policies for all meal types
    const refundPolicies = await prisma.restaurantRefundPolicy.findMany({
      where: {
        restaurantId: restaurantId,
        isActive: true
      },
      select: {
        mealType: true,
        fullRefundBeforeMinutes: true,
        partialRefundBeforeMinutes: true
      }
    });

    // Create a map for quick lookup of refund policies
    const refundPolicyMap = new Map(
      refundPolicies.map(policy => [policy.mealType, policy])
    );

    // Use reservation date if provided, otherwise use current date
    const targetDate = reservationDate ? new Date(reservationDate) : new Date();
    const currentTime = new Date();
    
    // Helper function to check if a meal service is in no refund window
    // 
    // Refund Window Logic:
    // - Full refund: Available until fullRefundBeforeMinutes before service start
    // - Partial refund: Available until partialRefundBeforeMinutes before service start (if configured)
    // - No refund: From partialRefundBeforeMinutes (or fullRefundBeforeMinutes if no partial) until service start
    // 
    // We should NOT show a meal service as default if:
    // 1. Current time is within the no refund window for the target reservation date
    // 2. This prevents users from making reservations they cannot cancel/modify
    const isInNoRefundWindow = (service: { mealType: string; serviceStartTime: Date }) => {
      const refundPolicy = refundPolicyMap.get(service.mealType as MealType);
      if (!refundPolicy) {
        // If no refund policy exists, allow the service to be shown
        return false;
      }

      // Create the actual meal service datetime by combining target date with service time
      const mealServiceDateTime = new Date(targetDate);
      mealServiceDateTime.setHours(
        service.serviceStartTime.getHours(),
        service.serviceStartTime.getMinutes(),
        0,
        0
      );

      // Calculate time difference in minutes from now to the meal service
      const timeDifferenceMinutes = Math.floor(
        (mealServiceDateTime.getTime() - currentTime.getTime()) / (1000 * 60)
      );

      // If the meal service is in the past, it should not be shown
      if (timeDifferenceMinutes < 0) {
        return true; // Consider past services as "in no refund window" to exclude them
      }

      // Calculate the no refund window start time
      // No refund window starts at partialRefundBeforeMinutes (if exists) or fullRefundBeforeMinutes
      const noRefundWindowMinutes = refundPolicy.partialRefundBeforeMinutes || refundPolicy.fullRefundBeforeMinutes;

      // Check if current time is within the no refund window
      // If time difference is less than the no refund window, user cannot make a reservation
      return timeDifferenceMinutes < noRefundWindowMinutes;
    };

    // Find the next upcoming meal service that is not in no refund window
    const availableService = mealServices.find(service => {
      // Don't show meal services that are in the no refund window
      if (isInNoRefundWindow(service)) {
        return false;
      }

      return true;
    });

    if (availableService) {
      return {
        success: true,
        mealType: availableService.mealType
      };
    }

    // If no service is available (all are in no refund window), return the first service
    // This handles edge cases but the frontend should handle showing appropriate messages
    return {
      success: true,
      mealType: mealServices[0]?.mealType || 'DINNER'
    };

  } catch (error) {
    console.error('Error fetching upcoming meal service:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch upcoming meal service'
    };
  }
}
