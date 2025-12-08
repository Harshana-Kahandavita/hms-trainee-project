/**
 * Table Reservation Modification Flow - Database Layer
 * 
 * This module handles database operations for table reservation modifications.
 * It uses the business logic layer for validation and rule enforcement.
 * 
 * Architecture Pattern:
 * 1. Action Layer (server actions) -> calls this module
 * 2. This module -> calls Business Logic for validation
 * 3. This module -> performs database operations
 * 
 * Similar to how guest-web getMealAvailability works:
 * - Action gets data from queries
 * - Action calls business logic for processing
 * - Business logic contains pure functions with no DB access
 */

import { PrismaClient, TableModificationType, TableModificationStatus } from '../../prisma/generated/prisma'
import { checkSectionAvailabilityForReservationTime } from '../restaurant_web_queries/table-reservation-management-queries'
import {
  TableReservationModificationBusinessLogic,
  ReservationStatus,
  ReservationType,
  type ReservationData,
  type ModificationInput,
  type TableData,
  type SectionAvailabilityData
} from './TableReservationModificationBusinessLogic'

// Input type for table reservation modification
export type TableReservationModificationInput = {
  reservationId: number
  requestedBy: string // User ID or "CUSTOMER" or "MERCHANT"
  modificationTypes: TableModificationType[]

  // New details (only include what's changing)
  newAdultCount?: number
  newChildCount?: number
  newSectionId?: number
  newTableId?: number
  newSpecialRequests?: string

  // Optional metadata
  notes?: string
}

// Response type
export type TableModificationResult = {
  success: boolean
  modificationId?: number
  status?: TableModificationStatus
  errorMessage?: string
  errorCode?: string
  reservation?: any
}

// Initialize business logic instance
const businessLogic = new TableReservationModificationBusinessLogic()

/**
 * Main function to process a table reservation modification
 * This follows the same pattern as getMealAvailabilityAction
 */
