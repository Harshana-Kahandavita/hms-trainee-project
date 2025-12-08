import { PrismaClient, TableSlotStatus } from '../../prisma/generated/prisma';
import { 
  GetSectionsAndTablesInput,
  GetSectionsAndTablesResult,
  GetSectionsAndTablesInputType,
  SectionWithTablesSchema,
  GetAvailableTableSlotsInput,
  GetAvailableTableSlotsResult,
  GetAvailableTableSlotsInputType,
  GetAvailableTableSlotsBySectionInput,
  GetAvailableTableSlotsBySectionResult,
  GetAvailableTableSlotsBySectionInputType,
  AvailableTableSlotSchema
} from './types';
import { getDwellingTimeConfiguration } from './configuration';

/**
 * Mark expired HELD slots as AVAILABLE in real-time
 * This replaces the cronjob approach for immediate consistency
 */
export async function markExpiredHeldSlotsAsAvailable(
  prisma: PrismaClient,
  restaurantId?: number
): Promise<{ success: boolean; releasedCount: number; error?: string }> {
  try {
    const now = new Date();
    
    // Build where clause - optionally filter by restaurant
    const whereClause: any = {
      status: TableSlotStatus.HELD,
      holdExpiresAt: {
        lt: now
      }
    };
    
    if (restaurantId) {
      whereClause.restaurantId = restaurantId;
    }

    // Find all expired holds
    const expiredHolds = await prisma.tableAvailabilitySlot.findMany({
      where: whereClause,
      select: {
        id: true,
        holdExpiresAt: true,
        restaurantId: true
      }
    });

    if (expiredHolds.length === 0) {
      return {
        success: true,
        releasedCount: 0
      };
    }

    // Release all expired holds in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update all expired slots to AVAILABLE
      const updateResult = await tx.tableAvailabilitySlot.updateMany({
        where: {
          id: {
            in: expiredHolds.map(hold => hold.id)
          },
          status: TableSlotStatus.HELD,
          holdExpiresAt: {
            lt: now
          }
        },
        data: {
          status: TableSlotStatus.AVAILABLE,
          holdExpiresAt: null
        }
      });

      // Delete the hold records
      await tx.reservationTableHold.deleteMany({
        where: {
          slotId: {
            in: expiredHolds.map(hold => hold.id)
          }
        }
      });

      return updateResult.count;
    });

    console.log(`✅ [REAL-TIME CLEANUP] Released ${result} expired holds${restaurantId ? ` for restaurant ${restaurantId}` : ' (all restaurants)'}`);

    return {
      success: true,
      releasedCount: result
    };
  } catch (error) {
    console.error('❌ [REAL-TIME CLEANUP] Error releasing expired holds:', error);
    return {
      success: false,
      releasedCount: 0,
      error: error instanceof Error ? error.message : 'Failed to release expired holds'
    };
  }
}

/**
 * Get all active sections and tables for a restaurant
 * Returns sections with their associated tables, ordered by display order
 */
export async function getSectionsAndTables(
  prisma: PrismaClient,
  input: GetSectionsAndTablesInputType
): Promise<GetSectionsAndTablesResult> {
  try {
    // Validate input
    const validatedInput = GetSectionsAndTablesInput.parse(input);
    
    // Get sections with their tables
    const sectionsWithTables = await prisma.restaurantSection.findMany({
      where: {
        restaurantId: validatedInput.restaurantId,
        isActive: true,
      },
      include: {
        tables: {
          where: {
            isActive: true,
          },
          orderBy: [
            { tableName: 'asc' },
          ],
        },
      },
      orderBy: [
        { displayOrder: 'asc' },
        { sectionName: 'asc' },
      ],
    });

    // Validate each section with tables
    const validatedSections = sectionsWithTables.map(section => {
      return SectionWithTablesSchema.parse(section);
    });

    return {
      success: true,
      sections: validatedSections,
    };
  } catch (error) {
    if (error instanceof Error) {
      return {
        success: false,
        error: `Failed to get sections and tables: ${error.message}`,
      };
    }
    return {
      success: false,
      error: 'Failed to get sections and tables: Unknown error',
    };
  }
}

/**
 * Get available table slots for a restaurant on a specific date
 * Returns slots that are AVAILABLE only (excludes HELD slots and dwell time conflicts)
 */
