import { PrismaClient } from '../../prisma/generated/prisma';

export interface RestaurantInfo {
  id: number;
  name: string;
  address: string;
  phone: string;
  description: string | null;
  capacity: number;
  onlineQuota: number;
  advancePaymentPercentage: number;
  reservationSupport: string;
  businessId: number;
  locationId: number;
  thumbnailImageId: number | null;
  heroImageId: number | null;
  createdAt: Date;
  updatedAt: Date;
  business?: {
    id: number;
    name: string;
    email: string;
  };
  location?: {
    id: number;
    city: string;
    postalCode: string;
  };
  thumbnailImage?: {
    id: number;
    imageUrl: string;
  };
  heroImage?: {
    id: number;
    imageUrl: string;
  };
}

export type GetAllRestaurantsResult =
  | { success: true; restaurants: RestaurantInfo[]; totalCount: number }
  | { success: false; error: string };

/**
 * Fetch all restaurants from the database
 * @param prisma - Prisma client instance
 * @param includeRelations - Whether to include related data (business, location, images)
 * @returns All restaurants with optional relations
 */
export async function getAllRestaurants(
  prisma: PrismaClient,
  includeRelations: boolean = false
): Promise<GetAllRestaurantsResult> {
  try {
    const restaurants = await prisma.restaurant.findMany({
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        description: true,
        capacity: true,
        onlineQuota: true,
        advancePaymentPercentage: true,
        reservationSupport: true,
        businessId: true,
        locationId: true,
        thumbnailImageId: true,
        heroImageId: true,
        createdAt: true,
        updatedAt: true,
        ...(includeRelations && {
          business: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          location: {
            select: {
              id: true,
              city: true,
              postalCode: true,
            },
          },
          thumbnailImage: {
            select: {
              id: true,
              imageUrl: true,
            },
          },
          heroImage: {
            select: {
              id: true,
              imageUrl: true,
            },
          },
        }),
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const totalCount = restaurants.length;

    return {
      success: true,
      restaurants: restaurants as RestaurantInfo[],
      totalCount,
    };
  } catch (error) {
    console.error('Error fetching all restaurants:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch restaurants',
    };
  }
}

/**
 * Fetch all restaurants with pagination support
 * @param prisma - Prisma client instance
 * @param page - Page number (starts from 1)
 * @param limit - Number of items per page
 * @param includeRelations - Whether to include related data
 * @returns Paginated restaurants
 */
export type GetAllRestaurantsPaginatedResult =
  | {
      success: true;
      restaurants: RestaurantInfo[];
      totalCount: number;
      page: number;
      totalPages: number;
    }
  | { success: false; error: string };

export async function getAllRestaurantsPaginated(
  prisma: PrismaClient,
  page: number = 1,
  limit: number = 10,
  includeRelations: boolean = false
): Promise<GetAllRestaurantsPaginatedResult> {
  try {
    const skip = (page - 1) * limit;

    const [totalCount, restaurants] = await Promise.all([
      prisma.restaurant.count(),
      prisma.restaurant.findMany({
        select: {
          id: true,
          name: true,
          address: true,
          phone: true,
          description: true,
          capacity: true,
          onlineQuota: true,
          advancePaymentPercentage: true,
          reservationSupport: true,
          businessId: true,
          locationId: true,
          thumbnailImageId: true,
          heroImageId: true,
          createdAt: true,
          updatedAt: true,
          ...(includeRelations && {
            business: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            location: {
              select: {
                id: true,
                city: true,
                postalCode: true,
              },
            },
            thumbnailImage: {
              select: {
                id: true,
                imageUrl: true,
              },
            },
            heroImage: {
              select: {
                id: true,
                imageUrl: true,
              },
            },
          }),
        },
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return {
      success: true,
      restaurants: restaurants as RestaurantInfo[],
      totalCount,
      page,
      totalPages,
    };
  } catch (error) {
    console.error('Error fetching paginated restaurants:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch restaurants',
    };
  }
}

