import { apiClient } from './api';

/**
 * Reservation service for fetching reservation data
 */

export interface Reservation {
  id: number;
  reservationNumber: string;
  restaurantId: number;
  customerId: number;
  requestId: number;
  reservationName: string;
  contactPhone: string;
  reservationDate: string;
  reservationTime: string;
  adultCount: number;
  childCount: number;
  mealType: string;
  totalAmount: number;
  serviceCharge: number;
  taxAmount: number;
  advancePaymentAmount: number | null;
  remainingPaymentAmount: number | null;
  status: string;
  specialRequests: string | null;
  dietaryRequirements: string | null;
  occasion: string | null;
  reservationType: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  customer?: {
    id: number;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string;
  };
  restaurant?: {
    id: number;
    name: string;
    address: string;
  };
  [key: string]: any; // Allow additional properties
}

export interface ReservationListResponse {
  success: boolean;
  data?: Reservation[];
  totalCount?: number;
  error?: string;
}

export interface ReservationDetailsResponse {
  success: boolean;
  data?: Reservation;
  error?: string;
}

const addReservationBreadcrumb = (
  message: string,
  data?: Record<string, unknown>
) => {
  // TODO: Add Sentry breadcrumb if Sentry is integrated
  // Sentry.addBreadcrumb({
  //   category: 'reservation_service',
  //   message,
  //   data,
  //   level: 'info',
  // });
  console.log(`[Reservation Service] ${message}`, data || '');
};

const captureReservationServiceError = (
  operation: string,
  error: unknown,
  data?: Record<string, unknown>
) => {
  const errorMessage = error instanceof Error ? error.message : `Reservation service error: ${operation}`;
  console.error(`[Reservation Service Error] ${operation}:`, errorMessage, data || '');
  
  // TODO: Add Sentry error capture if Sentry is integrated
  // const sentryError = error instanceof Error ? error : new Error(errorMessage);
  // Sentry.captureException(sentryError, {
  //   tags: {
  //     feature: 'reservation',
  //     operation,
  //   },
  //   contexts: {
  //     reservation_service: data,
  //   },
  //   level: 'error',
  // });
};

export const reservationService = {
  /**
   * Get reservations by restaurant ID
   * @param restaurantId - Restaurant ID
   * @param params - Optional query parameters (status, date range, pagination)
   * @returns Promise with reservation list
   */
  async getReservationsByRestaurantId(
    restaurantId: number,
    params?: {
      status?: string;
      fromDate?: string;
      toDate?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<ReservationListResponse> {
    console.log(`📋 Fetching reservations for restaurant ID: ${restaurantId}`, params || '');
    addReservationBreadcrumb('Fetching reservations by restaurant ID', { restaurantId, ...params });
    
    try {
      const response = await apiClient.get(`/reservations/${restaurantId}`, { params });
      console.log('✅ Reservations fetched successfully', {
        restaurantId,
        count: response.data.data?.length || 0,
        totalCount: response.data.totalCount,
      });
      return response.data;
    } catch (error) {
      console.error(`❌ Failed to fetch reservations`, error);
      captureReservationServiceError('getReservationsByRestaurantId', error, { restaurantId, ...params });
      throw error;
    }
  },
};