export async function getAvailableTableSlots(
  prisma: PrismaClient,
  input: GetAvailableTableSlotsInputType
): Promise<GetAvailableTableSlotsResult> {
  try {
    // Validate input
    const validatedInput = GetAvailableTableSlotsInput.parse(input);

    // REAL-TIME CLEANUP: Mark expired HELD slots as AVAILABLE before fetching
    await markExpiredHeldSlotsAsAvailable(prisma, validatedInput.restaurantId);

    // Get available slots with table and section information
    // Only include AVAILABLE slots, not HELD slots since they're not available for new reservations
    const availableSlots = await prisma.tableAvailabilitySlot.findMany({
      where: {
        restaurantId: validatedInput.restaurantId,
        date: validatedInput.date,
        status: 'AVAILABLE', // Only AVAILABLE slots, exclude HELD slots
        table: {
          isActive: true,
          section: {
            isActive: true
          }
        }
      },
      include: {
        table: {
          include: {
            section: {
              select: {
                id: true,
                sectionName: true,
                displayOrder: true,
              }
            }
          }
        }
      },
      orderBy: [
        { table: { section: { displayOrder: 'asc' } } },
        { table: { section: { sectionName: 'asc' } } },
        { table: { tableName: 'asc' } },
        { startTime: 'asc' }
      ],
    });

    // Filter out slots that conflict with existing reservations' dwell time
    const validSlots = await filterSlotsByDwellTimeConflicts(
      prisma,
      validatedInput.restaurantId,
      validatedInput.date,
      availableSlots
    );

    // Validate each slot
    const validatedSlots = validSlots.map(slot => {
      return AvailableTableSlotSchema.parse(slot);
    });

    return {
      success: true,
      slots: validatedSlots,
    };
  } catch (error) {
    if (error instanceof Error) {
      return {
        success: false,
        error: `Failed to get available table slots: ${error.message}`,
      };
    }
    return {
      success: false,
      error: 'Failed to get available table slots: Unknown error',
    };
  }
}

/**
 * Check if a slot conflicts with any existing reservation's dwell time
 */
async function checkDwellTimeConflict(
  prisma: PrismaClient,
  restaurantId: number,
  tableId: number,
  date: Date,
  slotStartTime: Date,
  dwellTimeMinutes: number
): Promise<boolean> {
  // Find reservations that would still occupy this table
  const conflictingReservations = await prisma.reservation.findMany({
    where: {
      restaurantId,
      reservationDate: date,
      status: { in: ['CONFIRMED', 'SEATED'] },
      tableAssignment: {
        assignedTableId: tableId
      }
    },
    select: {
      reservationTime: true
    }
  });

  // Check if any reservation's dwell time overlaps with this slot
  return conflictingReservations.some(reservation => {
    const reservationEnd = new Date(
      reservation.reservationTime.getTime() + dwellTimeMinutes * 60 * 1000
    );
    return slotStartTime < reservationEnd;
  });
}

/**
 * Check for dwell time conflicts in table slots
 * Filters out slots that would start during existing reservations' dwell time
 */
export async function filterSlotsByDwellTimeConflicts(
  prisma: PrismaClient,
  restaurantId: number,
  date: Date,
  slots: any[]
): Promise<any[]> {
  // Get restaurant's dwell time setting from config
  // First try restaurant-specific config, then fall back to platform default
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

  const dwellTimeMinutes = config?.defaultDwellMinutes || 90;

  // OPTIMIZED: Bulk fetch all conflicting reservations instead of N+1 queries
  const tableIds = Array.from(new Set(slots.map(slot => slot.tableId)));

  // Fetch ALL conflicting reservations in ONE query
  const conflictingReservations = await prisma.reservation.findMany({
    where: {
      restaurantId: restaurantId,
      reservationDate: date,
      status: { in: ['CONFIRMED', 'SEATED'] },
      tableAssignment: {
        assignedTableId: { in: tableIds }
      }
    },
    select: {
      reservationTime: true,
      tableAssignment: {
        select: {
          assignedTableId: true
        }
      }
    }
  });

  // Create a map of tableId -> array of reservation time ranges for fast lookup
  // Store both start and end times to properly check for overlaps
  const tableReservationRanges = new Map<number, Array<{ start: Date; end: Date }>>();
  conflictingReservations.forEach(reservation => {
    const tableId = reservation.tableAssignment?.assignedTableId;
    if (!tableId) return;

    const reservationStart = reservation.reservationTime;
    const reservationEnd = new Date(
      reservation.reservationTime.getTime() + dwellTimeMinutes * 60 * 1000
    );

    if (!tableReservationRanges.has(tableId)) {
      tableReservationRanges.set(tableId, []);
    }
    tableReservationRanges.get(tableId)!.push({ start: reservationStart, end: reservationEnd });
  });

  // Filter slots in memory by checking against pre-fetched reservation data
  const filteredSlots = slots.filter(slot => {
    const reservationRanges = tableReservationRanges.get(slot.tableId);
    if (!reservationRanges || reservationRanges.length === 0) {
      return true; // No conflicts
    }

    // Calculate slot end time (assuming 90-minute default duration)
    const slotEndTime = new Date(slot.startTime.getTime() + dwellTimeMinutes * 60 * 1000);

    // Check if this slot's time period overlaps with any existing reservation
    // Two time periods overlap if: slotStart < reservationEnd AND slotEnd > reservationStart
    const hasConflict = reservationRanges.some(range => 
      slot.startTime < range.end && slotEndTime > range.start
    );
    return !hasConflict;
  });

  return filteredSlots;
}

