import { PrismaClient, ReservationType, ReservationRequestStatus, TableSlotStatus } from '../../prisma/generated/prisma';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { filterSlotsByDwellTimeConflicts, checkTableDwellTimeAvailability } from './availability';

// Input validation schema for creating table reservation request
export const CreateTableReservationRequestInput = z.object({
  restaurantId: z.number().positive(),
  customerId: z.number().positive(),
  requestName: z.string().min(1),
  contactPhone: z.string().min(1),
  requestedDate: z.date(),
  requestedTime: z.date(),
  adultCount: z.number().positive(),
  childCount: z.number().min(0),
  mealType: z.enum(['BREAKFAST', 'LUNCH', 'DINNER']),
  mealServiceId: z.number().positive().optional(),
  estimatedTotalAmount: z.number().min(0), // Allow 0 for table reservations
  estimatedServiceCharge: z.number().min(0),
  estimatedTaxAmount: z.number().min(0),
  specialRequests: z.string().optional(),
  dietaryRequirements: z.string().optional(),
  occasion: z.string().optional(),
  reservationType: z.nativeEnum(ReservationType).default(ReservationType.TABLE_ONLY),
  requiresAdvancePayment: z.boolean().default(true),
  promoCodeId: z.number().positive().optional(),
  estimatedDiscountAmount: z.number().min(0).optional(),
  eligiblePromoPartySize: z.number().positive().optional(),
  
  // Table-specific details
  preferredSectionId: z.number().positive().optional(),
  preferredTableId: z.number().positive().optional(),
  preferredTimeSlotStart: z.date().optional(),
  preferredTimeSlotEnd: z.date().optional(),
  isFlexibleWithTable: z.boolean().default(true),
  isFlexibleWithSection: z.boolean().default(true),
  isFlexibleWithTime: z.boolean().default(false),
  
  // Held slot ID - required for table reservations
  heldSlotId: z.number().positive(),
  
  // Creator tracking
  createdBy: z.enum(['CUSTOMER', 'MERCHANT', 'MERCHANT_WALK_IN', 'SYSTEM']).optional().default('CUSTOMER'),
});

export type CreateTableReservationRequestInputType = z.infer<typeof CreateTableReservationRequestInput>;

export type CreateTableReservationRequestResult = 
  | { success: true; requestId: number; tableDetailsId: number }
  | { success: false; error: string };

// Input validation schema for confirming table reservation
export const ConfirmTableReservationInput = z.object({
  requestId: z.number().positive(),
  // Table assignment details (can be auto-assigned if flexible)
  assignedSectionId: z.number().positive().optional(),
  assignedTableId: z.number().positive().optional(),
  slotId: z.number().positive().optional(),
  tableStartTime: z.date().optional(),
  tableEndTime: z.date().optional(),
  // Payment details (if payment was made)
  advancePaymentAmount: z.number().min(0).optional(),
  remainingPaymentAmount: z.number().min(0).optional(),
  // Reservation number (auto-generated if not provided)
  reservationNumber: z.string().optional(),
  // Reservation status (defaults to CONFIRMED)
  status: z.enum(['CONFIRMED', 'SEATED']).optional().default('CONFIRMED'),
});

export type ConfirmTableReservationInputType = z.infer<typeof ConfirmTableReservationInput>;

export type ConfirmTableReservationResult = 
  | { success: true; reservationId: number; assignmentId: number; slotId?: number }
  | { success: false; error: string };

/**
 * Validates slot availability and table capacity constraints
 */
async function validateSlotAvailabilityAndCapacity(
  prisma: PrismaClient,
  input: CreateTableReservationRequestInputType
): Promise<{ success: boolean; error?: string }> {
  const totalPartySize = input.adultCount + input.childCount;
  
  // If a specific table is preferred, validate it exists and has sufficient capacity
  if (input.preferredTableId) {
    const table = await prisma.restaurantTable.findFirst({
      where: {
        id: input.preferredTableId,
        restaurantId: input.restaurantId,
        isActive: true,
      },
    });

    if (!table) {
      return {
        success: false,
        error: 'Preferred table does not exist or is not active',
      };
    }

    // Capacity check removed - allow reservations regardless of table capacity

    // If specific time slot is provided, check slot availability
    if (input.preferredTimeSlotStart && input.preferredTimeSlotEnd) {
      const existingSlot = await prisma.tableAvailabilitySlot.findFirst({
        where: {
          tableId: input.preferredTableId,
          date: input.requestedDate,
          startTime: input.preferredTimeSlotStart,
          endTime: input.preferredTimeSlotEnd,
          OR: [
            { status: TableSlotStatus.RESERVED },
            { status: TableSlotStatus.BLOCKED },
            { status: TableSlotStatus.MAINTENANCE },
            {
              status: TableSlotStatus.HELD,
              holdExpiresAt: {
                gt: new Date() // Only consider non-expired holds
              }
            }
          ],
        },
      });

      if (existingSlot) {
        return {
          success: false,
          error: 'Preferred time slot is not available for the selected table',
        };
      }
    }
  }

  // If a specific section is preferred but no specific table, validate section exists
  if (input.preferredSectionId && !input.preferredTableId) {
    const section = await prisma.restaurantSection.findFirst({
      where: {
        id: input.preferredSectionId,
        restaurantId: input.restaurantId,
        isActive: true,
      },
    });

    if (!section) {
      return {
        success: false,
        error: 'Preferred section does not exist or is not active',
      };
    }

    // Check if there are any tables in the section with sufficient capacity
    const suitableTables = await prisma.restaurantTable.findMany({
      where: {
        sectionId: input.preferredSectionId,
        restaurantId: input.restaurantId,
        isActive: true,
        seatingCapacity: {
          gte: totalPartySize,
        },
      },
    });

    if (suitableTables.length === 0) {
      return {
        success: false,
        error: `No tables in the preferred section have sufficient capacity for party size (${totalPartySize})`,
      };
    }
  }

  // If no specific table or section is preferred, check if any suitable tables exist
  if (!input.preferredTableId && !input.preferredSectionId) {
    const suitableTables = await prisma.restaurantTable.findMany({
      where: {
        restaurantId: input.restaurantId,
        isActive: true,
        seatingCapacity: {
          gte: totalPartySize,
        },
      },
    });

    if (suitableTables.length === 0) {
      return {
        success: false,
        error: `No tables available with sufficient capacity for party size (${totalPartySize})`,
      };
    }
  }

  return { success: true };
}



