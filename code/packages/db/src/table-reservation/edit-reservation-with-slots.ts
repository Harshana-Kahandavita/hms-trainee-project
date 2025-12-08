/**
 * Table Reservation Edit with Comprehensive Slot Management
 * Handles date, time, table, section, and party size changes with automatic slot release and reservation
 */

import { PrismaClient, TableSlotStatus, TableModificationType, TableModificationStatus } from '../../prisma/generated/prisma';
import { hasOverlappingReservations } from './request-management';
import { filterSlotsByDwellTimeConflicts } from './availability';

export interface EditTableReservationInput {
  reservationId: number;
  
  // Date/Time changes
  newReservationDate?: Date;
  newReservationTime?: Date;
  
  // Party size changes
  newAdultCount?: number;
  newChildCount?: number;
  
  // Location changes
  newSectionId?: number;
  newTableId?: number;
  
  // Other details
  newSpecialRequests?: string;
  
  // Amount updates
  newTotalAmount?: number;
  
  // Metadata
  updatedBy: string;
  notes?: string;
}

export interface EditTableReservationResult {
  success: boolean;
  modificationId?: number;
  reservation?: any;
  status?: TableModificationStatus;
  errorMessage?: string;
  details?: {
    oldSlotReleased: boolean;
    newSlotReserved: boolean;
    dateChanged: boolean;
    timeChanged: boolean;
    tableChanged: boolean;
    sectionChanged: boolean;
    partySizeChanged: boolean;
  };
}

/**
 * Main function to edit table reservation with comprehensive slot management
 */
