import {DayOfWeek, MealType, Prisma, PrismaClient} from '../prisma/generated/prisma';
import { format } from 'date-fns';
import { getRestaurantReviewStats } from './restaurant_review_stats';

export interface RestaurantSearchParams {
  date: string; // YYYY-MM-DD format
  mealType: MealType;
  partySize: number;
}

export interface RestaurantSearchParamsWithQuery extends RestaurantSearchParams {
  searchQuery: string;
}
export interface RestaurantSearchResult {
  id: number;
  name: string;
  address: string;
  description: string | null;
  thumbnailImageUrl: string | null;
  adultGrossPrice: number | null;
  businessName: string;
  averageRating: number;
  reservationSupport: string;
}

export type RestaurantSearchResponse = {
  success: true;
  restaurants: RestaurantSearchResult[];
} | {
  success: false;
  errorMsg: string;
};

export async function searchAvailableRestaurants(
  prisma: PrismaClient,
  params: RestaurantSearchParams
): Promise<RestaurantSearchResponse> {
  try {
    if (params.partySize <= 0) {
      return { success: true, restaurants: [] };
    }

    const requestDate = new Date(params.date);
    const dayOfWeek = format(requestDate, 'EEEE').toUpperCase() as keyof typeof DayOfWeek;

    // Execute raw query using Prisma - handle TABLE_ONLY restaurants differently
    const results = await prisma.$queryRaw<RestaurantSearchResult[]>(Prisma.sql`
      SELECT DISTINCT
          r.restaurant_id as id,
          r.name,
          r.address,
          r.description,
          ri.image_url as "thumbnailImageUrl",
          CASE
            WHEN r.reservation_support = 'TABLE_ONLY' THEN NULL
            ELSE COALESCE(rms.adult_gross_price, 0.00)
          END as "adultGrossPrice",
          b.name as "businessName",
          r.reservation_support as "reservationSupport"
      FROM
          restaurants r
          INNER JOIN business b
              ON r.business_id = b.business_id
          INNER JOIN restaurant_operating_hours roh
              ON r.restaurant_id = roh.restaurant_id
              AND roh.day_of_week::text = ${dayOfWeek}
              AND roh.is_open = true

          LEFT JOIN restaurant_meal_services rms
              ON r.restaurant_id = rms.restaurant_id
              AND rms.meal_type::text = ${params.mealType}
              AND rms.is_available = true
              AND r.reservation_support != 'TABLE_ONLY'

          LEFT JOIN restaurant_capacity rc
              ON r.restaurant_id = rc.restaurant_id
              AND rc.date = ${requestDate}::date
              AND (
                (r.reservation_support = 'TABLE_ONLY' AND rc.service_id IS NULL) OR
                (r.reservation_support != 'TABLE_ONLY' AND rc.service_id = rms.service_id)
              )
              AND (
                (r.reservation_support = 'TABLE_ONLY') OR
                (rc.total_seats - rc.booked_seats) >= ${params.partySize}
              )

          LEFT JOIN restaurant_images ri
              ON r.thumbnail_image_id = ri.image_id
      WHERE
          r.reservation_support IN ('BUFFET_ONLY', 'BOTH', 'TABLE_ONLY')
          AND NOT EXISTS (
              SELECT 1
              FROM restaurant_special_closures rsc
              WHERE r.restaurant_id = rsc.restaurant_id
              AND ${requestDate}::timestamp BETWEEN rsc.closure_start AND rsc.closure_end
          )`);

    // Fetch ratings for each restaurant
    const restaurantsWithRatings = await Promise.all(
      results.map(async (restaurant) => {
        // Get review stats for this restaurant
        const reviewStats = await getRestaurantReviewStats(prisma, restaurant.id);
        
        return {
          ...restaurant,
          adultGrossPrice: restaurant.adultGrossPrice ? Number(restaurant.adultGrossPrice) : null,
          averageRating: reviewStats ? reviewStats.avgServiceRating : 0
        };
      })
    );

    return {
      success: true,
      restaurants: restaurantsWithRatings
    };
  } catch (error) {
    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : 'Failed to search restaurants'
    };
  }
}

