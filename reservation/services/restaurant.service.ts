import { apiClient } from './api';

/**
 * Restaurant service for fetching restaurant data
 */

export interface Restaurant {
  id: number;
  name: string;
  description?: string;
  address?: string;
  contactNumber?: string;
  email?: string;
  imageUrl?: string;
  rating?: number;
  cuisineType?: string;
  priceRange?: string;
  openingHours?: string;
  [key: string]: any; // Allow additional properties
}

export interface RestaurantListResponse {
  success: boolean;
  data?: Restaurant[];
  totalCount?: number;
  error?: string;
}

export interface RestaurantDetailsResponse {
  success: boolean;
  data?: Restaurant;
  error?: string;
}

const addRestaurantBreadcrumb = (
  message: string,
  data?: Record<string, unknown>
) => {
  // TODO: Add Sentry breadcrumb if Sentry is integrated
  // Sentry.addBreadcrumb({
  //   category: 'restaurant_service',
  //   message,
  //   data,
  //   level: 'info',
  // });
  console.log(`[Restaurant Service] ${message}`, data || '');
};

const captureRestaurantServiceError = (
  operation: string,
  error: unknown,
  data?: Record<string, unknown>
) => {
  const errorMessage = error instanceof Error ? error.message : `Restaurant service error: ${operation}`;
  console.error(`[Restaurant Service Error] ${operation}:`, errorMessage, data || '');
  
  // TODO: Add Sentry error capture if Sentry is integrated
  // const sentryError = error instanceof Error ? error : new Error(errorMessage);
  // Sentry.captureException(sentryError, {
  //   tags: {
  //     feature: 'restaurant',
  //     operation,
  //   },
  //   contexts: {
  //     restaurant_service: data,
  //   },
  //   level: 'error',
  // });
};

export const restaurantService = {
  /**
   * Get list of all restaurants
   * @param params - Optional query parameters (e.g., search, filters)
   * @returns Promise with restaurant list
   */
  async getRestaurants(params?: {
    search?: string;
    cuisineType?: string;
    priceRange?: string;
    limit?: number;
    offset?: number;
  }): Promise<RestaurantListResponse> {
    console.log('🍽️ Fetching restaurant list', params || '');
    addRestaurantBreadcrumb('Fetching restaurant list', params);
    
    try {
      const response = await apiClient.get('/restaurants', { params });
      console.log('✅ Restaurant list fetched successfully', {
        count: response.data.data?.length || 0,
        totalCount: response.data.totalCount,
      });
      return response.data;
    } catch (error) {
      console.error('❌ Failed to fetch restaurant list', error);
      captureRestaurantServiceError('getRestaurants', error, params);
      throw error;
    }
  },

  /**
   * Get restaurant details by ID
   * @param restaurantId - Restaurant ID
   * @returns Promise with restaurant details
   */
  async getRestaurantById(restaurantId: number): Promise<RestaurantDetailsResponse> {
    console.log(`🍽️ Fetching restaurant details for ID: ${restaurantId}`);
    addRestaurantBreadcrumb('Fetching restaurant details', { restaurantId });
    
    try {
      const response = await apiClient.get(`/restaurants/${restaurantId}`);
      console.log('✅ Restaurant details fetched successfully', {
        restaurantId: response.data.data?.id,
        name: response.data.data?.name,
      });
      return response.data;
    } catch (error) {
      console.error(`❌ Failed to fetch restaurant details`, error);
      captureRestaurantServiceError('getRestaurantById', error, { restaurantId });
      throw error;
    }
  },

  /**
   * Search restaurants by query string
   * @param query - Search query
   * @param params - Optional additional parameters
   * @returns Promise with matching restaurants
   */
  async searchRestaurants(
    query: string,
    params?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<RestaurantListResponse> {
    console.log(`🔍 Searching restaurants with query: "${query}"`, params || '');
    addRestaurantBreadcrumb('Searching restaurants', { query, ...params });
    
    try {
      const response = await apiClient.get('/restaurants', {
        params: {
          search: query,
          ...params,
        },
      });
      console.log('✅ Restaurant search completed', {
        query,
        count: response.data.data?.length || 0,
        totalCount: response.data.totalCount,
      });
      return response.data;
    } catch (error) {
      console.error(`❌ Failed to search restaurants`, error);
      captureRestaurantServiceError('searchRestaurants', error, { query, ...params });
      throw error;
    }
  },
};

