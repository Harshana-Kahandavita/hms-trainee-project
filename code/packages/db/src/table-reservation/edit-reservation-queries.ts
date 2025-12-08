/**
 * Database Queries for Table Reservation Editing
 * Pure data operations separated from business logic
 */

import { PrismaClient, TableSlotStatus, Prisma } from '../../prisma/generated/prisma';

/**
 * Fetch reservation with all related data for editing
 */
export async function fetchReservationForEdit(
  prisma: PrismaClient | Prisma.TransactionClient,
  reservationId: number
) {
  return await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: {
      tableAssignment: {
        include: {
          assignedSection: true,
          assignedTable: true,
          slot: true
        }
      },
      restaurant: true
    }
  });
}

/**
 * Fetch table with section information
 */
export async function fetchTableWithSection(
  prisma: PrismaClient | Prisma.TransactionClient,
  tableId: number
) {
  return await prisma.restaurantTable.findUnique({
    where: { id: tableId },
    include: { section: true }
  });
}

/**
 * Fetch section by ID
 */
export async function fetchSection(
  prisma: PrismaClient | Prisma.TransactionClient,
  sectionId: number
) {
  return await prisma.restaurantSection.findUnique({
    where: { id: sectionId }
  });
}

/**
 * Release a table slot (set to AVAILABLE)
 */
export async function releaseTableSlot(
  tx: Prisma.TransactionClient,
  slotId: number
): Promise<void> {
  await tx.tableAvailabilitySlot.update({
    where: { id: slotId },
    data: {
      status: TableSlotStatus.AVAILABLE,
      reservationId: null,
      holdExpiresAt: null
    }
  });
}

/**
 * Find existing available slot for given parameters
 */
export async function findAvailableSlot(
  tx: Prisma.TransactionClient,
  params: {
    restaurantId: number;
    tableId: number;
    date: Date;
    startTime: Date;
    endTime: Date;
  }
) {
  return await tx.tableAvailabilitySlot.findFirst({
    where: {
      restaurantId: params.restaurantId,
      tableId: params.tableId,
      date: params.date,
      startTime: params.startTime,
      endTime: params.endTime,
      status: TableSlotStatus.AVAILABLE
    }
  });
}

/**
 * Find conflicting slot (overlapping and reserved/held)
 */
export async function findConflictingSlot(
  tx: Prisma.TransactionClient,
  params: {
    tableId: number;
    date: Date;
    startTime: Date;
    endTime: Date;
    excludeReservationId?: number;
  }
) {
  return await tx.tableAvailabilitySlot.findFirst({
    where: {
      tableId: params.tableId,
      date: params.date,
      AND: [
        {
          startTime: { lt: params.endTime }
        },
        {
          endTime: { gt: params.startTime }
        },
        {
          status: { in: [TableSlotStatus.RESERVED, TableSlotStatus.HELD] }
        },
        ...(params.excludeReservationId ? [{
          reservationId: { not: params.excludeReservationId }
        }] : [])
      ]
    }
  });
}

/**
 * Reserve an existing slot
 */
export async function reserveExistingSlot(
  tx: Prisma.TransactionClient,
  slotId: number,
  reservationId: number
): Promise<number> {
  await tx.tableAvailabilitySlot.update({
    where: { id: slotId },
    data: {
      status: TableSlotStatus.RESERVED,
      reservationId: reservationId
    }
  });
  return slotId;
}

/**
 * Create and reserve a new slot
 */
export async function createAndReserveSlot(
  tx: Prisma.TransactionClient,
  params: {
    restaurantId: number;
    tableId: number;
    date: Date;
    startTime: Date;
    endTime: Date;
    reservationId: number;
  }
): Promise<number> {
  const newSlot = await tx.tableAvailabilitySlot.create({
    data: {
      restaurantId: params.restaurantId,
      tableId: params.tableId,
      date: params.date,
      startTime: params.startTime,
      endTime: params.endTime,
      status: TableSlotStatus.RESERVED,
      reservationId: params.reservationId
    }
  });
  return newSlot.id;
}

/**
 * Update reservation basic fields
 */
export async function updateReservationFields(
  tx: Prisma.TransactionClient,
  reservationId: number,
  data: {
    reservationDate?: Date;
    reservationTime?: Date;
    adultCount?: number;
    childCount?: number;
    specialRequests?: string;
    lastModifiedAt: Date;
    lastModifiedBy: string;
    lastModificationId: number;
  }
) {
  return await tx.reservation.update({
    where: { id: reservationId },
    data
  });
}

/**
 * Update table assignment
 */
export async function updateTableAssignment(
  tx: Prisma.TransactionClient,
  reservationId: number,
  data: {
    assignedSectionId?: number;
    assignedTableId?: number;
    slotId?: number;
    tableStartTime?: Date;
    tableEndTime?: Date;
    updatedAt: Date;
  }
) {
  return await tx.reservationTableAssignment.update({
    where: { reservationId },
    data
  });
}

/**
 * Create table assignment if it doesn't exist
 */
export async function createTableAssignment(
  tx: Prisma.TransactionClient,
  reservationId: number,
  data: {
    assignedSectionId?: number;
    assignedTableId?: number;
    slotId?: number;
    tableStartTime?: Date;
    tableEndTime?: Date;
  }
) {
  return await tx.reservationTableAssignment.create({
    data: {
      reservationId,
      ...data
    }
  });
}

/**
 * Create modification request
 */
export async function createModificationRequest(
  prisma: PrismaClient,
  data: Prisma.TableReservationModificationRequestCreateInput
) {
  return await prisma.tableReservationModificationRequest.create({
    data
  });
}

/**
 * Update modification request status and metadata
 */
export async function updateModificationRequest(
  prisma: PrismaClient,
  modificationId: number,
  data: Partial<{
    status: any;
    processedAt: Date;
    processedBy: string;
    originalSlotReleased: boolean;
    newSlotReserved: boolean;
    slotAdjustedAt: Date;
  }>
) {
  return await prisma.tableReservationModificationRequest.update({
    where: { id: modificationId },
    data
  });
}

/**
 * Create modification status history entry
 */
export async function createModificationStatusHistory(
  prisma: PrismaClient,
  data: {
    modificationId: number;
    previousStatus: any;
    newStatus: any;
    changeReason: string;
    statusChangedAt: Date;
    changedBy: string;
  }
) {
  return await prisma.tableReservationModificationStatusHistory.create({
    data
  });
}

/**
 * Create modification history entry
 */
export async function createModificationHistory(
  tx: Prisma.TransactionClient,
  data: Prisma.TableReservationModificationHistoryCreateInput
) {
  return await tx.tableReservationModificationHistory.create({
    data
  });
}

/**
 * Fetch modification request current status
 */
export async function fetchModificationStatus(
  prisma: PrismaClient,
  modificationId: number
) {
  return await prisma.tableReservationModificationRequest.findUnique({
    where: { id: modificationId },
    select: { status: true }
  });
}

/**
 * Fetch final reservation state after edit
 */
export async function fetchFinalReservationState(
  prisma: PrismaClient,
  reservationId: number
) {
  return await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: {
      tableAssignment: {
        include: {
          assignedSection: true,
          assignedTable: true,
          slot: true
        }
      }
    }
  });
}

