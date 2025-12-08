import { PrismaClient, Prisma, MealType, ReservationType, TableSlotStatus } from "../../prisma/generated/prisma";
import { z } from "zod";
import { format } from 'date-fns';

const GetTableReservationsQueryInput = z.object({
  date: z.date().optional(),
  searchQuery: z.string().optional(),
  page: z.number().default(1),
  pageSize: z.number().default(10),
  businessId: z.number(),
  restaurantId: z.number(),
  mealType: z.nativeEnum(MealType).optional(),
  dateRange: z.object({
    from: z.date(),
    to: z.date(),
  }).optional(),
  currentMealType: z.nativeEnum(MealType),
  area: z.string().optional(),
  status: z.string().optional()
});

type GetTableReservationsQueryInputType = z.infer<typeof GetTableReservationsQueryInput>;

const getISTDate = () => {
  const now = new Date();
  // Start of day in local timezone
  now.setHours(0, 0, 0, 0);
  return now;
};

export async function getTableReservations(
  prisma: PrismaClient,
  input: GetTableReservationsQueryInputType
) {
  try {
    GetTableReservationsQueryInput.parse(input);
    
    console.log('📋 [GET-TABLE-RESERVATIONS] Query parameters:', {
      restaurantId: input.restaurantId,
      date: input.date,
      status: input.status,
      area: input.area
    });
    
    const skip = (input.page - 1) * input.pageSize;
    const istDate = getISTDate();

    // Base where condition for table reservations only
    const baseWhere: Prisma.ReservationWhereInput = {
      restaurantId: input.restaurantId,
      restaurant: {
        businessId: input.businessId
      },
      status: {
        in: ['CONFIRMED', 'ACCEPTED', 'SEATED', 'COMPLETED', 'CANCELLED']
      },
      // Filter for table reservations only
      reservationType: {
        in: [ReservationType.TABLE_ONLY, ReservationType.BUFFET_AND_TABLE]
      },
      ...(input.dateRange ? {
        reservationDate: {
          gte: input.dateRange.from,
          lte: input.dateRange.to,
        },
      } : {
        reservationDate: {
          gte: input.date || istDate,
          lt: new Date((input.date || istDate).getTime() + 24 * 60 * 60 * 1000),
        },
      }),
      ...(input.mealType && {
        mealType: input.mealType as MealType,
      }),
      ...(input.searchQuery && {
        OR: [
          { id: { equals: parseInt(input.searchQuery) || undefined } },
          { reservationName: { contains: input.searchQuery, mode: 'insensitive' } },
          { contactPhone: { contains: input.searchQuery, mode: 'insensitive' } },
        ],
      }),
      ...(input.status && {
        status: input.status,
      }),
      ...(input.area && {
        tableAssignment: {
          assignedSection: {
            sectionName: input.area
          }
        }
      }),
    };

    // Create a where condition excluding CANCELLED (NO_SHOW) for counts
    const baseWhereExcludingNoShow: Prisma.ReservationWhereInput = {
      ...baseWhere,
      status: {
        in: ['CONFIRMED', 'ACCEPTED', 'SEATED', 'COMPLETED']
      }
    };

    const [reservations, displayTotal, totalCountExcludingNoShow, statusCounts, totalRevenue] = await Promise.all([
      prisma.reservation.findMany({
        where: baseWhere,
        select: {
          id: true,
          reservationNumber: true,
          reservationName: true,
          contactPhone: true,
          reservationDate: true,
          reservationTime: true,
          mealType: true,
          adultCount: true,
          childCount: true,
          totalAmount: true,
          advancePaymentAmount: true,
          remainingPaymentAmount: true,
          createdBy: true,
          createdAt: true,
          status: true,
          specialRequests: true,
          reservationType: true,
          customer: {
            select: {
              email: true
            }
          },
          restaurant: {
            select: {
              id: true,
              advancePaymentPercentage: true,
              name: true
            }
          },
          promoCodeUsage: {
            select: {
              originalAmount: true,
              discountAmount: true,
              promoCode: {
                select: {
                  code: true
                }
              }
            }
          },
          financialData: {
            select: {
              totalAfterDiscount: true,
              advancePayment: true,
              balanceDue: true,
              isPaid: true
            }
          },
          // Include table assignment data
          tableAssignment: {
            select: {
              assignedSection: {
                select: {
                  sectionName: true
                }
              },
              assignedTable: {
                select: {
                  tableName: true,
                  seatingCapacity: true
                }
              },
              tableStartTime: true,
              tableEndTime: true
            }
          },
          // Include table sets (merged tables)
          tableSets: {
            where: {
              status: {
                in: ['ACTIVE', 'PENDING_MERGE']
              }
            },
            select: {
              id: true,
              tableIds: true,
              slotIds: true,
              primaryTableId: true,
              status: true,
              combinedCapacity: true
            }
          },
          // Include applied policies
          appliedPolicies: {
            select: {
              id: true,
              policyId: true,
              wasAccepted: true,
              wasSkipped: true,
              selectedOptionId: true,
              policy: {
                select: {
                  id: true,
                  name: true,
                  title: true
                }
              }
            }
          }
        },
        skip,
        take: input.pageSize,
        orderBy: [
          { reservationTime: 'asc' }, // Sort by actual reservation time instead of meal type
          { reservationDate: 'desc' },
          { id: 'desc' },
        ],
      }),
      prisma.reservation.count({
        where: baseWhere
      }),
      // Count excluding CANCELLED (NO_SHOW) for analytics totalCount
      prisma.reservation.count({
        where: baseWhereExcludingNoShow
      }),
      prisma.reservation.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: {
          status: true
        }
      }),
      // Exclude CANCELLED (NO_SHOW) from revenue calculation
      prisma.reservation.aggregate({
        where: baseWhereExcludingNoShow,
        _sum: {
          totalAmount: true
        }
      })
    ]);

    // Transform status counts into a more usable format
    const statusCountMap = {
      confirmedCount: 0,
      acceptedCount: 0,
      seatedCount: 0,
      completedCount: 0,
      cancelledCount: 0,
      totalCount: totalCountExcludingNoShow // Exclude NO_SHOW from total count
    };

    statusCounts.forEach((statusCount) => {
      const status = statusCount.status;
      const count = statusCount._count.status;
      
      switch (status) {
        case 'CONFIRMED':
          statusCountMap.confirmedCount = count;
          break;
        case 'ACCEPTED':
          statusCountMap.acceptedCount = count;
          break;
        case 'SEATED':
          statusCountMap.seatedCount = count;
          break;
        case 'COMPLETED':
          statusCountMap.completedCount = count;
          break;
        case 'CANCELLED':
          statusCountMap.cancelledCount = count;
          break;
      }
    });

    console.log('✅ [GET-TABLE-RESERVATIONS] Fetched reservations with policies:', {
      totalCount: reservations.length,
      reservationsWithPolicies: reservations.filter(r => r.appliedPolicies && r.appliedPolicies.length > 0).length
    });

    return {
      reservations,
      total: displayTotal,
      confirmedCount: statusCountMap.confirmedCount,
      acceptedCount: statusCountMap.acceptedCount,
      seatedCount: statusCountMap.seatedCount,
      completedCount: statusCountMap.completedCount,
      cancelledCount: statusCountMap.cancelledCount,
      totalCount: statusCountMap.totalCount,
      totalRevenue: Number(totalRevenue._sum.totalAmount) || 0
    };
  } catch (error) {
    console.error('Error in getTableReservations:', error);
    throw error;
  }
}

/**
 * Get available tables for a specific time slot when editing a reservation
 * This function filters tables based on availability for the specific date, meal type, and time slot
 */
