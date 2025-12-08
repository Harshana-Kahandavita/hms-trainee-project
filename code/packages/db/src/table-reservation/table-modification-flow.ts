import { PrismaClient, TableModificationType, TableModificationStatus } from '../../prisma/generated/prisma';
import { checkSectionAvailabilityForReservationTime } from '../restaurant_web_queries/table-reservation-management-queries';

// Input type for table reservation modification
export type TableReservationModificationInput = {
  reservationId: number;
  requestedBy: string; // User ID or "CUSTOMER" or "MERCHANT"
  modificationTypes: TableModificationType[];

  // New details (only include what's changing)
  newAdultCount?: number;
  newChildCount?: number;
  newSectionId?: number;
  newTableId?: number;
  newSpecialRequests?: string;

  // Optional metadata
  notes?: string;
};

// Response type
export type TableModificationResult = {
  success: boolean;
  modificationId?: number;
  status?: TableModificationStatus;
  errorMessage?: string;
  reservation?: any;
};

/**
 * Main function to process a table reservation modification
 */
export async function processTableReservationModification(
  prisma: PrismaClient,
  input: TableReservationModificationInput,
): Promise<TableModificationResult> {
  const action = 'processTableReservationModification';
  const requestId = `table_mod_${input.reservationId}_${Date.now()}`;

  console.log(`[${action}] Starting table reservation modification`, {
    action,
    requestId,
    input: JSON.stringify(input)
  });

  try {
    // Step 1: Validate the modification request
    console.log(`[${action}] Validating modification request`, {
      action,
      requestId
    });
    const validationResult = await validateTableModificationRequest(prisma, input);
    if (!validationResult.isValid || !validationResult.reservation) {
      console.log(`[${action}] Validation failed`, {
        action,
        requestId,
        error: validationResult.errorMessage
      });
      return {
        success: false,
        errorMessage: validationResult.errorMessage || 'Reservation not found'
      };
    }
    console.log(`[${action}] Validation successful`, {
      action,
      requestId
    });

    // Step 2: Create modification request record
    console.log(`[${action}] Creating modification request record`, {
      action,
      requestId
    });
    const modRequest = await createTableModificationRequest(prisma, input, {
      isValid: validationResult.isValid,
      reservation: validationResult.reservation,
      restaurant: validationResult.restaurant
    });
    console.log(`[${action}] Created modification request`, {
      action,
      requestId,
      modificationId: modRequest.modificationRequest.id
    });

    // Step 3: Process the modification immediately (for table reservations, we can process immediately)
    console.log(`[${action}] Processing modification`, {
      action,
      requestId,
      modificationId: modRequest.modificationRequest.id
    });
    
    const processResult = await processTableModification(prisma, modRequest.modificationRequest);
    
    if (!processResult.success) {
      return {
        success: false,
        errorMessage: processResult.errorMessage
      };
    }

    console.log(`[${action}] Modification processed successfully`, {
      action,
      requestId,
      modificationId: modRequest.modificationRequest.id,
      status: processResult.status,
      updatedFields: {
        adultCount: processResult.reservation?.adultCount,
        childCount: processResult.reservation?.childCount,
        specialRequests: processResult.reservation?.specialRequests,
        tableAssignment: processResult.reservation?.tableAssignment
      }
    });

    // Log comprehensive summary of all database updates
    console.log(`[${action}] Database update summary`, {
      action,
      requestId,
      reservationId: modRequest.modificationRequest.reservationId,
      modificationId: modRequest.modificationRequest.id,
      tablesUpdated: [
        'TableReservationModificationRequest',
        'TableReservationModificationStatusHistory', 
        'TableReservationModificationHistory',
        'Reservation',
        'ReservationTableAssignment',
        'TableAvailabilitySlot'
      ],
      modificationTypes: modRequest.modificationRequest.modificationTypes,
      status: processResult.status
    });

    // Note: Email sending will be handled by the calling action
    console.log(`[${action}] Modification completed, email sending will be handled by calling action`, {
      action,
      requestId,
      modificationId: modRequest.modificationRequest.id
    });

    // Serialize Decimal fields to numbers for client compatibility
    const serializedReservation = processResult.reservation ? {
      ...processResult.reservation,
      totalAmount: processResult.reservation.totalAmount?.toNumber() || 0,
      serviceCharge: processResult.reservation.serviceCharge?.toNumber() || 0,
      taxAmount: processResult.reservation.taxAmount?.toNumber() || 0,
      advancePaymentAmount: processResult.reservation.advancePaymentAmount?.toNumber() || 0,
      remainingPaymentAmount: processResult.reservation.remainingPaymentAmount?.toNumber() || 0,
      discountAmount: processResult.reservation.discountAmount?.toNumber() || 0,
    } : null;

    return {
      success: true,
      modificationId: modRequest.modificationRequest.id,
      status: processResult.status,
      reservation: serializedReservation
    };

  } catch (error) {
    console.log(`[${action}] Error processing table modification`, {
      action,
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

/**
 * Validate if the table modification request is allowed
 */
async function validateTableModificationRequest(
  prisma: PrismaClient,
  input: TableReservationModificationInput,
): Promise<{
  isValid: boolean;
  errorMessage?: string;
  reservation: any | null;
  restaurant: any | null;
}> {
  try {
    // 1. Check if reservation exists
    const reservation = await prisma.reservation.findUnique({
      where: { id: input.reservationId },
      include: {
        restaurant: true,
        tableAssignment: {
          include: {
            assignedTable: true,
            assignedSection: true,
            slot: true
          }
        }
      },
    });

    console.log('Reservation:', {
      action: 'validateTableModificationRequest',
      requestId: `table_res_${input.reservationId}`,
      reservation
    });

    if (!reservation) {
      return {
        isValid: false,
        errorMessage: 'Reservation not found',
        reservation: null,
        restaurant: null,
      };
    }

    // 2. Check if reservation is a table reservation
    if (reservation.reservationType !== 'TABLE_ONLY' && reservation.reservationType !== 'BUFFET_AND_TABLE') {
      return {
        isValid: false,
        errorMessage: 'This reservation is not a table reservation',
        reservation,
        restaurant: reservation.restaurant,
      };
    }

    // 3. Check if reservation is in a modifiable state
    const nonModifiableStates = ['CANCELLED', 'NO_SHOW', 'COMPLETED'];
    if (nonModifiableStates.includes(reservation.status)) {
      return {
        isValid: false,
        errorMessage: `Cannot modify a reservation in ${reservation.status} state`,
        reservation,
        restaurant: reservation.restaurant,
      };
    }

    // 4. Validate party size changes if applicable
    if (input.newAdultCount !== undefined || input.newChildCount !== undefined) {
      const newPartySize = (input.newAdultCount || reservation.adultCount) + (input.newChildCount || reservation.childCount);
      
      if (newPartySize <= 0) {
        return {
          isValid: false,
          errorMessage: 'Party size must be at least 1 guest',
          reservation,
          restaurant: reservation.restaurant,
        };
      }

      // If table is being changed, validate table capacity
      if (input.newTableId) {
        const newTable = await prisma.restaurantTable.findUnique({
          where: { id: input.newTableId }
        });
        
        if (!newTable) {
          return {
            isValid: false,
            errorMessage: 'Selected table is not available',
            reservation,
            restaurant: reservation.restaurant,
          };
        }
        
        // Note: Capacity validation removed - allow reservations regardless of table capacity
        // The UI will show a disclaimer warning when capacity is exceeded
      }
    }

    // 5. Validate section changes if applicable
    if (input.newSectionId !== undefined) {
      const newPartySize = (input.newAdultCount || reservation.adultCount) + (input.newChildCount || reservation.childCount);
      
      // Check if the section has available tables for the time slot
      const sectionAvailabilityResult = await checkSectionAvailabilityForReservationTime(prisma, {
        restaurantId: reservation.restaurantId,
        date: reservation.reservationDate,
        reservationTime: reservation.reservationTime,
        partySize: newPartySize,
        sectionId: input.newSectionId,
        excludeReservationId: reservation.id
      });

      if (!sectionAvailabilityResult.success) {
        return {
          isValid: false,
          errorMessage: 'Unable to verify section availability',
          reservation,
          restaurant: reservation.restaurant,
        };
      }

      if (!sectionAvailabilityResult.hasAvailableTables) {
        return {
          isValid: false,
          errorMessage: `Selected section has no available tables for the time slot. ${sectionAvailabilityResult.reason || ''}`,
          reservation,
          restaurant: reservation.restaurant,
        };
      }
    }

    return {
      isValid: true,
      reservation,
      restaurant: reservation.restaurant,
    };
  } catch (error) {
    console.log('Error validating table modification request:', {
      action: 'validateTableModificationRequest',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return {
      isValid: false,
      errorMessage: error instanceof Error ? error.message : 'An unknown error occurred',
      reservation: null,
      restaurant: null,
    };
  }
}

/**
 * Create a table modification request record
 */
async function createTableModificationRequest(
  prisma: PrismaClient,
  input: TableReservationModificationInput,
  validationResult: {
    isValid: boolean,
    reservation: any,
    restaurant: any
  },
): Promise<{
  modificationRequest: any;
  statusHistoryId: number;
}> {
  const { reservation } = validationResult;

  // Create the modification request
  const modificationRequest = await prisma.tableReservationModificationRequest.create({
    data: {
      // Base information
      reservationId: reservation.id,
      restaurantId: reservation.restaurantId,
      requestedBy: input.requestedBy,
      modificationTypes: input.modificationTypes,
      status: TableModificationStatus.PENDING,

      // Original details
      originalAdultCount: reservation.adultCount,
      originalChildCount: reservation.childCount,
      originalSectionId: reservation.tableAssignment?.assignedSectionId || null,
      originalTableId: reservation.tableAssignment?.assignedTableId || null,
      originalSlotId: reservation.tableAssignment?.slotId || null,
      originalSpecialRequests: reservation.specialRequests,

      // New requested details
      newAdultCount: input.newAdultCount,
      newChildCount: input.newChildCount,
      newSectionId: input.newSectionId,
      newTableId: input.newTableId,
      newSpecialRequests: input.newSpecialRequests,

      // Notes
      notes: input.notes,
    }
  });

  // Create status history record
  const statusHistory = await prisma.tableReservationModificationStatusHistory.create({
    data: {
      modificationId: modificationRequest.id,
      newStatus: TableModificationStatus.PENDING,
      changeReason: 'Modification request created',
      statusChangedAt: new Date(),
      changedBy: input.requestedBy,
    }
  });

  return {
    modificationRequest,
    statusHistoryId: statusHistory.id
  };
}

/**
 * Process the table modification
 */
async function processTableModification(
  prisma: PrismaClient,
  modRequest: any,
): Promise<{
  success: boolean;
  status: TableModificationStatus;
  errorMessage?: string;
  reservation?: any;
}> {
  try {
    // Update status to PROCESSING
    await prisma.tableReservationModificationStatusHistory.create({
      data: {
        modificationId: modRequest.id,
        previousStatus: TableModificationStatus.PENDING,
        newStatus: TableModificationStatus.PROCESSING,
        changeReason: 'Processing modification',
        statusChangedAt: new Date(),
        changedBy: modRequest.requestedBy,
      }
    });

    await prisma.tableReservationModificationRequest.update({
      where: { id: modRequest.id },
      data: { status: TableModificationStatus.PROCESSING }
    });

    // Apply the modification to the reservation
    const updatedReservation = await applyTableModificationToReservation(prisma, modRequest);

    // Verify the reservation was properly updated
    await verifyReservationUpdate(prisma, modRequest.reservationId, modRequest.id);

    // Update status to COMPLETED
    await prisma.tableReservationModificationStatusHistory.create({
      data: {
        modificationId: modRequest.id,
        previousStatus: TableModificationStatus.PROCESSING,
        newStatus: TableModificationStatus.COMPLETED,
        changeReason: 'Modification completed successfully',
        statusChangedAt: new Date(),
        changedBy: modRequest.requestedBy,
      }
    });

    await prisma.tableReservationModificationRequest.update({
      where: { id: modRequest.id },
      data: { 
        status: TableModificationStatus.COMPLETED,
        processedAt: new Date(),
        processedBy: modRequest.requestedBy
      }
    });

    return {
      success: true,
      status: TableModificationStatus.COMPLETED,
      reservation: updatedReservation
    };

  } catch (error) {
    console.log('Error processing table modification:', {
      action: 'processTableModification',
      modificationId: modRequest.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    // Update status to REJECTED
    await prisma.tableReservationModificationStatusHistory.create({
      data: {
        modificationId: modRequest.id,
        previousStatus: TableModificationStatus.PROCESSING,
        newStatus: TableModificationStatus.REJECTED,
        changeReason: `Modification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        statusChangedAt: new Date(),
        changedBy: modRequest.requestedBy,
      }
    });

    await prisma.tableReservationModificationRequest.update({
      where: { id: modRequest.id },
      data: { 
        status: TableModificationStatus.REJECTED,
        rejectionReason: error instanceof Error ? error.message : 'Unknown error'
      }
    });

    return {
      success: false,
      status: TableModificationStatus.REJECTED,
      errorMessage: error instanceof Error ? error.message : 'Failed to process modification'
    };
  }
}

/**
 * Apply modification changes to the reservation
 */
async function applyTableModificationToReservation(
  prisma: PrismaClient,
  modRequest: any,
): Promise<any> {
  try {
    // 1. Get the current reservation
    const reservation = await prisma.reservation.findUnique({
      where: { id: modRequest.reservationId },
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

    if (!reservation) {
      throw new Error(`Reservation ${modRequest.reservationId} not found`);
    }

    // 2. Start a transaction to update reservation and table assignment
    const result = await prisma.$transaction(async (tx) => {
      // Update reservation details
      const updateData: any = {
        lastModifiedAt: new Date(),
        lastModifiedBy: modRequest.requestedBy,
        lastModificationId: modRequest.id // Add reference to the current modification
      };

      // Add fields that were modified
      if (modRequest.modificationTypes.includes(TableModificationType.PARTY_SIZE)) {
        if (modRequest.newAdultCount !== null && modRequest.newAdultCount !== undefined) {
          updateData.adultCount = modRequest.newAdultCount;
        }
        if (modRequest.newChildCount !== null && modRequest.newChildCount !== undefined) {
          updateData.childCount = modRequest.newChildCount;
        }
      }

      if (modRequest.modificationTypes.includes(TableModificationType.SPECIAL_REQUESTS)) {
        if (modRequest.newSpecialRequests !== undefined) {
          updateData.specialRequests = modRequest.newSpecialRequests;
        }
      }

      // Update the reservation
      const updatedReservation = await tx.reservation.update({
        where: { id: reservation.id },
        data: updateData,
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
      if (modRequest.modificationTypes.includes(TableModificationType.TABLE_ASSIGNMENT) || 
          modRequest.modificationTypes.includes(TableModificationType.SECTION_ASSIGNMENT)) {
        
        const currentTableId = reservation.tableAssignment?.assignedTableId;
        const currentSlotId = reservation.tableAssignment?.slotId;
        
        // Check if section or table is changing to determine if we need to dissolve table sets
        const currentSectionId = reservation.tableAssignment?.assignedSectionId;
        const isSectionChanging = modRequest.newSectionId !== undefined && modRequest.newSectionId !== currentSectionId;
        const isTableChanging = modRequest.newTableId !== undefined && modRequest.newTableId !== currentTableId;
        
        let tableSets: Array<{
          id: number;
          tableIds: number[];
          slotIds: number[];
          primaryTableId: number;
        }> = [];
        let hasActiveTableSet = false;

        if (isSectionChanging || isTableChanging) {
          tableSets = await tx.tableSet.findMany({
            where: {
              reservationId: reservation.id,
              status: {
                in: ['ACTIVE', 'PENDING_MERGE']
              }
            }
          });

          hasActiveTableSet = tableSets.length > 0;

          console.log(`[TABLE-MODIFICATION] Active table sets fetched`, {
            reservationId: reservation.id,
            tableSetCount: tableSets.length,
            isSectionChanging,
            isTableChanging
          });
        }

        const shouldReleaseAllSlots = isSectionChanging || (isTableChanging && hasActiveTableSet);
        
        console.log(`[TABLE-MODIFICATION] Section change check:`, {
          currentSectionId,
          newSectionId: modRequest.newSectionId,
          isSectionChanging,
          isTableChanging,
          hasActiveTableSet,
          shouldReleaseAllSlots
        });

        // If moving to a different section OR reassigning tables with active merges, dissolve any table sets and free ALL slots
        if (shouldReleaseAllSlots) {
          const freeingContext = isSectionChanging
            ? 'different section'
            : 'same section table reassignment';

          console.log(`[TABLE-MODIFICATION] Initiating slot release due to ${freeingContext}`);

          let slotsToFree: any[] = [];

          if (isSectionChanging) {
            // STEP 1: Find ALL table availability slots for this reservation in the OLD section
            // Only proceed if currentSectionId is valid
            if (currentSectionId) {
              slotsToFree = await tx.tableAvailabilitySlot.findMany({
                where: {
                  reservationId: reservation.id,
                  table: {
                    sectionId: currentSectionId
                  }
                },
                include: {
                  table: true
                }
              });
              
              console.log(`[TABLE-MODIFICATION] Found ${slotsToFree.length} slots to free in old section (Section ${currentSectionId})`);
            } else {
              console.log(`[TABLE-MODIFICATION] No current section ID - finding all slots for this reservation`);
              
              // If no current section, find ALL slots for this reservation
              slotsToFree = await tx.tableAvailabilitySlot.findMany({
                where: {
                  reservationId: reservation.id
                },
                include: {
                  table: true
                }
              });
              
              console.log(`[TABLE-MODIFICATION] Found ${slotsToFree.length} total slots to free`);
            }
          } else {
            // Same section reassignment with active table set - free every slot tied to this reservation
            slotsToFree = await tx.tableAvailabilitySlot.findMany({
              where: {
                reservationId: reservation.id
              },
              include: {
                table: true
              }
            });

            console.log(`[TABLE-MODIFICATION] Found ${slotsToFree.length} slots to free for same-section table reassignment`);
          }
          
          // STEP 2: Free ALL relevant slots
          for (const slot of slotsToFree) {
            const tableInfo = slot.table ? `${slot.table.tableName} (${slot.table.id})` : `Table ID ${slot.tableId}`;
            console.log(`[TABLE-MODIFICATION] Freeing slot ${slot.id} for table ${tableInfo}`);
            
            // Update slot to AVAILABLE
            await tx.tableAvailabilitySlot.update({
              where: { id: slot.id },
              data: {
                status: 'AVAILABLE',
                reservationId: null,
                holdExpiresAt: null
              }
            });
            
            // Remove any holds for this slot
            await tx.reservationTableHold.deleteMany({
              where: { slotId: slot.id }
            });
            
            console.log(`[TABLE-MODIFICATION] Freed slot ${slot.id} and removed holds`);
          }
          
          console.log(`[TABLE-MODIFICATION] Freed ${slotsToFree.length} slots${isSectionChanging ? ' in old section' : ''}`);
          
          // STEP 3: Dissolve all active table sets for this reservation
          if (tableSets.length > 0) {
            const dissolvedBy = isSectionChanging ? 'SYSTEM_SECTION_CHANGE' : 'SYSTEM_TABLE_CHANGE';

            console.log(`[TABLE-MODIFICATION] Found ${tableSets.length} table sets to dissolve`);
            
            for (const tableSet of tableSets) {
              try {
                console.log(`[TABLE-MODIFICATION] Dissolving table set ${tableSet.id}`, {
                  tableIds: tableSet.tableIds,
                  slotIds: tableSet.slotIds,
                  primaryTableId: tableSet.primaryTableId,
                  dissolvedBy
                });
                
                // Mark table set as dissolved
                await tx.tableSet.update({
                  where: { id: tableSet.id },
                  data: {
                    status: 'DISSOLVED',
                    dissolvedAt: new Date(),
                    dissolvedBy
                  }
                });
                
                console.log(`[TABLE-MODIFICATION] Successfully dissolved table set ${tableSet.id}`);
              } catch (setError) {
                console.error(`[TABLE-MODIFICATION] Error dissolving table set ${tableSet.id}:`, setError);
                throw new Error(`Failed to dissolve table set: ${setError instanceof Error ? setError.message : 'Unknown error'}`);
              }
            }

            console.log(`[TABLE-MODIFICATION] Dissolved ${tableSets.length} table sets (reason: ${dissolvedBy})`);
          }
        }
        
        // If we're changing tables, we need to handle slot management
        if (isTableChanging) {
          // Step 1: Free the current slot if it exists (only if we haven't already freed it during section change)
          if (currentSlotId && !shouldReleaseAllSlots) {
            // Only free if not already handled by the broader slot release logic above
            await tx.tableAvailabilitySlot.update({
              where: { id: currentSlotId },
              data: {
                status: 'AVAILABLE',
                reservationId: null,
                holdExpiresAt: null
              }
            });
            
            // Remove any holds for this slot
            await tx.reservationTableHold.deleteMany({
              where: { slotId: currentSlotId }
            });
            
            console.log(`Freed primary slot ${currentSlotId} for table ${currentTableId} and removed holds`);
          } else if (currentSlotId && shouldReleaseAllSlots) {
            console.log(`Skipping primary slot ${currentSlotId} - already freed during slot release step`);
          }

          // Step 2: Find or reserve a slot for the new table using actual reservation time
          if (modRequest.newTableId) {
            const newTable = await tx.restaurantTable.findUnique({
              where: { id: modRequest.newTableId }
            });

            if (newTable) {
              // Use the actual reservation time instead of meal service times
              const reservationTimeOnly = new Date(`1970-01-01T${reservation.reservationTime.toTimeString().split(' ')[0]}`);
              
              // Calculate end time (default 90 minutes duration)
              const endTime = new Date(reservationTimeOnly);
              endTime.setMinutes(endTime.getMinutes() + 90);

              // Check if the table is available for this specific time slot
              const conflictingSlot = await tx.tableAvailabilitySlot.findFirst({
                where: {
                  tableId: modRequest.newTableId,
                  date: reservation.reservationDate,
                  AND: [
                    {
                      startTime: {
                        lt: endTime // slot starts before our end time
                      }
                    },
                    {
                      endTime: {
                        gt: reservationTimeOnly // slot ends after our start time
                      }
                    }
                  ],
                  status: 'RESERVED',
                  reservationId: {
                    not: reservation.id
                  }
                }
              });

              if (conflictingSlot) {
                throw new Error(`Table ${newTable.tableName} is already reserved for this time slot`);
              }

              // Find existing slot for this table on the reservation date that overlaps with our time
              let newSlot = await tx.tableAvailabilitySlot.findFirst({
                where: {
                  tableId: modRequest.newTableId,
                  date: reservation.reservationDate,
                  AND: [
                    {
                      startTime: {
                        lte: reservationTimeOnly // slot starts at or before our start time
                      }
                    },
                    {
                      endTime: {
                        gte: endTime // slot ends at or after our end time
                      }
                    }
                  ],
                  OR: [
                    { status: 'AVAILABLE' },
                    { status: 'RESERVED', reservationId: reservation.id }
                  ]
                }
              });

              // If no exact slot found, try to find any available slot for this table on this date
              if (!newSlot) {
                newSlot = await tx.tableAvailabilitySlot.findFirst({
                  where: {
                    tableId: modRequest.newTableId,
                    date: reservation.reservationDate,
                    status: 'AVAILABLE'
                  }
                });
              }

              // Only proceed if an existing slot is found
              if (!newSlot) {
                throw new Error(`No available slot found for table ${newTable.tableName} at the requested time`);
              }

              // If the slot is AVAILABLE, reserve it
              if (newSlot.status === 'AVAILABLE') {
                await tx.tableAvailabilitySlot.update({
                  where: { id: newSlot.id },
                  data: {
                    status: 'RESERVED',
                    reservationId: reservation.id
                  }
                });
              }
              // If the slot is already RESERVED for this reservation, no action needed
            }
          }
        }

        // Step 3: Update table assignment
        const updateData: any = {};
        
        if (modRequest.newSectionId !== undefined) {
          updateData.assignedSectionId = modRequest.newSectionId;
        }
        
        if (modRequest.newTableId !== undefined) {
          updateData.assignedTableId = modRequest.newTableId;
          
          // Update slot reference if we found a slot
          if (modRequest.newTableId) {
            const newSlot = await tx.tableAvailabilitySlot.findFirst({
              where: {
                tableId: modRequest.newTableId,
                date: reservation.reservationDate,
                reservationId: reservation.id
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
        if (!reservation.tableAssignment) {
          await tx.reservationTableAssignment.create({
            data: {
              reservationId: reservation.id,
              assignedSectionId: modRequest.newSectionId || null,
              assignedTableId: modRequest.newTableId || null,
              slotId: updateData.slotId || null
            }
          });
        } else {
          // Update existing table assignment
          await tx.reservationTableAssignment.update({
            where: { reservationId: reservation.id },
            data: updateData
          });
        }
      }

      // Fetch the updated reservation with the latest table assignment
      const finalReservation = await tx.reservation.findUnique({
        where: { id: reservation.id },
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

      // Create modification history record within the transaction
      await createTableModificationHistoryInTransaction(tx, modRequest, finalReservation);

      return finalReservation;
    });

    return result;
  } catch (error) {
    console.log('Failed to apply table modification to reservation:', {
      action: 'applyTableModificationToReservation',
      modificationId: modRequest.id,
      reservationId: modRequest.reservationId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    throw new Error(`Failed to apply table modification to reservation: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Verify that the reservation was properly updated with modification references
 */
async function verifyReservationUpdate(
  prisma: PrismaClient,
  reservationId: number,
  modificationId: number,
): Promise<void> {
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: {
        id: true,
        lastModifiedAt: true,
        lastModifiedBy: true,
        lastModificationId: true,
        adultCount: true,
        childCount: true,
        specialRequests: true,
        tableAssignment: {
          select: {
            assignedSectionId: true,
            assignedTableId: true,
            slotId: true
          }
        },
        _count: {
          select: {
            tableModificationRequests: true,
            tableModificationHistory: true
          }
        }
      }
    });

    if (!reservation) {
      console.log('Warning: Reservation not found during verification', {
        action: 'verifyReservationUpdate',
        reservationId,
        modificationId
      });
      return;
    }

    // Verify that lastModificationId was set correctly
    if (reservation.lastModificationId !== modificationId) {
      console.log('Warning: lastModificationId not properly set', {
        action: 'verifyReservationUpdate',
        reservationId,
        modificationId,
        actualLastModificationId: reservation.lastModificationId
      });
    }

    // Verify that lastModifiedAt and lastModifiedBy were set
    if (!reservation.lastModifiedAt || !reservation.lastModifiedBy) {
      console.log('Warning: lastModifiedAt or lastModifiedBy not set', {
        action: 'verifyReservationUpdate',
        reservationId,
        modificationId,
        lastModifiedAt: reservation.lastModifiedAt,
        lastModifiedBy: reservation.lastModifiedBy
      });
    }

    // Verify that the modification request is linked
    if (reservation._count.tableModificationRequests === 0) {
      console.log('Warning: No table modification requests linked to reservation', {
        action: 'verifyReservationUpdate',
        reservationId,
        modificationId
      });
    }

    // Verify that the modification history is linked
    if (reservation._count.tableModificationHistory === 0) {
      console.log('Warning: No table modification history linked to reservation', {
        action: 'verifyReservationUpdate',
        reservationId,
        modificationId
      });
    }

    console.log('Reservation update verification completed', {
      action: 'verifyReservationUpdate',
      reservationId,
      modificationId,
      lastModificationId: reservation.lastModificationId,
      lastModifiedAt: reservation.lastModifiedAt,
      lastModifiedBy: reservation.lastModifiedBy,
      modificationRequestsCount: reservation._count.tableModificationRequests,
      modificationHistoryCount: reservation._count.tableModificationHistory
    });
  } catch (error) {
    console.log('Error during reservation update verification:', {
      action: 'verifyReservationUpdate',
      reservationId,
      modificationId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    // Don't throw error as verification is not critical for the main flow
  }
}

/**
 * Create a table modification history record
 */
async function createTableModificationHistory(
  prisma: PrismaClient,
  modRequest: any,
  updatedReservation: any,
): Promise<void> {
  try {
    // Create a modification history record to track the changes
    await prisma.tableReservationModificationHistory.create({
      data: {
        reservationId: updatedReservation.id,
        modificationId: modRequest.id,
        
        // Previous values (from the modification request)
        previousAdultCount: modRequest.originalAdultCount,
        previousChildCount: modRequest.originalChildCount,
        previousSectionId: modRequest.originalSectionId,
        previousTableId: modRequest.originalTableId,
        previousSlotId: modRequest.originalSlotId,
        previousTableStartTime: null, // Not tracked in current schema
        previousTableEndTime: null,   // Not tracked in current schema
        previousSpecialRequests: modRequest.originalSpecialRequests,
        
        // New values (from the updated reservation)
        newAdultCount: updatedReservation.adultCount,
        newChildCount: updatedReservation.childCount,
        newSectionId: updatedReservation.tableAssignment?.assignedSectionId || null,
        newTableId: updatedReservation.tableAssignment?.assignedTableId || null,
        newSlotId: updatedReservation.tableAssignment?.slotId || null,
        newTableStartTime: null, // Not tracked in current schema
        newTableEndTime: null,   // Not tracked in current schema
        newSpecialRequests: updatedReservation.specialRequests,
        
        modifiedAt: new Date(),
        modifiedBy: modRequest.requestedBy,
      }
    });
  } catch (error) {
    console.log('Failed to create table modification history:', {
      action: 'createTableModificationHistory',
      modificationId: modRequest.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    // Continue processing even if history creation fails, as it's not critical for the main flow
  }
}



/**
 * Create a table modification history record within a transaction
 */
async function createTableModificationHistoryInTransaction(
  tx: any, // Use any for transaction type to avoid type issues
  modRequest: any,
  updatedReservation: any,
): Promise<void> {
  try {
    // Create a modification history record to track the changes
    await tx.tableReservationModificationHistory.create({
      data: {
        reservationId: updatedReservation.id,
        modificationId: modRequest.id,
        
        // Previous values (from the modification request)
        previousAdultCount: modRequest.originalAdultCount,
        previousChildCount: modRequest.originalChildCount,
        previousSectionId: modRequest.originalSectionId,
        previousTableId: modRequest.originalTableId,
        previousSlotId: modRequest.originalSlotId,
        previousTableStartTime: null, // Not tracked in current schema
        previousTableEndTime: null,   // Not tracked in current schema
        previousSpecialRequests: modRequest.originalSpecialRequests,
        
        // New values (from the updated reservation)
        newAdultCount: updatedReservation.adultCount,
        newChildCount: updatedReservation.childCount,
        newSectionId: updatedReservation.tableAssignment?.assignedSectionId || null,
        newTableId: updatedReservation.tableAssignment?.assignedTableId || null,
        newSlotId: updatedReservation.tableAssignment?.slotId || null,
        newTableStartTime: null, // Not tracked in current schema
        newTableEndTime: null,   // Not tracked in current schema
        newSpecialRequests: updatedReservation.specialRequests,
        
        modifiedAt: new Date(),
        modifiedBy: modRequest.requestedBy,
      }
    });
  } catch (error) {
    console.log('Failed to create table modification history within transaction:', {
      action: 'createTableModificationHistoryInTransaction',
      modificationId: modRequest.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    // Continue processing even if history creation fails, as it's not critical for the main flow
  }
}