export async function editTableReservationWithSlots(
  prisma: PrismaClient,
  input: EditTableReservationInput
): Promise<EditTableReservationResult> {
  const action = 'editTableReservationWithSlots';
  const requestId = `edit_reservation_${input.reservationId}_${Date.now()}`;

  console.log(`[${action}] Starting reservation edit with slot management`, {
    action,
    requestId,
    input: JSON.stringify(input, null, 2)
  });

  try {
    // Step 1: Validate the edit request
    const validationResult = await validateEditRequest(prisma, input);
    if (!validationResult.isValid) {
      console.log(`[${action}] Validation failed`, {
        action,
        requestId,
        error: validationResult.errorMessage
      });
      return {
        success: false,
        errorMessage: validationResult.errorMessage || 'Validation failed'
      };
    }

    const currentReservation = validationResult.reservation!;
    const modificationTypes = determineModificationTypes(input, currentReservation);

    console.log(`[${action}] Modification types identified`, {
      action,
      requestId,
      modificationTypes
    });

    // Step 2: Create modification request
    const modRequest = await createEditModificationRequest(
      prisma,
      input,
      currentReservation,
      modificationTypes
    );

    console.log(`[${action}] Created modification request`, {
      action,
      requestId,
      modificationId: modRequest.id
    });

    // Step 3: Process the edit with slot management
    const result = await processReservationEdit(
      prisma,
      modRequest,
      input,
      currentReservation,
      modificationTypes
    );

    if (result.success) {
      console.log(`[${action}] Edit completed successfully`, {
        action,
        requestId,
        modificationId: modRequest.id,
        details: result.details
      });
    } else {
      console.error(`[${action}] Edit failed`, {
        action,
        requestId,
        modificationId: modRequest.id,
        error: result.errorMessage
      });
    }

    return {
      ...result,
      modificationId: modRequest.id
    };

  } catch (error) {
    console.error(`[${action}] Unexpected error`, {
      action,
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'An unexpected error occurred'
    };
  }
}

/**
 * Validate the edit request
 */
async function validateEditRequest(
  prisma: PrismaClient,
  input: EditTableReservationInput
): Promise<{
  isValid: boolean;
  reservation?: any;
  errorMessage?: string;
}> {
  // Fetch current reservation
  const reservation = await prisma.reservation.findUnique({
    where: { id: input.reservationId },
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

  if (!reservation) {
    return {
      isValid: false,
      errorMessage: 'Reservation not found'
    };
  }

  // Check if reservation is in a valid state for editing
  if (reservation.status === 'COMPLETED' || reservation.status === 'CANCELLED') {
    return {
      isValid: false,
      errorMessage: `Cannot edit a ${reservation.status.toLowerCase()} reservation`
    };
  }

  // Validate party size if being changed
  if (input.newAdultCount !== undefined || input.newChildCount !== undefined) {
    const newAdultCount = input.newAdultCount ?? reservation.adultCount;
    const newChildCount = input.newChildCount ?? reservation.childCount;
    const totalPartySize = newAdultCount + newChildCount;

    if (totalPartySize <= 0) {
      return {
        isValid: false,
        errorMessage: 'Party size must be at least 1 guest'
      };
    }

    if (totalPartySize > 50) {
      return {
        isValid: false,
        errorMessage: 'Party size cannot exceed 50 guests'
      };
    }
  }

  // Validate date if being changed
  if (input.newReservationDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const newDate = new Date(input.newReservationDate);
    newDate.setHours(0, 0, 0, 0);

    if (newDate < today) {
      return {
        isValid: false,
        errorMessage: 'Cannot change reservation to a past date'
      };
    }
  }

  // Validate new table if specified
  if (input.newTableId) {
    const newTable = await prisma.restaurantTable.findUnique({
      where: { id: input.newTableId },
      include: { section: true }
    });

    if (!newTable) {
      return {
        isValid: false,
        errorMessage: 'Selected table not found'
      };
    }

    if (!newTable.isActive) {
      return {
        isValid: false,
        errorMessage: 'Selected table is not currently available'
      };
    }

    // Note: Capacity validation removed - allow reservations regardless of table capacity
    // The UI will show a disclaimer warning when capacity is exceeded

    // Auto-update section if table is in different section
    if (input.newSectionId && newTable.sectionId !== input.newSectionId) {
      return {
        isValid: false,
        errorMessage: `Selected table is not in the specified section`
      };
    }
  }

  // Validate new section if specified
  if (input.newSectionId) {
    const newSection = await prisma.restaurantSection.findUnique({
      where: { id: input.newSectionId }
    });

    if (!newSection) {
      return {
        isValid: false,
        errorMessage: 'Selected section not found'
      };
    }

    if (!newSection.isActive) {
      return {
        isValid: false,
        errorMessage: 'Selected section is not currently available'
      };
    }
  }

  return {
    isValid: true,
    reservation
  };
}

/**
 * Determine modification types based on changes
 */
function determineModificationTypes(
  input: EditTableReservationInput,
  currentReservation: any
): TableModificationType[] {
  const types: TableModificationType[] = [];

  // Check for party size changes
  if (input.newAdultCount !== undefined && input.newAdultCount !== currentReservation.adultCount) {
    types.push(TableModificationType.PARTY_SIZE);
  }
  if (input.newChildCount !== undefined && input.newChildCount !== currentReservation.childCount) {
    if (!types.includes(TableModificationType.PARTY_SIZE)) {
      types.push(TableModificationType.PARTY_SIZE);
    }
  }

  // Check for time slot changes
  if (input.newReservationDate || input.newReservationTime) {
    types.push(TableModificationType.TIME_SLOT);
  }

  // Check for section changes
  // Always consider it a change if a new section is specified (handles cases where current section might be null or data inconsistent)
  if (input.newSectionId !== undefined) {
    const currentSectionId = currentReservation.tableAssignment?.assignedSectionId;
    const isDifferent = input.newSectionId !== currentSectionId;

    console.log('🏢 [MODIFICATION TYPES] Section change check', {
      newSectionId: input.newSectionId,
      currentSectionId: currentSectionId,
      isDifferent: isDifferent,
      hasTableAssignment: !!currentReservation.tableAssignment
    });

    // Always mark as section change if user explicitly selected a section
    // This handles cases where UI data might be stale or inconsistent
    types.push(TableModificationType.SECTION_ASSIGNMENT);
    console.log('🏢 [MODIFICATION TYPES] Section change detected (user selected section)');
  }

  // Check for table changes
  if (input.newTableId !== undefined &&
      input.newTableId !== currentReservation.tableAssignment?.assignedTableId) {
    types.push(TableModificationType.TABLE_ASSIGNMENT);
  }

  // Check for special requests changes
  if (input.newSpecialRequests !== undefined) {
    types.push(TableModificationType.SPECIAL_REQUESTS);
  }

  return types;
}

/**
 * Create modification request record
 */
async function createEditModificationRequest(
  prisma: PrismaClient,
  input: EditTableReservationInput,
  currentReservation: any,
  modificationTypes: TableModificationType[]
): Promise<any> {
  const modRequest = await prisma.tableReservationModificationRequest.create({
    data: {
      reservationId: input.reservationId,
      restaurantId: currentReservation.restaurantId,
      requestedBy: input.updatedBy,
      modificationTypes,
      status: TableModificationStatus.PENDING,
      
      // Original values
      originalAdultCount: currentReservation.adultCount,
      originalChildCount: currentReservation.childCount,
      originalSectionId: currentReservation.tableAssignment?.assignedSectionId,
      originalTableId: currentReservation.tableAssignment?.assignedTableId,
      originalSlotId: currentReservation.tableAssignment?.slotId,
      originalTableStartTime: currentReservation.tableAssignment?.tableStartTime,
      originalTableEndTime: currentReservation.tableAssignment?.tableEndTime,
      originalSpecialRequests: currentReservation.specialRequests,
      
      // New values
      newAdultCount: input.newAdultCount,
      newChildCount: input.newChildCount,
      newSectionId: input.newSectionId,
      newTableId: input.newTableId,
      newTableStartTime: input.newReservationTime,
      newTableEndTime: input.newReservationTime ? calculateEndTime(input.newReservationTime) : undefined,
      newSpecialRequests: input.newSpecialRequests,
      
      notes: input.notes,
      originalSlotReleased: false,
      newSlotReserved: false
    }
  });

  // Create status history
  await prisma.tableReservationModificationStatusHistory.create({
    data: {
      modificationId: modRequest.id,
      previousStatus: null,
      newStatus: TableModificationStatus.PENDING,
      changeReason: 'Modification request created',
      statusChangedAt: new Date(),
      changedBy: input.updatedBy
    }
  });

  return modRequest;
}

/**
 * Process the reservation edit with slot management
 */
async function processReservationEdit(
  prisma: PrismaClient,
  modRequest: any,
  input: EditTableReservationInput,
  currentReservation: any,
  modificationTypes: TableModificationType[]
): Promise<EditTableReservationResult> {
  
  const details = {
    oldSlotReleased: false,
    newSlotReserved: false,
    dateChanged: false,
    timeChanged: false,
    tableChanged: false,
    sectionChanged: false,
    partySizeChanged: false
  };

  try {
    // Update status to PROCESSING
    await updateModificationStatus(
      prisma,
      modRequest.id,
      TableModificationStatus.PROCESSING,
      input.updatedBy,
      'Processing modification'
    );

    // Execute the edit within a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Step 1: Handle slot release if date, time, table, or section is changing
      // Note: Section change implies table change (tables belong to sections)
      const needsSlotChange = 
        modificationTypes.includes(TableModificationType.TIME_SLOT) ||
        modificationTypes.includes(TableModificationType.TABLE_ASSIGNMENT) ||
        modificationTypes.includes(TableModificationType.SECTION_ASSIGNMENT);

      if (needsSlotChange) {
        const currentSlotId = currentReservation.tableAssignment?.slotId;
        
        if (currentSlotId) {
          // Release current slot
          await tx.tableAvailabilitySlot.update({
            where: { id: currentSlotId },
            data: {
              status: TableSlotStatus.AVAILABLE,
              reservationId: null,
              holdExpiresAt: null
            }
          });
          
          details.oldSlotReleased = true;
          console.log(`Released slot ${currentSlotId}`);
        }
      }

      // Step 2: Determine final date, time, and table
      const finalDate = input.newReservationDate || currentReservation.reservationDate;
      const finalTime = input.newReservationTime || currentReservation.reservationTime;
      const finalSectionId = input.newSectionId || currentReservation.tableAssignment?.assignedSectionId;

      // Determine final table - if section changed but no specific table requested, find suitable table in new section
      let finalTableId = input.newTableId || currentReservation.tableAssignment?.assignedTableId;

      if (input.newSectionId && input.newSectionId !== currentReservation.tableAssignment?.assignedSectionId && !input.newTableId) {
        console.log('🔄 [SLOT MANAGEMENT] Section changed without specific table, finding suitable table in new section', {
          newSectionId: input.newSectionId,
          currentTableId: currentReservation.tableAssignment?.assignedTableId,
          requestedDate: finalDate,
          requestedTime: finalTime
        });

        const partySize = (input.newAdultCount || currentReservation.adultCount) + (input.newChildCount || currentReservation.childCount || 0);
        const normalizedFinalTime = new Date(`1970-01-01T${formatTime(finalTime)}`);
        
        // Create a proper Date object combining date and time for overlap checks
        const combinedDateTime = new Date(finalDate);
        combinedDateTime.setHours(finalTime.getHours(), finalTime.getMinutes(), finalTime.getSeconds(), 0);

        // Step 1: Find candidate tables with sufficient capacity
        const candidateTables = await tx.restaurantTable.findMany({
          where: {
            restaurantId: currentReservation.restaurantId,
            sectionId: input.newSectionId,
            isActive: true,
            seatingCapacity: {
              gte: partySize
            }
          },
          orderBy: [
            { seatingCapacity: 'asc' }, // Prefer smaller tables that fit
            { id: 'asc' }
          ]
        });

        // Step 2: Try to find an available table with no overlaps and valid slot
        let foundTable = null;
        for (const table of candidateTables) {
          // Check for overlapping reservations (considering dwell time)
          const hasOverlap = await hasOverlappingReservations(
            tx as PrismaClient,
            table.id,
            currentReservation.restaurantId,
            finalDate,
            combinedDateTime
          );

          if (hasOverlap) {
            console.log(`🚫 [SLOT MANAGEMENT] Table ${table.id} skipped due to overlapping reservations`, {
              tableId: table.id,
              tableName: table.tableName,
              requestedDate: finalDate,
              requestedTime: combinedDateTime
            });
            continue;
          }

          // Check if there's an available slot for this table at the requested time
          // Match by start time only - slots may have different durations
          const availableSlot = await tx.tableAvailabilitySlot.findFirst({
            where: {
              tableId: table.id,
              date: finalDate,
              startTime: normalizedFinalTime,
              status: TableSlotStatus.AVAILABLE
            }
          });

          if (availableSlot) {
            // Check for dwell time conflicts
            const validSlots = await filterSlotsByDwellTimeConflicts(
              tx as PrismaClient,
              currentReservation.restaurantId,
              finalDate,
              [availableSlot]
            );

            if (validSlots.length > 0) {
              foundTable = table;
              console.log('✅ [SLOT MANAGEMENT] Found suitable table in new section with available slot', {
                tableId: table.id,
                tableName: table.tableName,
                capacity: table.seatingCapacity,
                slotId: availableSlot.id
              });
              break;
            } else {
              console.log(`🚫 [SLOT MANAGEMENT] Table ${table.id} skipped due to dwell time conflicts`, {
                tableId: table.id,
                tableName: table.tableName
              });
            }
          } else {
            console.log(`🚫 [SLOT MANAGEMENT] Table ${table.id} skipped - no available slot for requested time`, {
              tableId: table.id,
              tableName: table.tableName,
              requestedTime: combinedDateTime
            });
          }
        }

        // Step 3: Fallback - try any table in the section (regardless of capacity)
        if (!foundTable) {
          console.log('⚠️ [SLOT MANAGEMENT] No suitable table found with capacity check, trying fallback (any table in section)');
          const fallbackTables = await tx.restaurantTable.findMany({
            where: {
              restaurantId: currentReservation.restaurantId,
              sectionId: input.newSectionId,
              isActive: true
            },
            orderBy: [
              { seatingCapacity: 'desc' }, // Prefer larger tables
              { id: 'asc' }
            ]
          });

          for (const table of fallbackTables) {
            // Check for overlapping reservations
            const hasOverlap = await hasOverlappingReservations(
              tx as PrismaClient,
              table.id,
              currentReservation.restaurantId,
              finalDate,
              combinedDateTime
            );

            if (hasOverlap) {
              console.log(`🚫 [SLOT MANAGEMENT] Fallback table ${table.id} skipped due to overlapping reservations`, {
                tableId: table.id,
                tableName: table.tableName
              });
              continue;
            }

            // Check if there's an available slot
            // Match by start time only - slots may have different durations
            const availableSlot = await tx.tableAvailabilitySlot.findFirst({
              where: {
                tableId: table.id,
                date: finalDate,
                startTime: normalizedFinalTime,
                status: TableSlotStatus.AVAILABLE
              }
            });

            if (availableSlot) {
              // Check for dwell time conflicts
              const validSlots = await filterSlotsByDwellTimeConflicts(
                tx as PrismaClient,
                currentReservation.restaurantId,
                finalDate,
                [availableSlot]
              );

              if (validSlots.length > 0) {
                foundTable = table;
                console.log('⚠️ [SLOT MANAGEMENT] Using fallback table in new section (capacity may be insufficient)', {
                  tableId: table.id,
                  tableName: table.tableName,
                  capacity: table.seatingCapacity,
                  requestedGuests: partySize,
                  slotId: availableSlot.id
                });
                break;
              }
            }
          }
        }

        if (foundTable) {
          finalTableId = foundTable.id;
        } else {
          throw new Error(`No available tables found in section ${input.newSectionId} for the requested time slot (considering dwell time and overlaps)`);
        }
      }

      // Step 3: Find or create new slot if needed
      let newSlotId: number | null = null;
      
      if (needsSlotChange && finalTableId) {
        const normalizedFinalTime = new Date(`1970-01-01T${formatTime(finalTime)}`);
        const endTime = calculateEndTime(normalizedFinalTime);

        // Check for existing available slot
        const existingSlot = await tx.tableAvailabilitySlot.findFirst({
          where: {
            tableId: finalTableId,
            date: finalDate,
            startTime: normalizedFinalTime,
            endTime: endTime,
            status: TableSlotStatus.AVAILABLE
          }
        });

        if (existingSlot) {
          // Reserve existing slot
          await tx.tableAvailabilitySlot.update({
            where: { id: existingSlot.id },
            data: {
              status: TableSlotStatus.RESERVED,
              reservationId: input.reservationId
            }
          });
          newSlotId = existingSlot.id;
        } else {
          // Check for conflicts
          const conflictingSlot = await tx.tableAvailabilitySlot.findFirst({
            where: {
              tableId: finalTableId,
              date: finalDate,
              AND: [
                {
                  startTime: { lt: endTime }
                },
                {
                  endTime: { gt: normalizedFinalTime }
                },
                {
                  status: { in: [TableSlotStatus.RESERVED, TableSlotStatus.HELD] }
                }
              ]
            }
          });

          if (conflictingSlot) {
            throw new Error(`Table is not available for the selected time slot`);
          }

          // Create new slot
          const newSlot = await tx.tableAvailabilitySlot.create({
            data: {
              restaurantId: currentReservation.restaurantId,
              tableId: finalTableId,
              date: finalDate,
              startTime: normalizedFinalTime,
              endTime: endTime,
              status: TableSlotStatus.RESERVED,
              reservationId: input.reservationId
            }
          });
          newSlotId = newSlot.id;
        }

        details.newSlotReserved = true;
        console.log(`Reserved new slot ${newSlotId}`);
      }

      // Step 4: Update reservation details
      const updateData: any = {
        lastModifiedAt: new Date(),
        lastModifiedBy: input.updatedBy,
        lastModificationId: modRequest.id
      };

      // Update date if changed
      if (input.newReservationDate) {
        updateData.reservationDate = input.newReservationDate;
        details.dateChanged = true;
      }

      // Update time if changed
      if (input.newReservationTime) {
        updateData.reservationTime = input.newReservationTime;
        details.timeChanged = true;
      }

      // Update party size if changed
      if (input.newAdultCount !== undefined) {
        updateData.adultCount = input.newAdultCount;
        details.partySizeChanged = true;
      }
      if (input.newChildCount !== undefined) {
        updateData.childCount = input.newChildCount;
        details.partySizeChanged = true;
      }

      // Update special requests if changed
      if (input.newSpecialRequests !== undefined) {
        updateData.specialRequests = input.newSpecialRequests;
      }

      // Update total amount if policy fees were added
      if (input.newTotalAmount !== undefined) {
        updateData.totalAmount = input.newTotalAmount;
      }

      const updatedReservation = await tx.reservation.update({
        where: { id: input.reservationId },
        data: updateData
      });

      // Step 5: Update table assignment
      if (finalTableId || finalSectionId || newSlotId) {
        const assignmentData: any = {
          updatedAt: new Date()
        };

        if (finalSectionId) {
          assignmentData.assignedSectionId = finalSectionId;
          details.sectionChanged = finalSectionId !== currentReservation.tableAssignment?.assignedSectionId;
        }

        if (finalTableId) {
          assignmentData.assignedTableId = finalTableId;
          details.tableChanged = finalTableId !== currentReservation.tableAssignment?.assignedTableId;
        }

        if (newSlotId) {
          assignmentData.slotId = newSlotId;
          assignmentData.tableStartTime = input.newReservationTime || currentReservation.reservationTime;
          assignmentData.tableEndTime = calculateEndTime(assignmentData.tableStartTime);
        }

        if (currentReservation.tableAssignment) {
          await tx.reservationTableAssignment.update({
            where: { reservationId: input.reservationId },
            data: assignmentData
          });
        } else {
          await tx.reservationTableAssignment.create({
            data: {
              reservationId: input.reservationId,
              ...assignmentData
            }
          });
        }
      }

      // Step 6: Create modification history
      await tx.tableReservationModificationHistory.create({
        data: {
          reservationId: input.reservationId,
          modificationId: modRequest.id,
          
          previousAdultCount: currentReservation.adultCount,
          previousChildCount: currentReservation.childCount,
          previousSectionId: currentReservation.tableAssignment?.assignedSectionId,
          previousTableId: currentReservation.tableAssignment?.assignedTableId,
          previousSlotId: currentReservation.tableAssignment?.slotId,
          previousTableStartTime: currentReservation.tableAssignment?.tableStartTime,
          previousTableEndTime: currentReservation.tableAssignment?.tableEndTime,
          previousSpecialRequests: currentReservation.specialRequests,
          
          newAdultCount: input.newAdultCount ?? currentReservation.adultCount,
          newChildCount: input.newChildCount ?? currentReservation.childCount,
          newSectionId: finalSectionId,
          newTableId: finalTableId,
          newSlotId: newSlotId,
          newTableStartTime: input.newReservationTime || currentReservation.reservationTime,
          newTableEndTime: calculateEndTime(input.newReservationTime || currentReservation.reservationTime),
          newSpecialRequests: input.newSpecialRequests || currentReservation.specialRequests,
          
          modifiedAt: new Date(),
          modifiedBy: input.updatedBy
        }
      });

      return updatedReservation;
    });

    // Update modification request status
    await updateModificationStatus(
      prisma,
      modRequest.id,
      TableModificationStatus.COMPLETED,
      input.updatedBy,
      'Modification completed successfully'
    );

    await prisma.tableReservationModificationRequest.update({
      where: { id: modRequest.id },
      data: {
        processedAt: new Date(),
        processedBy: input.updatedBy,
        originalSlotReleased: details.oldSlotReleased,
        newSlotReserved: details.newSlotReserved,
        slotAdjustedAt: new Date()
      }
    });

    // Fetch final reservation state
    const finalReservation = await prisma.reservation.findUnique({
      where: { id: input.reservationId },
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

    return {
      success: true,
      status: TableModificationStatus.COMPLETED,
      reservation: finalReservation,
      details
    };

  } catch (error) {
    // Update modification request to rejected
    await updateModificationStatus(
      prisma,
      modRequest.id,
      TableModificationStatus.REJECTED,
      input.updatedBy,
      error instanceof Error ? error.message : 'Unknown error'
    );

    return {
      success: false,
      status: TableModificationStatus.REJECTED,
      errorMessage: error instanceof Error ? error.message : 'Failed to process modification',
      details
    };
  }
}

/**
 * Update modification status
 */
async function updateModificationStatus(
  prisma: PrismaClient,
  modificationId: number,
  newStatus: TableModificationStatus,
  changedBy: string,
  reason: string
): Promise<void> {
  const currentMod = await prisma.tableReservationModificationRequest.findUnique({
    where: { id: modificationId },
    select: { status: true }
  });

  await prisma.tableReservationModificationStatusHistory.create({
    data: {
      modificationId,
      previousStatus: currentMod?.status || null,
      newStatus,
      changeReason: reason,
      statusChangedAt: new Date(),
      changedBy
    }
  });

  await prisma.tableReservationModificationRequest.update({
    where: { id: modificationId },
    data: { status: newStatus }
  });
}

/**
 * Calculate end time (default 90 minutes)
 */
function calculateEndTime(startTime: Date): Date {
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

