import { PrismaClient } from '../../prisma/generated/prisma';

export interface CustomerInfo {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  createdAt: Date;
}

export type GetCustomerByIdResult =
  | { success: true; customer: CustomerInfo }
  | { success: false; error: string };

export type UpdateCustomerEmailResult =
  | { success: true; customer: CustomerInfo }
  | { success: false; error: string };

/**
 * Fetch customer by ID
 * @param prisma - Prisma client instance
 * @param customerId - Customer ID to fetch
 * @returns Customer information
 */
export async function getCustomerById(
  prisma: PrismaClient,
  customerId: number
): Promise<GetCustomerByIdResult> {
  try {
    const customer = await prisma.customer.findUnique({
      where: {
        id: customerId,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        createdAt: true,
      },
    });

    if (!customer) {
      return {
        success: false,
        error: `Customer with ID ${customerId} not found`,
      };
    }

    return {
      success: true,
      customer: customer as CustomerInfo,
    };
  } catch (error) {
    console.error('Error fetching customer by ID:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch customer',
    };
  }
}

/**
 * Update customer email address by customer ID
 * @param prisma - Prisma client instance
 * @param customerId - Customer ID to update
 * @param emailAddress - New email address to set (can be null to clear email)
 * @returns Updated customer information
 */
export async function updateCustomerEmailAddress(
  prisma: PrismaClient,
  customerId: number,
  emailAddress: string | null
): Promise<UpdateCustomerEmailResult> {
  try {
    // First check if customer exists
    const existingCustomer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!existingCustomer) {
      return {
        success: false,
        error: `Customer with ID ${customerId} not found`,
      };
    }

    // Validate email format if provided
    if (emailAddress !== null && emailAddress.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailAddress.trim())) {
        return {
          success: false,
          error: 'Invalid email address format',
        };
      }
    }

    // Update customer email
    const updatedCustomer = await prisma.customer.update({
      where: {
        id: customerId,
      },
      data: {
        email: emailAddress && emailAddress.trim() !== '' ? emailAddress.trim() : null,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        createdAt: true,
      },
    });

    return {
      success: true,
      customer: updatedCustomer as CustomerInfo,
    };
  } catch (error) {
    console.error('Error updating customer email address:', error);
    
    // Handle Prisma errors
    if (error && typeof error === 'object' && 'code' in error) {
      const prismaError = error as any;
      
      // P2025: Record not found
      if (prismaError.code === 'P2025') {
        return {
          success: false,
          error: `Customer with ID ${customerId} not found`,
        };
      }
      
      // P2002: Unique constraint violation (email already exists)
      if (prismaError.code === 'P2002') {
        return {
          success: false,
          error: 'Email address is already in use by another customer',
        };
      }
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update customer email address',
    };
  }
}