export async function processTableReservationModification(
  prisma: PrismaClient,
  input: TableReservationModificationInput
): Promise<TableModificationResult> {
  const action = 'processTableReservationModification'
  const requestId = `table_mod_${input.reservationId}_${Date.now()}`

  console.log(`[${action}] Starting table reservation modification`, {
    action,
    requestId,
    input: JSON.stringify(input)
  })

  try {
    // Step 1: Fetch reservation data from database
    console.log(`[${action}] Fetching reservation data`, {
      action,
      requestId,
      reservationId: input.reservationId
    })
    
    const reservationData = await fetchReservationData(prisma, input.reservationId)
    if (!reservationData) {
      return {
        success: false,
        errorMessage: 'Reservation not found',
        errorCode: 'RESERVATION_NOT_FOUND'
      }
    }

    // Step 2: Prepare modification input for business logic
    const modification: ModificationInput = {
      newAdultCount: input.newAdultCount,
      newChildCount: input.newChildCount,
      newSectionId: input.newSectionId,
      newTableId: input.newTableId,
      newSpecialRequests: input.newSpecialRequests
    }

    // Step 3: Fetch additional data needed for validation
    let newTableData: TableData | undefined
    let sectionAvailabilityData: SectionAvailabilityData | undefined

    if (input.newTableId) {
      newTableData = await fetchTableData(prisma, input.newTableId)
      if (!newTableData) {
        return {
          success: false,
          errorMessage: 'Selected table not found',
          errorCode: 'TABLE_NOT_FOUND'
        }
      }
    }

    if (input.newSectionId) {
      // Calculate new party size for availability check
      const newPartySize = businessLogic.calculateNewPartySize({
        currentAdultCount: reservationData.adultCount,
        currentChildCount: reservationData.childCount,
        newAdultCount: input.newAdultCount,
        newChildCount: input.newChildCount
      })

      sectionAvailabilityData = await fetchSectionAvailability(prisma, {
        restaurantId: reservationData.reservation.restaurantId,
        date: reservationData.reservationDate,
        reservationTime: reservationData.reservationTime,
        partySize: newPartySize,
        sectionId: input.newSectionId,
        excludeReservationId: input.reservationId
      })
    }

    // Step 4: Use business logic to validate the modification
    console.log(`[${action}] Validating modification with business logic`, {
      action,
      requestId
    })

    const validationResult = businessLogic.validateModification({
      reservation: reservationData,
      modification,
      newTable: newTableData,
      sectionAvailability: sectionAvailabilityData
    })

    if (!validationResult.isValid) {
      console.log(`[${action}] Business logic validation failed`, {
        action,
        requestId,
        error: validationResult.errorMessage,
        errorCode: validationResult.errorCode
      })
      return {
        success: false,
        errorMessage: validationResult.errorMessage,
        errorCode: validationResult.errorCode
      }
    }

    console.log(`[${action}] Business logic validation successful`, {
      action,
      requestId
    })

    // Step 5: Detect what changes are being made
    const changes = businessLogic.detectChanges({
      reservation: reservationData,
      modification
    })

    if (!changes.hasChanges) {
      return {
        success: false,
        errorMessage: 'No changes detected',
        errorCode: 'NO_CHANGES'
      }
    }

    console.log(`[${action}] Detected changes`, {
      action,
      requestId,
      changedFields: changes.changedFields,
      partySize: changes.partySize
    })

    // Step 6: Create modification request record in database
    console.log(`[${action}] Creating modification request record`, {
      action,
      requestId
    })

    const modRequest = await createTableModificationRequest(prisma, input, reservationData.reservation)

    console.log(`[${action}] Created modification request`, {
      action,
      requestId,
      modificationId: modRequest.modificationRequest.id
    })

    // Step 7: Process the modification (database operations)
    console.log(`[${action}] Processing modification`, {
      action,
      requestId,
      modificationId: modRequest.modificationRequest.id
    })

    const processResult = await processTableModification(prisma, modRequest.modificationRequest)

    if (!processResult.success) {
      return {
        success: false,
        errorMessage: processResult.errorMessage,
        errorCode: processResult.errorCode
      }
    }

    console.log(`[${action}] Modification processed successfully`, {
      action,
      requestId,
      modificationId: modRequest.modificationRequest.id,
      status: processResult.status
    })

    // Serialize Decimal fields to numbers for client compatibility
    const serializedReservation = processResult.reservation ? {
      ...processResult.reservation,
      totalAmount: processResult.reservation.totalAmount?.toNumber() || 0,
      serviceCharge: processResult.reservation.serviceCharge?.toNumber() || 0,
      taxAmount: processResult.reservation.taxAmount?.toNumber() || 0,
      advancePaymentAmount: processResult.reservation.advancePaymentAmount?.toNumber() || 0,
      remainingPaymentAmount: processResult.reservation.remainingPaymentAmount?.toNumber() || 0,
      discountAmount: processResult.reservation.discountAmount?.toNumber() || 0
    } : null

    return {
      success: true,
      modificationId: modRequest.modificationRequest.id,
      status: processResult.status,
      reservation: serializedReservation
    }
  } catch (error) {
    console.log(`[${action}] Error processing table modification`, {
      action,
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'An unknown error occurred',
      errorCode: 'INTERNAL_ERROR'
    }
  }
}

/**
 * Fetch reservation data and transform it to business logic format
 */
async function fetchReservationData(
  prisma: PrismaClient,
  reservationId: number
): Promise<ReservationData & { reservation: any } | null> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: {
      restaurant: true,
      tableAssignment: {
        include: {
          assignedTable: true,
          assignedSection: true,
          slot: true
        }
      }
    }
  })

  if (!reservation) {
    return null
  }

  // Transform to business logic format
  return {
    id: reservation.id,
    status: reservation.status as ReservationStatus,
    reservationType: reservation.reservationType as ReservationType,
    adultCount: reservation.adultCount,
    childCount: reservation.childCount,
    reservationDate: reservation.reservationDate,
    reservationTime: reservation.reservationTime,
    specialRequests: reservation.specialRequests,
    tableAssignment: reservation.tableAssignment ? {
      assignedTable: reservation.tableAssignment.assignedTable ? {
        id: reservation.tableAssignment.assignedTable.id,
        tableName: reservation.tableAssignment.assignedTable.tableName,
        seatingCapacity: reservation.tableAssignment.assignedTable.seatingCapacity
      } : null,
      assignedSection: reservation.tableAssignment.assignedSection ? {
        id: reservation.tableAssignment.assignedSection.id,
        sectionName: reservation.tableAssignment.assignedSection.sectionName
      } : null
    } : null,
    reservation // Keep the full reservation for database operations
  }
}

/**
 * Fetch table data from database
 */
