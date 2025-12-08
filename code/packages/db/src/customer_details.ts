import { PrismaClient } from "../prisma/generated/prisma";
import { z } from "zod";

// Input validation schemas
const CustomerEmailSchema = z.string().email({
  message: "Invalid email address"
});

const CustomerPhoneSchema = z.string().min(1, {
  message: "Phone number is required"
});

export interface CustomerDetailsResult {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
}

export type CustomerByEmailResponse = {
  success: true;
  data: CustomerDetailsResult;
} | {
  success: false;
  errorMsg: string;
};

export type CustomerByPhoneResponse = CustomerByEmailResponse;

export async function getCustomerByPhone(
  prisma: PrismaClient,
  phone: string
): Promise<CustomerByPhoneResponse> {
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
    console.error('Error fetching customer details:', error);
    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : 'Failed to fetch customer details'
    };
  }
}

export async function getCustomerByEmail(
  prisma: PrismaClient,
  email: string
): Promise<CustomerByEmailResponse> {
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
    console.error('Error fetching customer details:', error);
    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : 'Failed to fetch customer details'
    };
  }
} 