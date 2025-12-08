import { PrismaClient } from '../../prisma/generated/prisma'

/**
 * Get reservation with full details including date, time, and table assignment
 */
export async function getReservationFullDetails(
  prisma: PrismaClient,
  reservationId: number,
  tx?: any
) {
  const client = tx || prisma
  return await client.reservation.findUnique({
    where: { id: reservationId },
    include: {
      tableAssignment: {
        include: {
          slot: true,  // Include full slot object
          assignedTable: true,
          assignedSection: true,
        }
      }
    }
  })
}

/**
 * Get primary slot directly by reservation ID
 * This is much more reliable than time-based lookups
 */
export async function getPrimarySlotByReservationId(
  prisma: PrismaClient,
  reservationId: number,
  tableId: number,
  tx?: any
) {
  const client = tx || prisma
  
  console.log('🔍 [DB-QUERY] getPrimarySlotByReservationId called:', {
    reservationId,
    tableId,
    note: 'Direct lookup by reservationId - most reliable method'
  });
  
  const result = await client.tableAvailabilitySlot.findFirst({
    where: {
      reservationId,
      tableId
    }
  })
  
  if (!result) {
    console.warn('⚠️ [DB-QUERY] getPrimarySlotByReservationId - No slot found:', {
      reservationId,
      tableId,
      note: 'This reservation may not have a table slot assigned'
    });
  } else {
    console.log('✅ [DB-QUERY] getPrimarySlotByReservationId - Slot found:', {
      slotId: result.id,
      tableId: result.tableId,
      reservationId: result.reservationId,
      date: result.date.toISOString(),
      startTime: result.startTime.toISOString(),
      endTime: result.endTime.toISOString(),
      status: result.status
    });
  }
  
  return result;
}

/**
 * Check if table is available during the given time period
 * Uses overlap logic to find any conflicting slots during the desired time
 */
export async function checkTableAvailabilityDuringPeriod(
  prisma: PrismaClient,
  tableId: number,
  date: Date,
  startTime: Date,
  endTime: Date,
  tx?: any
) {
  const client = tx || prisma
  
  console.log('🔍 [DB-QUERY] checkTableAvailabilityDuringPeriod called:', {
    tableId,
    date: date.toISOString(),
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    note: 'Checking for any conflicting slots during this time period'
  });
  
  // Find any slots that overlap with our desired time period and are not available
  const conflictingSlots = await client.tableAvailabilitySlot.findMany({
    where: {
      tableId,
      date,
      status: {
        in: ['RESERVED', 'HELD', 'BLOCKED', 'MAINTENANCE'] // Any status that blocks availability
      },
      // Time overlap logic: Two time periods overlap if:
      // - Slot starts before our period ends AND
      // - Slot ends after our period starts
      AND: [
        {
          startTime: { lt: endTime }   // Slot starts before our period ends
        },
        {
          endTime: { gt: startTime }   // Slot ends after our period starts
        }
      ]
    },
    include: {
      table: {
        select: {
          id: true,
          seatingCapacity: true,
          tableName: true
        }
      }
    }
  })
  
  if (conflictingSlots.length > 0) {
    console.warn('⚠️ [DB-QUERY] checkTableAvailabilityDuringPeriod - Table not available:', {
      tableId,
      requestedPeriod: {
        date: date.toISOString(),
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString()
      },
      conflictingSlots: conflictingSlots.map((slot: any) => ({
        id: slot.id,
        status: slot.status,
        reservationId: slot.reservationId,
        startTime: slot.startTime.toISOString(),
        endTime: slot.endTime.toISOString()
      })),
      note: 'Table has conflicting reservations during this time period'
    });
    return null; // Table is not available
  }
  
  // If no conflicts, table is available
  console.log('✅ [DB-QUERY] checkTableAvailabilityDuringPeriod - Table is available:', {
    tableId,
    requestedPeriod: {
      date: date.toISOString(),
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString()
    },
    note: 'No conflicting slots found - table is free for this time period'
  });
  
  // Find AVAILABLE slots that overlap with our time period (these can be reserved)
  const availableSlots = await client.tableAvailabilitySlot.findMany({
    where: {
      tableId,
      date,
      status: 'AVAILABLE',
      // Time overlap logic: Find slots that overlap with our period
      AND: [
        {
          startTime: { lt: endTime }   // Slot starts before our period ends
        },
        {
          endTime: { gt: startTime }   // Slot ends after our period starts
        }
      ]
    },
    include: {
      table: {
        select: {
          id: true,
          seatingCapacity: true,
          tableName: true
        }
      }
    }
  })
  
  console.log('✅ [DB-QUERY] Found available slots for reservation:', {
    tableId,
    availableSlots: availableSlots.length,
    slots: availableSlots.map((slot: any) => ({
      id: slot.id,
      startTime: slot.startTime.toISOString(),
      endTime: slot.endTime.toISOString(),
      status: slot.status
    }))
  });

  // Return availability confirmation with actual slots that can be reserved
  return {
    tableId,
    isAvailable: true,
    availabilityPeriod: {
      date,
      startTime,
      endTime
    },
    availableSlots, // Return the actual slots that can be reserved
    table: availableSlots[0]?.table || { // Get table info from first slot
      id: tableId,
      seatingCapacity: 0, // Will be fetched separately
      tableName: `Table ${tableId}`
    }
  };
}

