import { PrismaClient, TableSlotStatus } from '../../prisma/generated/prisma';

/**
 * Releases all expired table slot holds
 * This should be run periodically (e.g., every 5 minutes) to clean up expired holds
 */
export async function releaseExpiredTableSlotHolds(
  prisma: PrismaClient
): Promise<{ success: boolean; releasedCount: number; error?: string }> {
  try {
    const now = new Date();

    // Find all expired holds
    const expiredHolds = await prisma.tableAvailabilitySlot.findMany({
      where: {
        status: TableSlotStatus.HELD,
        holdExpiresAt: {
          lt: now
        }
      },
      select: {
        id: true,
        holdExpiresAt: true
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

    return {
      success: true,
      releasedCount: result
    };
  } catch (error) {
    return {
      success: false,
      releasedCount: 0,
      error: error instanceof Error ? error.message : 'Failed to release expired holds'
    };
  }
}

/**
 * Gets statistics about current table slot holds
 */
export async function getTableSlotHoldStats(
  prisma: PrismaClient
): Promise<{ 
  success: boolean; 
  totalHolds: number; 
  expiredHolds: number; 
  activeHolds: number;
  error?: string 
}> {
  try {
    const now = new Date();

    const [totalHolds, expiredHolds] = await Promise.all([
      prisma.tableAvailabilitySlot.count({
        where: {
          status: TableSlotStatus.HELD
        }
      }),
      prisma.tableAvailabilitySlot.count({
        where: {
          status: TableSlotStatus.HELD,
          holdExpiresAt: {
            lt: now
          }
        }
      })
    ]);

    return {
      success: true,
      totalHolds,
      expiredHolds,
      activeHolds: totalHolds - expiredHolds
    };
  } catch (error) {
    return {
      success: false,
      totalHolds: 0,
      expiredHolds: 0,
      activeHolds: 0,
      error: error instanceof Error ? error.message : 'Failed to get hold stats'
    };
  }
}
