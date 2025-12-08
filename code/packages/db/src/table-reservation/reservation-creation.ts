import { PrismaClient } from '../../prisma/generated/prisma';
import { z } from 'zod';
import { createTableReservationRequest } from './request-management';
import { getOrCreateCustomer } from './customer-management';
import { resolvePreferredSectionId } from './section-management';

// Input validation schema for creating table reservation
export const CreateTableReservationInput = z.object({
  restaurantId: z.number().positive(),
  firstName: z.string().min(1),
  lastName: z.string(),
  phone: z.string().min(1),
  email: z.string().optional(),
  date: z.string().min(1),
  time: z.string().min(1),
  partySize: z.number().positive(),
  preferredArea: z.string().optional(),
  areaId: z.number().positive().optional(),
  estimatedTotalAmount: z.number().min(0),
  specialRequests: z.string().optional(),
  requiresAdvancePayment: z.boolean(),
  heldSlotId: z.number().positive(),
  createdBy: z.enum(['CUSTOMER', 'MERCHANT', 'MERCHANT_WALK_IN', 'SYSTEM']).optional().default('CUSTOMER'),
});

export type CreateTableReservationInputType = z.infer<typeof CreateTableReservationInput>;

export type CreateTableReservationResult = 
  | { success: true; requestId: number; tableDetailsId: number; customerId: number; isNewCustomer: boolean }
  | { success: false; error: string };

/**
 * Creates a table reservation with customer and section management
 * This function handles the complete flow of creating a table reservation:
 * 1. Get or create customer
 * 2. Resolve preferred section
 * 3. Parse date/time
 * 4. Create reservation request
 */
export async function createTableReservation(
  prisma: PrismaClient,
  input: CreateTableReservationInputType
): Promise<CreateTableReservationResult> {
  try {
    // Validate input
    const validatedInput = CreateTableReservationInput.parse(input);

    // Step 1: Get or create customer
    const customerResult = await getOrCreateCustomer(prisma, {
      firstName: validatedInput.firstName,
      lastName: validatedInput.lastName,
      phone: validatedInput.phone,
      email: validatedInput.email
    });

    if (!customerResult.success) {
      return {
        success: false,
        error: `Failed to get or create customer: ${(customerResult as { success: false; error: string }).error}`
      };
    }

    // Step 2: Resolve preferred section ID
    const sectionResult = await resolvePreferredSectionId(prisma, {
      restaurantId: validatedInput.restaurantId,
      areaId: validatedInput.areaId,
      preferredArea: validatedInput.preferredArea
    });

    if (sectionResult.error) {
      return {
        success: false,
        error: `Failed to resolve section: ${sectionResult.error}`
      };
    }

    // Step 3: Parse date and time
    const requestedDate = new Date(validatedInput.date);
    const [hours, minutes] = validatedInput.time.split(':').map(Number);
    const requestedTime = new Date(validatedInput.date);
    requestedTime.setHours(hours || 0, minutes || 0, 0, 0);

    // Step 4: Create reservation request
    const reservationResult = await createTableReservationRequest(prisma, {
      restaurantId: validatedInput.restaurantId,
      customerId: customerResult.customerId,
      requestName: `${validatedInput.firstName}${validatedInput.lastName ? ' ' + validatedInput.lastName : ''}`,
      contactPhone: validatedInput.phone,
      requestedDate: requestedDate,
      requestedTime: requestedTime,
      adultCount: validatedInput.partySize,
      childCount: 0, // Table reservations don't separate adults/children
      mealType: 'DINNER', // Default to DINNER for table reservations
      estimatedTotalAmount: validatedInput.estimatedTotalAmount,
      estimatedServiceCharge: 0,
      estimatedTaxAmount: 0,
      specialRequests: validatedInput.specialRequests,
      reservationType: 'TABLE_ONLY',
      requiresAdvancePayment: validatedInput.requiresAdvancePayment,
      preferredSectionId: sectionResult.sectionId,
      isFlexibleWithTable: true,
      isFlexibleWithSection: !sectionResult.sectionId,
      isFlexibleWithTime: false,
      heldSlotId: validatedInput.heldSlotId,
      createdBy: validatedInput.createdBy
    });

    if (!reservationResult.success) {
      return {
        success: false,
        error: `Failed to create reservation request: ${(reservationResult as { success: false; error: string }).error}`
      };
    }

    return {
      success: true,
      requestId: reservationResult.requestId,
      tableDetailsId: reservationResult.tableDetailsId,
      customerId: customerResult.customerId,
      isNewCustomer: customerResult.isNewCustomer
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.errors.map(e => e.message).join(', ')}`
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}
