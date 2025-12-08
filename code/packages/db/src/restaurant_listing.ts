import { PrismaClient, Prisma, ReservationSupportType } from "../prisma/generated/prisma";
import { z } from "zod";

// Input validation schemas
const ReservationTypeSchema = z.enum(['buffet', 'table'], {
  errorMap: () => ({ message: "Type must be either 'buffet' or 'table'" })
});

const PaginationSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20)
});

// Type for Prisma query result with all includes
type RestaurantWithIncludes = Prisma.RestaurantGetPayload<{
  include: {
    location: true;
    thumbnailImage: true;
    heroImage: true;
    cuisines: {
      include: {
        cuisine: true;
      };
    };
    reviewStats: true;
    mealServices: {
      include: {
        schedule: true;
      };
    };
    operatingHours: true;
    business: true;
  };
}>;

// Types for restaurant listing
export interface RestaurantListItem {
  id: number;
  name: string;
  description: string | null;
  address: string;
  phone: string;
  businessName: string;
  
  // Location
  city: string;
  state: string;
  postalCode: string;
  
  // Images
  thumbnailImageUrl: string | null;
  heroImageUrl: string | null;
  
  // Ratings
  averageRating: number;
  totalReviews: number;
  
  // Cuisines
  cuisines: Array<{
    id: number;
    name: string;
  }>;
  
  // Operating hours
  operatingHours: Array<{
    dayOfWeek: string;
    isOpen: boolean;
    openingTime: Date;
    closingTime: Date;
  }>;
  
  // Meal services
  mealServices: Array<{
    id: number;
    mealType: string;
    startTime: Date;
    endTime: Date;
    isAvailable: boolean;
    isChildEnabled: boolean;
    childNetPrice: number | null;
    childAgeLimit: number;
    availableDays: string[];
  }>;
  
  // Reservation support
  reservationSupport: string;
}

export interface PaginationMeta {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export type RestaurantListingResponse = {
  success: true;
  data: {
    restaurants: RestaurantListItem[];
    pagination: PaginationMeta;
  };
} | {
  success: false;
  errorMsg: string;
};

/**
 * Get restaurants filtered by reservation type with pagination
 * 
 * @param prisma - Prisma client instance
 * @param type - Restaurant type: 'buffet' or 'table'
 * @param page - Page number (starts from 1)
 * @param limit - Number of items per page (max 100)
 * @returns Paginated list of restaurants with full details
 */
export async function getRestaurantsByReservationType(
  prisma: PrismaClient,
  type: 'buffet' | 'table',
  page: number = 1,
  limit: number = 20
): Promise<RestaurantListingResponse> {
  try {
    // Validate inputs
    const typeValidation = ReservationTypeSchema.safeParse(type);
    if (!typeValidation.success) {
      return {
        success: false,
        errorMsg: typeValidation.error.errors[0]?.message || "Invalid type parameter"
      };
    }

    const paginationValidation = PaginationSchema.safeParse({ page, limit });
    if (!paginationValidation.success) {
      return {
        success: false,
        errorMsg: paginationValidation.error.errors[0]?.message || "Invalid pagination parameters"
      };
    }

    const validatedPagination = paginationValidation.data;
    const skip = (validatedPagination.page - 1) * validatedPagination.limit;

    // Determine reservation support filter based on type
    const reservationSupportFilter = type === 'buffet' 
      ? { in: ['BUFFET_ONLY', 'BOTH'] as ReservationSupportType[] }
      : { in: ['TABLE_ONLY', 'BOTH'] as ReservationSupportType[] };

    // Get total count for pagination
    const totalItems = await prisma.restaurant.count({
      where: {
        reservationSupport: reservationSupportFilter,
      },
    });

    // Fetch restaurants with all required relations
    const restaurants = await prisma.restaurant.findMany({
      where: {
        reservationSupport: reservationSupportFilter,
      },
      include: {
        location: true,
        thumbnailImage: true,
        heroImage: true,
        cuisines: {
          include: {
            cuisine: true,
          },
        },
        reviewStats: true,
        mealServices: {
          include: {
            schedule: true,
          },
        },
        operatingHours: true,
        business: true,
      },
      skip,
      take: validatedPagination.limit,
      orderBy: {
        id: 'asc',
      },
    });

    // Transform data to match the RestaurantListItem interface
    const transformedRestaurants: RestaurantListItem[] = restaurants.map(restaurant => ({
      id: restaurant.id,
      name: restaurant.name,
      description: restaurant.description,
      address: restaurant.address,
      phone: restaurant.phone,
      businessName: restaurant.business?.name || '',
      
      // Location
      city: restaurant.location.city,
      state: restaurant.location.state,
      postalCode: restaurant.location.postalCode,
      
      // Images (return relative URLs without base URL prefix - let the API layer handle that)
      thumbnailImageUrl: restaurant.thumbnailImage?.imageUrl || null,
      heroImageUrl: restaurant.heroImage?.imageUrl || null,
      
      // Ratings
      averageRating: restaurant.reviewStats 
        ? Number(restaurant.reviewStats.avgServiceRating)
        : 0,
      totalReviews: restaurant.reviewStats?.totalReviews || 0,
      
      // Cuisines
      cuisines: restaurant.cuisines.map(rc => ({
        id: rc.cuisine.id,
        name: rc.cuisine.cuisineName,
      })),
      
      // Operating hours
      operatingHours: restaurant.operatingHours.map(oh => ({
        dayOfWeek: oh.dayOfWeek,
        isOpen: oh.isOpen,
        openingTime: oh.openingTime,
        closingTime: oh.closingTime,
      })),
      
      // Meal services
      mealServices: restaurant.mealServices.map(service => ({
        id: service.id,
        mealType: service.mealType,
        startTime: service.serviceStartTime,
        endTime: service.serviceEndTime,
        isAvailable: service.isAvailable,
        isChildEnabled: service.isChildEnabled,
        childNetPrice: service.childNetPrice ? Number(service.childNetPrice) : null,
        childAgeLimit: service.childAgeLimit,
        availableDays: service.schedule?.availableDays || [],
      })),
      
      // Reservation support
      reservationSupport: restaurant.reservationSupport,
    }));

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalItems / validatedPagination.limit);
    const hasNextPage = validatedPagination.page < totalPages;
    const hasPreviousPage = validatedPagination.page > 1;

    return {
      success: true,
      data: {
        restaurants: transformedRestaurants,
        pagination: {
          currentPage: validatedPagination.page,
          pageSize: validatedPagination.limit,
          totalItems,
          totalPages,
          hasNextPage,
          hasPreviousPage,
        },
      },
    };
  } catch (error) {
    console.error('Error fetching restaurants by reservation type:', error);
    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : 'Failed to fetch restaurants'
    };
  }
}