export async function getAvailableTablesForTimeSlot(
  prisma: PrismaClient,
  input: {
    restaurantId: number;
    date: Date;
    mealType: MealType;
    partySize: number;
    excludeReservationId?: number;
    sectionId?: number; // Optional: filter by specific section
  }
) {
  try {
    const { restaurantId, date, mealType, partySize, excludeReservationId, sectionId } = input;

    // Get meal service details to determine time slot
    const mealService = await prisma.restaurantMealService.findFirst({
      where: {
        restaurantId,
        mealType,
        isAvailable: true
      }
    });

    if (!mealService) {
      return {
        success: false,
        error: 'Meal service not found for the specified meal type'
      };
    }

    // Build the base query for tables
    const baseTableQuery = {
      restaurantId,
      isActive: true,
      seatingCapacity: {
        gte: partySize
      },
      ...(sectionId && { sectionId })
    };

    // Get all tables that meet the capacity requirement
    const allTables = await prisma.restaurantTable.findMany({
      where: baseTableQuery,
      include: {
        section: {
          select: {
            id: true,
            sectionName: true
          }
        }
      }
    });

    // Get all slots for this time period to check availability
    const timeSlots = await prisma.tableAvailabilitySlot.findMany({
      where: {
        restaurantId,
        date,
        AND: [
          {
            startTime: {
              lt: mealService.serviceEndTime // slot starts before meal service ends
            }
          },
          {
            endTime: {
              gt: mealService.serviceStartTime // slot ends after meal service starts
            }
          }
        ]
      },
      include: {
        table: {
          include: {
            section: {
              select: {
                id: true,
                sectionName: true
              }
            }
          }
        }
      }
    });

    // Create a map of table ID to overlapping slots for quick lookup
    const slotMap = new Map();
    timeSlots.forEach(slot => {
      if (!slotMap.has(slot.tableId)) {
        slotMap.set(slot.tableId, []);
      }
      slotMap.get(slot.tableId).push(slot);
    });

    // Filter tables based on availability
    const availableTables = [];

    for (const table of allTables) {
      const overlappingSlotsForTable = slotMap.get(table.id) || [];
      
      // Check if any overlapping slot makes this table unavailable
      let isTableAvailable = true;
      let currentReservationSlot = null;
      
      for (const slot of overlappingSlotsForTable) {
        if (slot.status === 'RESERVED' && slot.reservationId === excludeReservationId) {
          // This is the current reservation's slot - mark it as current
          currentReservationSlot = slot;
        } else if (slot.status === 'RESERVED' && slot.reservationId !== excludeReservationId) {
          // Slot is reserved by another reservation - table is unavailable
          console.log(`Table ${table.tableName} unavailable - reserved by reservation ${slot.reservationId}`);
          isTableAvailable = false;
          break;
        } else if (slot.status === 'HELD') {
          // Slot is held - table is unavailable
          console.log(`Table ${table.tableName} unavailable - slot is held`);
          isTableAvailable = false;
          break;
        } else if (slot.status === 'BLOCKED' || slot.status === 'MAINTENANCE') {
          // Slot is blocked or under maintenance - table is unavailable
          console.log(`Table ${table.tableName} unavailable - slot status: ${slot.status}`);
          isTableAvailable = false;
          break;
        }
        // If slot.status === 'AVAILABLE', the table is still available
      }
      
      if (isTableAvailable) {
        availableTables.push({
          id: table.id,
          tableName: table.tableName,
          seatingCapacity: table.seatingCapacity,
          sectionId: table.section.id,
          sectionName: table.section.sectionName,
          isActive: table.isActive,
          availabilityStatus: currentReservationSlot ? 'CURRENT_RESERVATION' : 'AVAILABLE'
        });
      }
    }

    return {
      success: true,
      tables: availableTables,
      mealService: {
        startTime: mealService.serviceStartTime,
        endTime: mealService.serviceEndTime
      }
    };
  } catch (error) {
    console.error('Error getting available tables for time slot:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get available tables for time slot'
    };
  }
}

/**
 * Validate table availability for updates with proper slot management
 */
export async function validateTableAvailabilityForUpdate(
  prisma: PrismaClient,
  input: {
    restaurantId: number;
    reservationId: number;
    newTableId?: number;
    newSectionId?: number;
    date: Date;
    mealType: MealType;
    partySize: number;
  }
) {
  try {
    const { restaurantId, reservationId, newTableId, newSectionId, date, mealType, partySize } = input;

    // Get meal service details to determine time slot
    const mealService = await prisma.restaurantMealService.findFirst({
      where: {
        restaurantId,
        mealType,
        isAvailable: true
      }
    });

    if (!mealService) {
      return {
        success: false,
        error: 'Meal service not found for the specified meal type'
      };
    }

    // If we're changing tables, validate the new table
    if (newTableId) {
      // Check if the table exists and is active
      const newTable = await prisma.restaurantTable.findUnique({
        where: { id: newTableId },
        include: {
          section: true
        }
      });

      if (!newTable) {
        return {
          success: false,
          error: 'Selected table does not exist'
        };
      }

      if (!newTable.isActive) {
        return {
          success: false,
          error: 'Selected table is not active'
        };
      }

      // Check if section matches (if section is being changed)
      if (newSectionId && newTable.sectionId !== newSectionId) {
        return {
          success: false,
          error: 'Selected table does not belong to the specified section'
        };
      }

      // Check table availability for the time slot
      const conflictingSlot = await prisma.tableAvailabilitySlot.findFirst({
        where: {
          tableId: newTableId,
          date,
          startTime: mealService.serviceStartTime,
          endTime: mealService.serviceEndTime,
          status: {
            in: ['RESERVED', 'HELD']
          },
          reservationId: {
            not: reservationId
          }
        },
        include: {
          reservation: {
            select: {
              id: true,
              reservationNumber: true,
              reservationName: true
            }
          }
        }
      });

      if (conflictingSlot) {
        if (conflictingSlot.status === 'RESERVED') {
          return {
            success: false,
            error: `Table ${newTable.tableName} is already reserved by reservation ${conflictingSlot.reservation?.reservationNumber} (${conflictingSlot.reservation?.reservationName}) for this time slot`
          };
        } else if (conflictingSlot.status === 'HELD') {
          return {
            success: false,
            error: `Table ${newTable.tableName} is currently held for another reservation`
          };
        }
      }
    }

    // If we're changing sections, validate the section exists
    if (newSectionId) {
      const section = await prisma.restaurantSection.findUnique({
        where: { id: newSectionId }
      });

      if (!section) {
        return {
          success: false,
          error: 'Selected section does not exist'
        };
      }

      if (!section.isActive) {
        return {
          success: false,
          error: 'Selected section is not active'
        };
      }
    }

    return {
      success: true,
      data: {
        isAvailable: true
      }
    };
  } catch (error) {
    console.error('Error validating table availability for update:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate table availability'
    };
  }
}

// Table reservation status change functions
export async function completeTableReservation(
  prisma: PrismaClient,
  reservationId: string
) {
  try {
    const reservation = await prisma.reservation.update({
      where: { id: parseInt(reservationId) },
      data: { status: 'COMPLETED' },
      select: {
        id: true,
        status: true //To complete it is only enough to return the status because if we want to fetch the reservation data we can have fetch function seperately.
      }
    });

    return {
      success: true,
      data: reservation
    };
  } catch (error) {
    console.error('Error completing table reservation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to complete reservation'
    };
  }
}

