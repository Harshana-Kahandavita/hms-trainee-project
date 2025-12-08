import { PrismaClient, TableSlotStatus } from '../../prisma/generated/prisma';
import {
  HoldTableSlotInput,
  HoldTableSlotResult,
  HoldTableSlotInputType,
  ReserveTableSlotInput,
  ReserveTableSlotResult,
  ReserveTableSlotInputType,
  ReleaseExpiredHoldsInput,
  ReleaseExpiredHoldsResult,
  ReleaseExpiredHoldsInputType
} from './types';

// Types for availability blocking
export interface GetAvailableSlotsForBlockingInput {
  restaurantId: number;
  date: Date;
  startTime: Date;
  endTime: Date;
  sectionId?: number;
}

export interface GetAvailableSlotsForBlockingResult {
  success: boolean;
  slots?: Array<{
    id: number;
    tableId: number;
    tableName: string;
    sectionName: string;
    startTime: Date;
    endTime: Date;
  }>;
  totalCount?: number;
  error?: string;
}

export interface BlockRestaurantAvailabilityInput {
  restaurantId: number;
  date: Date;
  startTime: Date;
  endTime: Date;
  reason?: string;
  sectionId?: number;
}

export interface BlockRestaurantAvailabilityResult {
  success: boolean;
  blockedCount?: number;
  blockedSlotIds?: number[];
  error?: string;
}

export interface GetBlockedSlotsForUnblockingInput {
  restaurantId: number;
  date: Date;
  startTime: Date;
  endTime: Date;
  sectionId?: number;
}

export interface GetBlockedSlotsForUnblockingResult {
  success: boolean;
  slots?: Array<{
    id: number;
    tableId: number;
    tableName: string;
    sectionName: string;
    startTime: Date;
    endTime: Date;
  }>;
  totalCount?: number;
  error?: string;
}

export interface UnblockRestaurantAvailabilityInput {
  restaurantId: number;
  date: Date;
  startTime: Date;
  endTime: Date;
  reason?: string;
  sectionId?: number;
}

export interface UnblockRestaurantAvailabilityResult {
  success: boolean;
  unblockedCount?: number;
  unblockedSlotIds?: number[];
  error?: string;
}

/**
 * Hold a table slot temporarily with transaction and conflict handling
 * This function ensures atomicity and prevents race conditions
 */
export async function holdTableSlot(
  prisma: PrismaClient,
  input: HoldTableSlotInputType
): Promise<HoldTableSlotResult> {
  try {
    // Validate input
    const validatedInput = HoldTableSlotInput.parse(input);
    
    // Calculate hold expiration time
    const holdExpiresAt = new Date();
    holdExpiresAt.setMinutes(holdExpiresAt.getMinutes() + validatedInput.holdMinutes);
    
    return await prisma.$transaction(async (tx) => {
      // First, check if the slot exists and is available
      const existingSlot = await tx.tableAvailabilitySlot.findFirst({
        where: {
          restaurantId: validatedInput.restaurantId,
          tableId: validatedInput.tableId,
          date: validatedInput.date,
          startTime: validatedInput.startTime,
          endTime: validatedInput.endTime,
        },
      });

      if (!existingSlot) {
        // Slot doesn't exist, create it as HELD
        const newSlot = await tx.tableAvailabilitySlot.create({
          data: {
            restaurantId: validatedInput.restaurantId,
            tableId: validatedInput.tableId,
            date: validatedInput.date,
            startTime: validatedInput.startTime,
            endTime: validatedInput.endTime,
            status: TableSlotStatus.HELD,
            holdExpiresAt: holdExpiresAt,
          },
        });

        // Create the hold record
        await tx.reservationTableHold.create({
          data: {
            requestId: validatedInput.requestId,
            slotId: newSlot.id,
            holdExpiresAt: holdExpiresAt,
          },
        });

        return {
          success: true,
          slotId: newSlot.id,
          holdExpiresAt: holdExpiresAt,
        };
      }

      // Slot exists, check if it's available
      if (existingSlot.status !== TableSlotStatus.AVAILABLE) {
        // Check if it's a held slot that has expired
        if (existingSlot.status === TableSlotStatus.HELD && existingSlot.holdExpiresAt) {
          const now = new Date();
          if (existingSlot.holdExpiresAt <= now) {
            // Slot is held but expired, we can take it
            const updatedSlot = await tx.tableAvailabilitySlot.update({
              where: { id: existingSlot.id },
              data: {
                status: TableSlotStatus.HELD,
                holdExpiresAt: holdExpiresAt,
              },
            });

            // Create the hold record
            await tx.reservationTableHold.create({
              data: {
                requestId: validatedInput.requestId,
                slotId: updatedSlot.id,
                holdExpiresAt: holdExpiresAt,
              },
            });

            return {
              success: true,
              slotId: updatedSlot.id,
              holdExpiresAt: holdExpiresAt,
            };
          }
        }
        
        // Slot is not available and not expired
        return {
          success: false,
          error: `Slot is not available. Current status: ${existingSlot.status}`,
        };
      }

      // Slot is available, update it to HELD
      const updatedSlot = await tx.tableAvailabilitySlot.update({
        where: { id: existingSlot.id },
        data: {
          status: TableSlotStatus.HELD,
          holdExpiresAt: holdExpiresAt,
        },
      });

      // Create the hold record
      await tx.reservationTableHold.create({
        data: {
          requestId: validatedInput.requestId,
          slotId: updatedSlot.id,
          holdExpiresAt: holdExpiresAt,
        },
      });

      return {
        success: true,
        slotId: updatedSlot.id,
        holdExpiresAt: holdExpiresAt,
      };
    }, {
      maxWait: 5000, // 5 seconds max wait for transaction
      timeout: 10000, // 10 seconds max transaction time
    });
  } catch (error) {
    if (error instanceof Error) {
      return {
        success: false,
        error: `Failed to hold table slot: ${error.message}`,
      };
    }
    return {
      success: false,
      error: 'Failed to hold table slot: Unknown error',
    };
  }
}

