import { PrismaClient, Prisma, TableSlotStatus, CancellationRequestedBy, CancellationStatus, CancellationReasonCategory, CancellationWindowType, RefundStatus, RefundReason } from "../../../prisma/generated/prisma";
import { z } from "zod";

// ============================================================================
// Input Validation Schemas
// ============================================================================

const ValidateTableCancellationInput = z.object({
  reservationId: z.number().positive(),
  customerId: z.number().positive().optional(),
  referenceTime: z.date().optional()
});

const CalculateRefundInput = z.object({
  reservationId: z.number().positive(),
  restaurantId: z.number().positive(),
  totalAmount: z.number().min(0),
  advancePaymentAmount: z.number().min(0).optional(),
  reservationDateTime: z.date(),
  referenceTime: z.date().optional()
});

const ReleaseTableSlotsInput = z.object({
  reservationId: z.number().positive(),
  tableSetId: z.number().positive().optional(),
  slotIds: z.array(z.number().positive()).optional(),
  userId: z.string().min(1)
});

const CreateCancellationRecordsInput = z.object({
  reservationId: z.number().positive(),
  restaurantId: z.number().positive(),
  requestedBy: z.nativeEnum(CancellationRequestedBy),
  requestedById: z.number().positive(),
  reason: z.string().min(1),
  reasonCategory: z.nativeEnum(CancellationReasonCategory),
  additionalNotes: z.string().optional(),
  refundAmount: z.number().min(0),
  refundPercentage: z.number().min(0).max(100),
  windowType: z.nativeEnum(CancellationWindowType),
  processedBy: z.string().min(1),
  tableSetId: z.number().positive().optional(),
  releasedSlotIds: z.array(z.number().positive()).default([])
});

// ============================================================================
// Type Definitions
// ============================================================================

export type ValidateTableCancellationInputType = z.infer<typeof ValidateTableCancellationInput>;
export type CalculateRefundInputType = z.infer<typeof CalculateRefundInput>;
export type ReleaseTableSlotsInputType = z.infer<typeof ReleaseTableSlotsInput>;
export type CreateCancellationRecordsInputType = z.infer<typeof CreateCancellationRecordsInput>;

export interface TableCancellationValidationResult {
  success: boolean;
  isEligible?: boolean;
  reservation?: any;
  error?: string;
  errorCode?: string;
}

export interface RefundCalculationResult {
  success: boolean;
  refundAmount?: number;
  refundPercentage?: number;
  windowType?: CancellationWindowType;
  minutesUntilReservation?: number;
  error?: string;
  errorCode?: string;
}

export interface SlotReleaseResult {
  success: boolean;
  releasedSlotIds?: number[];
  tableNames?: string[];
  wasMerged?: boolean;
  tableCount?: number;
  error?: string;
  errorCode?: string;
}

export interface CancellationRecordsResult {
  success: boolean;
  cancellationId?: number;
  refundTransactionId?: number;
  cancellationNumber?: string;
  error?: string;
  errorCode?: string;
}

export interface ProcessTableCancellationResult {
  success: boolean;
  data?: {
    cancellationId: number;
    cancellationNumber: string;
    refundAmount: number;
    refundPercentage: number;
    slotsReleased: number;
    tablesReleased: string[];
    wasMerged: boolean;
  };
  error?: string;
  errorCode?: string;
}

// ============================================================================
// Transaction Configuration
// ============================================================================

const TRANSACTION_CONFIG = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 5000, // 5 seconds max wait for transaction
  timeout: 10000, // 10 seconds max transaction time
} as const;

const LOCK_TIMEOUT_CONFIG = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 2000, // 2 seconds max wait for lock
  timeout: 8000, // 8 seconds max transaction time
} as const;

// ============================================================================
// Granular Transaction Functions
// ============================================================================

/**
 * Validates table cancellation eligibility with proper locking
 * This function ensures atomicity and prevents race conditions
 */