/**
 * Check if a table has any overlapping reservations for the given time period
 * This function is exported for use in action layers
 */
export async function hasOverlappingReservations(
  prisma: PrismaClient,
  tableId: number,
  restaurantId: number,
  date: Date,
  startTime: Date
): Promise<boolean> {
  // Get restaurant's dwell time setting from config
  let config = await prisma.tableReservationUtilsConfiguration.findFirst({
    where: {
      restaurantId: restaurantId,
      isActive: true
    },
    select: { defaultDwellMinutes: true }
  });

  // If no restaurant-specific config, use platform default (restaurant_id IS NULL)
  if (!config) {
    config = await prisma.tableReservationUtilsConfiguration.findFirst({
      where: {
        restaurantId: null,
        isActive: true
      },
      select: { defaultDwellMinutes: true }
    });
  }

  const durationMinutes = config?.defaultDwellMinutes || 90;
  const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
  
  // Check for any RESERVED or HELD slots that overlap with our time period
  const overlappingSlots = await prisma.tableAvailabilitySlot.findMany({
    where: {
      tableId: tableId,
      date: date,
      status: {
        in: ['RESERVED', 'HELD']
      },
      // Time period overlap: our_start < their_end AND our_end > their_start
      AND: [
        {
          endTime: {
            gt: startTime // their end > our start
          }
        },
        {
          startTime: {
            lt: endTime // their start < our end
          }
        }
      ]
    }
  });

  return overlappingSlots.length > 0;
}

/**
 * Finds and holds the best available table slot for a reservation request
 * This is used when no specific table is preferred
 */
export async function findAndHoldBestTableSlot(
  prisma: PrismaClient,
  input: {
    restaurantId: number;
    date: Date;
    time: Date;
    partySize: number;
    preferredSectionId?: number;
    holdDurationMinutes?: number;
  }
): Promise<{ success: boolean; slotId?: number; tableId?: number; sectionId?: number; error?: string }> {
  try {
    const holdDurationMinutes = input.holdDurationMinutes || 10;
    const holdExpiresAt = new Date(Date.now() + holdDurationMinutes * 60 * 1000);
    const totalPartySize = input.partySize;

    // Build query for suitable tables
    const tableQuery: any = {
      restaurantId: input.restaurantId,
      isActive: true,
      seatingCapacity: {
        gte: totalPartySize,
      },
    };

    if (input.preferredSectionId) {
      tableQuery.sectionId = input.preferredSectionId;
    }

    const suitableTables = await prisma.restaurantTable.findMany({
      where: tableQuery,
      include: {
        section: true,
      },
      orderBy: [
        { seatingCapacity: 'asc' }, // Prefer smaller tables that fit the party
        { id: 'asc' }, // Consistent ordering
      ],
    });

    if (suitableTables.length === 0) {
      // Fallback: Search ALL available tables (regardless of size) for flexibility
      const allTableQuery: any = {
        restaurantId: input.restaurantId,
        isActive: true,
      };
      
      if (input.preferredSectionId) {
        allTableQuery.sectionId = input.preferredSectionId;
      }
      
      const allTables = await prisma.restaurantTable.findMany({
        where: allTableQuery,
        include: { section: true },
        orderBy: [
          { seatingCapacity: 'desc' }, // Prefer larger tables for better accommodation
          { id: 'asc' },
        ],
      });
      
      // Try to find available slots for any table (with overlap conflict checking)
      for (const table of allTables) {
        // First check if this table has any overlapping reservations
        const hasOverlap = await hasOverlappingReservations(
          prisma,
          table.id,
          input.restaurantId,
          input.date,
          input.time
        );

        if (hasOverlap) {
          // Skip this table - it has overlapping reservations
          console.log(`🚫 [OVERLAP-PREVENTION] Table ${table.id} skipped due to overlapping reservations (fallback)`, {
            tableId: table.id,
            requestedDate: input.date.toISOString(),
            requestedTime: input.time.toISOString(),
            restaurantId: input.restaurantId
          });
          continue;
        }

        const availableSlot = await prisma.tableAvailabilitySlot.findFirst({
          where: {
            tableId: table.id,
            date: input.date,
            startTime: input.time,
            status: TableSlotStatus.AVAILABLE,
          },
        });

        if (availableSlot) {
          // Check for dwell time conflicts before holding
          const validSlots = await filterSlotsByDwellTimeConflicts(
            prisma,
            input.restaurantId,
            input.date,
            [availableSlot]
          );

          if (validSlots.length > 0) {
            const updatedSlot = await prisma.tableAvailabilitySlot.update({
              where: { id: availableSlot.id },
              data: {
                status: TableSlotStatus.HELD,
                holdExpiresAt: holdExpiresAt,
              },
            });

            return {
              success: true,
              slotId: updatedSlot.id,
              tableId: table.id,
              sectionId: table.sectionId,
            };
          }
        }
      }
      
      return {
        success: false,
        error: 'No available table slots for the requested time',
      };
    }

    // Try to find an available slot for each table (with overlap conflict checking)
    for (const table of suitableTables) {
      // First check if this table has any overlapping reservations
      const hasOverlap = await hasOverlappingReservations(
        prisma,
        table.id,
        input.restaurantId,
        input.date,
        input.time
      );

      if (hasOverlap) {
        // Skip this table - it has overlapping reservations
        console.log(`🚫 [OVERLAP-PREVENTION] Table ${table.id} skipped due to overlapping reservations`, {
          tableId: table.id,
          requestedDate: input.date.toISOString(),
          requestedTime: input.time.toISOString(),
          restaurantId: input.restaurantId
        });
        continue;
      }

      const availableSlot = await prisma.tableAvailabilitySlot.findFirst({
        where: {
          tableId: table.id,
          date: input.date,
          startTime: input.time,
          status: TableSlotStatus.AVAILABLE,
        },
      });

      if (availableSlot) {
        // Check for dwell time conflicts before holding
        const validSlots = await filterSlotsByDwellTimeConflicts(
          prisma,
          input.restaurantId,
          input.date,
          [availableSlot]
        );

        if (validSlots.length > 0) {
          // Hold this slot
          const updatedSlot = await prisma.tableAvailabilitySlot.update({
            where: { id: availableSlot.id },
            data: {
              status: TableSlotStatus.HELD,
              holdExpiresAt: holdExpiresAt,
            },
          });

          return {
            success: true,
            slotId: updatedSlot.id,
            tableId: table.id,
            sectionId: table.sectionId,
          };
        }
      }
    }

    return {
      success: false,
      error: 'No available table slots for the requested time',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to find and hold table slot',
    };
  }
}