/**
 * Reserve a table slot permanently with transaction and conflict handling
 * This function can work with either slotId or tableId+date+time combination
 */
export async function reserveTableSlot(
  prisma: PrismaClient,
  input: ReserveTableSlotInputType
): Promise<ReserveTableSlotResult> {
  try {
    // Validate input
    const validatedInput = ReserveTableSlotInput.parse(input);
    
    // Ensure we have either slotId or tableId+date+time combination
    if (!validatedInput.slotId && (!validatedInput.tableId || !validatedInput.date || !validatedInput.startTime || !validatedInput.endTime)) {
      return {
        success: false,
        error: 'Either slotId or tableId+date+startTime+endTime combination must be provided',
      };
    }
    
    return await prisma.$transaction(async (tx) => {
      let slot;
      
      if (validatedInput.slotId) {
        // Find slot by ID
        slot = await tx.tableAvailabilitySlot.findUnique({
          where: { id: validatedInput.slotId },
        });
      } else {
        // Find slot by tableId, date, and time
        slot = await tx.tableAvailabilitySlot.findFirst({
          where: {
            restaurantId: validatedInput.restaurantId,
            tableId: validatedInput.tableId!,
            date: validatedInput.date!,
            startTime: validatedInput.startTime!,
            endTime: validatedInput.endTime!,
          },
        });
      }
      
      if (!slot) {
        return {
          success: false,
          error: 'Slot not found',
        };
      }
      
      // Check if slot is available for reservation
      if (slot.status === TableSlotStatus.RESERVED) {
        return {
          success: false,
          error: 'Slot is already reserved',
        };
      }
      
      if (slot.status === TableSlotStatus.BLOCKED) {
        return {
          success: false,
          error: 'Slot is blocked and cannot be reserved',
        };
      }
      
      if (slot.status === TableSlotStatus.MAINTENANCE) {
        return {
          success: false,
          error: 'Slot is under maintenance and cannot be reserved',
        };
      }
      
      // If slot is HELD, check if it's expired
      if (slot.status === TableSlotStatus.HELD && slot.holdExpiresAt) {
        const now = new Date();
        if (slot.holdExpiresAt > now) {
          return {
            success: false,
            error: 'Slot is currently held and not expired',
          };
        }
      }
      
      // Update slot to RESERVED and link to reservation
      const updatedSlot = await tx.tableAvailabilitySlot.update({
        where: { id: slot.id },
        data: {
          status: TableSlotStatus.RESERVED,
          reservationId: validatedInput.reservationId,
          holdExpiresAt: null, // Clear any hold expiration
        },
      });
      
      // Remove any existing hold records for this slot
      await tx.reservationTableHold.deleteMany({
        where: { slotId: slot.id },
      });
      
      return {
        success: true,
        slotId: updatedSlot.id,
        reservationId: validatedInput.reservationId,
      };
    }, {
      maxWait: 5000, // 5 seconds max wait for transaction
      timeout: 10000, // 10 seconds max transaction time
    });
  } catch (error) {
    if (error instanceof Error) {
      return {
        success: false,
        error: `Failed to reserve table slot: ${error.message}`,
      };
    }
    return {
      success: false,
      error: 'Failed to reserve table slot: Unknown error',
    };
  }
}

/**
 * Release expired holds and set slots back to AVAILABLE
 * This function is designed to be run as a cron job
 */