export async function validateTableCancellationWithLock(
  prisma: PrismaClient,
  input: ValidateTableCancellationInputType
): Promise<TableCancellationValidationResult> {
  try {
    // Validate input
    const validatedInput = ValidateTableCancellationInput.parse(input);
    const referenceTime = validatedInput.referenceTime || new Date();
    
    return await prisma.$transaction(async (tx) => {
      // Lock the reservation for update to prevent concurrent modifications
      const reservation = await tx.reservation.findUnique({
        where: { id: validatedInput.reservationId },
        include: {
          restaurant: {
            include: {
              refundPolicies: {
                where: { isActive: true }
              }
            }
          },
          customer: true,
          tableAssignment: {
            include: {
              assignedTable: true,
              assignedSection: true,
              slot: true
            }
          },
          tableSets: {
            where: {
              status: { in: ['PENDING_MERGE', 'ACTIVE'] }
            },
            orderBy: { createdAt: 'desc' },
            take: 1
          },
          cancellationRequests: {
            where: {
              status: { in: ['PENDING_REVIEW', 'APPROVED_PENDING_REFUND'] }
            }
          }
        }
      });

      if (!reservation) {
        return {
          success: false,
          error: 'Reservation not found',
          errorCode: 'RESERVATION_NOT_FOUND'
        };
      }

      // Check customer ownership if customerId provided
      if (validatedInput.customerId && reservation.customerId !== validatedInput.customerId) {
        return {
          success: false,
          error: 'You do not have permission to cancel this reservation',
          errorCode: 'UNAUTHORIZED_CANCELLATION'
        };
      }

      // Check if reservation is already cancelled
      if (reservation.status === 'CANCELLED') {
        return {
          success: false,
          error: 'Reservation has already been cancelled',
          errorCode: 'ALREADY_CANCELLED'
        };
      }

      // Check if reservation is confirmed
      if (reservation.status !== 'CONFIRMED') {
        return {
          success: false,
          error: 'Only confirmed reservations can be cancelled',
          errorCode: 'INVALID_STATUS'
        };
      }

      // Check if there are pending cancellation requests
      if (reservation.cancellationRequests.length > 0) {
        return {
          success: false,
          error: 'A cancellation request is already pending for this reservation',
          errorCode: 'PENDING_CANCELLATION_EXISTS'
        };
      }

      // Check if reservation time has passed
      const reservationDateTime = new Date(reservation.reservationDate);
      const reservationTime = reservation.reservationTime ? new Date(reservation.reservationTime) : null;

      if (!reservationTime) {
        return {
          success: false,
          error: 'Reservation time is not available for validation',
          errorCode: 'INVALID_RESERVATION_TIME'
        };
      }

      reservationDateTime.setHours(
        reservationTime.getHours(),
        reservationTime.getMinutes(),
        0,
        0
      );

      if (reservationDateTime <= referenceTime) {
        return {
          success: false,
          error: 'Cannot cancel reservation after the scheduled time',
          errorCode: 'RESERVATION_IN_PAST'
        };
      }

      // Note: We don't validate table set status during cancellation validation
      // Table sets (merged or pending) will be dissolved during the cancellation process
      // No need to check if primary table matches - cancellation should work regardless
      // Dwelling time checks are not needed during cancellation as we're releasing the table

      return {
        success: true,
        isEligible: true,
        reservation: reservation
      };
    }, LOCK_TIMEOUT_CONFIG);

  } catch (error) {
    console.error('Error validating table cancellation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate cancellation eligibility',
      errorCode: 'VALIDATION_ERROR'
    };
  }
}

/**
 * Calculates refund amount within transaction context
 * Ensures policy consistency during calculation
 */