/**
 * Check if a table has dwelling time conflicts during a specific time period
 * This extends slot-based checks by accounting for post-reservation dwelling time
 * Used in table merging and reassignment operations to prevent double-booking
 * 
 * @param prisma - Prisma client instance
 * @param restaurantId - Restaurant ID
 * @param tableId - Table ID to check
 * @param date - Date to check
 * @param periodStartTime - Start time of the period to check
 * @param periodEndTime - End time of the period to check
 * @param tx - Optional transaction client
 * @returns Object with availability status, conflicting reservations, and dwell time used
 */
export async function checkTableDwellTimeAvailability(
  prisma: PrismaClient,
  restaurantId: number,
  tableId: number,
  date: Date,
  periodStartTime: Date,
  periodEndTime: Date,
  tx?: any
): Promise<{
  isAvailable: boolean;
  conflictingReservations?: Array<{
    reservationId: number;
    reservationTime: Date;
    effectiveEndTime: Date;
  }>;
  dwellTimeMinutes?: number;
}> {
  const client = tx || prisma;

  // 1. Get restaurant's dwell time configuration using query function
  const dwellTimeMinutes = await getDwellingTimeConfiguration(
    prisma,
    restaurantId,
    tx
  );

  // 2. Find all active reservations on this table for this date
  // Check both:
  //   a) Reservations with direct tableAssignment (primary table)
  //   b) Reservations with merged tables via TableSet (secondary tables)
  // Only check CONFIRMED and SEATED reservations (active ones that occupy the table)

  // a) Find reservations with direct assignment to this table
  const directlyAssignedReservations = await client.reservation.findMany({
    where: {
      restaurantId,
      reservationDate: date,
      status: { in: ['CONFIRMED', 'SEATED'] },
      tableAssignment: {
        assignedTableId: tableId,
      },
    },
    select: {
      id: true,
      reservationTime: true,
      tableAssignment: {
        select: {
          slotId: true,
          tableEndTime: true, // Slot end time from assignment
        },
      },
    },
  });

  // b) Find reservations with this table in merged TableSet
  // Query: Find TableSets where tableId is in the tableIds array AND status is ACTIVE or PENDING_MERGE
  const tableSetsWithThisTable = await client.tableSet.findMany({
    where: {
      slotDate: date,
      status: { in: ['ACTIVE', 'PENDING_MERGE'] },
      // Check if tableId is in the tableIds array using Prisma's array contains operator
      tableIds: {
        has: tableId,
      },
      reservation: {
        restaurantId,
        reservationDate: date,
        status: { in: ['CONFIRMED', 'SEATED'] },
      },
    },
    select: {
      reservationId: true,
      slotStartTime: true,
      slotEndTime: true,
      reservation: {
        select: {
          id: true,
          reservationTime: true,
          tableAssignment: {
            select: {
              slotId: true,
              tableEndTime: true,
            },
          },
        },
      },
    },
  });

  // Combine both types of reservations and deduplicate by reservation ID
  // A reservation might have both direct assignment and TableSet (if it's merging from primary table)
  const reservationMap = new Map<number, typeof directlyAssignedReservations[0]>();

  // Add directly assigned reservations
  directlyAssignedReservations.forEach((res: typeof directlyAssignedReservations[0]) => {
    reservationMap.set(res.id, res);
  });

  // Add TableSet reservations (use TableSet's slotEndTime for more accurate timing)
  tableSetsWithThisTable.forEach((tableSet: typeof tableSetsWithThisTable[0]) => {
    const existing = reservationMap.get(tableSet.reservation.id);
    if (!existing) {
      // New reservation from TableSet
      reservationMap.set(tableSet.reservation.id, {
        id: tableSet.reservation.id,
        reservationTime: tableSet.reservation.reservationTime,
        tableAssignment: {
          slotId: tableSet.reservation.tableAssignment?.slotId || null,
          // Use TableSet's slotEndTime as it's more accurate for merged tables
          tableEndTime: tableSet.slotEndTime || tableSet.reservation.tableAssignment?.tableEndTime || null,
        },
      });
    } else {
      // Reservation already exists (has direct assignment), prefer TableSet's slotEndTime if available
      if (tableSet.slotEndTime) {
        existing.tableAssignment = {
          ...existing.tableAssignment,
          tableEndTime: tableSet.slotEndTime,
        };
      }
    }
  });

  const reservations = Array.from(reservationMap.values());

  // 3. Check if any reservation's dwelling time overlaps with our period
  const conflictingReservations = reservations
    .filter((reservation) => {
      // Get slot end time (when reservation slot ends)
      // Use tableEndTime from assignment if available, otherwise fall back to reservationTime + default duration
      const slotEndTime = reservation.tableAssignment?.tableEndTime;

      // Calculate effective end time: slot end + dwelling time
      let effectiveEndTime: Date;
      if (slotEndTime) {
        // Use actual slot end time from assignment
        effectiveEndTime = new Date(
          slotEndTime.getTime() + dwellTimeMinutes * 60 * 1000
        );
      } else {
        // Fallback: assume 90-minute slot duration (standard slot length)
        const assumedSlotEnd = new Date(
          reservation.reservationTime.getTime() + 90 * 60 * 1000
        );
        effectiveEndTime = new Date(
          assumedSlotEnd.getTime() + dwellTimeMinutes * 60 * 1000
        );
      }

      // Check overlap: periodStart < effectiveEnd AND periodEnd > reservationStart
      // Two time periods overlap if one starts before the other ends
      const reservationStart = reservation.reservationTime;
      const hasOverlap =
        periodStartTime < effectiveEndTime && periodEndTime > reservationStart;

      return hasOverlap;
    })
    .map((reservation) => {
      // Calculate effective end time for return value
      const slotEndTime = reservation.tableAssignment?.tableEndTime;
      let effectiveEndTime: Date;

      if (slotEndTime) {
        effectiveEndTime = new Date(
          slotEndTime.getTime() + dwellTimeMinutes * 60 * 1000
        );
      } else {
        const assumedSlotEnd = new Date(
          reservation.reservationTime.getTime() + 90 * 60 * 1000
        );
        effectiveEndTime = new Date(
          assumedSlotEnd.getTime() + dwellTimeMinutes * 60 * 1000
        );
      }

      return {
        reservationId: reservation.id,
        reservationTime: reservation.reservationTime,
        effectiveEndTime,
      };
    });

  return {
    isAvailable: conflictingReservations.length === 0,
    conflictingReservations: conflictingReservations.length > 0 ? conflictingReservations : undefined,
    dwellTimeMinutes,
  };
}