/**
 * Releases a held table slot
 * This is called when a hold expires or is cancelled
 */
export async function releaseTableSlot(
  prisma: PrismaClient,
  slotId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.tableAvailabilitySlot.update({
      where: { id: slotId },
      data: {
        status: TableSlotStatus.AVAILABLE,
        holdExpiresAt: null,
      },
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to release table slot',
    };
  }
}

/**
 * Validates that a held slot is still valid and can be used for reservation
 */
export async function validateHeldSlot(
  prisma: PrismaClient,
  slotId: number
): Promise<{ success: boolean; error?: string; slot?: any }> {
  try {
    const slot = await prisma.tableAvailabilitySlot.findUnique({
      where: { id: slotId },
      include: {
        table: {
          include: {
            section: true,
          },
        },
      },
    });

    if (!slot) {
      return {
        success: false,
        error: 'Table slot not found',
      };
    }

    if (slot.status !== TableSlotStatus.HELD) {
      return {
        success: false,
        error: 'Table slot is not in HELD status',
      };
    }

    if (slot.holdExpiresAt && slot.holdExpiresAt < new Date()) {
      return {
        success: false,
        error: 'Table slot hold has expired',
      };
    }

    return {
      success: true,
      slot,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate held slot',
    };
  }
}

/**
 * Generates a unique reservation number in format: RT-MMDD-XXXX
 * Where RT is prefix, MMDD is month and day, XXXX is random 4-digit number
 */
function generateReservationNumber(reservationDate: Date): string {
  // Format month and day as MMDD (e.g., 1025 for October 25)
  const month = String(reservationDate.getMonth() + 1).padStart(2, '0');
  const day = String(reservationDate.getDate()).padStart(2, '0');
  const dateString = `${month}${day}`;
  
  // Generate random 4-digit number (0000-9999)
  const random4Digits = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  
  return `RT-${dateString}-${random4Digits}`;
}

/**
 * Finds the best available table for flexible assignment
 */
async function findBestAvailableTable(
  prisma: PrismaClient,
  requestId: number,
  restaurantId: number,
  partySize: number,
  preferredSectionId?: number,
  preferredTimeSlotStart?: Date,
  preferredTimeSlotEnd?: Date
): Promise<{ tableId: number; sectionId: number; slotId?: number } | null> {
  // Get the request details
  const request = await prisma.reservationRequest.findUnique({
    where: { id: requestId },
    include: { tableDetails: true },
  });

  if (!request) {
    return null;
  }

  // Build the table query
  const tableQuery: any = {
    restaurantId,
    isActive: true,
    seatingCapacity: {
      gte: partySize,
    },
  };

  // If section is preferred, filter by section
  if (preferredSectionId) {
    tableQuery.sectionId = preferredSectionId;
  }

  // Get available tables
  const availableTables = await prisma.restaurantTable.findMany({
    where: tableQuery,
    include: {
      section: true,
      availability: {
        where: {
          date: request.requestedDate,
          OR: [
            { status: TableSlotStatus.AVAILABLE },
            {
              status: TableSlotStatus.HELD,
              holdExpiresAt: {
                lt: new Date() // Only expired holds
              }
            }
          ],
        },
      },
    },
    orderBy: [
      { seatingCapacity: 'asc' }, // Prefer smaller tables that fit the party
      { section: { displayOrder: 'asc' } },
      { tableName: 'asc' },
    ],
  });

  // Find the best table with available slot
  for (const table of availableTables) {
    // If specific time slot is preferred, check for that slot
    if (preferredTimeSlotStart && preferredTimeSlotEnd) {
      const slot = table.availability.find(slot => 
        slot.startTime.getTime() === preferredTimeSlotStart.getTime() &&
        slot.endTime.getTime() === preferredTimeSlotEnd.getTime()
      );
      
      if (slot) {
        return {
          tableId: table.id,
          sectionId: table.sectionId,
          slotId: slot.id,
        };
      }
    } else {
      // Take the first available slot
      const slot = table.availability[0];
      if (slot) {
        return {
          tableId: table.id,
          sectionId: table.sectionId,
          slotId: slot.id,
        };
      }
    }
  }

  // If no tables with existing slots are found, but we have suitable tables,
  // we can still assign a table (slot will be created during confirmation)
  if (availableTables.length > 0) {
    const bestTable = availableTables[0];
    if (bestTable) {
      return {
        tableId: bestTable.id,
        sectionId: bestTable.sectionId,
        // No slotId - will be created during confirmation
      };
    }
  }

  return null;
}

/**
 * Creates a table reservation request with associated table details
 * 
 * This function uses existing held table slots instead of creating new ones.
 * It validates that the held slot is still valid and creates both a ReservationRequest 
 * and ReservationRequestTableDetails in a single transaction.
 * 
 * @param prisma - Prisma client instance
 * @param input - Input data for creating the reservation request
 * @returns Result with request ID and table details ID on success, or error message on failure
 */