export async function acceptTableReservation(
  prisma: PrismaClient,
  reservationId: string
) {
  try {
    const reservation = await prisma.reservation.update({
      where: { id: parseInt(reservationId) },
      data: { status: 'ACCEPTED' },
      select: {
        id: true,         
        status: true  //To accept it is only enough to return the status because if we want to fetch the reservation data we can have fetch function seperately.
      }
    });

    return {
      success: true,
      data: reservation
    };
  } catch (error) {
    console.error('Error accepting table reservation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to accept reservation'
    };
  }
}

export async function seatTableReservation(
  prisma: PrismaClient,
  reservationId: string
) {
  try {
    const reservation = await prisma.reservation.update({
      where: { id: parseInt(reservationId) },
      data: { status: 'SEATED' },
      select: {
        id: true,
        status: true
      }
    });

    return {
      success: true,
      data: reservation
    };
  } catch (error) {
    console.error('Error seating table reservation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to seat reservation'
    };
  }
}

export async function pendingTableReservation(
  prisma: PrismaClient,
  reservationId: string
) {
  try {
    const reservation = await prisma.reservation.update({
      where: { id: parseInt(reservationId) },
      data: { status: 'CONFIRMED' }, //To pending it is only enough to return the status because if we want to fetch the reservation data we can have fetch function seperately.
      select: {
        id: true,
        status: true
      }
    });

    return {
      success: true,
      data: reservation
    };
  } catch (error) {
    console.error('Error setting table reservation to pending:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set reservation to pending'
    };
  }
}

/**
 * Helper function to dissolve all table sets for a reservation
 * This is called when a reservation is cancelled/marked as no-show
 * It restores all secondary slots to their original statuses
 */