/**
 * Get table by ID with capacity
 */
export async function getTableWithCapacity(
  prisma: PrismaClient,
  tableId: number,
  tx?: any
) {
  const client = tx || prisma
  return await client.restaurantTable.findUnique({
    where: { id: tableId },
    select: {
      id: true,
      seatingCapacity: true
    }
  })
}

/**
 * Create TableSet
 */
export async function createTableSet(
  prisma: PrismaClient,
  data: {
    reservationId: number
    slotDate: Date
    slotStartTime: Date
    slotEndTime: Date
    tableIds: number[]
    slotIds: number[]
    primaryTableId: number
    originalStatuses: Record<string, string>
    status: string
    combinedCapacity: number
    createdBy: string
    expiresAt: Date | null
  },
  tx?: any
) {
  const client = tx || prisma
  return await client.tableSet.create({
    data
  })
}

/**
 * Get TableSet by ID
 */
export async function getTableSetById(
  prisma: PrismaClient,
  tableSetId: number,
  tx?: any
) {
  const client = tx || prisma
  return await client.tableSet.findUnique({
    where: { id: tableSetId }
  })
}

/**
 * Get TableSet by reservation and slot (to check for duplicates)
 */
export async function getTableSetByReservationAndSlot(
  prisma: PrismaClient,
  reservationId: number,
  slotDate: Date,
  slotStartTime: Date,
  tx?: any
) {
  const client = tx || prisma
  return await client.tableSet.findUnique({
    where: {
      reservationId_slotDate_slotStartTime: {
        reservationId,
        slotDate,
        slotStartTime
      }
    }
  })
}

/**
 * Update TableSet
 */
export async function updateTableSet(
  prisma: PrismaClient,
  tableSetId: number,
  data: Partial<{
    status: string
    confirmedAt: Date
    confirmedBy: string
    expiresAt: Date | null
    dissolvedAt: Date
    dissolvedBy: string
    tableIds: number[]
    slotIds: number[]
    combinedCapacity: number
    originalStatuses: any
  }>,
  tx?: any
) {
  const client = tx || prisma
  return await client.tableSet.update({
    where: { id: tableSetId },
    data
  })
}

/**
 * Update single slot status
 */
export async function updateSlot(
  prisma: PrismaClient,
  slotId: number,
  status: string,
  reservationId: number | null,
  tx?: any
) {
  const client = tx || prisma
  return await client.tableAvailabilitySlot.update({
    where: { id: slotId },
    data: {
      status,
      reservationId
    }
  })
}

/**
 * Get slot by ID
 */
export async function getSlotById(
  prisma: PrismaClient,
  slotId: number,
  tx?: any
) {
  const client = tx || prisma
  return await client.tableAvailabilitySlot.findUnique({
    where: { id: slotId },
    include: {
      table: {
        select: { seatingCapacity: true }
      }
    }
  })
}

/**
 * Get reservation status
 */
export async function getReservationStatus(
  prisma: PrismaClient,
  reservationId: number,
  tx?: any
) {
  const client = tx || prisma
  return await client.reservation.findUnique({
    where: { id: reservationId },
    select: { id: true, status: true }
  })
}

/**
 * Expire old pending merges
 */
export async function expireOldPendingMerges(prisma: PrismaClient) {
  return await prisma.tableSet.updateMany({
    where: {
      status: 'PENDING_MERGE',
      expiresAt: {
        lt: new Date()
      }
    },
    data: {
      status: 'EXPIRED',
      dissolvedAt: new Date(),
      dissolvedBy: 'SYSTEM'
    }
  })
}