export async function releaseExpiredHolds(
  prisma: PrismaClient,
  input: ReleaseExpiredHoldsInputType = { batchSize: 100, dryRun: false }
): Promise<ReleaseExpiredHoldsResult> {
  try {
    // Validate input
    const validatedInput = ReleaseExpiredHoldsInput.parse(input);
    
    return await prisma.$transaction(async (tx) => {
      const now = new Date();
      
      // Find expired held slots
      const expiredSlots = await tx.tableAvailabilitySlot.findMany({
        where: {
          status: TableSlotStatus.HELD,
          holdExpiresAt: {
            lt: now
          }
        },
        select: {
          id: true,
          holdExpiresAt: true
        },
        take: validatedInput.batchSize,
        orderBy: {
          holdExpiresAt: 'asc' // Process oldest first
        }
      });
      
      if (expiredSlots.length === 0) {
        return {
          success: true,
          releasedCount: 0,
          releasedSlotIds: []
        };
      }
      
      const slotIds = expiredSlots.map(slot => slot.id);
      
      if (validatedInput.dryRun) {
        // In dry run mode, just return what would be released
        return {
          success: true,
          releasedCount: slotIds.length,
          releasedSlotIds: slotIds
        };
      }
      
      // Update expired slots to AVAILABLE and clear hold expiration
      await tx.tableAvailabilitySlot.updateMany({
        where: {
          id: {
            in: slotIds
          }
        },
        data: {
          status: TableSlotStatus.AVAILABLE,
          holdExpiresAt: null
        }
      });
      
      // Remove hold records for these slots
      await tx.reservationTableHold.deleteMany({
        where: {
          slotId: {
            in: slotIds
          }
        }
      });
      
      return {
        success: true,
        releasedCount: slotIds.length,
        releasedSlotIds: slotIds
      };
    }, {
      maxWait: 10000, // 10 seconds max wait for transaction
      timeout: 30000, // 30 seconds max transaction time (longer for batch operations)
    });
  } catch (error) {
    if (error instanceof Error) {
      return {
        success: false,
        error: `Failed to release expired holds: ${error.message}`,
      };
    }
    return {
      success: false,
      error: 'Failed to release expired holds: Unknown error',
    };
  }
}

/**
 * Get available slots for blocking within a specific time range
 * This shows what slots will be affected before actually blocking them
 */
export async function getAvailableSlotsForBlocking(
  prisma: PrismaClient,
  input: GetAvailableSlotsForBlockingInput
): Promise<GetAvailableSlotsForBlockingResult> {
  try {
    const slots = await prisma.tableAvailabilitySlot.findMany({
      where: {
        restaurantId: input.restaurantId,
        date: input.date,
        startTime: {
          lte: input.endTime,
        },
        endTime: {
          gte: input.startTime,
        },
        status: TableSlotStatus.AVAILABLE,
        ...(input.sectionId && {
          table: {
            sectionId: input.sectionId,
          },
        }),
      },
      select: {
        id: true,
        tableId: true,
        startTime: true,
        endTime: true,
        table: {
          select: {
            tableName: true,
            section: {
              select: {
                sectionName: true,
              },
            },
          },
        },
      },
      orderBy: [
        { table: { section: { sectionName: 'asc' } } },
        { table: { tableName: 'asc' } },
        { startTime: 'asc' },
      ],
    });

    const formattedSlots = slots.map(slot => ({
      id: slot.id,
      tableId: slot.tableId,
      tableName: slot.table.tableName,
      sectionName: slot.table.section.sectionName,
      startTime: slot.startTime,
      endTime: slot.endTime,
    }));

    return {
      success: true,
      slots: formattedSlots,
      totalCount: formattedSlots.length,
    };
  } catch (error) {
    if (error instanceof Error) {
      return {
        success: false,
        error: `Failed to get available slots: ${error.message}`,
      };
    }
    return {
      success: false,
      error: 'Failed to get available slots: Unknown error',
    };
  }
}

/**
 * Block restaurant availability by setting slots to BLOCKED status
 * This permanently blocks the selected time slots from being reserved
 */