async function fetchTableData(
  prisma: PrismaClient,
  tableId: number
): Promise<TableData | undefined> {
  const table = await prisma.restaurantTable.findUnique({
    where: { id: tableId }
  })

  if (!table) {
    return undefined
  }

  return {
    id: table.id,
    tableName: table.tableName,
    seatingCapacity: table.seatingCapacity,
    sectionId: table.sectionId,
    isActive: table.isActive
  }
}

/**
 * Fetch section availability from database
 */
async function fetchSectionAvailability(
  prisma: PrismaClient,
  input: {
    restaurantId: number
    date: Date
    reservationTime: Date
    partySize: number
    sectionId: number
    excludeReservationId: number
  }
): Promise<SectionAvailabilityData> {
  const result = await checkSectionAvailabilityForReservationTime(prisma, input)

  return {
    hasAvailableTables: result.hasAvailableTables || false,
    availableTableCount: result.availableTableCount || 0,
    reason: result.reason
  }
}

/**
 * Create a table modification request record
 */
async function createTableModificationRequest(
  prisma: PrismaClient,
  input: TableReservationModificationInput,
  reservation: any
): Promise<{
  modificationRequest: any
  statusHistoryId: number
}> {
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
      notes: input.notes
    }
  })

  // Create status history record
  const statusHistory = await prisma.tableReservationModificationStatusHistory.create({
    data: {
      modificationId: modificationRequest.id,
      newStatus: TableModificationStatus.PENDING,
      changeReason: 'Modification request created',
      statusChangedAt: new Date(),
      changedBy: input.requestedBy
    }
  })

  return {
    modificationRequest,
    statusHistoryId: statusHistory.id
  }
}

/**
 * Process the table modification (database operations only)
 */