async function dissolveReservationTableSets(
  tx: any,
  reservationId: number
): Promise<{ dissolvedCount: number; errors: string[] }> {
  const errors: string[] = [];
  let dissolvedCount = 0;

  try {
    console.log(`🔍 [DISSOLVE-TABLE-SETS] Finding table sets for reservation ${reservationId}`);

    // Find all ACTIVE or PENDING_MERGE table sets for this reservation
    const tableSets = await tx.tableSet.findMany({
      where: {
        reservationId: reservationId,
        status: {
          in: ['ACTIVE', 'PENDING_MERGE']
        }
      }
    });

    console.log(`🔍 [DISSOLVE-TABLE-SETS] Found ${tableSets.length} table sets to dissolve`);

    // Process each table set
    for (const tableSet of tableSets) {
      try {
        console.log(`🔄 [DISSOLVE-TABLE-SETS] Processing table set ${tableSet.id}`, {
          tableIds: tableSet.tableIds,
          slotIds: tableSet.slotIds,
          primaryTableId: tableSet.primaryTableId,
          status: tableSet.status
        });

        // Get the index of the primary table to exclude it from restoration
        const primarySlotIndex = (tableSet.tableIds as number[]).indexOf(tableSet.primaryTableId);
        
        // Get all secondary slot IDs (exclude primary slot)
        const secondarySlotIds = (tableSet.slotIds as number[]).filter(
          (_: any, idx: number) => idx !== primarySlotIndex
        );

        console.log(`🔄 [DISSOLVE-TABLE-SETS] Secondary slot IDs to restore:`, secondarySlotIds);

        // Free all secondary slots - set them to AVAILABLE since the reservation is cancelled
        // Note: We don't restore to original status because the reservation is being cancelled/no-show
        // All merged tables should be freed and made available again
        for (const slotId of secondarySlotIds) {
          console.log(`🔄 [DISSOLVE-TABLE-SETS] Freeing secondary slot ${slotId} - setting to AVAILABLE`);

          await tx.tableAvailabilitySlot.update({
            where: { id: slotId },
            data: {
              status: 'AVAILABLE' as TableSlotStatus,
              reservationId: null,
              holdExpiresAt: null
            }
          });
          
          console.log(`✅ [DISSOLVE-TABLE-SETS] Freed slot ${slotId}`);
        }

        // Mark the table set as DISSOLVED
        await tx.tableSet.update({
          where: { id: tableSet.id },
          data: {
            status: 'DISSOLVED',
            dissolvedAt: new Date(),
            dissolvedBy: 'SYSTEM_NO_SHOW'
          }
        });

        dissolvedCount++;
        console.log(`✅ [DISSOLVE-TABLE-SETS] Successfully dissolved table set ${tableSet.id}`);
      } catch (setError) {
        const errorMsg = `Failed to dissolve table set ${tableSet.id}: ${setError instanceof Error ? setError.message : 'Unknown error'}`;
        console.error(`❌ [DISSOLVE-TABLE-SETS] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    console.log(`✅ [DISSOLVE-TABLE-SETS] Completed: dissolved ${dissolvedCount} table sets with ${errors.length} errors`);
    
    return { dissolvedCount, errors };
  } catch (error) {
    const errorMsg = `Error dissolving table sets: ${error instanceof Error ? error.message : 'Unknown error'}`;
    console.error(`❌ [DISSOLVE-TABLE-SETS] ${errorMsg}`);
    errors.push(errorMsg);
    return { dissolvedCount, errors };
  }
}

export async function cancelTableReservation(
  prisma: PrismaClient,
  reservationId: string
) {
  try {
    return await prisma.$transaction(async (tx) => {
      // 1. Get the reservation with its table assignment
      const reservation = await tx.reservation.findUnique({
        where: { id: parseInt(reservationId) },
        include: {
          tableAssignment: true
        }
      });

      if (!reservation) {
        throw new Error('Reservation not found');
      }

      console.log(`🚫 [CANCEL-RESERVATION] Processing cancellation for reservation ${reservationId}`);

      // 2. Dissolve all table sets (merged tables) for this reservation
      const { dissolvedCount, errors } = await dissolveReservationTableSets(tx, reservation.id);
      
      if (dissolvedCount > 0) {
        console.log(`✅ [CANCEL-RESERVATION] Dissolved ${dissolvedCount} table sets`);
      }
      
      if (errors.length > 0) {
        console.warn(`⚠️ [CANCEL-RESERVATION] Encountered errors while dissolving table sets:`, errors);
        // Continue with cancellation even if there were errors dissolving table sets
      }

      // 3. Release the table slot if one is assigned
      if (reservation.tableAssignment?.slotId) {
        await tx.tableAvailabilitySlot.update({
          where: { id: reservation.tableAssignment.slotId },
          data: {
            status: 'AVAILABLE',
            reservationId: null,
            holdExpiresAt: null
          }
        });

        // Remove any hold records for this slot
        await tx.reservationTableHold.deleteMany({
          where: { slotId: reservation.tableAssignment.slotId }
        });

        console.log(`✅ [CANCEL-RESERVATION] Released primary table slot ${reservation.tableAssignment.slotId}`);
      }

      // 4. Update reservation status to CANCELLED
      const updatedReservation = await tx.reservation.update({
        where: { id: parseInt(reservationId) },
        data: { status: 'CANCELLED' }
      });

      console.log(`✅ [CANCEL-RESERVATION] Successfully cancelled reservation ${reservationId}`);

      return {
        success: true,
        data: updatedReservation,
        meta: {
          dissolvedTableSets: dissolvedCount,
          errors: errors.length > 0 ? errors : undefined
        }
      };
    });
  } catch (error) {
    console.error('Error cancelling table reservation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel reservation'
    };
  }
}

/**
 * Get available tables for a specific section, date, and time slot
 * Excludes tables that are already assigned to other reservations
 */
export async function getAvailableTablesForSection(
  prisma: PrismaClient,
  input: {
    restaurantId: number;
    sectionName: string;
    date: Date;
    startTime: Date;
    endTime: Date;
    partySize: number;
    excludeReservationId?: number; // Optional: exclude current reservation from conflict check
  }
) {
  try {
    const { restaurantId, sectionName, date, startTime, endTime, partySize, excludeReservationId } = input;

    // Get current time to check for expired holds
    const now = new Date();

    // Get available slots for the specified section, date, and time range
    const availableSlots = await prisma.tableAvailabilitySlot.findMany({
      where: {
        restaurantId,
        date: date,
        startTime: {
          gte: startTime,
          lt: endTime
        },
        OR: [
          { status: 'AVAILABLE' },
          {
            status: 'HELD',
            holdExpiresAt: {
              gt: now // Only include holds that haven't expired
            }
          }
        ],
        table: {
          section: {
            sectionName: sectionName
          },
          isActive: true,
          seatingCapacity: {
            gte: partySize
          }
        }
      },
      include: {
        table: {
          include: {
            section: {
              select: {
                sectionName: true
              }
            }
          }
        }
      }
    });

    // Get tables that are already assigned to other reservations in this time slot
    const assignedTables = await prisma.tableAvailabilitySlot.findMany({
      where: {
        restaurantId,
        date: date,
        startTime: {
          gte: startTime,
          lt: endTime
        },
        status: 'RESERVED',
        reservationId: {
          not: excludeReservationId ? excludeReservationId : undefined
        },
        table: {
          section: {
            sectionName: sectionName
          }
        }
      },
      select: {
        tableId: true
      }
    });

    const assignedTableIds = new Set(assignedTables.map(slot => slot.tableId));

    // Get all tables in the section that meet the capacity requirement
    const allSectionTables = await prisma.restaurantTable.findMany({
      where: {
        restaurantId,
        isActive: true,
        seatingCapacity: {
          gte: partySize
        },
        section: {
          sectionName: sectionName
        }
      },
      include: {
        section: {
          select: {
            sectionName: true
          }
        }
      }
    });

    // Create a map of available tables
    const availableTablesMap = new Map();

    // Add tables from available slots
    availableSlots.forEach(slot => {
      const table = slot.table;
      if (!assignedTableIds.has(table.id)) {
        availableTablesMap.set(table.id, {
          id: table.id,
          tableName: table.tableName,
          seatingCapacity: table.seatingCapacity,
          sectionName: table.section.sectionName,
          isActive: table.isActive
        });
      }
    });

    // Add tables that don't have any availability slots (they are available by default)
    allSectionTables.forEach(table => {
      if (!availableTablesMap.has(table.id) && !assignedTableIds.has(table.id)) {
        // Check if this table has any slots for this date/time
        const hasSlotsForTimeSlot = availableSlots.some(slot => slot.tableId === table.id) ||
                                   assignedTables.some(slot => slot.tableId === table.id);
        
        // If no slots exist for this time slot, the table is available
        if (!hasSlotsForTimeSlot) {
          availableTablesMap.set(table.id, {
            id: table.id,
            tableName: table.tableName,
            seatingCapacity: table.seatingCapacity,
            sectionName: table.section.sectionName,
            isActive: table.isActive
          });
        }
      }
    });

    return {
      success: true,
      tables: Array.from(availableTablesMap.values())
    };
  } catch (error) {
    console.error('Error in getAvailableTablesForSection:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get available tables'
    };
  }
}

/**
 * Get available sections for a specific date and time slot
 */
export async function getAvailableSectionsForTimeSlot(
  prisma: PrismaClient,
  input: {
    restaurantId: number;
    date: Date;
    startTime: Date;
    endTime: Date;
    partySize: number;
  }
) {
  try {
    const { restaurantId, date, startTime, endTime, partySize } = input;

    // Get current time to check for expired holds
    const now = new Date();

    // Get all sections with tables that meet the capacity requirement
    const allSections = await prisma.restaurantSection.findMany({
      where: {
        restaurantId,
        isActive: true,
        tables: {
          some: {
            isActive: true,
            seatingCapacity: {
              gte: partySize
            }
          }
        }
      },
      select: {
        id: true,
        sectionName: true,
        description: true,
        capacity: true,
        displayOrder: true,
        tables: {
          where: {
            isActive: true,
            seatingCapacity: {
              gte: partySize
            }
          },
          select: {
            id: true,
            tableName: true,
            seatingCapacity: true
          }
        }
      },
      orderBy: {
        displayOrder: 'asc'
      }
    });

    // Get all availability slots for the time period
    const allSlots = await prisma.tableAvailabilitySlot.findMany({
      where: {
        restaurantId,
        date: date,
        startTime: {
          gte: startTime,
          lt: endTime
        }
      },
      select: {
        tableId: true,
        status: true,
        holdExpiresAt: true
      }
    });

    // Get reserved table IDs for this time slot
    const reservedTableIds = new Set(
      allSlots
        .filter(slot => slot.status === 'RESERVED')
        .map(slot => slot.tableId)
    );

    // Get available table IDs for this time slot
    const availableTableIds = new Set(
      allSlots
        .filter(slot => 
          slot.status === 'AVAILABLE' || 
          (slot.status === 'HELD' && slot.holdExpiresAt && slot.holdExpiresAt > now)
        )
        .map(slot => slot.tableId)
    );

    // Filter sections to only include those with available tables
    const availableSections = allSections.filter(section => {
      return section.tables.some(table => {
        // A table is available if:
        // 1. It has an available slot, OR
        // 2. It has no slots for this time period (available by default), AND
        // 3. It's not reserved
        const hasAvailableSlot = availableTableIds.has(table.id);
        const hasAnySlot = allSlots.some(slot => slot.tableId === table.id);
        const isReserved = reservedTableIds.has(table.id);
        
        return hasAvailableSlot || (!hasAnySlot && !isReserved);
      });
    });

    return {
      success: true,
      sections: availableSections
    };
  } catch (error) {
    console.error('Error getting available sections for time slot:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get available sections'
    };
  }
}

/**
 * Check if a party size change is valid for a reservation
 */
export async function validatePartySizeChange(
  prisma: PrismaClient,
  input: {
    restaurantId: number;
    reservationId: number;
    newPartySize: number;
    date: Date;
    mealType: MealType;
  }
) {
  try {
    const { restaurantId, reservationId, newPartySize, date, mealType } = input;

    // Get restaurant capacity for the meal type
    const mealService = await prisma.restaurantMealService.findFirst({
      where: {
        restaurantId,
        mealType,
        isAvailable: true
      }
    });

    if (!mealService) {
      return {
        success: false,
        error: 'Meal service not available for this restaurant and meal type'
      };
    }

    // Get restaurant capacity for the specific date
    const capacityRecord = await prisma.restaurantCapacity.findFirst({
      where: {
        restaurantId,
        serviceId: mealService.id,
        date: date,
        isEnabled: true
      }
    });

    if (!capacityRecord) {
      return {
        success: false,
        error: 'No capacity record found for this date and meal type'
      };
    }

    // Check if the new party size exceeds available capacity
    const availableSeats = capacityRecord.totalSeats - capacityRecord.bookedSeats;
    
    // Get current reservation's party size to calculate the difference
    const currentReservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { adultCount: true, childCount: true }
    });

    if (!currentReservation) {
      return {
        success: false,
        error: 'Reservation not found'
      };
    }

    const currentPartySize = currentReservation.adultCount + currentReservation.childCount;
    const partySizeDifference = newPartySize - currentPartySize;

    if (partySizeDifference > availableSeats) {
      return {
        success: false,
        error: `Party size change not allowed. Only ${availableSeats} seats available for this time slot.`
      };
    }

    return {
      success: true
    };
  } catch (error) {
    console.error('Error validating party size change:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate party size change'
    };
  }
}

export async function updateTableReservationDetailsQuery(
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
) {
  try {
    const {
      reservationId,
      newAdultCount,
      newChildCount,
      newSectionId,
      newTableId,
      updatedBy,
      updateReason
    } = input;

    // Get current reservation details
    const currentReservation = await prisma.reservation.findUnique({
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

    if (!currentReservation) {
      return {
        success: false,
        error: 'Reservation not found'
      };
    }

    // Start a transaction to update reservation and table assignment with slot management
    const result = await prisma.$transaction(async (tx) => {
      // Update reservation details
      const updatedReservation = await tx.reservation.update({
        where: { id: reservationId },
        data: {
          ...(newAdultCount !== undefined && { adultCount: newAdultCount }),
          ...(newChildCount !== undefined && { childCount: newChildCount }),
          lastModifiedAt: new Date()
        },
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

      // Handle table assignment changes with slot management
      if (newSectionId !== undefined || newTableId !== undefined) {
        const currentTableId = currentReservation.tableAssignment?.assignedTableId;
        const currentSlotId = currentReservation.tableAssignment?.slotId;
        
        // If we're changing tables, we need to handle slot management
        if (newTableId !== undefined && newTableId !== currentTableId) {
          // Step 1: Free the current slot if it exists
          if (currentSlotId) {
            await tx.tableAvailabilitySlot.update({
              where: { id: currentSlotId },
              data: {
                status: 'AVAILABLE',
                reservationId: null
              }
            });
            console.log(`Freed slot ${currentSlotId} for table ${currentTableId}`);
          }

          // Step 2: Find or create a new slot for the new table
          if (newTableId) {
            const newTable = await tx.restaurantTable.findUnique({
              where: { id: newTableId }
            });

            if (newTable) {
              // Get meal service to determine time slots
              const mealService = await tx.restaurantMealService.findFirst({
                where: {
                  restaurantId: currentReservation.restaurantId,
                  mealType: currentReservation.mealType
                }
              });

              if (mealService) {
                // Check if the table is available for this time slot (inline check for transaction)
                const conflictingSlot = await tx.tableAvailabilitySlot.findFirst({
                  where: {
                    tableId: newTableId,
                    date: currentReservation.reservationDate,
                    startTime: mealService.serviceStartTime,
                    endTime: mealService.serviceEndTime,
                    status: 'RESERVED',
                    reservationId: {
                      not: reservationId
                    }
                  },
                  include: {
                    reservation: {
                      select: {
                        id: true,
                        reservationNumber: true,
                        reservationName: true
                      }
                    }
                  }
                });

                if (conflictingSlot) {
                  throw new Error(`Table ${newTable.tableName} is already reserved by reservation ${conflictingSlot.reservation?.reservationNumber} (${conflictingSlot.reservation?.reservationName}) for this time slot`);
                }

                // Check for other unavailable slot statuses
                const unavailableSlot = await tx.tableAvailabilitySlot.findFirst({
                  where: {
                    tableId: newTableId,
                    date: currentReservation.reservationDate,
                    startTime: mealService.serviceStartTime,
                    endTime: mealService.serviceEndTime,
                    status: {
                      in: ['HELD', 'BLOCKED', 'MAINTENANCE']
                    }
                  }
                });

                if (unavailableSlot) {
                  throw new Error(`Table ${newTable.tableName} is not available for this time slot (status: ${unavailableSlot.status})`);
                }

                // Find existing slot for this table on the reservation date
                let newSlot = await tx.tableAvailabilitySlot.findFirst({
                  where: {
                    tableId: newTableId,
                    date: currentReservation.reservationDate,
                    startTime: mealService.serviceStartTime,
                    endTime: mealService.serviceEndTime,
                    status: 'AVAILABLE'
                  }
                });

                // If no available slot exists, create one
                if (!newSlot) {
                  newSlot = await tx.tableAvailabilitySlot.create({
                    data: {
                      restaurantId: currentReservation.restaurantId,
                      tableId: newTableId,
                      date: currentReservation.reservationDate,
                      startTime: mealService.serviceStartTime,
                      endTime: mealService.serviceEndTime,
                      status: 'RESERVED',
                      reservationId: reservationId
                    }
                  });
                  console.log(`Created new slot ${newSlot.id} for table ${newTableId}`);
                } else {
                  // Reserve the existing slot
                  await tx.tableAvailabilitySlot.update({
                    where: { id: newSlot.id },
                    data: {
                      status: 'RESERVED',
                      reservationId: reservationId
                    }
                  });
                  console.log(`Reserved existing slot ${newSlot.id} for table ${newTableId}`);
                }
              }
            }
          }
        }

        // Step 3: Update table assignment
        const updateData: any = {};
        
        if (newSectionId !== undefined) {
          updateData.assignedSectionId = newSectionId;
        }
        
        if (newTableId !== undefined) {
          updateData.assignedTableId = newTableId;
          
          // Update slot reference if we found/created a new slot
          if (newTableId) {
            const newSlot = await tx.tableAvailabilitySlot.findFirst({
              where: {
                tableId: newTableId,
                date: currentReservation.reservationDate,
                reservationId: reservationId
              }
            });
            
            if (newSlot) {
              updateData.slotId = newSlot.id;
            }
          } else {
            // If no table is assigned, clear the slot reference
            updateData.slotId = null;
          }
        }

        // If table assignment doesn't exist, create it
        if (!currentReservation.tableAssignment) {
          await tx.reservationTableAssignment.create({
            data: {
              reservationId,
              assignedSectionId: newSectionId || null,
              assignedTableId: newTableId || null,
              slotId: updateData.slotId || null
            }
          });
        } else {
          // Update existing table assignment
          await tx.reservationTableAssignment.update({
            where: { reservationId },
            data: updateData
          });
        }
      }

      // Fetch the updated reservation with the latest table assignment
      const finalReservation = await tx.reservation.findUnique({
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

      return finalReservation;
    });

    return {
      success: true,
      updatedReservation: result
    };
  } catch (error) {
    console.error('Error updating table reservation details:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update reservation details'
    };
  }
}

/**
 * Update table reservation details with proper time-based slot management
 */
export async function updateTableReservationDetailsWithTimeBasedSlots(
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
) {
  try {
    const {
      reservationId,
      newAdultCount,
      newChildCount,
      newSectionId,
      newTableId,
      updatedBy,
      updateReason
    } = input;

    // Get current reservation details
    const currentReservation = await prisma.reservation.findUnique({
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

    if (!currentReservation) {
      return {
        success: false,
        error: 'Reservation not found'
      };
    }

    // Start a transaction to update reservation and table assignment with slot management
    const result = await prisma.$transaction(async (tx) => {
      // Update reservation details
      const updatedReservation = await tx.reservation.update({
        where: { id: reservationId },
        data: {
          ...(newAdultCount !== undefined && { adultCount: newAdultCount }),
          ...(newChildCount !== undefined && { childCount: newChildCount }),
          lastModifiedAt: new Date()
        },
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

      // Handle table assignment changes with time-based slot management
      if (newSectionId !== undefined || newTableId !== undefined) {
        const currentTableId = currentReservation.tableAssignment?.assignedTableId;
        const currentSlotId = currentReservation.tableAssignment?.slotId;
        
        // If we're changing tables, we need to handle slot management
        if (newTableId !== undefined && newTableId !== currentTableId) {
          // Step 1: Free the current slot if it exists
          if (currentSlotId) {
            await tx.tableAvailabilitySlot.update({
              where: { id: currentSlotId },
              data: {
                status: 'AVAILABLE',
                reservationId: null
              }
            });
            console.log(`Freed slot ${currentSlotId} for table ${currentTableId}`);
          }

          // Step 2: Find or create a new slot for the new table using actual reservation time
          if (newTableId) {
            const newTable = await tx.restaurantTable.findUnique({
              where: { id: newTableId }
            });

            if (newTable) {
              // Use the actual reservation time instead of meal service times
              const reservationTimeOnly = new Date(`1970-01-01T${currentReservation.reservationTime.toTimeString().split(' ')[0]}`);

              // Check if the table is available for this specific time slot
              const conflictingSlot = await tx.tableAvailabilitySlot.findFirst({
                where: {
                  tableId: newTableId,
                  date: currentReservation.reservationDate,
                  startTime: reservationTimeOnly,
                  status: 'RESERVED',
                  reservationId: {
                    not: reservationId
                  }
                },
                include: {
                  reservation: {
                    select: {
                      id: true,
                      reservationNumber: true,
                      reservationName: true
                    }
                  }
                }
              });

              if (conflictingSlot) {
                throw new Error(`Table ${newTable.tableName} is already reserved by reservation ${conflictingSlot.reservation?.reservationNumber} (${conflictingSlot.reservation?.reservationName}) for this time slot`);
              }

              // Check for other unavailable slot statuses
              const unavailableSlot = await tx.tableAvailabilitySlot.findFirst({
                where: {
                  tableId: newTableId,
                  date: currentReservation.reservationDate,
                  startTime: reservationTimeOnly,
                  status: {
                    in: ['HELD', 'BLOCKED', 'MAINTENANCE']
                  }
                }
              });

              if (unavailableSlot) {
                throw new Error(`Table ${newTable.tableName} is not available for this time slot (status: ${unavailableSlot.status})`);
              }

              // Find existing slot for this table on the reservation date and time
              let newSlot = await tx.tableAvailabilitySlot.findFirst({
                where: {
                  tableId: newTableId,
                  date: currentReservation.reservationDate,
                  startTime: reservationTimeOnly,
                  status: 'AVAILABLE'
                }
              });

              // If no available slot exists, create one
              if (!newSlot) {
                // For table reservations, we need to determine the end time
                // This could be based on restaurant configuration or default duration
                const defaultSlotDuration = 90; // 90 minutes default
                const endTime = new Date(reservationTimeOnly.getTime() + (defaultSlotDuration * 60 * 1000));
                
                newSlot = await tx.tableAvailabilitySlot.create({
                  data: {
                    restaurantId: currentReservation.restaurantId,
                    tableId: newTableId,
                    date: currentReservation.reservationDate,
                    startTime: reservationTimeOnly,
                    endTime: endTime,
                    status: 'RESERVED',
                    reservationId: reservationId
                  }
                });
                console.log(`Created new time-based slot ${newSlot.id} for table ${newTableId} at ${reservationTimeOnly.toTimeString()}`);
              } else {
                // Reserve the existing slot
                await tx.tableAvailabilitySlot.update({
                  where: { id: newSlot.id },
                  data: {
                    status: 'RESERVED',
                    reservationId: reservationId
                  }
                });
                console.log(`Reserved existing time-based slot ${newSlot.id} for table ${newTableId}`);
              }
            }
          }
        }

        // Step 3: Update table assignment
        const updateData: any = {};
        
        if (newSectionId !== undefined) {
          updateData.assignedSectionId = newSectionId;
        }
        
        if (newTableId !== undefined) {
          updateData.assignedTableId = newTableId;
          
          // Update slot reference if we found/created a new slot
          if (newTableId) {
            const reservationTimeOnly = new Date(`1970-01-01T${currentReservation.reservationTime.toTimeString().split(' ')[0]}`);
            const newSlot = await tx.tableAvailabilitySlot.findFirst({
              where: {
                tableId: newTableId,
                date: currentReservation.reservationDate,
                startTime: reservationTimeOnly,
                reservationId: reservationId
              }
            });
            
            if (newSlot) {
              updateData.slotId = newSlot.id;
            }
          } else {
            // If no table is assigned, clear the slot reference
            updateData.slotId = null;
          }
        }

        // If table assignment doesn't exist, create it
        if (!currentReservation.tableAssignment) {
          await tx.reservationTableAssignment.create({
            data: {
              reservationId,
              assignedSectionId: newSectionId || null,
              assignedTableId: newTableId || null,
              slotId: updateData.slotId || null
            }
          });
        } else {
          // Update existing table assignment
          await tx.reservationTableAssignment.update({
            where: { reservationId },
            data: updateData
          });
        }
      }

      // Fetch the updated reservation with the latest table assignment
      const finalReservation = await tx.reservation.findUnique({
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

      return finalReservation;
    });

    return {
      success: true,
      updatedReservation: result
    };
  } catch (error) {
    console.error('Error updating table reservation details with time-based slots:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update reservation details'
    };
  }
}

export async function updateSpecialRequests(
  prisma: PrismaClient,
  input: {
    reservationId: number;
    specialRequests?: string;
  }
) {
  try {
    const { reservationId, specialRequests } = input;

    const updatedReservation = await prisma.reservation.update({
      where: { id: reservationId },
      data: {
        specialRequests: specialRequests || null,
        lastModifiedAt: new Date()
      }
    });

    return {
      success: true,
      updatedReservation
    };
  } catch (error) {
    console.error('Error updating special requests:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update special requests'
    };
  }
}

export async function getRestaurantSections(
  prisma: PrismaClient,
  input: {
    restaurantId: number;
  }
) {
  try {
    const { restaurantId } = input;

    const sections = await prisma.restaurantSection.findMany({
      where: {
        restaurantId,
        isActive: true,
      },
      orderBy: {
        displayOrder: 'asc',
      },
    });

    return {
      success: true,
      sections
    };
  } catch (error) {
    console.error('Error getting restaurant sections:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get restaurant sections'
    };
  }
}

export async function getRestaurantTables(
  prisma: PrismaClient,
  input: {
    restaurantId: number;
    sectionId?: number;
  }
) {
  try {
    const { restaurantId, sectionId } = input;

    const whereClause: any = {
      restaurantId,
    };

    if (sectionId) {
      whereClause.sectionId = sectionId;
    }

    const tables = await prisma.restaurantTable.findMany({
      where: whereClause,
      select: {
        id: true,
        tableName: true,
        seatingCapacity: true,
        tableType: true,
        isActive: true,
        section: {
          select: {
            id: true,
            sectionName: true,
          }
        },
      },
      orderBy: [
        { section: { displayOrder: 'asc' } },
        { tableName: 'asc' },
      ],
    });

    return {
      success: true,
      tables
    };
  } catch (error) {
    console.error('Error getting restaurant tables:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get restaurant tables'
    };
  }
}

/**
 * Check if a specific table is available for a table reservation on a given date and time
 * This function checks actual table assignments rather than availability slots
 */
export async function checkTableAvailabilityForReservation(
  prisma: PrismaClient,
  input: {
    restaurantId: number;
    tableId: number;
    date: Date;
    mealType: MealType;
    excludeReservationId?: number;
  }
) {
  try {
    const { restaurantId, tableId, date, mealType, excludeReservationId } = input;

    // Get the meal service to determine the time slot
    const mealService = await prisma.restaurantMealService.findFirst({
      where: {
        restaurantId,
        mealType,
        isAvailable: true
      },
      select: {
        serviceStartTime: true,
        serviceEndTime: true
      }
    });

    if (!mealService) {
      return {
        success: false,
        error: 'Meal service not found'
      };
    }

    // Check if the table is already assigned to another reservation on the same date and meal type
    const existingAssignment = await prisma.reservationTableAssignment.findFirst({
      where: {
        assignedTableId: tableId,
        reservation: {
          restaurantId,
          reservationDate: date,
          mealType,
          status: {
            in: ['CONFIRMED', 'ACCEPTED', 'SEATED'] // Only check active reservations
          },
          id: {
            not: excludeReservationId || undefined
          }
        }
      },
      include: {
        reservation: {
          select: {
            id: true,
            reservationNumber: true,
            reservationName: true
          }
        }
      }
    });

    if (existingAssignment) {
      return {
        success: false,
        isAvailable: false,
        error: `Table is already assigned to reservation ${existingAssignment.reservation.reservationNumber} (${existingAssignment.reservation.reservationName})`,
        conflictingReservation: existingAssignment.reservation
      };
    }

    return {
      success: true,
      isAvailable: true
    };
  } catch (error) {
    console.error('Error checking table availability for reservation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check table availability'
    };
  }
}

/**
 * Get available tables for a section on a specific date and meal type for table reservations
 * This function checks actual table assignments rather than availability slots
 */
export async function getAvailableTablesForSectionOnDate(
  prisma: PrismaClient,
  input: {
    restaurantId: number;
    sectionName: string;
    date: Date;
    mealType: MealType;
    partySize: number;
    excludeReservationId?: number;
  }
) {
  try {
    const { restaurantId, sectionName, date, mealType, partySize, excludeReservationId } = input;

    // Get all tables in the section that meet the capacity requirement
    const allSectionTables = await prisma.restaurantTable.findMany({
      where: {
        restaurantId,
        isActive: true,
        seatingCapacity: {
          gte: partySize
        },
        section: {
          sectionName: sectionName
        }
      },
      include: {
        section: {
          select: {
            sectionName: true
          }
        }
      }
    });

    // Check which tables are available (not assigned to other reservations)
    const availableTables = [];

    for (const table of allSectionTables) {
      const availabilityCheck = await checkTableAvailabilityForReservation(prisma, {
        restaurantId,
        tableId: table.id,
        date,
        mealType,
        excludeReservationId
      });

      if (availabilityCheck.success && availabilityCheck.isAvailable) {
        availableTables.push({
          id: table.id,
          tableName: table.tableName,
          seatingCapacity: table.seatingCapacity,
          sectionName: table.section.sectionName,
          isActive: table.isActive
        });
      }
    }

    return {
      success: true,
      tables: availableTables
    };
  } catch (error) {
    console.error('Error getting available tables for section on date:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get available tables'
    };
  }
}

/**
 * Get reservation details for validation
 */
export async function getReservationForValidation(
  prisma: PrismaClient,
  reservationId: number
) {
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { 
        mealType: true, 
        reservationDate: true,
        reservationType: true,
        tableAssignment: {
          include: {
            assignedTable: true
          }
        }
      }
    });

    return {
      success: true,
      reservation
    };
  } catch (error) {
    console.error('Error getting reservation for validation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get reservation for validation'
    };
  }
}

/**
 * Get reservation details with table assignment for slot management
 */
export async function getReservationWithTableAssignment(
  prisma: PrismaClient,
  reservationId: number
) {
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        tableAssignment: {
          include: {
            assignedTable: true,
            assignedSection: true,
            slot: true
          }
        }
      }
    });

    return {
      success: true,
      reservation
    };
  } catch (error) {
    console.error('Error getting reservation with table assignment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get reservation with table assignment'
    };
  }
}

/**
 * Get table details by ID
 */
export async function getTableById(
  prisma: PrismaClient,
  tableId: number
) {
  try {
    const table = await prisma.restaurantTable.findUnique({
      where: { id: tableId }
    });

    return {
      success: true,
      table
    };
  } catch (error) {
    console.error('Error getting table by ID:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get table by ID'
    };
  }
}

/**
 * Check if a table is available for a specific time slot
 */
export async function checkTableAvailabilityForTimeSlot(
  prisma: PrismaClient,
  input: {
    tableId: number;
    date: Date;
    startTime: Date;
    endTime: Date;
    excludeReservationId?: number;
  }
) {
  try {
    const { tableId, date, startTime, endTime, excludeReservationId } = input;

    // Check if there's already a reservation for this table at this time
    const existingSlot = await prisma.tableAvailabilitySlot.findFirst({
      where: {
        tableId,
        date,
        startTime,
        endTime,
        status: 'RESERVED',
        ...(excludeReservationId && {
          reservationId: {
            not: excludeReservationId
          }
        })
      }
    });

    return {
      success: true,
      isAvailable: !existingSlot,
      existingSlot: existingSlot ? {
        id: existingSlot.id,
        reservationId: existingSlot.reservationId
      } : null
    };
  } catch (error) {
    console.error('Error checking table availability for time slot:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check table availability'
    };
  }
}

/**
 * Get all slots for a table on a specific date
 */
export async function getTableSlotsForDate(
  prisma: PrismaClient,
  input: {
    tableId: number;
    date: Date;
  }
) {
  try {
    const { tableId, date } = input;

    const slots = await prisma.tableAvailabilitySlot.findMany({
      where: {
        tableId,
        date
      },
      include: {
        reservation: {
          select: {
            id: true,
            reservationNumber: true,
            reservationName: true
          }
        }
      },
      orderBy: {
        startTime: 'asc'
      }
    });

    return {
      success: true,
      slots
    };
  } catch (error) {
    console.error('Error getting table slots for date:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get table slots'
    };
  }
}

/**
 * Check if a section has available tables for a specific time slot
 */
export async function checkSectionAvailabilityForReservationTime(
  prisma: PrismaClient,
  input: {
    restaurantId: number;
    date: Date;
    reservationTime: Date;
    partySize: number;
    sectionId: number;
    excludeReservationId?: number;
  }
) {
  try {
    const { restaurantId, date, reservationTime, partySize, sectionId, excludeReservationId } = input;

    // Get restaurant's table reservation configuration
    const config = await prisma.tableReservationUtilsConfiguration.findFirst({
      where: { 
        restaurantId,
        isActive: true 
      }
    });

    // Use configured slot duration or default to 90 minutes
    const slotDurationMinutes = config?.defaultSlotMinutes || 90;

    // Convert reservation time to time format for comparison
    // Extract just the time part from the full datetime
    const hours = reservationTime.getHours();
    const minutes = reservationTime.getMinutes();
    const seconds = reservationTime.getSeconds();
    
    // Create a time-only date for comparison (using a base date)
    const reservationTimeOnly = new Date(1970, 0, 1, hours, minutes, seconds);
    
    // Calculate the end time for the reservation using configured duration
    const endTime = new Date(reservationTimeOnly.getTime() + (slotDurationMinutes * 60 * 1000));

    console.log('Section availability check:', {
      originalReservationTime: reservationTime.toISOString(),
      originalHours: reservationTime.getHours(),
      originalMinutes: reservationTime.getMinutes(),
      parsedStartTime: reservationTimeOnly.toTimeString(),
      calculatedEndTime: endTime.toTimeString(),
      duration: slotDurationMinutes,
      sectionId,
      partySize
    });

    // Get current time to check for expired holds
    const now = new Date();
    
    // Get available slots that are:
    // 1. AVAILABLE
    // 2. HELD (if not expired)
    // 3. RESERVED by the current reservation being edited (to allow moving within same section)
    const availableSlots = await prisma.tableAvailabilitySlot.findMany({
      where: {
        restaurantId,
        date,
        OR: [
          { status: TableSlotStatus.AVAILABLE },
          {
            status: TableSlotStatus.HELD,
            holdExpiresAt: {
              gt: now // Only include holds that haven't expired
            }
          },
          // Include the current reservation's slot so it's counted as available
          ...(excludeReservationId ? [{
            status: TableSlotStatus.RESERVED,
            reservationId: excludeReservationId
          }] : [])
        ],
        table: {
          sectionId,
          isActive: true,
          seatingCapacity: {
            gte: partySize
          },
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
                sectionName: true
              }
            }
          }
        }
      }
    });

    if (availableSlots.length === 0) {
      return {
        success: true,
        hasAvailableTables: false,
        reason: 'No available slots found in this section for the specified party size'
      };
    }

    // Check if any slot overlaps with the requested time
    let hasAvailableTable = false;
    let availableTableCount = 0;
    const availableTableIds = new Set();

    for (const slot of availableSlots) {
      // Check if this slot overlaps with our requested time
      const slotStart = slot.startTime;
      const slotEnd = slot.endTime;
      
      // A slot overlaps if:
      // - slot.startTime < requested.endTime AND slot.endTime > requested.startTime
      // OR if the requested time falls within the slot
      const overlaps = (slotStart < endTime && slotEnd > reservationTimeOnly) || 
                      (reservationTimeOnly >= slotStart && reservationTimeOnly < slotEnd);
      
      if (overlaps) {
        // Check if this is the current reservation's slot
        const isCurrentReservation = slot.status === 'RESERVED' && slot.reservationId === excludeReservationId;
        
        if (!availableTableIds.has(slot.tableId)) {
          availableTableIds.add(slot.tableId);
          availableTableCount++;
          hasAvailableTable = true;
        }
      }
    }

    // Get section name from first slot's table
    const firstSlot = availableSlots[0];
    const sectionName = firstSlot && 'table' in firstSlot && firstSlot.table && 'section' in firstSlot.table && firstSlot.table.section 
      ? firstSlot.table.section.sectionName 
      : 'Unknown';

    return {
      success: true,
      hasAvailableTables: hasAvailableTable,
      availableTableCount,
      totalTablesInSection: sectionName,
      sectionName: sectionName
    };
  } catch (error) {
    console.error('Error checking section availability for reservation time:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check section availability for reservation time'
    };
  }
}

/**
 * Get available tables for a specific time slot based on reservation time (for table reservations)
 * Uses the same availability checking logic as the guest web
 */
export async function getAvailableTablesForReservationTime(
  prisma: PrismaClient,
  input: {
    restaurantId: number;
    date: Date;
    reservationTime: Date; // The actual reservation time
    partySize: number;
    excludeReservationId?: number;
    sectionId?: number; // Optional: filter by specific section
  }
) {
  try {
    const { restaurantId, date, reservationTime, partySize, excludeReservationId, sectionId } = input;

    // Get restaurant's table reservation configuration
    const config = await prisma.tableReservationUtilsConfiguration.findFirst({
      where: { 
        restaurantId,
        isActive: true 
      }
    });

    // Use configured slot duration or default to 90 minutes
    const slotDurationMinutes = config?.defaultSlotMinutes || 90;
    
    // Convert reservation time to time format for comparison
    // Extract just the time part from the full datetime
    const hours = reservationTime.getHours();
    const minutes = reservationTime.getMinutes();
    const seconds = reservationTime.getSeconds();
    
    // Create a time-only date for comparison (using a base date)
    const reservationTimeOnly = new Date(1970, 0, 1, hours, minutes, seconds);
    
    // Calculate the end time for the reservation using configured duration
    const endTime = new Date(reservationTimeOnly.getTime() + (slotDurationMinutes * 60 * 1000));

    console.log('Checking time slot availability:', {
      originalReservationTime: reservationTime.toISOString(),
      originalHours: reservationTime.getHours(),
      originalMinutes: reservationTime.getMinutes(),
      parsedStartTime: reservationTimeOnly.toTimeString(),
      calculatedEndTime: endTime.toTimeString(),
      duration: slotDurationMinutes,
      restaurantId,
      date: date.toISOString().split('T')[0]
    });

    // Get current time to check for expired holds
    const now = new Date();
    
    // Get all slots for the time period to check availability properly
    // Don't filter by party size - return all tables
    const allSlots = await prisma.tableAvailabilitySlot.findMany({
      where: {
        restaurantId,
        date,
        table: {
          isActive: true,
          ...(sectionId && { sectionId }),
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
                sectionName: true
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

    console.log(`Found ${allSlots.length} total slots (party size filter removed)`);

    // Group slots by table and check if they overlap with the requested time
    const tableAvailabilityMap = new Map();

    for (const slot of allSlots) {
      const tableId = slot.tableId;
      const table = slot.table;
      
      // Check if this slot overlaps with our requested time
      const slotStart = slot.startTime;
      const slotEnd = slot.endTime;
      
      // A slot overlaps if:
      // - slot.startTime < requested.endTime AND slot.endTime > requested.startTime
      // OR if the requested time falls within the slot
      const overlaps = (slotStart < endTime && slotEnd > reservationTimeOnly) || 
                      (reservationTimeOnly >= slotStart && reservationTimeOnly < slotEnd);
      
      if (overlaps) {
        // Check if this is the current reservation's slot
        const isCurrentReservation = slot.status === 'RESERVED' && slot.reservationId === excludeReservationId;
        
        // Determine availability status
        let availabilityStatus = 'AVAILABLE';
        let isAvailable = true;
        
        if (slot.status === 'RESERVED') {
          if (isCurrentReservation) {
            availabilityStatus = 'CURRENT_RESERVATION';
            isAvailable = true;
          } else {
            // Table is reserved by another reservation - not available
            availabilityStatus = 'RESERVED';
            isAvailable = false;
          }
        } else if (slot.status === 'HELD') {
          if (slot.holdExpiresAt && slot.holdExpiresAt > now) {
            // Slot is held and not expired - not available
            availabilityStatus = 'HELD';
            isAvailable = false;
          } else {
            // Slot was held but expired - available
            availabilityStatus = 'AVAILABLE';
            isAvailable = true;
          }
        } else if (slot.status === 'BLOCKED' || slot.status === 'MAINTENANCE') {
          // Table is blocked or under maintenance - not available
          availabilityStatus = slot.status;
          isAvailable = false;
        } else {
          // Status is AVAILABLE
          availabilityStatus = 'AVAILABLE';
          isAvailable = true;
        }
        
        // Only add tables that are available or belong to current reservation
        if (isAvailable || isCurrentReservation) {
          if (!tableAvailabilityMap.has(tableId)) {
            tableAvailabilityMap.set(tableId, {
              id: table.id,
              tableName: table.tableName,
              seatingCapacity: table.seatingCapacity,
              sectionId: table.section.id,
              sectionName: table.section.sectionName,
              isActive: table.isActive,
              availabilityStatus,
              isCurrentReservation
            });
          } else {
            // If we already have this table, update status if it's the current reservation
            const existing = tableAvailabilityMap.get(tableId);
            if (isCurrentReservation) {
              existing.availabilityStatus = 'CURRENT_RESERVATION';
              existing.isCurrentReservation = true;
            }
          }
        }
      }
    }

    const availableTables = Array.from(tableAvailabilityMap.values());

    console.log(`Available tables for time ${reservationTimeOnly.toTimeString()}: ${availableTables.length}`);
    console.log('Available tables:', availableTables.map(t => ({ 
      name: t.tableName, 
      section: t.sectionName, 
      status: t.availabilityStatus 
    })));

    return {
      success: true,
      tables: availableTables,
      reservationTime: reservationTimeOnly,
      endTime: endTime
    };
  } catch (error) {
    console.error('Error getting available tables for reservation time:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get available tables for reservation time'
    };
  }
}