export async function blockRestaurantAvailability(
  prisma: PrismaClient,
  input: BlockRestaurantAvailabilityInput
): Promise<BlockRestaurantAvailabilityResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      // First, get the slots that will be blocked
      const slotsToBlock = await tx.tableAvailabilitySlot.findMany({
        where: {
          restaurantId: input.restaurantId,
          date: input.date,
          startTime: {
            lte: input.endTime,
          },
          endTime: {
            gte: input.startTime,
          },
          status: TableSlotStatus.AVAILABLE,
          ...(input.sectionId && {
            table: {
              sectionId: input.sectionId,
            },
          }),
        },
        select: {
          id: true,
        },
      });

      if (slotsToBlock.length === 0) {
        return {
          success: true,
          blockedCount: 0,
          blockedSlotIds: [],
        };
      }

      const slotIds = slotsToBlock.map(slot => slot.id);

      // Update slots to BLOCKED status
      await tx.tableAvailabilitySlot.updateMany({
        where: {
          id: {
            in: slotIds,
          },
        },
        data: {
          status: TableSlotStatus.BLOCKED,
          updatedAt: new Date(),
        },
      });

      return {
        success: true,
        blockedCount: slotIds.length,
        blockedSlotIds: slotIds,
      };
    }, {
      maxWait: 5000, // 5 seconds max wait for transaction
      timeout: 15000, // 15 seconds max transaction time
    });
  } catch (error) {
    if (error instanceof Error) {
      return {
        success: false,
        error: `Failed to block restaurant availability: ${error.message}`,
      };
    }
    return {
      success: false,
      error: 'Failed to block restaurant availability: Unknown error',
    };
  }
}

/**
 * Get blocked slots for unblocking within a specific time range
 * This shows what slots will be unblocked before actually unblocking them
 */
export async function getBlockedSlotsForUnblocking(
  prisma: PrismaClient,
  input: GetBlockedSlotsForUnblockingInput
): Promise<GetBlockedSlotsForUnblockingResult> {
  try {
    const slots = await prisma.tableAvailabilitySlot.findMany({
      where: {
        restaurantId: input.restaurantId,
        date: input.date,
        startTime: {
          lte: input.endTime,
        },
        endTime: {
          gte: input.startTime,
        },
        status: TableSlotStatus.BLOCKED,
        ...(input.sectionId && {
          table: {
            sectionId: input.sectionId,
          },
        }),
      },
      select: {
        id: true,
        tableId: true,
        startTime: true,
        endTime: true,
        table: {
          select: {
            tableName: true,
            section: {
              select: {
                sectionName: true,
              },
            },
          },
        },
      },
      orderBy: [
        { table: { section: { sectionName: 'asc' } } },
        { table: { tableName: 'asc' } },
        { startTime: 'asc' },
      ],
    });

    const formattedSlots = slots.map(slot => ({
      id: slot.id,
      tableId: slot.tableId,
      tableName: slot.table.tableName,
      sectionName: slot.table.section.sectionName,
      startTime: slot.startTime,
      endTime: slot.endTime,
    }));

    return {
      success: true,
      slots: formattedSlots,
      totalCount: formattedSlots.length,
    };
  } catch (error) {
    if (error instanceof Error) {
      return {
        success: false,
        error: `Failed to get blocked slots: ${error.message}`,
      };
    }
    return {
      success: false,
      error: 'Failed to get blocked slots: Unknown error',
    };
  }
}

/**
 * Unblock restaurant availability by setting slots back to AVAILABLE status
 * This makes the previously blocked time slots available for reservation again
 */
export async function unblockRestaurantAvailability(
  prisma: PrismaClient,
  input: UnblockRestaurantAvailabilityInput
): Promise<UnblockRestaurantAvailabilityResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      // First, get the slots that will be unblocked
      const slotsToUnblock = await tx.tableAvailabilitySlot.findMany({
        where: {
          restaurantId: input.restaurantId,
          date: input.date,
          startTime: {
            lte: input.endTime,
          },
          endTime: {
            gte: input.startTime,
          },
          status: TableSlotStatus.BLOCKED,
          ...(input.sectionId && {
            table: {
              sectionId: input.sectionId,
            },
          }),
        },
        select: {
          id: true,
        },
      });

      if (slotsToUnblock.length === 0) {
        return {
          success: true,
          unblockedCount: 0,
          unblockedSlotIds: [],
        };
      }

      const slotIds = slotsToUnblock.map(slot => slot.id);

      // Update slots back to AVAILABLE status
      await tx.tableAvailabilitySlot.updateMany({
        where: {
          id: {
            in: slotIds,
          },
        },
        data: {
          status: TableSlotStatus.AVAILABLE,
          updatedAt: new Date(),
        },
      });

      return {
        success: true,
        unblockedCount: slotIds.length,
        unblockedSlotIds: slotIds,
      };
    }, {
      maxWait: 5000, // 5 seconds max wait for transaction
      timeout: 15000, // 15 seconds max transaction time
    });
  } catch (error) {
    if (error instanceof Error) {
      return {
        success: false,
        error: `Failed to unblock restaurant availability: ${error.message}`,
      };
    }
    return {
      success: false,
      error: 'Failed to unblock restaurant availability: Unknown error',
    };
  }
}