export async function searchAvailableRestaurantsWithQuery(
  prisma: PrismaClient,
  params: RestaurantSearchParamsWithQuery
): Promise<RestaurantSearchResponse> {
  try {
    if (params.partySize <= 0) {
      return { success: true, restaurants: [] };
    }

    const requestDate = new Date(params.date);
    const dayOfWeek = format(requestDate, 'EEEE').toUpperCase() as keyof typeof DayOfWeek;
    
    // Clean and normalize search term
    const searchTerm = params.searchQuery 
      ? `%${params.searchQuery
          .toLowerCase()
          .replace(/[^a-zA-Z0-9\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .split(' ')
          .join('%')}%`
      : null;

    // Execute raw query using Prisma with search conditions
    let query = Prisma.sql`
      WITH filtered_restaurants AS (
        SELECT DISTINCT r.*
        FROM restaurants r
        LEFT JOIN locations l ON r.location_id = l.location_id
        LEFT JOIN restaurant_cuisines rc ON r.restaurant_id = rc.restaurant_id
        LEFT JOIN cuisines c ON rc.cuisine_id = c.cuisine_id
        LEFT JOIN business b ON r.business_id = b.business_id
        WHERE 1=1
        ${searchTerm ? Prisma.sql`
          AND (
            LOWER(regexp_replace(r.name, '[^a-zA-Z0-9\s]', ' ', 'g')) LIKE ${searchTerm}
            OR LOWER(regexp_replace(l.city, '[^a-zA-Z0-9\s]', ' ', 'g')) LIKE ${searchTerm}
            OR LOWER(regexp_replace(l.state, '[^a-zA-Z0-9\s]', ' ', 'g')) LIKE ${searchTerm}
            OR LOWER(regexp_replace(c.cuisine_name, '[^a-zA-Z0-9\s]', ' ', 'g')) LIKE ${searchTerm}
            OR LOWER(regexp_replace(b.name, '[^a-zA-Z0-9\s]', ' ', 'g')) LIKE ${searchTerm}
          )
        ` : Prisma.sql``}
      )
      SELECT DISTINCT
          r.restaurant_id as id,
          r.name,
          r.address,
          r.description,
          ri.image_url as "thumbnailImageUrl",
          CASE
            WHEN r.reservation_support = 'TABLE_ONLY' THEN NULL
            ELSE COALESCE(rms.adult_gross_price, 0.00)
          END as "adultGrossPrice",
          b.name as "businessName",
          r.reservation_support as "reservationSupport"
      FROM
          filtered_restaurants r
          INNER JOIN business b
              ON r.business_id = b.business_id
          INNER JOIN restaurant_operating_hours roh
              ON r.restaurant_id = roh.restaurant_id
              AND roh.day_of_week::text = ${dayOfWeek}
              AND roh.is_open = true

          LEFT JOIN restaurant_meal_services rms
              ON r.restaurant_id = rms.restaurant_id
              AND rms.meal_type::text = ${params.mealType}
              AND rms.is_available = true
              AND r.reservation_support != 'TABLE_ONLY'

          LEFT JOIN restaurant_capacity rc
              ON r.restaurant_id = rc.restaurant_id
              AND rc.date = ${requestDate}::date
              AND (
                (r.reservation_support = 'TABLE_ONLY' AND rc.service_id IS NULL) OR
                (r.reservation_support != 'TABLE_ONLY' AND rc.service_id = rms.service_id)
              )
              AND (
                (r.reservation_support = 'TABLE_ONLY') OR
                (rc.total_seats - rc.booked_seats) >= ${params.partySize}
              )

          LEFT JOIN restaurant_images ri
              ON r.thumbnail_image_id = ri.image_id
      WHERE
          r.reservation_support IN ('BUFFET_ONLY', 'BOTH', 'TABLE_ONLY')
          AND NOT EXISTS (
              SELECT 1
              FROM restaurant_special_closures rsc
              WHERE r.restaurant_id = rsc.restaurant_id
              AND ${requestDate}::timestamp BETWEEN rsc.closure_start AND rsc.closure_end
          )`;

    const results = await prisma.$queryRaw<RestaurantSearchResult[]>(query);

    // Fetch ratings for each restaurant
    const restaurantsWithRatings = await Promise.all(
      results.map(async (restaurant) => {
        // Get review stats for this restaurant
        const reviewStats = await getRestaurantReviewStats(prisma, restaurant.id);
        
        return {
          ...restaurant,
          adultGrossPrice: restaurant.adultGrossPrice ? Number(restaurant.adultGrossPrice) : null,
          averageRating: reviewStats ? reviewStats.avgServiceRating : 0
        };
      })
    );

    return {
      success: true,
      restaurants: restaurantsWithRatings
    };
  } catch (error) {
    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : 'Failed to search restaurants'
    };
  }
}
