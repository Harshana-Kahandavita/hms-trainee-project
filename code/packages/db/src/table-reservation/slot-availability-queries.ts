/**
 * Slot availability queries for table reservation editing
 * Supports checking availability for specific dates and times
 */

import { PrismaClient, TableSlotStatus } from '../../prisma/generated/prisma';

export interface CheckSlotAvailabilityInput {
  restaurantId: number;
  tableId: number;
  date: Date;
  startTime: Date;
  endTime?: Date;
  excludeReservationId?: number;
}

export interface CheckSlotAvailabilityResult {
  isAvailable: boolean;
  reason?: string;
  conflictingSlots?: Array<{
    id: number;
    startTime: Date;
    endTime: Date;
    status: TableSlotStatus;
    reservationId: number | null;
  }>;
}

/**
 * Check if a specific time slot is available for a table
 */
export async function checkTableSlotAvailability(
  prisma: PrismaClient,
  input: CheckSlotAvailabilityInput
): Promise<CheckSlotAvailabilityResult> {
  const { restaurantId, tableId, date, startTime, endTime, excludeReservationId } = input;

  // Calculate end time if not provided (default 90 minutes)
  const calculatedEndTime = endTime || calculateSlotEndTime(startTime);

  // Normalize times to time-only format
  const normalizedStartTime = new Date(`1970-01-01T${formatTime(startTime)}`);
  const normalizedEndTime = new Date(`1970-01-01T${formatTime(calculatedEndTime)}`);

  // Find conflicting slots
  const conflictingSlots = await prisma.tableAvailabilitySlot.findMany({
    where: {
      restaurantId,
      tableId,
      date: {
        equals: date
      },
      status: {
        in: [TableSlotStatus.RESERVED, TableSlotStatus.HELD, TableSlotStatus.BLOCKED]
      },
      AND: [
        {
          startTime: { lt: normalizedEndTime }
        },
        {
          endTime: { gt: normalizedStartTime }
        }
      ],
      ...(excludeReservationId && {
        reservationId: {
          not: excludeReservationId
        }
      })
    },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      status: true,
      reservationId: true
    }
  });

  if (conflictingSlots.length > 0) {
    return {
      isAvailable: false,
      reason: `Table is already ${conflictingSlots[0]?.status.toLowerCase() || 'reserved'} for this time slot`,
      conflictingSlots
    };
  }

  return {
    isAvailable: true
  };
}

/**
 * Get available time slots for a table on a specific date
 */
export async function getAvailableTimeSlotsForTable(
  prisma: PrismaClient,
  input: {
    restaurantId: number;
    tableId: number;
    date: Date;
    excludeReservationId?: number;
  }
): Promise<{
  success: boolean;
  availableSlots?: Array<{
    startTime: Date;
    endTime: Date;
    duration: number;
  }>;
  reservedSlots?: Array<{
    id: number;
    startTime: Date;
    endTime: Date;
    status: TableSlotStatus;
    reservationId: number | null;
  }>;
  error?: string;
}> {
  try {
    const { restaurantId, tableId, date, excludeReservationId } = input;

    // Get all slots for this table on this date
    const allSlots = await prisma.tableAvailabilitySlot.findMany({
      where: {
        restaurantId,
        tableId,
        date: {
          equals: date
        },
        ...(excludeReservationId && {
          reservationId: {
            not: excludeReservationId
          }
        })
      },
      orderBy: {
        startTime: 'asc'
      }
    });

    const reservedSlots = allSlots.filter(
      slot => slot.status === TableSlotStatus.RESERVED || 
              slot.status === TableSlotStatus.HELD ||
              slot.status === TableSlotStatus.BLOCKED
    );

    const availableSlots = allSlots
      .filter(slot => slot.status === TableSlotStatus.AVAILABLE)
      .map(slot => ({
        startTime: slot.startTime,
        endTime: slot.endTime,
        duration: calculateDuration(slot.startTime, slot.endTime)
      }));

    return {
      success: true,
      availableSlots,
      reservedSlots: reservedSlots.map(slot => ({
        id: slot.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        status: slot.status,
        reservationId: slot.reservationId
      }))
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get available time slots'
    };
  }
}

/**
 * Get available tables for a specific date and time
 */
export async function getAvailableTablesForDateTime(
  prisma: PrismaClient,
  input: {
    restaurantId: number;
    date: Date;
    startTime: Date;
    endTime?: Date;
    partySize: number;
    sectionId?: number;
    excludeReservationId?: number;
  }
): Promise<{
  success: boolean;
  tables?: Array<{
    id: number;
    tableName: string;
    seatingCapacity: number;
    sectionId: number;
    sectionName: string;
    isAvailable: boolean;
    availabilityStatus: string;
  }>;
  error?: string;
}> {
  try {
    const { restaurantId, date, startTime, endTime, partySize, sectionId, excludeReservationId } = input;

    const calculatedEndTime = endTime || calculateSlotEndTime(startTime);
    const normalizedStartTime = new Date(`1970-01-01T${formatTime(startTime)}`);
    const normalizedEndTime = new Date(`1970-01-01T${formatTime(calculatedEndTime)}`);

    // Get all tables that meet capacity requirements
    const tables = await prisma.restaurantTable.findMany({
      where: {
        restaurantId,
        isActive: true,
        seatingCapacity: {
          gte: partySize
        },
        ...(sectionId && { sectionId })
      },
      include: {
        section: {
          select: {
            id: true,
            sectionName: true
          }
        },
        availability: {
          where: {
            date: {
              equals: date
            },
            AND: [
              {
                startTime: { lt: normalizedEndTime }
              },
              {
                endTime: { gt: normalizedStartTime }
              }
            ],
            ...(excludeReservationId && {
              reservationId: {
                not: excludeReservationId
              }
            })
          }
        }
      }
    });

    const tablesWithAvailability = tables.map(table => {
      const hasConflict = table.availability.some(
        slot => slot.status === TableSlotStatus.RESERVED || 
                slot.status === TableSlotStatus.HELD ||
                slot.status === TableSlotStatus.BLOCKED
      );

      const isCurrentReservation = Boolean(excludeReservationId && 
        table.availability.some(slot => slot.reservationId === excludeReservationId));

      return {
        id: table.id,
        tableName: table.tableName,
        seatingCapacity: table.seatingCapacity,
        sectionId: table.sectionId,
        sectionName: table.section.sectionName,
        isAvailable: Boolean(!hasConflict || isCurrentReservation),
        availabilityStatus: isCurrentReservation ? 'CURRENT_RESERVATION' : (!hasConflict ? 'AVAILABLE' : 'OCCUPIED')
      };
    });

    return {
      success: true,
      tables: tablesWithAvailability
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get available tables'
    };
  }
}

/**
 * Calculate slot end time (default 90 minutes)
 */
function calculateSlotEndTime(startTime: Date): Date {
  const endTime = new Date(startTime);
  endTime.setMinutes(endTime.getMinutes() + 90);
  return endTime;
}

/**
 * Format time to HH:MM:SS
 */
function formatTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Calculate duration in minutes between two times
 */
function calculateDuration(startTime: Date, endTime: Date): number {
  return Math.floor((endTime.getTime() - startTime.getTime()) / (1000 * 60));
}

