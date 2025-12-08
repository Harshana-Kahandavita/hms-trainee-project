import { PrismaClient } from '../../prisma/generated/prisma';
import { z } from 'zod';

// Input validation schemas for customer operations
export const GetOrCreateCustomerInput = z.object({
  firstName: z.string().min(1),
  lastName: z.string(),
  phone: z.string().min(1),
  email: z.string().optional(),
});

export const CustomerEmailSchema = z.string().email({
  message: "Invalid email address"
});

export const CustomerPhoneSchema = z.string().min(1, {
  message: "Phone number is required"
});

export type GetOrCreateCustomerInputType = z.infer<typeof GetOrCreateCustomerInput>;

// Result types
export type GetOrCreateCustomerResult = 
  | { success: true; customerId: number; isNewCustomer: boolean }
  | { success: false; error: string };

export type GetOrCreateGenericWalkInCustomerResultType = 
  | { success: true; customerId: number }
  | { success: false; error: string };

export interface CustomerDetailsResult {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
}

export type CustomerByEmailResult = 
  | { success: true; data: CustomerDetailsResult }
  | { success: false; errorMsg: string };

export type CustomerByPhoneResult = CustomerByEmailResult;

/**
 * Gets or creates a customer based on phone number
 * If customer exists, returns existing customer
 * If customer doesn't exist, creates new customer with provided details
 */
export async function getOrCreateCustomer(
  prisma: PrismaClient,
  input: GetOrCreateCustomerInputType
): Promise<GetOrCreateCustomerResult> {
  try {
    // Validate input
    const validatedInput = GetOrCreateCustomerInput.parse(input);
    
    // First, try to find existing customer by phone
    const existingCustomer = await prisma.customer.findFirst({
      where: { phone: validatedInput.phone }
    });

    if (existingCustomer) {
      return {
        success: true,
        customerId: existingCustomer.id,
        isNewCustomer: false
      };
    }

    // Create new customer if not found
    const normalizedEmail = validatedInput.email && validatedInput.email.trim().length > 0 
      ? validatedInput.email.trim() 
      : null;

    const newCustomer = await prisma.customer.create({
      data: {
        firstName: validatedInput.firstName,
        lastName: validatedInput.lastName,
        phone: validatedInput.phone,
        email: normalizedEmail
      }
    });

    return {
      success: true,
      customerId: newCustomer.id,
      isNewCustomer: true
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.errors.map(e => e.message).join(', ')}`
      };
    }

    // Handle Prisma-specific errors
    if (error && typeof error === 'object' && 'code' in error) {
      const prismaError = error as any;
      
      switch (prismaError.code) {
        case 'P2002':
          return {
            success: false,
            error: 'Customer with this phone number or email already exists'
          };
        case 'P2003':
          return {
            success: false,
            error: 'Referenced data does not exist'
          };
        default:
          return {
            success: false,
            error: `Database error: ${prismaError.message || 'Unknown error'}`
          };
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Gets or creates a generic walk-in customer for table reservations
 * This customer is used when no specific customer details are provided for walk-in reservations
 */
export async function getOrCreateGenericWalkInCustomer(
  prisma: PrismaClient
): Promise<GetOrCreateGenericWalkInCustomerResultType> {
  try {
    // First, try to find an existing generic walk-in customer
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        phone: 'WALK-IN-GENERIC',
        firstName: 'Walk-in',
        lastName: 'Guest'
      }
    });

    if (existingCustomer) {
      return {
        success: true,
        customerId: existingCustomer.id
      };
    }

    // If no existing customer, create a new generic walk-in customer
    const newCustomer = await prisma.customer.create({
      data: {
        firstName: 'Walk-in',
        lastName: 'Guest',
        phone: 'WALK-IN-GENERIC',
        email: null // Generic customer has no email
      }
    });

    return {
      success: true,
      customerId: newCustomer.id
    };
  } catch (error) {
    // Handle Prisma-specific errors
    if (error && typeof error === 'object' && 'code' in error) {
      const prismaError = error as any;
      
      switch (prismaError.code) {
        case 'P2002':
          return {
            success: false,
            error: 'Generic walk-in customer already exists'
          };
        case 'P2003':
          return {
            success: false,
            error: 'Referenced data does not exist'
          };
        default:
          return {
            success: false,
            error: `Database error: ${prismaError.message || 'Unknown error'}`
          };
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get or create generic walk-in customer'
    };
  }
}

/**
 * Gets a customer by phone number
 */
export async function getCustomerByPhone(
  prisma: PrismaClient,
  phone: string
): Promise<CustomerByPhoneResult> {
  try {
    // Validate input
    const validationResult = CustomerPhoneSchema.safeParse(phone);
    if (!validationResult.success) {
      return {
        success: false,
        errorMsg: validationResult.error.errors[0]?.message || "Invalid phone number"
      };
    }

    const customer = await prisma.customer.findFirst({
      where: { phone: phone },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true
      }
    });

    if (!customer) {
      return {
        success: false,
        errorMsg: "Customer not found"
      };
    }

    return {
      success: true,
      data: {
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone
      }
    };
  } catch (error) {
    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : 'Failed to fetch customer details'
    };
  }
}

/**
 * Gets a customer by email address
 */
export async function getCustomerByEmail(
  prisma: PrismaClient,
  email: string
): Promise<CustomerByEmailResult> {
  try {
    // Validate input
    const validationResult = CustomerEmailSchema.safeParse(email);
    if (!validationResult.success) {
      return {
        success: false,
        errorMsg: validationResult.error.errors[0]?.message || "Invalid email address"
      };
    }

    const customer = await prisma.customer.findUnique({
      where: { email: email },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true
      }
    });

    if (!customer) {
      return {
        success: false,
        errorMsg: "Customer not found"
      };
    }

    return {
      success: true,
      data: {
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone
      }
    };
  } catch (error) {
    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : 'Failed to fetch customer details'
    };
  }
}