async function processTableModification(
  prisma: PrismaClient,
  modRequest: any
): Promise<{
  success: boolean
  status: TableModificationStatus
  errorMessage?: string
  errorCode?: string
  reservation?: any
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
        changedBy: modRequest.requestedBy
      }
    })

    await prisma.tableReservationModificationRequest.update({
      where: { id: modRequest.id },
      data: { status: TableModificationStatus.PROCESSING }
    })

    // Apply the modification to the reservation
    const updatedReservation = await applyTableModificationToReservation(prisma, modRequest)

    // Verify the reservation was properly updated
    await verifyReservationUpdate(prisma, modRequest.reservationId, modRequest.id)

    // Update status to COMPLETED
    await prisma.tableReservationModificationStatusHistory.create({
      data: {
        modificationId: modRequest.id,
        previousStatus: TableModificationStatus.PROCESSING,
        newStatus: TableModificationStatus.COMPLETED,
        changeReason: 'Modification completed successfully',
        statusChangedAt: new Date(),
        changedBy: modRequest.requestedBy
      }
    })

    await prisma.tableReservationModificationRequest.update({
      where: { id: modRequest.id },
      data: {
        status: TableModificationStatus.COMPLETED,
        processedAt: new Date(),
        processedBy: modRequest.requestedBy
      }
    })

    return {
      success: true,
      status: TableModificationStatus.COMPLETED,
      reservation: updatedReservation
    }
  } catch (error) {
    console.log('Error processing table modification:', {
      action: 'processTableModification',
      modificationId: modRequest.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    // Update status to REJECTED
    await prisma.tableReservationModificationStatusHistory.create({
      data: {
        modificationId: modRequest.id,
        previousStatus: TableModificationStatus.PROCESSING,
        newStatus: TableModificationStatus.REJECTED,
        changeReason: `Modification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        statusChangedAt: new Date(),
        changedBy: modRequest.requestedBy
      }
    })

    await prisma.tableReservationModificationRequest.update({
      where: { id: modRequest.id },
      data: {
        status: TableModificationStatus.REJECTED,
        rejectionReason: error instanceof Error ? error.message : 'Unknown error'
      }
    })

    return {
      success: false,
      status: TableModificationStatus.REJECTED,
      errorMessage: error instanceof Error ? error.message : 'Failed to process modification',
      errorCode: 'PROCESSING_ERROR'
    }
  }
}

/**
 * Apply modification changes to the reservation (database operations)
 */
async function applyTableModificationToReservation(
  prisma: PrismaClient,
  modRequest: any
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
    })

    if (!reservation) {
      throw new Error(`Reservation ${modRequest.reservationId} not found`)
    }

    // 2. Start a transaction to update reservation and table assignment
    const result = await prisma.$transaction(async (tx) => {
      // Update reservation details
      const updateData: any = {
        lastModifiedAt: new Date(),
        lastModifiedBy: modRequest.requestedBy,
        lastModificationId: modRequest.id
      }

      // Add fields that were modified
      if (modRequest.modificationTypes.includes(TableModificationType.PARTY_SIZE)) {
        if (modRequest.newAdultCount !== null && modRequest.newAdultCount !== undefined) {
          updateData.adultCount = modRequest.newAdultCount
        }
        if (modRequest.newChildCount !== null && modRequest.newChildCount !== undefined) {
          updateData.childCount = modRequest.newChildCount
        }
      }

      if (modRequest.modificationTypes.includes(TableModificationType.SPECIAL_REQUESTS)) {
        if (modRequest.newSpecialRequests !== undefined) {
          updateData.specialRequests = modRequest.newSpecialRequests
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
      })

      // Handle table assignment changes with slot management
      if (
        modRequest.modificationTypes.includes(TableModificationType.TABLE_ASSIGNMENT) ||
        modRequest.modificationTypes.includes(TableModificationType.SECTION_ASSIGNMENT)
      ) {
        const currentTableId = reservation.tableAssignment?.assignedTableId
        const currentSlotId = reservation.tableAssignment?.slotId

        // If we're changing tables, we need to handle slot management
        if (modRequest.newTableId !== undefined && modRequest.newTableId !== currentTableId) {
          // Step 1: Free the current slot if it exists
          if (currentSlotId) {
            await tx.tableAvailabilitySlot.update({
              where: { id: currentSlotId },
              data: {
                status: 'AVAILABLE',
                reservationId: null
              }
            })
            console.log(`Freed slot ${currentSlotId} for table ${currentTableId}`)
          }

          // Step 2: Find or use existing slot for the new table
          if (modRequest.newTableId) {
            const newTable = await tx.restaurantTable.findUnique({
              where: { id: modRequest.newTableId }
            })

            if (newTable) {
              // Use the actual reservation time
              const reservationTimeOnly = new Date(`1970-01-01T${reservation.reservationTime.toTimeString().split(' ')[0]}`)

              // Calculate end time (default 90 minutes duration)
              const endTime = new Date(reservationTimeOnly)
              endTime.setMinutes(endTime.getMinutes() + 90)

              // Check for conflicting slots - ENHANCED to check future dates
              // This prevents reassigning tables that have future conflicts
              const conflictingSlots = await tx.tableAvailabilitySlot.findMany({
                where: {
                  tableId: modRequest.newTableId,
                  date: {
                    gte: reservation.reservationDate // Check from reservation date onwards
                  },
                  AND: [
                    {
                      startTime: {
                        lt: endTime
                      }
                    },
                    {
                      endTime: {
                        gt: reservationTimeOnly
                      }
                    }
                  ],
                  status: {
                    in: ['RESERVED', 'HELD']
                  },
                  reservationId: {
                    not: reservation.id
                  }
                },
                include: {
                  reservation: {
                    select: {
                      reservationNumber: true,
                      reservationName: true,
                      reservationDate: true
                    }
                  }
                },
                orderBy: {
                  date: 'asc'
                }
              })

              if (conflictingSlots.length > 0) {
                const conflictDates = conflictingSlots
                  .map(s => s.reservation?.reservationDate?.toLocaleDateString() || 'Unknown')
                  .slice(0, 3)
                  .join(', ')
                throw new Error(
                  `Table ${newTable.tableName} has ${conflictingSlots.length} conflicting reservation(s) on: ${conflictDates}${conflictingSlots.length > 3 ? '...' : ''}. Cannot reassign.`
                )
              }

              // Find existing slot for this table
              let newSlot = await tx.tableAvailabilitySlot.findFirst({
                where: {
                  tableId: modRequest.newTableId,
                  date: reservation.reservationDate,
                  AND: [
                    {
                      startTime: {
                        lte: reservationTimeOnly
                      }
                    },
                    {
                      endTime: {
                        gte: endTime
                      }
                    }
                  ],
                  OR: [
                    { status: 'AVAILABLE' },
                    { status: 'RESERVED', reservationId: reservation.id }
                  ]
                }
              })

              // If no exact slot found, try to find any available slot
              if (!newSlot) {
                newSlot = await tx.tableAvailabilitySlot.findFirst({
                  where: {
                    tableId: modRequest.newTableId,
                    date: reservation.reservationDate,
                    status: 'AVAILABLE'
                  }
                })
              }

              if (!newSlot) {
                throw new Error(`No available slot found for table ${newTable.tableName} at the requested time`)
              }

              // Reserve the slot if it's available
              if (newSlot.status === 'AVAILABLE') {
                await tx.tableAvailabilitySlot.update({
                  where: { id: newSlot.id },
                  data: {
                    status: 'RESERVED',
                    reservationId: reservation.id
                  }
                })
              }
            }
          }
        }

        // Step 3: Update table assignment
        const assignmentUpdateData: any = {}

        if (modRequest.newSectionId !== undefined) {
          assignmentUpdateData.assignedSectionId = modRequest.newSectionId
        }

        if (modRequest.newTableId !== undefined) {
          assignmentUpdateData.assignedTableId = modRequest.newTableId

          // Update slot reference
          if (modRequest.newTableId) {
            const newSlot = await tx.tableAvailabilitySlot.findFirst({
              where: {
                tableId: modRequest.newTableId,
                date: reservation.reservationDate,
                reservationId: reservation.id
              }
            })

            if (newSlot) {
              assignmentUpdateData.slotId = newSlot.id
            }
          } else {
            assignmentUpdateData.slotId = null
          }
        }

        // Create or update table assignment
        if (!reservation.tableAssignment) {
          await tx.reservationTableAssignment.create({
            data: {
              reservationId: reservation.id,
              assignedSectionId: modRequest.newSectionId || null,
              assignedTableId: modRequest.newTableId || null,
              slotId: assignmentUpdateData.slotId || null
            }
          })
        } else {
          await tx.reservationTableAssignment.update({
            where: { reservationId: reservation.id },
            data: assignmentUpdateData
          })
        }
      }

      // Fetch the updated reservation
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
      })

      // Create modification history record
      await createTableModificationHistoryInTransaction(tx, modRequest, finalReservation)

      return finalReservation
    })

    return result
  } catch (error) {
    console.log('Failed to apply table modification to reservation:', {
      action: 'applyTableModificationToReservation',
      modificationId: modRequest.id,
      reservationId: modRequest.reservationId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    throw error
  }
}

/**
 * Verify that the reservation was properly updated
 */
async function verifyReservationUpdate(
  prisma: PrismaClient,
  reservationId: number,
  modificationId: number
): Promise<void> {
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: {
        id: true,
        lastModifiedAt: true,
        lastModifiedBy: true,
        lastModificationId: true,
        _count: {
          select: {
            tableModificationRequests: true,
            tableModificationHistory: true
          }
        }
      }
    })

    if (!reservation) {
      console.log('Warning: Reservation not found during verification', {
        action: 'verifyReservationUpdate',
        reservationId,
        modificationId
      })
      return
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
    })
  } catch (error) {
    console.log('Error during reservation update verification:', {
      action: 'verifyReservationUpdate',
      reservationId,
      modificationId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

/**
 * Create modification history within a transaction
 */
async function createTableModificationHistoryInTransaction(
  tx: any,
  modRequest: any,
  updatedReservation: any
): Promise<void> {
  try {
    await tx.tableReservationModificationHistory.create({
      data: {
        reservationId: updatedReservation.id,
        modificationId: modRequest.id,

        // Previous values
        previousAdultCount: modRequest.originalAdultCount,
        previousChildCount: modRequest.originalChildCount,
        previousSectionId: modRequest.originalSectionId,
        previousTableId: modRequest.originalTableId,
        previousSlotId: modRequest.originalSlotId,
        previousTableStartTime: null,
        previousTableEndTime: null,
        previousSpecialRequests: modRequest.originalSpecialRequests,

        // New values
        newAdultCount: updatedReservation.adultCount,
        newChildCount: updatedReservation.childCount,
        newSectionId: updatedReservation.tableAssignment?.assignedSectionId || null,
        newTableId: updatedReservation.tableAssignment?.assignedTableId || null,
        newSlotId: updatedReservation.tableAssignment?.slotId || null,
        newTableStartTime: null,
        newTableEndTime: null,
        newSpecialRequests: updatedReservation.specialRequests,

        modifiedAt: new Date(),
        modifiedBy: modRequest.requestedBy
      }
    })
  } catch (error) {
    console.log('Failed to create table modification history within transaction:', {
      action: 'createTableModificationHistoryInTransaction',
      modificationId: modRequest.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