export async function createTableReservationRequest(
  prisma: PrismaClient,
  input: CreateTableReservationRequestInputType
): Promise<CreateTableReservationRequestResult> {
  try {
    // Validate input
    const validatedInput = CreateTableReservationRequestInput.parse(input);
    
    // Check if we have a held slot ID in the input
    if (!validatedInput.heldSlotId) {
      return {
        success: false,
        error: 'No held slot ID provided. Table slot must be held before creating reservation request.',
      };
    }

    // Validate that the held slot is still valid
    const slotValidation = await validateHeldSlot(prisma, validatedInput.heldSlotId);
    if (!slotValidation.success) {
      return {
        success: false,
        error: slotValidation.error!,
      };
    }

    const heldSlot = slotValidation.slot!;
    const totalPartySize = validatedInput.adultCount + validatedInput.childCount;

    // Capacity check removed - allow reservations regardless of table capacity

    // Validate that the held slot matches the requested time
    // Compare only the time portion (hours and minutes) to avoid timezone issues
    const heldSlotTime = heldSlot.startTime.getHours() * 60 + heldSlot.startTime.getMinutes();
    const requestedTime = validatedInput.requestedTime.getHours() * 60 + validatedInput.requestedTime.getMinutes();
    
    console.log('Time comparison debug:', {
      heldSlotStartTime: heldSlot.startTime.toISOString(),
      requestedTime: validatedInput.requestedTime.toISOString(),
      heldSlotTimeMinutes: heldSlotTime,
      requestedTimeMinutes: requestedTime,
      heldSlotTimeString: heldSlot.startTime.toTimeString(),
      requestedTimeString: validatedInput.requestedTime.toTimeString()
    });
    
    if (heldSlotTime !== requestedTime) {
      return {
        success: false,
        error: `Held slot time does not match requested time. Held: ${heldSlot.startTime.toTimeString()}, Requested: ${validatedInput.requestedTime.toTimeString()}`,
      };
    }

    // Validate that the held slot matches the requested date
    // Compare only the date portion (year, month, day) to avoid timezone issues
    const heldSlotDate = heldSlot.date.getFullYear() * 10000 + (heldSlot.date.getMonth() + 1) * 100 + heldSlot.date.getDate();
    const requestedDate = validatedInput.requestedDate.getFullYear() * 10000 + (validatedInput.requestedDate.getMonth() + 1) * 100 + validatedInput.requestedDate.getDate();
    
    if (heldSlotDate !== requestedDate) {
      return {
        success: false,
        error: `Held slot date does not match requested date. Held: ${heldSlot.date.toDateString()}, Requested: ${validatedInput.requestedDate.toDateString()}`,
      };
    }
    
    // Use transaction to ensure both records are created atomically
    const result = await prisma.$transaction(async (tx) => {
      // Create the main reservation request
      const reservationRequest = await tx.reservationRequest.create({
        data: {
          restaurantId: validatedInput.restaurantId,
          customerId: validatedInput.customerId,
          requestName: validatedInput.requestName,
          contactPhone: validatedInput.contactPhone,
          requestedDate: validatedInput.requestedDate,
          requestedTime: validatedInput.requestedTime,
          adultCount: validatedInput.adultCount,
          childCount: validatedInput.childCount,
          mealType: validatedInput.mealType,
          mealServiceId: validatedInput.mealServiceId,
          estimatedTotalAmount: validatedInput.estimatedTotalAmount,
          estimatedServiceCharge: validatedInput.estimatedServiceCharge,
          estimatedTaxAmount: validatedInput.estimatedTaxAmount,
          specialRequests: validatedInput.specialRequests,
          dietaryRequirements: validatedInput.dietaryRequirements,
          occasion: validatedInput.occasion,
          reservationType: validatedInput.reservationType,
          requiresAdvancePayment: validatedInput.requiresAdvancePayment,
          promoCodeId: validatedInput.promoCodeId,
          estimatedDiscountAmount: validatedInput.estimatedDiscountAmount,
          eligiblePromoPartySize: validatedInput.eligiblePromoPartySize,
          status: ReservationRequestStatus.PENDING,
          createdBy: validatedInput.createdBy || 'CUSTOMER',
        },
      });

      // Create the table details using the held slot information
      const tableDetails = await tx.reservationRequestTableDetails.create({
        data: {
          requestId: reservationRequest.id,
          preferredSectionId: heldSlot.table.sectionId,
          preferredTableId: heldSlot.tableId,
          preferredTimeSlotStart: heldSlot.startTime,
          preferredTimeSlotEnd: heldSlot.endTime,
          isFlexibleWithTable: validatedInput.isFlexibleWithTable,
          isFlexibleWithSection: validatedInput.isFlexibleWithSection,
          isFlexibleWithTime: validatedInput.isFlexibleWithTime,
        },
      });

      // Create a hold record linking the request to the held slot
      await tx.reservationTableHold.create({
        data: {
          requestId: reservationRequest.id,
          slotId: validatedInput.heldSlotId,
          holdExpiresAt: heldSlot.holdExpiresAt!,
        },
      });

      return {
        requestId: reservationRequest.id,
        tableDetailsId: tableDetails.requestId, // This is the same as requestId since it's the primary key
      };
    });

    return {
      success: true,
      requestId: result.requestId,
      tableDetailsId: result.tableDetailsId,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.errors.map(e => e.message).join(', ')}`,
      };
    }

    // Handle Prisma-specific errors
    if (error && typeof error === 'object' && 'code' in error) {
      const prismaError = error as any;
      
      switch (prismaError.code) {
        case 'P2002':
          return {
            success: false,
            error: 'A reservation request with these details already exists',
          };
        case 'P2003':
          return {
            success: false,
            error: 'Referenced restaurant, customer, section, table, or meal service does not exist',
          };
        case 'P2025':
          return {
            success: false,
            error: 'Referenced record not found',
          };
        default:
          return {
            success: false,
            error: `Database error: ${prismaError.message || 'Unknown error'}`,
          };
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Confirms a table reservation request by creating a reservation and table assignment
 * 
 * This function handles the final confirmation step where a reservation request
 * is converted into an actual reservation with table assignment. It supports
 * flexible assignment when no specific table was selected.
 * 
 * @param prisma - Prisma client instance
 * @param input - Input data for confirming the reservation
 * @returns Result with reservation ID and assignment ID on success, or error message on failure
 */
export async function confirmTableReservation(
  prisma: PrismaClient,
  input: ConfirmTableReservationInputType
): Promise<ConfirmTableReservationResult> {
  try {
    console.log('🚀 [CONFIRM-TABLE-RESERVATION] Function called with input:', {
      requestId: input.requestId,
      status: input.status,
      advancePaymentAmount: input.advancePaymentAmount,
      remainingPaymentAmount: input.remainingPaymentAmount
    });

    // Validate input
    const validatedInput = ConfirmTableReservationInput.parse(input);
    
    const result = await prisma.$transaction(async (tx) => {
      // Get the reservation request with table details
      const request = await tx.reservationRequest.findUnique({
        where: { id: validatedInput.requestId },
        include: { tableDetails: true },
      });

      if (!request) {
        throw new Error('Reservation request not found');
      }

      console.log('📋 [CONFIRM-TABLE-RESERVATION] Request data retrieved:', {
        requestId: request.id,
        reservationType: request.reservationType,
        requestedDate: request.requestedDate,
        requestedTime: request.requestedTime,
        mealType: request.mealType,
        adultCount: request.adultCount,
        childCount: request.childCount
      });

      if (request.status !== ReservationRequestStatus.PENDING) {
        throw new Error(`Cannot confirm reservation request with status: ${request.status}`);
      }

      // Determine table assignment
      let assignedTableId = validatedInput.assignedTableId;
      let assignedSectionId = validatedInput.assignedSectionId;
      let slotId = validatedInput.slotId;
      let tableStartTime = validatedInput.tableStartTime;
      let tableEndTime = validatedInput.tableEndTime;

      // If no specific assignment provided, find the best available table
      if (!assignedTableId && !assignedSectionId) {
        const totalPartySize = request.adultCount + request.childCount;
        const bestTable = await findBestAvailableTable(
          prisma,
          request.id,
          request.restaurantId,
          totalPartySize,
          request.tableDetails?.preferredSectionId || undefined,
          request.tableDetails?.preferredTimeSlotStart || undefined,
          request.tableDetails?.preferredTimeSlotEnd || undefined
        );

        if (!bestTable) {
          throw new Error('No suitable table available for assignment');
        }

        assignedTableId = bestTable.tableId;
        assignedSectionId = bestTable.sectionId;
        slotId = bestTable.slotId;
      }

      // Get the held slot from the reservation request
      const heldSlot = await tx.reservationTableHold.findFirst({
        where: { requestId: request.id },
        include: {
          slot: {
            include: {
              table: {
                include: {
                  section: true,
                },
              },
            },
          },
        },
      });

      if (!heldSlot) {
        throw new Error('No held slot found for this reservation request');
      }

      // Validate that the held slot is still valid
      if (heldSlot.slot.status !== TableSlotStatus.HELD) {
        throw new Error('Held slot is no longer in HELD status');
      }

      if (heldSlot.holdExpiresAt && heldSlot.holdExpiresAt < new Date()) {
        throw new Error('Held slot has expired');
      }

      // Use the held slot information
      slotId = heldSlot.slotId;
      assignedTableId = heldSlot.slot.tableId;
      assignedSectionId = heldSlot.slot.table.sectionId;
      tableStartTime = heldSlot.slot.startTime;
      tableEndTime = heldSlot.slot.endTime;

      // Generate reservation number if not provided
      const reservationNumber = validatedInput.reservationNumber || generateReservationNumber(request.requestedDate);

      // Validate reservation type for table reservations
      if (request.reservationType === 'BUFFET_ONLY') {
        console.warn('⚠️ [CONFIRM-TABLE-RESERVATION] Table reservation request has BUFFET_ONLY type, this should not happen', {
          requestId: request.id,
          reservationType: request.reservationType,
          requestedDate: request.requestedDate,
          requestedTime: request.requestedTime
        });
      }

      // Log reservation data before creation
      console.log('📋 [CONFIRM-TABLE-RESERVATION] Creating reservation with data:', {
        requestId: request.id,
        reservationType: request.reservationType,
        requestedDate: request.requestedDate,
        requestedTime: request.requestedTime,
        mealType: request.mealType,
        adultCount: request.adultCount,
        childCount: request.childCount
      });

      // Create the reservation
      const reservation = await tx.reservation.create({
        data: {
          reservationNumber,
          restaurantId: request.restaurantId,
          customerId: request.customerId,
          requestId: request.id,
          reservationName: request.requestName,
          contactPhone: request.contactPhone,
          reservationDate: request.requestedDate,
          reservationTime: request.requestedTime,
          adultCount: request.adultCount,
          childCount: request.childCount,
          mealType: request.mealType,
          totalAmount: request.estimatedTotalAmount,
          serviceCharge: request.estimatedServiceCharge,
          taxAmount: request.estimatedTaxAmount,
          advancePaymentAmount: validatedInput.advancePaymentAmount,
          remainingPaymentAmount: validatedInput.remainingPaymentAmount,
          status: validatedInput.status,
          specialRequests: request.specialRequests,
          dietaryRequirements: request.dietaryRequirements,
          occasion: request.occasion,
          reservationType: request.reservationType,
          promoCodeId: request.promoCodeId,
          discountAmount: request.estimatedDiscountAmount,
          createdBy: request.createdBy, // Preserve the createdBy value from the request
        },
      });

      // Log created reservation data for verification
      console.log('✅ [CONFIRM-TABLE-RESERVATION] Reservation created successfully:', {
        reservationId: reservation.id,
        reservationNumber: reservation.reservationNumber,
        reservationType: reservation.reservationType,
        reservationDate: reservation.reservationDate,
        reservationTime: reservation.reservationTime,
        mealType: reservation.mealType,
        adultCount: reservation.adultCount,
        childCount: reservation.childCount
      });

      // Create financial data for the reservation
      const totalAmount = request.estimatedTotalAmount.toNumber();
      const serviceCharge = request.estimatedServiceCharge?.toNumber() || 0;
      const taxAmount = request.estimatedTaxAmount?.toNumber() || 0;
      const discount = request.estimatedDiscountAmount?.toNumber() || 0;

      const netAmount = totalAmount - serviceCharge - taxAmount;
      const totalBeforeDiscount = netAmount + discount;
      const totalAfterDiscount = totalAmount;
      const advancePayment = validatedInput.advancePaymentAmount || 0;
      const balanceDue = totalAfterDiscount - advancePayment;
      const isPaid = balanceDue <= 0;

      console.log('💰 [CONFIRM-TABLE-RESERVATION] Creating financial data:', {
        reservationId: reservation.id,
        netAmount,
        serviceCharge,
        taxAmount,
        totalBeforeDiscount,
        discount,
        totalAfterDiscount,
        advancePayment,
        balanceDue,
        isPaid
      });

      await tx.reservationFinancialData.create({
        data: {
          reservationId: reservation.id,
          netBuffetPrice: netAmount,
          taxAmount,
          serviceCharge,
          totalBeforeDiscount,
          discount,
          totalAfterDiscount,
          advancePayment,
          balanceDue,
          isPaid
        }
      });

      // Create the table assignment
      const tableAssignment = await tx.reservationTableAssignment.create({
        data: {
          reservationId: reservation.id,
          assignedSectionId,
          assignedTableId,
          slotId,
          tableStartTime: tableStartTime || request.requestedTime,
          tableEndTime: tableEndTime || new Date(new Date(request.requestedTime).getTime() + 90 * 60000),
        },
      });

      // Update the slot status to RESERVED and link to reservation
      if (slotId) {
        await tx.tableAvailabilitySlot.update({
          where: { id: slotId },
          data: {
            status: TableSlotStatus.RESERVED,
            reservationId: reservation.id,
            holdExpiresAt: null, // Clear any hold expiration
          },
        });

        // Remove any hold records for this slot
        await tx.reservationTableHold.deleteMany({
          where: { slotId },
        });
      }

      // Update the request status to CONFIRMED
      await tx.reservationRequest.update({
        where: { id: request.id },
        data: { status: ReservationRequestStatus.CONFIRMED },
      });

      // Create status history entry
      await tx.reservationRequestStatusHistory.create({
        data: {
          requestId: request.id,
          previousStatus: request.status,
          newStatus: ReservationRequestStatus.CONFIRMED,
          changeReason: 'Reservation confirmed with table assignment',
          statusChangedAt: new Date(),
          changedBy: 'SYSTEM',
        },
      });

      return {
        reservationId: reservation.id,
        assignmentId: tableAssignment.reservationId, // This is the same as reservationId since it's the primary key
        slotId,
      };
    });

    return {
      success: true,
      reservationId: result.reservationId,
      assignmentId: result.assignmentId,
      slotId: result.slotId,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.errors.map(e => e.message).join(', ')}`,
      };
    }

    // Handle Prisma-specific errors
    if (error && typeof error === 'object' && 'code' in error) {
      const prismaError = error as any;
      
      switch (prismaError.code) {
        case 'P2002':
          return {
            success: false,
            error: 'A reservation with this number already exists',
          };
        case 'P2003':
          return {
            success: false,
            error: 'Referenced table, section, or slot does not exist',
          };
        case 'P2025':
          return {
            success: false,
            error: 'Referenced record not found',
          };
        default:
          return {
            success: false,
            error: `Database error: ${prismaError.message || 'Unknown error'}`,
          };
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Reassigns a table reservation to a different table
 * This function removes the current table assignment, frees up the previous slot,
 * and assigns the reservation to a new table slot
 * 
 * @param prisma - Prisma client instance
 * @param input - Input data for reassigning the table
 * @returns Result with new assignment details on success, or error message on failure
 */
export async function reassignTableReservation(
  prisma: PrismaClient,
  input: {
    reservationId: number;
    newTableId?: number;
    newSectionId?: number;
    newSlotId?: number;
    newStartTime?: Date;
    newEndTime?: Date;
    reassignedBy: string;
    reassignmentReason?: string;
  }
): Promise<{
  success: boolean;
  newAssignmentId?: number;
  newSlotId?: number;
  error?: string;
}> {
  try {
    return await prisma.$transaction(async (tx) => {
      // Get the current reservation with its table assignment
      const reservation = await tx.reservation.findUnique({
        where: { id: input.reservationId },
        include: {
          tableAssignment: {
            include: {
              slot: true,
              assignedTable: true,
              assignedSection: true,
            },
          },
        },
      });

      if (!reservation) {
        throw new Error('Reservation not found');
      }

      if (!reservation.tableAssignment) {
        throw new Error('Reservation does not have a table assignment');
      }

      const currentAssignment = reservation.tableAssignment;
      const currentSlot = currentAssignment.slot;

      // Validate that we have enough information to make the reassignment
      if (!input.newTableId && !input.newSectionId && !input.newSlotId) {
        throw new Error('Must provide either newTableId, newSectionId, or newSlotId for reassignment');
      }

      let newSlotId = input.newSlotId;
      let newTableId = input.newTableId;
      let newSectionId = input.newSectionId;
      let newStartTime = input.newStartTime;
      let newEndTime = input.newEndTime;

      // If we have a new table but no slot, find or create a slot for that table
      if (newTableId && !newSlotId) {
        // First validate that the table exists and has sufficient capacity
        const newTable = await tx.restaurantTable.findUnique({
          where: { id: newTableId },
        });

        if (!newTable) {
          throw new Error('New table not found');
        }

        // Capacity check removed - allow reservations regardless of table capacity

        // Set the section ID from the table
        newSectionId = newTable.sectionId;

        // Check if there are any conflicting reserved slots for this table and time
        const conflictingSlot = await tx.tableAvailabilitySlot.findFirst({
          where: {
            tableId: newTableId,
            date: reservation.reservationDate,
            startTime: newStartTime || reservation.reservationTime,
            status: TableSlotStatus.RESERVED,
            reservationId: {
              not: reservation.id // Exclude current reservation's slots
            }
          },
        });

        if (conflictingSlot) {
          throw new Error(`Table is already reserved by another reservation for this time slot`);
        }

        // ✅ NEW: Check dwelling time conflicts for the new table
        const reassignmentStartTime = newStartTime || reservation.reservationTime;
        const reassignmentEndTime = newEndTime || new Date(
          reassignmentStartTime.getTime() + 90 * 60 * 1000 // Default 90min slot if not provided
        );

        const dwellTimeCheck = await checkTableDwellTimeAvailability(
          prisma,
          reservation.restaurantId,
          newTableId,
          reservation.reservationDate,
          reassignmentStartTime,
          reassignmentEndTime,
          tx
        );

        if (!dwellTimeCheck.isAvailable) {
          const effectiveEndTime = dwellTimeCheck.conflictingReservations?.[0]?.effectiveEndTime;
          const formattedEndTime = effectiveEndTime
            ? new Date(effectiveEndTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
            : 'unknown time';

          throw new Error(
            `Table is still occupied by previous reservation until ${formattedEndTime} (dwelling time: ${dwellTimeCheck.dwellTimeMinutes} minutes). Cannot reassign during this period.`
          );
        }

        const newSlot = await tx.tableAvailabilitySlot.findFirst({
          where: {
            tableId: newTableId,
            date: reservation.reservationDate,
            startTime: newStartTime || reservation.reservationTime,
            status: TableSlotStatus.AVAILABLE,
          },
        });

        if (newSlot) {
          newSlotId = newSlot.id;
          newStartTime = newSlot.startTime;
          newEndTime = newSlot.endTime;
        } else {
          // Check if there's already a slot for this table and time (even if not available)
          const existingSlot = await tx.tableAvailabilitySlot.findFirst({
            where: {
              tableId: newTableId,
              date: reservation.reservationDate,
              startTime: newStartTime || reservation.reservationTime,
            },
          });

          if (existingSlot && existingSlot.status === TableSlotStatus.RESERVED && existingSlot.reservationId !== reservation.id) {
            throw new Error(`Table is already reserved by another reservation for this time slot`);
          }

          // Create a new slot for the new table
          const createdSlot = await tx.tableAvailabilitySlot.create({
            data: {
              restaurantId: reservation.restaurantId,
              tableId: newTableId,
              date: reservation.reservationDate,
              startTime: newStartTime || reservation.reservationTime,
              endTime: newEndTime || new Date(new Date(reservation.reservationTime).getTime() + 90 * 60000), // Default 90 minutes
              status: TableSlotStatus.RESERVED,
              reservationId: reservation.id,
            },
          });
          newSlotId = createdSlot.id;
          newStartTime = createdSlot.startTime;
          newEndTime = createdSlot.endTime;
        }
      }

      // If we have a new slot, get the table and section information
      if (newSlotId && !newTableId) {
        const newSlot = await tx.tableAvailabilitySlot.findUnique({
          where: { id: newSlotId },
          include: {
            table: {
              include: {
                section: true,
              },
            },
          },
        });

        if (!newSlot) {
          throw new Error('New slot not found');
        }

        if (newSlot.status !== TableSlotStatus.AVAILABLE) {
          throw new Error(`New slot is not available. Current status: ${newSlot.status}`);
        }

        newTableId = newSlot.tableId;
        newSectionId = newSlot.table.sectionId;
        newStartTime = newSlot.startTime;
        newEndTime = newSlot.endTime;

        // ✅ NEW: Check dwelling time conflicts for the table from the slot
        const dwellTimeCheck = await checkTableDwellTimeAvailability(
          prisma,
          reservation.restaurantId,
          newTableId,
          reservation.reservationDate,
          newStartTime,
          newEndTime,
          tx
        );

        if (!dwellTimeCheck.isAvailable) {
          const effectiveEndTime = dwellTimeCheck.conflictingReservations?.[0]?.effectiveEndTime;
          const formattedEndTime = effectiveEndTime
            ? new Date(effectiveEndTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
            : 'unknown time';

          throw new Error(
            `Table is still occupied by previous reservation until ${formattedEndTime} (dwelling time: ${dwellTimeCheck.dwellTimeMinutes} minutes). Cannot reassign during this period.`
          );
        }
      }

      // Validate that the new table has sufficient capacity (for cases where we have newSlotId but not newTableId)
      if (newTableId && !newSlotId) {
        const newTable = await tx.restaurantTable.findUnique({
          where: { id: newTableId },
        });

        if (!newTable) {
          throw new Error('New table not found');
        }

        // Capacity check removed - allow reservations regardless of table capacity
      }

      // Free up the current slot
      if (currentSlot) {
        await tx.tableAvailabilitySlot.update({
          where: { id: currentSlot.id },
          data: {
            status: TableSlotStatus.AVAILABLE,
            reservationId: null,
            holdExpiresAt: null,
          },
        });

        // Remove any hold records for the current slot
        await tx.reservationTableHold.deleteMany({
          where: { slotId: currentSlot.id },
        });
      }

      // Reserve the new slot
      if (newSlotId) {
        await tx.tableAvailabilitySlot.update({
          where: { id: newSlotId },
          data: {
            status: TableSlotStatus.RESERVED,
            reservationId: reservation.id,
            holdExpiresAt: null,
          },
        });
      }

      // Update the table assignment
      const updatedAssignment = await tx.reservationTableAssignment.update({
        where: { reservationId: reservation.id },
        data: {
          assignedTableId: newTableId,
          assignedSectionId: newSectionId,
          slotId: newSlotId,
          tableStartTime: newStartTime,
          tableEndTime: newEndTime,
        },
      });

      // Create a modification history entry
      // Note: We skip creating modification history for table reassignments since they don't involve a modification request
      // The reassignment is tracked through the table assignment changes and reservation modification timestamps

      // Update the reservation's last modification info
      await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          lastModifiedAt: new Date(),
          lastModifiedBy: input.reassignedBy,
        },
      });

      return {
        success: true,
        newAssignmentId: updatedAssignment.reservationId,
        newSlotId: newSlotId,
      };
    });
  } catch (error) {
    if (error instanceof Error) {
      return {
        success: false,
        error: `Failed to reassign table reservation: ${error.message}`,
      };
    }
    return {
      success: false,
      error: 'Failed to reassign table reservation: Unknown error',
    };
  }
}

/**
 * Updates table reservation details including party size, seating area, and table assignment
 * @param prisma - Prisma client instance
 * @param input - Input data for updating the reservation details
 * @returns Result with updated reservation details on success, or error message on failure
 */
export async function updateTableReservationDetails(
  prisma: PrismaClient,
  input: {
    reservationId: number;
    newAdultCount?: number;
    newChildCount?: number;
    newSectionId?: number;
    newTableId?: number;
    updatedBy: string;
    updateReason?: string;
  }
): Promise<{
  success: boolean;
  updatedReservation?: any;
  error?: string;
}> {
  try {
    return await prisma.$transaction(async (tx) => {
      // Get the current reservation with its table assignment
      const reservation = await tx.reservation.findUnique({
        where: { id: input.reservationId },
        include: {
          tableAssignment: {
            include: {
              slot: true,
              assignedTable: true,
              assignedSection: true,
            },
          },
          request: {
            include: {
              mealService: true,
            },
          },
        },
      });

      if (!reservation) {
        throw new Error('Reservation not found');
      }

      const currentAssignment = reservation.tableAssignment;
      const currentSlot = currentAssignment?.slot;
      const mealService = reservation.request.mealService;

      if (!mealService) {
        throw new Error('Meal service not found for reservation');
      }

      // Calculate new party size
      const newAdultCount = input.newAdultCount ?? reservation.adultCount;
      const newChildCount = input.newChildCount ?? reservation.childCount;
      const newPartySize = newAdultCount + newChildCount;
      const oldPartySize = reservation.adultCount + reservation.childCount;

      // Validate party size changes
      if (newPartySize <= 0) {
        throw new Error('Party size must be greater than 0');
      }

      // If changing table, validate capacity
      if (input.newTableId && input.newTableId !== currentAssignment?.assignedTableId) {
        const newTable = await tx.restaurantTable.findUnique({
          where: { id: input.newTableId },
        });

        if (!newTable) {
          throw new Error('New table not found');
        }

        // Capacity check removed - allow reservations regardless of table capacity
      }

      // Calculate new pricing if party size changed
      let newTotalAmount = reservation.totalAmount;
      let newServiceCharge = reservation.serviceCharge;
      let newTaxAmount = reservation.taxAmount;

      if (newPartySize !== oldPartySize) {
        // Recalculate pricing based on new party size
        const adultPrice = Number(mealService.adultNetPrice);
        const childPrice = Number(mealService.childNetPrice);
        
        newTotalAmount = new Decimal((adultPrice * newAdultCount) + (childPrice * newChildCount));
        newServiceCharge = new Decimal(Number(newTotalAmount) * Number(mealService.serviceChargePercentage) / 100);
        newTaxAmount = new Decimal(Number(newTotalAmount) * Number(mealService.taxPercentage) / 100);
      }

      // Update the reservation
      const updatedReservation = await tx.reservation.update({
        where: { id: input.reservationId },
        data: {
          adultCount: newAdultCount,
          childCount: newChildCount,
          totalAmount: newTotalAmount,
          serviceCharge: newServiceCharge,
          taxAmount: newTaxAmount,
          lastModifiedAt: new Date(),
          lastModifiedBy: input.updatedBy,
        },
        include: {
          tableAssignment: {
            include: {
              slot: true,
              assignedTable: true,
              assignedSection: true,
            },
          },
        },
      });

      // Update table assignment if needed
      if (input.newSectionId || input.newTableId) {
        let newSlotId = currentSlot?.id;
        let newTableId = input.newTableId ?? currentAssignment?.assignedTableId;
        let newSectionId = input.newSectionId ?? currentAssignment?.assignedSectionId;

        // If changing section but not table, find a suitable table in the new section
        if (input.newSectionId && !input.newTableId && currentAssignment?.assignedTableId) {
          const currentTable = await tx.restaurantTable.findUnique({
            where: { id: currentAssignment.assignedTableId },
          });

          if (currentTable && currentTable.sectionId !== input.newSectionId) {
            // Find a suitable table in the new section
            const suitableTable = await tx.restaurantTable.findFirst({
              where: {
                sectionId: input.newSectionId,
                seatingCapacity: {
                  gte: newPartySize,
                },
                isActive: true,
              },
            });

            if (suitableTable) {
              newTableId = suitableTable.id;
            } else {
              throw new Error(`No suitable table found in the selected section for party size ${newPartySize}`);
            }
          }
        }

        // If we have a new table, find or create a slot
        if (newTableId && newTableId !== currentAssignment?.assignedTableId) {
          const newSlot = await tx.tableAvailabilitySlot.findFirst({
            where: {
              tableId: newTableId,
              date: reservation.reservationDate,
              startTime: reservation.reservationTime,
              status: TableSlotStatus.AVAILABLE,
            },
          });

          if (newSlot) {
            newSlotId = newSlot.id;
          } else {
            // Create a new slot for the new table
            const createdSlot = await tx.tableAvailabilitySlot.create({
              data: {
                restaurantId: reservation.restaurantId,
                tableId: newTableId,
                date: reservation.reservationDate,
                startTime: reservation.reservationTime,
                endTime: new Date(new Date(reservation.reservationTime).getTime() + 90 * 60000), // Default 90 minutes
                status: TableSlotStatus.RESERVED,
                reservationId: reservation.id,
              },
            });
            newSlotId = createdSlot.id;
          }
        }

        // Update or create table assignment
        if (currentAssignment) {
          await tx.reservationTableAssignment.update({
            where: { reservationId: input.reservationId },
            data: {
              assignedSectionId: newSectionId,
              assignedTableId: newTableId,
              slotId: newSlotId,
            },
          });
        } else {
          await tx.reservationTableAssignment.create({
            data: {
              reservationId: input.reservationId,
              assignedSectionId: newSectionId,
              assignedTableId: newTableId,
              slotId: newSlotId,
            },
          });
        }

        // Release the old slot if it exists and is different
        if (currentSlot && newSlotId !== currentSlot.id) {
          await tx.tableAvailabilitySlot.update({
            where: { id: currentSlot.id },
            data: {
              status: TableSlotStatus.AVAILABLE,
              reservationId: null,
            },
          });
        }
      }

      // Create modification history record
      await tx.reservationModificationHistory.create({
        data: {
          reservationId: input.reservationId,
          modificationId: 0, // Placeholder since we're not using a modification request
          previousDate: reservation.reservationDate,
          previousTime: reservation.reservationTime,
          previousAdultCount: reservation.adultCount,
          previousChildCount: reservation.childCount,
          previousMealType: reservation.mealType,
          previousAmount: reservation.totalAmount,
          previousServiceCharge: reservation.serviceCharge,
          previousTaxAmount: reservation.taxAmount,
          previousDiscountAmount: reservation.discountAmount,
          previousAdvancePaymentAmount: reservation.advancePaymentAmount,
          previousRemainingPaymentAmount: reservation.remainingPaymentAmount,
          newDate: updatedReservation.reservationDate,
          newTime: updatedReservation.reservationTime,
          newAdultCount: updatedReservation.adultCount,
          newChildCount: updatedReservation.childCount,
          newMealType: updatedReservation.mealType,
          newAmount: updatedReservation.totalAmount,
          newServiceCharge: updatedReservation.serviceCharge,
          newTaxAmount: updatedReservation.taxAmount,
          newDiscountAmount: updatedReservation.discountAmount,
          newAdvancePaymentAmount: updatedReservation.advancePaymentAmount,
          newRemainingPaymentAmount: updatedReservation.remainingPaymentAmount,
          modifiedAt: new Date(),
          modifiedBy: input.updatedBy,
        },
      });

      return {
        success: true,
        updatedReservation,
      };
    });
  } catch (error) {
    console.error('Error updating table reservation details:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