export async function calculateRefundInTransaction(
  prisma: PrismaClient,
  input: CalculateRefundInputType,
  tx?: Prisma.TransactionClient
): Promise<RefundCalculationResult> {
  try {
    // Validate input
    const validatedInput = CalculateRefundInput.parse(input);
    const referenceTime = validatedInput.referenceTime || new Date();
    
    const client = tx || prisma;

    // Get active refund policy for the restaurant
    // For table reservations, we don't filter by mealType as per business requirements
    const refundPolicy = await client.restaurantRefundPolicy.findFirst({
      where: {
        restaurantId: validatedInput.restaurantId,
        isActive: true
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!refundPolicy) {
      return {
        success: false,
        error: 'No active refund policy found for this restaurant',
        errorCode: 'NO_REFUND_POLICY'
      };
    }

    // Calculate minutes until reservation
    const minutesUntilReservation = Math.floor(
      (validatedInput.reservationDateTime.getTime() - referenceTime.getTime()) / (1000 * 60)
    );

    // For table reservations, use totalAmount as the refundable amount
    const refundableAmount = validatedInput.totalAmount;

    if (refundableAmount <= 0) {
      return {
        success: true,
        refundAmount: 0,
        refundPercentage: 0,
        windowType: CancellationWindowType.NO_REFUND,
        minutesUntilReservation
      };
    }

    let refundAmount = 0;
    let refundPercentage = 0;
    let windowType: CancellationWindowType = CancellationWindowType.NO_REFUND;

    // Apply refund policy logic
    if (minutesUntilReservation >= refundPolicy.fullRefundBeforeMinutes) {
      // Full refund window
      refundAmount = refundableAmount;
      refundPercentage = 100;
      windowType = CancellationWindowType.FREE;
    } else if (
      refundPolicy.partialRefundBeforeMinutes && 
      refundPolicy.partialRefundPercentage &&
      minutesUntilReservation >= refundPolicy.partialRefundBeforeMinutes
    ) {
      // Partial refund window
      refundPercentage = refundPolicy.partialRefundPercentage;
      refundAmount = Math.round((refundableAmount * refundPercentage) / 100);
      windowType = CancellationWindowType.PARTIAL;
    } else {
      // No refund window
      refundAmount = 0;
      refundPercentage = 0;
      windowType = CancellationWindowType.NO_REFUND;
    }

    return {
      success: true,
      refundAmount,
      refundPercentage,
      windowType,
      minutesUntilReservation
    };

  } catch (error) {
    console.error('Error calculating refund:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate refund amount',
      errorCode: 'REFUND_CALCULATION_ERROR'
    };
  }
}

/**
 * Releases table slots atomically
 * Handles both individual slots and merged table scenarios
 */
export async function releaseTableSlotsTransactional(
  prisma: PrismaClient,
  input: ReleaseTableSlotsInputType,
  tx?: Prisma.TransactionClient
): Promise<SlotReleaseResult> {
  try {
    // Validate input
    const validatedInput = ReleaseTableSlotsInput.parse(input);
    const client = tx || prisma;
    
    const executeRelease = async (transactionClient: Prisma.TransactionClient) => {
      let releasedSlotIds: number[] = [];
      let tableNames: string[] = [];
      let wasMerged = false;
      let tableCount = 1;

      // Check if this is a merged table scenario
      if (validatedInput.tableSetId) {
        // Handle merged table dissolution
        const tableSet = await transactionClient.tableSet.findUnique({
          where: { id: validatedInput.tableSetId },
          include: {
            reservation: {
              include: {
                tableAssignment: {
                  include: {
                    assignedTable: true
                  }
                }
              }
            }
          }
        });

        if (!tableSet) {
          throw new Error('Table set not found');
        }

        // Get table names for the slots being released
        const tables = await transactionClient.restaurantTable.findMany({
          where: {
            id: { in: tableSet.tableIds }
          },
          select: {
            id: true,
            tableName: true
          }
        });

        tableNames = tables.map(table => table.tableName);
        tableCount = tableSet.tableIds.length;
        wasMerged = true;

        // Release all slots in the table set
        const updateResult = await transactionClient.tableAvailabilitySlot.updateMany({
          where: {
            id: { in: tableSet.slotIds },
            status: TableSlotStatus.RESERVED,
            reservationId: validatedInput.reservationId
          },
          data: {
            status: TableSlotStatus.AVAILABLE,
            reservationId: null,
            holdExpiresAt: null
          }
        });

        if (updateResult.count === 0) {
          throw new Error('No slots were released - they may have already been released or are not reserved');
        }

        releasedSlotIds = tableSet.slotIds;

        // Mark table set as dissolved
        await transactionClient.tableSet.update({
          where: { id: tableSet.id },
          data: {
            status: 'DISSOLVED',
            dissolvedAt: new Date(),
            dissolvedBy: validatedInput.userId
          }
        });

      } else {
        // Handle single table slot release
        const reservation = await transactionClient.reservation.findUnique({
          where: { id: validatedInput.reservationId },
          include: {
            tableAssignment: {
              include: {
                assignedTable: true,
                slot: true
              }
            }
          }
        });

        if (!reservation?.tableAssignment?.slot) {
          // No table assignment found, this might be okay for some scenarios
          return {
            success: true,
            releasedSlotIds: [],
            tableNames: [],
            wasMerged: false,
            tableCount: 0
          };
        }

        const slot = reservation.tableAssignment.slot;
        const table = reservation.tableAssignment.assignedTable;

        // Release the single slot
        const updateResult = await transactionClient.tableAvailabilitySlot.update({
          where: {
            id: slot.id,
            status: TableSlotStatus.RESERVED,
            reservationId: validatedInput.reservationId
          },
          data: {
            status: TableSlotStatus.AVAILABLE,
            reservationId: null,
            holdExpiresAt: null
          }
        });

        releasedSlotIds = [slot.id];
        tableNames = table ? [table.tableName] : [];
        wasMerged = false;
        tableCount = 1;
      }

      return {
        success: true,
        releasedSlotIds,
        tableNames,
        wasMerged,
        tableCount
      };
    };

    // Execute within transaction if not already in one
    if (tx) {
      return await executeRelease(tx);
    } else {
      return await prisma.$transaction(executeRelease, TRANSACTION_CONFIG);
    }

  } catch (error) {
    console.error('Error releasing table slots:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to release table slots',
      errorCode: 'SLOT_RELEASE_ERROR'
    };
  }
}

/**
 * Creates cancellation and refund records atomically
 * All database writes happen in single transaction
 */
export async function createCancellationRecordsTransactional(
  prisma: PrismaClient,
  input: CreateCancellationRecordsInputType,
  tx?: Prisma.TransactionClient
): Promise<CancellationRecordsResult> {
  try {
    // Validate input
    const validatedInput = CreateCancellationRecordsInput.parse(input);
    
    const executeCreation = async (transactionClient: Prisma.TransactionClient) => {
      // Create cancellation request
      const cancellationRequest = await transactionClient.cancellationRequest.create({
        data: {
          reservationId: validatedInput.reservationId,
          restaurantId: validatedInput.restaurantId,
          requestedBy: validatedInput.requestedBy,
          requestedById: validatedInput.requestedById,
          status: validatedInput.refundAmount > 0 
            ? CancellationStatus.APPROVED_PENDING_REFUND 
            : CancellationStatus.APPROVED_NO_REFUND,
          reason: validatedInput.reason,
          reasonCategory: validatedInput.reasonCategory,
          additionalNotes: validatedInput.additionalNotes || '',
          processedBy: validatedInput.processedBy,
          processedAt: new Date(),
          refundAmount: validatedInput.refundAmount > 0 ? validatedInput.refundAmount : null,
          refundPercentage: validatedInput.refundPercentage > 0 ? validatedInput.refundPercentage : null,
          windowType: validatedInput.windowType,
          tableSetId: validatedInput.tableSetId,
          mergedTableCount: validatedInput.tableSetId ? undefined : 1, // Will be updated if merged
          releasedSlotIds: validatedInput.releasedSlotIds,
          slotReleaseCompletedAt: new Date()
        }
      });

      let refundTransactionId: number | undefined;

      // Create refund transaction if refund amount > 0
      if (validatedInput.refundAmount > 0) {
        const refundTransaction = await transactionClient.refundTransaction.create({
          data: {
            reservationId: validatedInput.reservationId,
            restaurantId: validatedInput.restaurantId,
            cancellationId: cancellationRequest.id,
            amount: validatedInput.refundAmount,
            reason: RefundReason.RESERVATION_CANCELLATION,
            status: RefundStatus.PENDING,
            processedBy: validatedInput.processedBy,
            notes: `Table reservation cancellation refund - ${validatedInput.windowType} window`,
            createdAt: new Date()
          }
        });
        refundTransactionId = refundTransaction.id;
      }

      // Update reservation status to CANCELLED
      await transactionClient.reservation.update({
        where: { id: validatedInput.reservationId },
        data: { 
          status: 'CANCELLED',
          updatedAt: new Date()
        }
      });

      // Generate cancellation number
      const cancellationNumber = `CAN-${cancellationRequest.id}-${validatedInput.reservationId}`;

      return {
        success: true,
        cancellationId: cancellationRequest.id,
        refundTransactionId,
        cancellationNumber
      };
    };

    // Execute within transaction if not already in one
    if (tx) {
      return await executeCreation(tx);
    } else {
      return await prisma.$transaction(executeCreation, TRANSACTION_CONFIG);
    }

  } catch (error) {
    console.error('Error creating cancellation records:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create cancellation records',
      errorCode: 'CANCELLATION_CREATION_ERROR'
    };
  }
}

/**
 * Orchestrates the complete table cancellation process
 * Ensures all operations happen atomically
 */
export async function processTableCancellationTransactional(
  prisma: PrismaClient,
  input: {
    reservationId: number;
    customerId?: number;
    reason: string;
    reasonCategory: CancellationReasonCategory;
    additionalNotes?: string;
    processedBy: string;
    userId: string;
    referenceTime?: Date;
  }
): Promise<ProcessTableCancellationResult> {
  try {
    const referenceTime = input.referenceTime || new Date();

    return await prisma.$transaction(async (tx) => {
      // Step 1: Validate cancellation with lock
      const validation = await validateTableCancellationWithLock(prisma, {
        reservationId: input.reservationId,
        customerId: input.customerId,
        referenceTime
      });

      if (!validation.success || !validation.reservation) {
        return {
          success: false,
          error: validation.error || 'Validation failed',
          errorCode: validation.errorCode || 'VALIDATION_FAILED'
        };
      }

      const reservation = validation.reservation;

      // Step 2: Calculate refund
      const reservationDateTime = new Date(reservation.reservationDate);
      const reservationTime = reservation.reservationTime ? new Date(reservation.reservationTime) : null;

      if (!reservationTime) {
        return {
          success: false,
          error: 'Reservation time is not available for validation',
          errorCode: 'INVALID_RESERVATION_TIME'
        };
      }

      reservationDateTime.setHours(
        reservationTime.getHours(),
        reservationTime.getMinutes(),
        0,
        0
      );

      const refundCalculation = await calculateRefundInTransaction(prisma, {
        reservationId: input.reservationId,
        restaurantId: reservation.restaurantId,
        totalAmount: Number(reservation.totalAmount),
        advancePaymentAmount: reservation.advancePaymentAmount ? Number(reservation.advancePaymentAmount) : undefined,
        reservationDateTime,
        referenceTime
      }, tx);

      if (!refundCalculation.success) {
        return {
          success: false,
          error: refundCalculation.error || 'Refund calculation failed',
          errorCode: refundCalculation.errorCode || 'REFUND_CALCULATION_FAILED'
        };
      }

      // Step 3: Release table slots
      const activeTableSet = reservation.tableSets[0];
      const slotRelease = await releaseTableSlotsTransactional(prisma, {
        reservationId: input.reservationId,
        tableSetId: activeTableSet?.id,
        userId: input.userId
      }, tx);

      if (!slotRelease.success) {
        return {
          success: false,
          error: slotRelease.error || 'Failed to release table slots',
          errorCode: slotRelease.errorCode || 'SLOT_RELEASE_FAILED'
        };
      }

      // Step 4: Create cancellation records
      const cancellationRecords = await createCancellationRecordsTransactional(prisma, {
        reservationId: input.reservationId,
        restaurantId: reservation.restaurantId,
        requestedBy: CancellationRequestedBy.CUSTOMER,
        requestedById: input.customerId || reservation.customerId,
        reason: input.reason,
        reasonCategory: input.reasonCategory,
        additionalNotes: input.additionalNotes,
        refundAmount: refundCalculation.refundAmount || 0,
        refundPercentage: refundCalculation.refundPercentage || 0,
        windowType: refundCalculation.windowType || CancellationWindowType.NO_REFUND,
        processedBy: input.processedBy,
        tableSetId: activeTableSet?.id,
        releasedSlotIds: slotRelease.releasedSlotIds || []
      }, tx);

      if (!cancellationRecords.success) {
        return {
          success: false,
          error: cancellationRecords.error || 'Failed to create cancellation records',
          errorCode: cancellationRecords.errorCode || 'CANCELLATION_CREATION_FAILED'
        };
      }

      return {
        success: true,
        data: {
          cancellationId: cancellationRecords.cancellationId!,
          cancellationNumber: cancellationRecords.cancellationNumber!,
          refundAmount: refundCalculation.refundAmount || 0,
          refundPercentage: refundCalculation.refundPercentage || 0,
          slotsReleased: slotRelease.releasedSlotIds?.length || 0,
          tablesReleased: slotRelease.tableNames || [],
          wasMerged: slotRelease.wasMerged || false
        }
      };

    }, TRANSACTION_CONFIG);

  } catch (error) {
    console.error('Error processing table cancellation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process table cancellation',
      errorCode: 'PROCESSING_ERROR'
    };
  }
}
