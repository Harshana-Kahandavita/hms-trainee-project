import { apiClient } from './api';

/**
 * Customer service for fetching customer data
 */

export interface Customer {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  createdAt: string;
  [key: string]: any; // Allow additional properties
}

export interface CustomerDetailsResponse {
  success: boolean;
  data?: Customer;
  error?: string;
}

const addCustomerBreadcrumb = (
  message: string,
  data?: Record<string, unknown>
) => {
  // TODO: Add Sentry breadcrumb if Sentry is integrated
  // Sentry.addBreadcrumb({
  //   category: 'customer_service',
  //   message,
  //   data,
  //   level: 'info',
  // });
  console.log(`[Customer Service] ${message}`, data || '');
};

const captureCustomerServiceError = (
  operation: string,
  error: unknown,
  data?: Record<string, unknown>
) => {
  const errorMessage = error instanceof Error ? error.message : `Customer service error: ${operation}`;
  console.error(`[Customer Service Error] ${operation}:`, errorMessage, data || '');
  
  // TODO: Add Sentry error capture if Sentry is integrated
  // const sentryError = error instanceof Error ? error : new Error(errorMessage);
  // Sentry.captureException(sentryError, {
  //   tags: {
  //     feature: 'customer',
  //     operation,
  //   },
  //   contexts: {
  //     customer_service: data,
  //   },
  //   level: 'error',
  // });
};

export interface UpdateCustomerEmailResponse {
  success: boolean;
  data?: Customer;
  message?: string;
  error?: string;
}

export const customerService = {
  /**
   * Get customer by ID
   * @param customerId - Customer ID
   * @returns Promise with customer details
   */
  async getCustomerById(customerId: number): Promise<CustomerDetailsResponse> {
    console.log(`👤 Fetching customer details for ID: ${customerId}`);
    addCustomerBreadcrumb('Fetching customer by ID', { customerId });
    
    try {
      const response = await apiClient.get(`/customer/${customerId}`);
      console.log('✅ Customer details fetched successfully', {
        customerId: response.data.data?.id,
        name: `${response.data.data?.firstName} ${response.data.data?.lastName}`,
      });
      return response.data;
    } catch (error) {
      console.error(`❌ Failed to fetch customer details`, error);
      captureCustomerServiceError('getCustomerById', error, { customerId });
      throw error;
    }
  },

  /**
   * Update customer email address by customer ID
   * @param customerId - Customer ID
   * @param emailAddress - New email address (can be null to clear email)
   * @returns Promise with updated customer details
   */
  async updateCustomerEmailAddress(
    customerId: number,
    emailAddress: string | null
  ): Promise<UpdateCustomerEmailResponse> {
    console.log(`📧 Updating customer email for ID: ${customerId}`);
    addCustomerBreadcrumb('Updating customer email', { customerId, emailAddress });
    
    try {
      const response = await apiClient.put(`/customer/${customerId}/email`, {
        emailAddress: emailAddress,
      });
      console.log('✅ Customer email updated successfully', {
        customerId: response.data.data?.id,
        email: response.data.data?.email,
      });
      return response.data;
    } catch (error) {
      console.error(`❌ Failed to update customer email`, error);
      captureCustomerServiceError('updateCustomerEmailAddress', error, { customerId, emailAddress });
      throw error;
    }
  },
};