/**
 * Get available table slots for a restaurant on a specific date and section
 * Returns slots that are AVAILABLE only (excludes HELD slots and dwell time conflicts) for the specified section
 */
export async function getAvailableTableSlotsBySection(
  prisma: PrismaClient,
  input: GetAvailableTableSlotsBySectionInputType
): Promise<GetAvailableTableSlotsBySectionResult> {
  try {
    // Validate input
    const validatedInput = GetAvailableTableSlotsBySectionInput.parse(input);

    // REAL-TIME CLEANUP: Mark expired HELD slots as AVAILABLE before fetching
    await markExpiredHeldSlotsAsAvailable(prisma, validatedInput.restaurantId);

    // Get available slots with table and section information for the specific section
    // Only include AVAILABLE slots, not HELD slots since they're not available for new reservations
    const availableSlots = await prisma.tableAvailabilitySlot.findMany({
      where: {
        restaurantId: validatedInput.restaurantId,
        date: validatedInput.date,
        table: {
          sectionId: validatedInput.sectionId,
          isActive: true,
          section: {
            isActive: true
          }
        },
        status: 'AVAILABLE' // Only AVAILABLE slots, exclude HELD slots
      },
      include: {
        table: {
          include: {
            section: {
              select: {
                id: true,
                sectionName: true,
                displayOrder: true,
              }
            }
          }
        }
      },
      orderBy: [
        { table: { tableName: 'asc' } },
        { startTime: 'asc' }
      ],
    });

    // Filter out slots that conflict with existing reservations' dwell time
    const validSlots = await filterSlotsByDwellTimeConflicts(
      prisma,
      validatedInput.restaurantId,
      validatedInput.date,
      availableSlots
    );

    // Validate each slot
    const validatedSlots = validSlots.map(slot => {
      return AvailableTableSlotSchema.parse(slot);
    });

    return {
      success: true,
      slots: validatedSlots,
    };
  } catch (error) {
    if (error instanceof Error) {
      return {
        success: false,
        error: `Failed to get available table slots by section: ${error.message}`,
      };
    }
    return {
      success: false,
      error: 'Failed to get available table slots by section: Unknown error',
    };
  }
}
