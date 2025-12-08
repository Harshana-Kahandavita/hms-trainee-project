import { PrismaClient, ModificationType, ModificationStatus, Reservation, ReservationModificationRequest, PaymentStatus, RefundStatus, PaymentChannel, MealType } from '../../prisma/generated/prisma';
import Decimal from 'decimal.js';
import { PaymentGatewayClient } from '../../../payment-gw/src/payment_client';
import { validatePromoCode } from '../promo_code_flow';

/**
 * Get current time in ISO format
 */
const getCurrentTime = (): Date => {
  // Get current time in local timezone
  const now = new Date();
  // Convert to UTC to match the format of other dates in the system
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds()
  ));
};

/**
 * Convert date to ISO format
 */
const toISOTime = (date: Date): Date => {
  return new Date(date.toISOString());
};

// Input type for modification request
export type ReservationModificationInput = {
    reservationId: number;
    requestedBy: string; // User ID or "CUSTOMER" or "MERCHANT"
    modificationTypes: ModificationType[];

    // New details (only include what's changing)
    newDate?: Date;
    newTime?: Date;
    newAdultCount?: number;
    newChildCount?: number;
    newMealType?: string;   //this can be convert to Database MealType enum

    // Special requests modification
    newSpecialRequests?: string;

    // Optional metadata
    notes?: string;
};

// Response type
export type ModificationResult = {
    success: boolean;
    modificationId?: number;
    status?: ModificationStatus;
    errorMessage?: string;
    requiresPayment?: boolean;
    paymentAmount?: Decimal;
    requiresRefund?: boolean;
    refundAmount?: Decimal;
    reservation?: Reservation;
};

// Payment gateway configuration from environment variables
const paymentConfig = {
  baseUrl: process.env.GUEST_WEB_PAYMENT_GW_BASE_URL || 'https://stgrincewind.hsenidmobile.com',
  clientId: process.env.GUEST_WEB_PAYMENT_CLIENT_ID || 'staging',
  clientSecret: process.env.GUEST_WEB_PAYMENT_CLIENT_SECRET || '9142582e-2218-4fa6-a5d8-08f5f62822f8',
  grantType: process.env.GUEST_WEB_PAYMENT_GRANT_TYPE || 'client_credentials',
  merchantId: process.env.GUEST_WEB_PAYMENT_MERCHANT_ID || 'rush_booking'
};

// Initialize payment gateway client
const paymentClient = new PaymentGatewayClient(paymentConfig);

/**
 * Main function to process a reservation modification
 */
export async function processReservationModification(
    prisma: PrismaClient,
    input: ReservationModificationInput,
): Promise<ModificationResult> {
    const action = 'processReservationModification';
    const requestId = `res_${input.reservationId}`;
    
    console.log(`[${action}] Starting processReservationModification`, {
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
        const validationResult = await validateModificationRequest(prisma, input);
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
        const modRequest = await createModificationRequest(prisma, input, {
            isValid: validationResult.isValid,
            reservation: validationResult.reservation,
            restaurant: validationResult.restaurant
        });
            console.log(`[${action}] Created modification request`, {
            action,
            requestId,
            modificationId: modRequest.modificationRequest.id
        });

        // Step 3: Check capacity availability
        console.log(`[${action}] Checking capacity availability`, {
            action,
            requestId,
            modificationId: modRequest.modificationRequest.id
        });
        const capacityResult = await checkCapacity(prisma, modRequest.modificationRequest);
        if (!capacityResult.success) {
            console.log(`[${action}] No capacity available`, {
                action,
                requestId,
                modificationId: modRequest.modificationRequest.id,
                error: capacityResult.errorMessage
            });
            // Update request status to REJECTED
            await updateModificationStatus(
                prisma,
                modRequest.modificationRequest.id,
                ModificationStatus.PENDING,
                ModificationStatus.REJECTED,
                'No capacity available',
            );

            return {
                success: false,
                modificationId: modRequest.modificationRequest.id,
                status: ModificationStatus.REJECTED,
                errorMessage: capacityResult.errorMessage || 'No capacity available for the requested modification'
            };
        }
        console.log(`[${action}] Capacity check passed`, {
            action,
            requestId,
            modificationId: modRequest.modificationRequest.id
        });

        // Step 4: Calculate price difference
        console.log(`[${action}] Calculating price difference`, {
            action,
            requestId,
            modificationId: modRequest.modificationRequest.id
        });
        const pricingResult = await calculatePriceDifference(prisma, modRequest.modificationRequest);
        console.log(`[${action}] Price calculation result`, {
            action,
            requestId,
            modificationId: modRequest.modificationRequest.id,
            originalAmount: pricingResult.originalAmount.toString(),
            newAmount: pricingResult.newAmount.toString(),
            difference: pricingResult.priceDifference.toString(),
            requiresPayment: pricingResult.requiresAdditionalPayment,
            requiresRefund: pricingResult.requiresRefund
        });

        // Update request with pricing information
        console.log(`[${action}] Updating request with pricing info`, {
            action,
            requestId,
            modificationId: modRequest.modificationRequest.id
        });
        const updatedRequest = await updateRequestWithPricing(prisma, modRequest, pricingResult);

        // Step 5: Process payment if required
        if (pricingResult.requiresAdditionalPayment) {
            await updateModificationStatus(
                prisma,
                modRequest.modificationRequest.id,
                ModificationStatus.PROCESSING,
                ModificationStatus.PAYMENT_PENDING,
                'Additional payment required',
            );

            return {
                success: true,
                modificationId: modRequest.modificationRequest.id,
                status: ModificationStatus.PAYMENT_PENDING,
                requiresPayment: true,
                paymentAmount: pricingResult.newAdvancePaymentAmount
            };
        }

        // Step 6: Process refund if required
        if (pricingResult.requiresRefund) {
                const refundResult = await processRefund(prisma, modRequest.modificationRequest, pricingResult.priceDifference);
            if (!refundResult.success) {
                return {
                    success: false,
                    modificationId: modRequest.modificationRequest.id,
                    errorMessage: 'Failed to process refund'
                };
            }
        }

        // Step 7: Update capacity records
        console.log(`[${action}] Updating capacity records`, {
            action,
            requestId,
            modificationId: modRequest.modificationRequest.id
        });
        const capacityUpdateResult = await updateCapacity(prisma, updatedRequest);
        if (!capacityUpdateResult.success) {
            console.log(`[${action}] Failed to update capacity`, {
                action,
                requestId,
                modificationId: modRequest.modificationRequest.id,
                error: capacityUpdateResult.errorMessage
            });
            return {
                success: false,
                modificationId: modRequest.modificationRequest.id,
                errorMessage: capacityUpdateResult.errorMessage || 'Failed to update capacity records'
            };
        }
        console.log(`[${action}] Capacity updated successfully`, {
            action,
            requestId,
            modificationId: modRequest.modificationRequest.id
        });

        // Step 8: Apply changes to reservation
        const updatedReservation = await applyModificationToReservation(prisma, updatedRequest);

        // Step 9: Record modification history
        await recordModificationHistory(prisma, updatedRequest, updatedReservation);

        // Step 10: Complete the modification
        await updateModificationStatus(
            prisma,
            modRequest.modificationRequest.id,
            updatedRequest.status,
            ModificationStatus.COMPLETED,
            'Modification completed successfully',
        );

        console.log(`[${action}] Modification process completed successfully`, {
            action,
            requestId,
            modificationId: modRequest.modificationRequest.id
        });


        console.log('requires payment', pricingResult.requiresAdditionalPayment)
        // Final return with success
        return {
            success: true,
            modificationId: modRequest.modificationRequest.id,
            status: ModificationStatus.COMPLETED,
            requiresRefund: pricingResult.requiresRefund,
            refundAmount: pricingResult.requiresRefund ? pricingResult.priceDifference.abs() : undefined,
            reservation: updatedReservation,
            requiresPayment: pricingResult.requiresAdditionalPayment
        };
    } catch (error) {
        console.log(`[${action}] Error processing reservation modification`, {
            action,
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });
        return {
            success: false,
            errorMessage: error instanceof Error ? error.message : 'Unknown error occurred'
        };
    }
}

/**
 * Validate if the modification request is allowed
 */
async function validateModificationRequest(
    prisma: PrismaClient,
    input: ReservationModificationInput,
): Promise<{
    isValid: boolean;
    errorMessage?: string;
    reservation: Reservation | null;
    restaurant: any | null;
}> {
    try {
        // 1. Check if reservation exists
        const reservation = await prisma.reservation.findUnique({
            where: { id: input.reservationId },
            include: {
                restaurant: true,
            },
        });

        console.log('Reservation:', {
            action: 'validateModificationRequest',
            requestId: `res_${input.reservationId}`,
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

        // 2. Check if reservation is in a modifiable state
        const nonModifiableStates = ['CANCELLED', 'NO_SHOW', 'COMPLETED'];
        if (nonModifiableStates.includes(reservation.status)) {
            return {
                isValid: false,
                errorMessage: `Cannot modify a reservation in ${reservation.status} state`,
                reservation,
                restaurant: reservation.restaurant,
            };
        }

        // 3. Check if the reservation is within the full refund window
        // First get the new meal type (if changing) or use original
        const newMealType = input.newMealType ? input.newMealType as MealType : reservation.mealType;
        const newDate = input.newDate || reservation.reservationDate;

        const [refundPolicy, mealService] = await Promise.all([
            prisma.restaurantRefundPolicy.findUnique({
                where: {
                    restaurantId_mealType: {
                        restaurantId: reservation.restaurantId,
                        mealType: newMealType
                    }
                }
            }),
            prisma.restaurantMealService.findFirst({
                where: {
                    restaurantId: reservation.restaurantId,
                    mealType: newMealType,
                    isAvailable: true
                },
                include: {
                    platters: true
                }
            })
        ]);

        if (!refundPolicy || !mealService) {
            return {
                isValid: false,
                errorMessage: 'Refund policy or meal service not found for the requested modification',
                reservation,
                restaurant: reservation.restaurant,
            };
        }

        // Create a new date object for the modified reservation date
        const modifiedReservationDate = new Date(newDate);
        
        // Get hours and minutes from the meal service start time
        const mealStartTime = new Date(mealService.serviceStartTime);
        const hours = mealStartTime.getHours();
        const minutes = mealStartTime.getMinutes();
        
        // Set the time on the modified reservation date
        const modifiedReservationDateTime = new Date(modifiedReservationDate);
        modifiedReservationDateTime.setHours(hours, minutes, 0, 0);

        // Calculate cutoff time by subtracting the full refund window
        const cutoffTime = new Date(modifiedReservationDateTime);
        cutoffTime.setMinutes(cutoffTime.getMinutes() - refundPolicy.fullRefundBeforeMinutes);

        // Get current time
        const currentTime = getCurrentTime();

        // Convert both times to ISO format for comparison
        const isoCutoffTime = toISOTime(cutoffTime);
        const isoCurrentTime = toISOTime(currentTime);

        if (isoCurrentTime >= isoCutoffTime) {
            // Format the meal type for display (e.g., "HIGH_TEA" -> "High Tea")
            const formattedMealType = newMealType
                .split('_')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');

            return {
                isValid: false,
                errorMessage: `You're unable to modify this reservation because the selected buffet is no longer available`,
                reservation,
                restaurant: reservation.restaurant,
            };
        }

        // 4. Check if the reservation date is not in the past or today
        const currentDate = new Date();
        console.log("🗓️ Date comparison:", {
            currentDate: currentDate.toISOString(),
            reservationDate: new Date(reservation.reservationDate).toISOString(),
            reservationTime: new Date(reservation.reservationTime).toISOString(),
            combined: new Date(`${reservation.reservationDate.toISOString().split('T')[0]}T${reservation.reservationTime.toISOString().split('T')[1]}`).toISOString()
        });

        // Compare dates without considering time
        const reservationDateOnly = new Date(reservation.reservationDate);
        reservationDateOnly.setHours(0, 0, 0, 0);

        const currentDateOnly = new Date();
        currentDateOnly.setHours(0, 0, 0, 0);

        // 5. Check that the modification actually changes something from the original reservation
        // Compare new values to original reservation values
        const isDateChanged = input.newDate && (() => {
            // Extract just the date part by setting hours, minutes, seconds, and milliseconds to 0
            const inputDateOnly = new Date(Date.UTC(
                input.newDate.getFullYear(),
                input.newDate.getMonth(), 
                input.newDate.getDate()
            ));
            
            const reservationDateOnly = new Date(Date.UTC(
                reservation.reservationDate.getFullYear(),
                reservation.reservationDate.getMonth(),
                reservation.reservationDate.getDate()
            ));
            
            // Compare the timestamp of date portions only
            return inputDateOnly.getTime() !== reservationDateOnly.getTime();
        })();
        
        // For platter-based services, we need to compare the actual people capacity
        const isPlatterService = mealService.platters.some(p => p.isDefault);
        const defaultPlatter = mealService.platters.find(p => p.isDefault);
        const paxPerPlatter = defaultPlatter?.headCount || 1;
        
        // For platter services, compare total capacity
        const isAdultCountChanged = input.newAdultCount !== undefined &&
            (isPlatterService
                ? input.newAdultCount !== reservation.adultCount // For platter service, compare raw values
                : input.newAdultCount !== reservation.adultCount); // For regular service, compare as is
            
        const isChildCountChanged = input.newChildCount !== undefined && 
            input.newChildCount !== reservation.childCount;
            
        const isMealTypeChanged = input.newMealType !== undefined && 
            input.newMealType !== reservation.mealType;
        
        // Log which specific changes are being made
        console.log("🔄 Modification changes detected:", {
            dateChange: isDateChanged ? "YES" : "NO",
            adultCountChange: isAdultCountChanged ? "YES" : "NO",
            childCountChange: isChildCountChanged ? "YES" : "NO",
            mealTypeChange: isMealTypeChanged ? "YES" : "NO",
            isPlatterService,
            paxPerPlatter,
            newDate: input.newDate,
            originalDate: reservation.reservationDate,
            newAdultCount: input.newAdultCount,
            originalAdultCount: reservation.adultCount,
            newChildCount: input.newChildCount,
            originalChildCount: reservation.childCount,
            newMealType: input.newMealType,
            originalMealType: reservation.mealType
        });
        
        // Only consider date, meal type, and party size changes as meaningful
        // Time changes are not considered meaningful for capacity management
        const hasMeaningfulChanges = isDateChanged || 
                                     isAdultCountChanged || isChildCountChanged || 
                                     isMealTypeChanged;
        
        if (!hasMeaningfulChanges) {
            return {
                isValid: false,
                errorMessage: 'Modification must include changes to date, meal type, or party size',
                reservation,
                restaurant: reservation.restaurant,
            };
        }

        // All validations passed
        return {
            isValid: true,
            reservation,
            restaurant: reservation.restaurant,
        };
    } catch (error) {
        console.log('Error validating modification request:', {
            action: 'validateModificationRequest',
            requestId: `res_${input.reservationId}`,
            error: error instanceof Error ? error.message : 'Unexpected error during validation',
            stack: error instanceof Error ? error.stack : undefined
        });
        return {
            isValid: false,
            errorMessage: error instanceof Error ? error.message : 'Unexpected error during validation',
            reservation: null,
            restaurant: null,
        };
    }
}

/**
 * Create a modification request record
 */
async function createModificationRequest(
    prisma: PrismaClient,
    input: ReservationModificationInput,
    validationResult: {
        isValid: boolean,
        reservation: Reservation,
        restaurant: any
    },
): Promise<{
    modificationRequest: ReservationModificationRequest;
    statusHistoryId: number;
}> {
    const { reservation } = validationResult;

    // Create the modification request
    const modificationRequest = await prisma.reservationModificationRequest.create({
        data: {
            // Base information
            reservationId: reservation.id,
            restaurantId: reservation.restaurantId,
            requestedBy: input.requestedBy,
            modificationTypes: input.modificationTypes,
            status: ModificationStatus.PENDING,

            // Original details
            originalDate: reservation.reservationDate,
            originalTime: reservation.reservationTime,
            originalAdultCount: reservation.adultCount,
            originalChildCount: reservation.childCount,
            originalMealType: reservation.mealType,
            originalAmount: reservation.totalAmount,
            originalServiceCharge: reservation.serviceCharge,
            originalTaxAmount: reservation.taxAmount,
            originalDiscountAmount: reservation.discountAmount,
            originalPromoCodeId: reservation.promoCodeId,
            originalAdvancePaymentAmount: reservation.advancePaymentAmount,
            originalRemainingPaymentAmount: reservation.remainingPaymentAmount,

            // New requested details
            newDate: input.newDate,
            newTime: input.newTime,
            newAdultCount: input.newAdultCount,
            newChildCount: input.newChildCount,
            newMealType: input.newMealType as any, // Type conversion

            // Initial financial settings
            additionalPaymentRequired: false,
            refundRequired: false,

            // Capacity tracking (initialize as null)
            seatsReleased: null,
            seatsReserved: null,
            capacityAdjustedAt: null,

            // Optional notes (include special requests modification info)
            notes: input.newSpecialRequests !== undefined 
                ? `Special requests update: "${input.newSpecialRequests || 'Removed'}"${input.notes ? `\nAdditional notes: ${input.notes}` : ''}`
                : input.notes
        }
    });

    // Create initial status history
    const statusHistory = await prisma.reservationModificationStatusHistory.create({
        data: {
            modificationId: modificationRequest.id,
            newStatus: ModificationStatus.PENDING,
            changeReason: 'Modification request created',
            statusChangedAt: new Date(),
            changedBy: input.requestedBy
        }
    });

    return {
        modificationRequest,
        statusHistoryId: statusHistory.id
    };
}

/**
 * Check capacity availability without updating the database
 */
async function checkCapacity(
    prisma: PrismaClient,
    modRequest: ReservationModificationRequest,
): Promise<{
    success: boolean;
    errorMessage?: string;
    seatsReleased?: number;
    seatsReserved?: number;
}> {
    console.log('Starting capacity check for modification request:', {
        action: 'checkCapacity',
        modificationId: modRequest.id,
        reservationId: modRequest.reservationId,
        modificationTypes: modRequest.modificationTypes
    });

    try {
        // Get the reservation to access all details
        const reservation = await prisma.reservation.findUnique({
            where: { id: modRequest.reservationId }
        });

        if (!reservation) {
            console.log('Reservation not found:', {
                action: 'checkCapacity',
                reservationId: modRequest.reservationId
            });
            return {
                success: false,
                errorMessage: `Reservation ${modRequest.reservationId} not found`
            };
        }

        console.log('Retrieved reservation details:', {
            action: 'checkCapacity',
            reservationId: reservation.id,
            restaurantId: reservation.restaurantId,
            currentDate: reservation.reservationDate,
            currentTime: reservation.reservationTime,
            currentPartySize: `${reservation.adultCount} adults, ${reservation.childCount} children`
        });

        // Check if date, party size, or meal type is changing
        const isDateChanged = modRequest.newDate !== null && modRequest.newDate !== undefined && (() => {
            // Extract just the date part by setting hours, minutes, seconds, and milliseconds to 0
            const newDateOnly = new Date(
                Date.UTC(
                    modRequest.newDate.getFullYear(),
                    modRequest.newDate.getMonth(), 
                    modRequest.newDate.getDate()
                )
            );
            
            const originalDateOnly = new Date(Date.UTC(
                reservation.reservationDate.getFullYear(),
                reservation.reservationDate.getMonth(),
                reservation.reservationDate.getDate()
            ));
            
            // Compare the timestamp of date portions only
            return newDateOnly.getTime() !== originalDateOnly.getTime();
        })();
        
        const isAdultCountChanged = modRequest.newAdultCount !== null && 
            modRequest.newAdultCount !== undefined && 
            modRequest.newAdultCount !== reservation.adultCount;
            
        const isChildCountChanged = modRequest.newChildCount !== null && 
            modRequest.newChildCount !== undefined && 
            modRequest.newChildCount !== reservation.childCount;
            
        const isPartyChanged = isAdultCountChanged || isChildCountChanged;
        
        const isMealTypeChanged = modRequest.newMealType !== null && 
            modRequest.newMealType !== undefined && 
            modRequest.newMealType !== reservation.mealType;

        // Log which specific changes are being made
        console.log('🔄 Capacity update - changes detected:', {
            action: 'checkCapacity',
            dateChange: isDateChanged ? "YES" : "NO",
            adultCountChange: isAdultCountChanged ? "YES" : "NO",
            childCountChange: isChildCountChanged ? "YES" : "NO",
            partyChange: isPartyChanged ? "YES" : "NO",
            mealTypeChange: isMealTypeChanged ? "YES" : "NO",
            newDate: modRequest.newDate,
            originalReservationDate: reservation.reservationDate,
            modRequestOriginalDate: modRequest.originalDate,
            newAdultCount: modRequest.newAdultCount,
            originalReservationAdultCount: reservation.adultCount,
            modRequestOriginalAdultCount: modRequest.originalAdultCount,
            newChildCount: modRequest.newChildCount,
            originalReservationChildCount: reservation.childCount,
            modRequestOriginalChildCount: modRequest.originalChildCount,
            newMealType: modRequest.newMealType,
            originalReservationMealType: reservation.mealType,
            modRequestOriginalMealType: modRequest.originalMealType
        });

        // If no changes to date, party size, or meal type, return success immediately
        // Time changes are not considered for capacity checks
        if (!isDateChanged && !isPartyChanged && !isMealTypeChanged) {
            // Still update the request with zero values to ensure consistent tracking
            await prisma.reservationModificationRequest.update({
                where: { id: modRequest.id },
                data: {
                    seatsReleased: 0,
                    seatsReserved: 0,
                    capacityAdjustedAt: new Date()
                }
            });
            return { success: true, seatsReleased: 0, seatsReserved: 0 };
        }

        // Get the original party size
        const originalPartySize = reservation.adultCount + reservation.childCount;

        // Get the new values
        const newDate = isDateChanged && modRequest.newDate ? modRequest.newDate : reservation.reservationDate;
        const newMealType = modRequest.newMealType ?? reservation.mealType;
        const newAdultCount = modRequest.newAdultCount ?? reservation.adultCount;
        const newChildCount = modRequest.newChildCount ?? reservation.childCount;
        const newPartySize = newAdultCount + newChildCount;

        let seatsReleased = 0; // Initialize with zero instead of undefined/null
        let seatsReserved = 0; // Initialize with zero instead of undefined/null

        // STEP 1: Release capacity from the original date/service if date or meal type changed
        if (isDateChanged || isMealTypeChanged) {
            // Find the original meal service
            const originalMealService = await prisma.restaurantMealService.findFirst({
                where: {
                    restaurantId: reservation.restaurantId,
                    mealType: reservation.mealType,
                    isAvailable: true
                }
            });

            if (originalMealService) {
                // Find capacity record for the original date/service
                const originalCapacityRecord = await prisma.restaurantCapacity.findFirst({
                    where: {
                        restaurantId: reservation.restaurantId,
                        serviceId: originalMealService.id,
                        date: reservation.reservationDate
                    }
                });

                if (originalCapacityRecord) {
                    // Log original capacity before update
                    console.log('Original capacity before update:', {
                        action: 'checkCapacity',
                        id: originalCapacityRecord.id,
                        date: reservation.reservationDate.toISOString().split('T')[0],
                        mealType: reservation.mealType,
                        totalSeats: originalCapacityRecord.totalSeats,
                        bookedSeats: originalCapacityRecord.bookedSeats,
                        availableSeats: originalCapacityRecord.totalSeats - originalCapacityRecord.bookedSeats
                    });

                    // Update capacity record to release seats
                    const updatedBookedSeats = Math.max(0, originalCapacityRecord.bookedSeats - originalPartySize);

                    await prisma.restaurantCapacity.update({
                        where: { id: originalCapacityRecord.id },
                        data: {
                            bookedSeats: updatedBookedSeats
                        }
                    });

                    seatsReleased = originalPartySize;

                    // Log original capacity after update
                        console.log('Original capacity after update:', {
                        action: 'checkCapacity',
                        id: originalCapacityRecord.id,
                        date: reservation.reservationDate.toISOString().split('T')[0],
                        mealType: reservation.mealType,
                        totalSeats: originalCapacityRecord.totalSeats,
                        bookedSeats: updatedBookedSeats,
                        availableSeats: originalCapacityRecord.totalSeats - updatedBookedSeats
                    });

                    console.log('Released seats from original date/service:', {
                        action: 'checkCapacity',
                        originalDate: reservation.reservationDate.toISOString().split('T')[0],
                        originalMealType: reservation.mealType,
                        originalPartySize,
                        previousBookedSeats: originalCapacityRecord.bookedSeats,
                        newBookedSeats: updatedBookedSeats
                    });
                } else {
                    console.log('No capacity record found for original date/service - no seats to release');
                }
            } else {
                console.log('Original meal service not found - no capacity to release');
            }
        }

        // STEP 2: Update capacity for new date/service
        // First find the new meal service
        const newMealService = await prisma.restaurantMealService.findFirst({
            where: {
                restaurantId: reservation.restaurantId,
                mealType: newMealType,
                isAvailable: true
            }
        });

        if (!newMealService) {
            return {
                success: false,
                errorMessage: `Meal service not found for ${newMealType}`
            };
        }

        // Find capacity record for the new date/service
        let newCapacityRecord = await prisma.restaurantCapacity.findFirst({
            where: {
                restaurantId: reservation.restaurantId,
                serviceId: newMealService.id,
                date: newDate,
                isEnabled: true
            }
        });

        // If no capacity record exists, create one
        if (!newCapacityRecord) {
            // Get restaurant to determine total seats
            const restaurant = await prisma.restaurant.findUnique({
                where: { id: reservation.restaurantId }
            });

            if (!restaurant) {
                return {
                    success: false,
                    errorMessage: 'Restaurant information not found'
                };
            }

            // Create new capacity record
            newCapacityRecord = await prisma.restaurantCapacity.create({
                data: {
                    restaurantId: reservation.restaurantId,
                    serviceId: newMealService.id,
                    date: newDate,
                    totalSeats: restaurant.capacity,
                    bookedSeats: 0
                }
            });

            console.log('Created new capacity record:', {
                action: 'updateCapacity',
                restaurantId: reservation.restaurantId,
                serviceId: newMealService.id,
                date: newDate.toISOString().split('T')[0],
                totalSeats: restaurant.capacity
            });
        }

        // Calculate how many new seats to book
        let seatsToBook = newPartySize;

        // If date/meal didn't change but party size did, we only need to book the difference
        if (!isDateChanged && !isMealTypeChanged && isPartyChanged) {
            const seatDifference = newPartySize - originalPartySize;
            // If reducing party size, release seats; if increasing, book more
            if (seatDifference <= 0) {
                // Releasing seats (negative number becomes positive release)
                seatsToBook = -seatDifference;
                seatsReleased += seatsToBook;

                // Update capacity record
                await prisma.restaurantCapacity.update({
                    where: { id: newCapacityRecord.id },
                    data: {
                        bookedSeats: Math.max(0, newCapacityRecord.bookedSeats - seatsToBook)
                    }
                });

                console.log('Released seats due to smaller party size:', {
                    action: 'updateCapacity',
                    date: newDate.toISOString().split('T')[0],
                    seatsReleased: seatsToBook,
                    originalPartySize,
                    newPartySize
                });

                // We're done - we've released seats, not booked any
                seatsToBook = 0;
            } else {
                // Booking more seats (only the difference)
                seatsToBook = seatDifference;
                
                // Log capacity before update
                console.log('Capacity before party size update:', {
                    action: 'updateCapacity',
                    id: newCapacityRecord.id,
                    date: newDate.toISOString().split('T')[0],
                    mealType: newMealType,
                    totalSeats: newCapacityRecord.totalSeats,
                    bookedSeats: newCapacityRecord.bookedSeats,
                    availableSeats: newCapacityRecord.totalSeats - newCapacityRecord.bookedSeats
                });
            }
        }

        // Book additional seats if needed
        if (seatsToBook > 0) {
            // Log new capacity before update
            console.log('New capacity before update:', {
                action: 'updateCapacity',
                id: newCapacityRecord.id,
                date: newDate.toISOString().split('T')[0],
                mealType: newMealType,
                totalSeats: newCapacityRecord.totalSeats,
                bookedSeats: newCapacityRecord.bookedSeats,
                availableSeats: newCapacityRecord.totalSeats - newCapacityRecord.bookedSeats
            });

            await prisma.restaurantCapacity.update({
                where: { id: newCapacityRecord.id },
                data: {
                    bookedSeats: newCapacityRecord.bookedSeats + seatsToBook
                }
            });

            seatsReserved = seatsToBook;

            // Log new capacity after update
            console.log('New capacity after update:', {
                action: 'updateCapacity',
                date: newDate.toISOString().split('T')[0],
                mealType: newMealType,
                totalSeats: newCapacityRecord.totalSeats,
                bookedSeats: newCapacityRecord.bookedSeats + seatsToBook,
                availableSeats: newCapacityRecord.totalSeats - (newCapacityRecord.bookedSeats + seatsToBook)
            });

            console.log('Booked new seats:', {
                action: 'updateCapacity',
                date: newDate.toISOString().split('T')[0],
                mealType: newMealType,
                seatsBooked: seatsToBook,
                newTotalBookedSeats: newCapacityRecord.bookedSeats + seatsToBook
            });
        }

        // Update the modification request with capacity info
        // Ensure we're always setting integer values, never null
        await prisma.reservationModificationRequest.update({
            where: { id: modRequest.id },
            data: {
                seatsReleased: seatsReleased,
                seatsReserved: seatsReserved,
                capacityAdjustedAt: new Date()
            }
        });

        return {
            success: true,
            seatsReleased,
            seatsReserved
        };
    } catch (error) {
            console.log('Error checking capacity:', {
            action: 'checkCapacity',
            modificationId: modRequest.id,
            reservationId: modRequest.reservationId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        return {
            success: false,
            errorMessage: error instanceof Error ? error.message : 'Unknown error checking capacity'
        };
    }
}

/**
 * Calculate price difference based on modification
 */
async function calculatePriceDifference(
    prisma: PrismaClient,
    modRequest: ReservationModificationRequest,
) {
    console.log('calculatePriceDifference', modRequest);
    // Get the original reservation to access all needed details
    const reservation = await prisma.reservation.findUnique({
        where: { id: modRequest.reservationId },
        include: {
            promoCode: true
        }
    });

    if (!reservation) {
        throw new Error('Reservation not found');
    }

    // Initialize prices with original values
    let originalAmount = modRequest.originalAmount;
    let newAmount = modRequest.originalAmount;
    const originalDiscountAmount = reservation.discountAmount || new Decimal(0);
    let newDiscountAmount = new Decimal(0);
    let netBuffetPrice = new Decimal(0);
    let grandTotal = new Decimal(0);

    // Initialize payment variables
    let newAdvancePaymentAmount = reservation.advancePaymentAmount || new Decimal(0);
    let newRemainingPaymentAmount = reservation.remainingPaymentAmount || new Decimal(0);
    let calculatedNewAdvancePayment = new Decimal(0);
    let promoCodeValidation = undefined;

    // Check if party size is changing
    const newAdultCount = modRequest.newAdultCount ?? reservation.adultCount;
    const newChildCount = modRequest.newChildCount ?? reservation.childCount;
    const isPartySizeChanged =
        modRequest.newAdultCount !== null ||
        modRequest.newChildCount !== null;

    // Check if meal type is changing
    const newMealType = modRequest.newMealType || reservation.mealType;
    const isMealTypeChanged = modRequest.newMealType !== null;

    // Recalculate price if needed
    if (isPartySizeChanged || isMealTypeChanged) {
        // Get meal service details for pricing
        const mealService = await prisma.restaurantMealService.findFirst({
            where: {
                restaurantId: reservation.restaurantId,
                mealType: newMealType,
                isAvailable: true
            },
            include: {
                platters: true
            }
        });

        if (!mealService) {
            throw new Error('Meal service not available for the requested type');
        }

        // Check if this is a platter-based service
        const defaultPlatter = mealService.platters.find(p => p.isDefault);
        const isPlatterService = defaultPlatter !== undefined;

        if (isPlatterService && defaultPlatter) {
            // For platter services, calculate based on platter pricing
            const paxPerPlatter = defaultPlatter.headCount;
            const platterCount = Math.ceil(newAdultCount / paxPerPlatter);
            
            // Calculate new base price using platter pricing
            netBuffetPrice = new Decimal(defaultPlatter.adultNetPrice).mul(platterCount);
            newAmount = netBuffetPrice;
            
            // Child count is not used for platter services
        } else {
            // Regular service pricing
        // Calculate new base price (adult price)
        const baseBuffetPrice = new Decimal(mealService.adultNetPrice).mul(newAdultCount);

        // Add child pricing if applicable and available
        let childPrice = new Decimal(0);
        if (newChildCount > 0 && mealService.childNetPrice) {
            childPrice = new Decimal(mealService.childNetPrice).mul(newChildCount);
        }

        // Calculate total base price
        netBuffetPrice = baseBuffetPrice.add(childPrice);
        newAmount = netBuffetPrice;
        }

        // Calculate increased pax (if any)
        const increasedPax = Math.max((newAdultCount + newChildCount) - (reservation.adultCount + reservation.childCount), 0);

        // If there's a promo code and either party size or meal type changed, validate it
        if (reservation.promoCode && (isPartySizeChanged || isMealTypeChanged)) {
            // For meal type changes without party size changes, use total party size
            // For party size changes, use the increased pax
            const partySizeForValidation = isPartySizeChanged ? increasedPax : (reservation.adultCount + reservation.childCount);

            const promoValidationResult = await validatePromoCode(prisma, {
                code: reservation.promoCode.code,
                restaurantId: reservation.restaurantId,
                mealType: newMealType,
                adultCount: newAdultCount,
                childrenCount: newChildCount,
                customerId: reservation.customerId,
                subTotal: Number(netBuffetPrice.toString())
            });

            promoCodeValidation = {
                isValid: promoValidationResult.success,
                errorMessage: !promoValidationResult.success && 'error' in promoValidationResult ? promoValidationResult.error : undefined,
                discountAmount: promoValidationResult.success ? new Decimal(promoValidationResult.discountAmount || 0) : undefined
            };

            if (promoValidationResult.success) {
                newDiscountAmount = new Decimal(promoValidationResult.discountAmount || 0);
            } else {
                newDiscountAmount = new Decimal(0);
            }
        }

        // Grand Total = Net Buffet Price - original discount - new discount
        grandTotal = netBuffetPrice.sub(originalDiscountAmount).sub(newDiscountAmount);
        if (grandTotal.lessThan(0)) grandTotal = new Decimal(0);
        newAmount = grandTotal;

        // Calculate advance payment and balance due
        const restaurant = await prisma.restaurant.findUnique({
            where: { id: reservation.restaurantId },
            select: { advancePaymentPercentage: true }
        });

        const advancePaymentPercentage = restaurant?.advancePaymentPercentage || 0;

        // Calculate theoretical new total advance payment based on percentage
        calculatedNewAdvancePayment = grandTotal.mul(advancePaymentPercentage).div(100);

        // Get original advance payment
        const originalAdvancePayment = reservation.advancePaymentAmount || new Decimal(0);

        // Compare with original advance payment to determine additional payment needed
        if (calculatedNewAdvancePayment.greaterThan(originalAdvancePayment)) {
            // Additional advance payment required (only the difference)
            newAdvancePaymentAmount = calculatedNewAdvancePayment.sub(originalAdvancePayment);
            // Total advance payment would be original + new difference
            const totalAdvancePayment = originalAdvancePayment.add(newAdvancePaymentAmount);
            // Remaining is total - total advance
            newRemainingPaymentAmount = grandTotal.sub(totalAdvancePayment);
        } else {
            // No additional advance payment required
            newAdvancePaymentAmount = new Decimal(0);
            // Remaining is new total - original advance
            newRemainingPaymentAmount = grandTotal.sub(originalAdvancePayment);

            // Make sure remaining payment is not negative
            if (newRemainingPaymentAmount.lessThan(0)) {
                newRemainingPaymentAmount = new Decimal(0);
            }
        }

            console.log('Payment calculations:', {
            originalAmount: originalAmount.toString(),
            newAmount: newAmount.toString(),
            originalAdvancePayment: originalAdvancePayment.toString(),
            calculatedNewAdvancePayment: calculatedNewAdvancePayment.toString(),
            additionalAdvancePaymentNeeded: newAdvancePaymentAmount.toString(),
            newRemainingPayment: newRemainingPaymentAmount.toString(),
            originalDiscountAmount: originalDiscountAmount.toString(),
            newDiscountAmount: newDiscountAmount.toString(),
            netBuffetPrice: netBuffetPrice.toString(),
            grandTotal: grandTotal.toString(),
            isPlatterService: isPlatterService || false,
            platterPaxCount: defaultPlatter?.headCount || 0
        });

        // Update modification request with new calculated amounts
        await prisma.reservationModificationRequest.update({
            where: { id: modRequest.id },
            data: {
                newAmount,
                newAdvancePaymentAmount,
                newRemainingPaymentAmount,
                newDiscountAmount,
                promoCodeReapplied: promoCodeValidation?.isValid || false,
                promoCodeAdjustmentNotes: promoCodeValidation?.isValid ? undefined : promoCodeValidation?.errorMessage
            }
        });
    }

    // Calculate the price difference
    const priceDifference = newAmount.sub(originalAmount);

    // Determine if additional payment or refund is needed
    const requiresAdditionalPayment = newAdvancePaymentAmount.gt(0.1);
    const requiresRefund = priceDifference.lt(0) && newAdvancePaymentAmount.eq(0);

    // Update the modification request with price difference
    await prisma.reservationModificationRequest.update({
        where: { id: modRequest.id },
        data: {
            priceDifference: priceDifference.abs(),
            additionalPaymentRequired: requiresAdditionalPayment,
            refundRequired: requiresRefund
        }
    });

    return {
        priceDifference,
        requiresAdditionalPayment,
        requiresRefund,
        originalAmount,
        newAmount,
        newAdvancePaymentAmount: isPartySizeChanged || isMealTypeChanged ? newAdvancePaymentAmount : undefined,
        newRemainingPaymentAmount: isPartySizeChanged || isMealTypeChanged ? newRemainingPaymentAmount : undefined,
        originalDiscountAmount,
        newDiscountAmount,
        netBuffetPrice,
        grandTotal
    };
}

/**
 * Update modification request with pricing information
 */
async function updateRequestWithPricing(
    prisma: PrismaClient,
    modRequest: {
        modificationRequest: ReservationModificationRequest;
        statusHistoryId: number;
    },
    pricingResult: {
        priceDifference: Decimal,
        requiresAdditionalPayment: boolean,
        requiresRefund: boolean,
        originalAmount: Decimal,
        newAmount: Decimal,
        newAdvancePaymentAmount?: Decimal,
        newRemainingPaymentAmount?: Decimal,
        newDiscountAmount?: Decimal,
        promoCodeReapplied?: boolean
    },
): Promise<ReservationModificationRequest> {
    const action = 'updateRequestWithPricing';
    const requestId = `mod_${modRequest.modificationRequest.id}`;

    // Format the price difference to ensure it has 2 decimal places
    const formattedPriceDifference = new Decimal(
        pricingResult.priceDifference.toFixed(2)
    );

    // Get the current modification request to access original values
    const currentRequest = await prisma.reservationModificationRequest.findUnique({
        where: { id: modRequest.modificationRequest.id }
    });

    if (!currentRequest) {
        throw new Error(`Modification request ${modRequest.modificationRequest.id} not found`);
    }

    // Prepare update data
    const updateData: any = {
        priceDifference: formattedPriceDifference,
        additionalPaymentRequired: pricingResult.requiresAdditionalPayment,
        refundRequired: pricingResult.requiresRefund,
        status: pricingResult.requiresAdditionalPayment
            ? ModificationStatus.PROCESSING
            : ModificationStatus.PENDING
    };

    // Add new payment amounts if provided
    if (pricingResult.newAdvancePaymentAmount) {
        updateData.newAdvancePaymentAmount = pricingResult.newAdvancePaymentAmount;
    }

    if (pricingResult.newRemainingPaymentAmount) {
        updateData.newRemainingPaymentAmount = pricingResult.newRemainingPaymentAmount;
    }

    if (pricingResult.newDiscountAmount && pricingResult.promoCodeReapplied === true) {
        // Add the new discount amount to the existing discount amount
        const existingDiscountAmount = currentRequest.originalDiscountAmount || new Decimal(0);
        updateData.newDiscountAmount = existingDiscountAmount.add(pricingResult.newDiscountAmount);
    }

    // Update the modification request with price difference and payment flags
    const updatedRequest = await prisma.reservationModificationRequest.update({
        where: { id: modRequest.modificationRequest.id },
        data: updateData
    });

    // // Update the modification history with pricing details
    // await prisma.reservationModificationHistory.update({
    //     where: { id: modRequest.statusHistoryId },
    //     data: {
    //         reservationId: updatedRequest.reservationId,
    //         modificationId: modRequest.modificationRequest.id,
    //         newAmount: updatedRequest.newAmount || new Decimal(0),
    //         newServiceCharge: updatedRequest.newServiceCharge || new Decimal(0),
    //         newTaxAmount: updatedRequest.newTaxAmount || new Decimal(0),
    //         newDiscountAmount: updatedRequest.newDiscountAmount || new Decimal(0),
    //         newAdvancePaymentAmount: updatedRequest.newAdvancePaymentAmount || new Decimal(0),
    //         newRemainingPaymentAmount: updatedRequest.newRemainingPaymentAmount || new Decimal(0),
    //         modifiedAt: new Date(),
    //         modifiedBy: 'CUSTOMER'
    //     }
    // });

    console.log(`[${action}] Updated modification request and history with pricing`, {
        action,
        requestId,
        id: updatedRequest.id,
        statusHistoryId: modRequest.statusHistoryId,
        priceDifference: updatedRequest.priceDifference?.toString(),
        requiresAdditionalPayment: updatedRequest.additionalPaymentRequired,
        requiresRefund: updatedRequest.refundRequired,
        newAdvancePaymentAmount: updatedRequest.newAdvancePaymentAmount?.toString(),
        newRemainingPaymentAmount: updatedRequest.newRemainingPaymentAmount?.toString(),
        status: updatedRequest.status
    });

    return updatedRequest;
}

/**
 * Process a refund for price decrease
 */
async function processRefund(
    prisma: PrismaClient,
    modRequest: ReservationModificationRequest,
    refundAmount: Decimal,
) {
    // TODO: Implement refund processing
    // 1. Create refund transaction record
    // 2. Call payment processor API for refund
    // 3. Update refund status
    return { success: true };
}

/**
 * Apply modification changes to the reservation
 * This function updates the reservation with the new details from the modification request
 */
async function applyModificationToReservation(
    prisma: PrismaClient,
    modRequest: ReservationModificationRequest,
): Promise<Reservation> {
    try {
        // 1. Get the current reservation
        const reservation = await prisma.reservation.findUnique({
            where: { id: modRequest.reservationId }
        });

        if (!reservation) {
            throw new Error(`Reservation ${modRequest.reservationId} not found`);
        }

        // 2. Prepare update data based on modification types
        const updateData: any = {
            lastModificationId: modRequest.id,
            updatedAt: new Date()
        };

        // Add fields that were modified
        if (modRequest.modificationTypes.includes(ModificationType.DATE_TIME)) {
            if (modRequest.newDate) {
                updateData.reservationDate = modRequest.newDate;
            }
            if (modRequest.newTime) {
                updateData.reservationTime = modRequest.newTime;
            }
        }

        if (modRequest.modificationTypes.includes(ModificationType.PARTY_SIZE)) {
            if (modRequest.newAdultCount !== null && modRequest.newAdultCount !== undefined) {
                updateData.adultCount = modRequest.newAdultCount;
            }
            if (modRequest.newChildCount !== null && modRequest.newChildCount !== undefined) {
                updateData.childCount = modRequest.newChildCount;
            }
        }

        if (modRequest.modificationTypes.includes(ModificationType.MEAL_TYPE)) {
            if (modRequest.newMealType) {
                updateData.mealType = modRequest.newMealType;
            }
        }

        // Update financial details if they've changed
        if (modRequest.newAmount) {
            updateData.totalAmount = modRequest.newAmount;
        }
        if (modRequest.newServiceCharge !== null && modRequest.newServiceCharge !== undefined) {
            updateData.serviceCharge = modRequest.newServiceCharge;
        }
        if (modRequest.newTaxAmount !== null && modRequest.newTaxAmount !== undefined) {
            updateData.taxAmount = modRequest.newTaxAmount;
        }
        if (modRequest.newDiscountAmount !== null && modRequest.newDiscountAmount !== undefined) {
            updateData.discountAmount = modRequest.newDiscountAmount;
        }

        // Update payment fields if they've changed
        if (modRequest.newAdvancePaymentAmount !== null && modRequest.newAdvancePaymentAmount !== undefined) {
            // The original advance payment amount plus any additional needed
            const originalAdvancePayment = reservation.advancePaymentAmount || new Decimal(0);

            if (modRequest.newAdvancePaymentAmount.greaterThan(0)) {
                // If new advance payment is required, add it to the original
                updateData.advancePaymentAmount = originalAdvancePayment.add(modRequest.newAdvancePaymentAmount);
            } else {
                // Otherwise, keep the original advance payment
                updateData.advancePaymentAmount = originalAdvancePayment;
            }
        }

        if (modRequest.newRemainingPaymentAmount !== null && modRequest.newRemainingPaymentAmount !== undefined) {
            updateData.remainingPaymentAmount = modRequest.newRemainingPaymentAmount;
        }

        // Update special requests if they were modified
        // We check the notes field to see if it contains special requests update information
        if (modRequest.notes && modRequest.notes.includes('Special requests update:')) {
            // Extract the new special requests value from the notes
            const match = modRequest.notes.match(/Special requests update: "(.*?)"/);
            if (match) {
                const newSpecialRequests = match[1] === 'Removed' ? null : match[1];
                updateData.specialRequests = newSpecialRequests;
                
                console.log('Updating special requests:', {
                    reservationId: reservation.id,
                    oldSpecialRequests: reservation.specialRequests,
                    newSpecialRequests: newSpecialRequests
                });
            }
        }

        // 3. Update the reservation
        console.log('Updating reservation with modification data:', {
            action: 'applyModificationToReservation',
            reservationId: reservation.id,
            modificationId: modRequest.id,
            updateData
        });

        const updatedReservation = await prisma.reservation.update({
            where: { id: reservation.id },
            data: updateData
        });

        return updatedReservation;
    } catch (error) {
        console.log('Failed to apply modification to reservation:', {
            action: 'applyModificationToReservation',
            modificationId: modRequest.id,
            reservationId: modRequest.reservationId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        throw new Error(`Failed to apply modification to reservation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Record modification history details
 * This creates a detailed log of what was changed in the reservation
 */
async function recordModificationHistory(
    prisma: PrismaClient,
    modRequest: ReservationModificationRequest,
    updatedReservation: Reservation,
): Promise<void> {
    try {
        // Get the actual differential amount paid
        const originalAdvancePaymentAmount = modRequest.originalAdvancePaymentAmount || new Decimal(0);
        const newAdvancePaymentAmount = updatedReservation.advancePaymentAmount || new Decimal(0);

        // Get the discount amounts
        const originalDiscountAmount = modRequest.originalDiscountAmount || new Decimal(0);
        const newDiscountAmount = updatedReservation.discountAmount || new Decimal(0);

        // Calculate the total discount (previous + new)
        const totalDiscountAmount = originalDiscountAmount.add(newDiscountAmount);

        console.log('Recording modification payment history:', {
            action: 'recordModificationHistory',
            originalAdvance: originalAdvancePaymentAmount.toString(),
            newTotalAdvance: newAdvancePaymentAmount.toString(),
            additionalAdvancePaid: newAdvancePaymentAmount.sub(originalAdvancePaymentAmount).toString(),
            originalRemaining: modRequest.originalRemainingPaymentAmount?.toString() || '0',
            newRemaining: updatedReservation.remainingPaymentAmount?.toString() || '0',
            originalDiscount: originalDiscountAmount.toString(),
            newDiscount: newDiscountAmount.toString(),
            totalDiscount: totalDiscountAmount.toString()
        });

        // Create a history record with before/after values
        await prisma.reservationModificationHistory.create({
            data: {
                modificationId: modRequest.id,
                reservationId: modRequest.reservationId,

                // Original values
                previousDate: modRequest.originalDate,
                previousTime: modRequest.originalTime,
                previousAdultCount: modRequest.originalAdultCount,
                previousChildCount: modRequest.originalChildCount,
                previousMealType: modRequest.originalMealType,
                previousAmount: modRequest.originalAmount,
                previousTaxAmount: modRequest.originalTaxAmount,
                previousServiceCharge: modRequest.originalServiceCharge,
                previousAdvancePaymentAmount: modRequest.originalAdvancePaymentAmount,
                previousRemainingPaymentAmount: modRequest.originalRemainingPaymentAmount,
                previousDiscountAmount: originalDiscountAmount,

                // New values (after application)
                newDate: updatedReservation.reservationDate,
                newTime: updatedReservation.reservationTime,
                newAdultCount: updatedReservation.adultCount,
                newChildCount: updatedReservation.childCount,
                newMealType: updatedReservation.mealType,
                newServiceCharge: updatedReservation.serviceCharge,
                newTaxAmount: updatedReservation.taxAmount,
                newAmount: updatedReservation.totalAmount,
                newAdvancePaymentAmount: updatedReservation.advancePaymentAmount,
                newRemainingPaymentAmount: updatedReservation.remainingPaymentAmount,
                newDiscountAmount: totalDiscountAmount, // Use the total discount amount

                // Metadata
                modifiedBy: modRequest.requestedBy,
                modifiedAt: new Date(),
                // notes: modRequest.notes || ''
            }
        });

        console.log('Recorded modification history', {
            action: 'recordModificationHistory',
            modificationId: modRequest.id,
            reservationId: modRequest.reservationId,
            originalDiscount: originalDiscountAmount.toString(),
            newDiscount: newDiscountAmount.toString(),
            totalDiscount: totalDiscountAmount.toString()
        });
    } catch (error) {
        console.log('Failed to record modification history:', {
            action: 'recordModificationHistory',
            modificationId: modRequest.id,
            reservationId: modRequest.reservationId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        // We don't want to throw an error here as this is a non-critical operation
        // The modification itself was successful even if the history record fails
    }
}

/**
 * Update the status of a modification request and record status history
 */
async function updateModificationStatus(
    prisma: PrismaClient,
    modificationId: number,
    previousStatus: ModificationStatus,
    newStatus: ModificationStatus,
    reason: string,
): Promise<void> {
    // Update the request status
    await prisma.reservationModificationRequest.update({
        where: { id: modificationId },
        data: {
            status: newStatus,
            processedAt: newStatus === ModificationStatus.COMPLETED ||
                        newStatus === ModificationStatus.REJECTED ?
                        new Date() : undefined
        }
    });

    // Create status history record
    await prisma.reservationModificationStatusHistory.create({
        data: {
            modificationId,
            previousStatus,
            newStatus,
            changeReason: reason,
            statusChangedAt: new Date(),
            changedBy: 'SYSTEM' // This could be parameterized to accept the actual user
        }
    });

    console.log('Updated modification status:', {
        action: 'updateModificationStatus',
        modificationId,
        from: previousStatus,
        to: newStatus,
        reason
    });
}

/**
 * Process payment for modification
 */
export async function processModificationPayment(
    prisma: PrismaClient,
    modificationId: number,
    paymentData: {
        amount: Decimal;
        paymentChannel: string;
        transactionReference: string;
    },
): Promise<{ success: boolean; paymentId?: number; errorMessage?: string }> {
    // TODO: Implement payment processing
    // 1. Create payment record
    // 2. Update modification status
    // 3. Continue with modification if payment successful
    return { success: true };
}

/**
 * Cancel a pending modification request
 */
export async function cancelModificationRequest(
    prisma: PrismaClient,
    modificationId: number,
    cancelledBy: string,
    reason: string,
): Promise<{ success: boolean; errorMessage?: string }> {
    // TODO: Implement cancellation
    // 1. Check if cancellable (PENDING, PROCESSING, PAYMENT_PENDING)
    // 2. Update status to CANCELLED
    // 3. Release any held capacity
    return { success: true };
}

/**
 * Initialize payment for a modification request that requires additional payment
 */
async function initializeModificationPayment(
    prisma: PrismaClient,
    modificationId: number,
    amount: Decimal,
): Promise<{
    success: boolean;
    paymentId?: number;
    redirectUrl?: string;
    statusUrl?: string;
    errorMessage?: string;
}> {
    // Define type for payment record
    let paymentRecord: { id: number } | undefined;

    try {
        // 1. Get the modification request to validate it's in the correct state
        const modRequest = await prisma.reservationModificationRequest.findUnique({
            where: { id: modificationId },
            include: {
                reservation: true
            }
        }).catch(error => {
            console.log('Database error fetching modification request:', {
                action: 'initializeModificationPayment',
                modificationId,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw new Error('Failed to retrieve modification request');
        });

        if (!modRequest) {
            return {
                success: false,
                errorMessage: 'Modification request not found'
            };
        }

        if (modRequest.status !== ModificationStatus.PAYMENT_PENDING) {
            return {
                success: false,
                errorMessage: `Cannot initialize payment for modification in ${modRequest.status} status`
            };
        }

        // 2. Configure payment parameters
        const currencyExponent = Number(process.env.GUEST_WEB_PAYMENT_CURRENCY_EXPONENT || '2');
        const currencyCode = process.env.GUEST_WEB_PAYMENT_CURRENCY_CODE || 'USD';
        const ipgProvider = process.env.GUEST_WEB_PAYMENT_IPG_PROVIDER || 'HNB';
        const redirectBaseUrl = process.env.GUEST_WEB_PAYMENT_REDIRECT_BASE_URL || 'http://localhost:3000/';
        const paymentProvider = process.env.GUEST_WEB_PAYMENT_PROVIDER || 'IPG';
        const paymentChannel = process.env.GUEST_WEB_PAYMENT_CHANNEL || 'CREDIT_CARD';

        // 3. Adjust amount format for payment gateway
        try {
            // Use toFixed for string conversion and validate as a number
            const adjustedAmount = amount.mul(Math.pow(10, currencyExponent)).toFixed(0);
            if (isNaN(Number(adjustedAmount))) {
                throw new Error('Invalid amount calculation');
            }

            // 4. Create unique merchant transaction ID
            const merchantTxId = `MOD_${modificationId}_${Date.now()}`;

            // 5. Create payment record in the database
            try {
                paymentRecord = await prisma.reservationPayment.create({
                    data: {
                        reservationId: modRequest.reservationId,
                        modificationId: modificationId,
                        amount: amount,
                        paymentType: "MODIFICATION",
                        paymentDate: new Date(),
                        paymentStatus: PaymentStatus.INITIATED,
                        paymentChannel: PaymentChannel.CREDIT_CARD,
                        transactionReference: merchantTxId,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        processedBy: 'User'
                    }
                });

                // 6. Initialize payment with real payment gateway
                // Construct redirect URL
                // If redirectBaseUrl contains PLACEHOLDER, replace it with modificationId (mobile app pattern)
                // Otherwise, append the path (guest-web pattern)
                const redirectUrl = redirectBaseUrl.includes('PLACEHOLDER')
                    ? redirectBaseUrl.replace('PLACEHOLDER', modificationId.toString())
                    : `${redirectBaseUrl}/payment/modification/processing/${modificationId}`;

                const paymentRequest = {
                    'merchant-id': paymentConfig.merchantId,
                    'amount': Math.round(Number(adjustedAmount)),
                    'ipg-provider': ipgProvider,
                    'currency-exponent': currencyExponent,
                    'currency-code': currencyCode,
                    'merchant-tx-id': merchantTxId,
                    'tx-originated-date-time': new Date().toISOString().replace('T', ' ').replace('Z', ' IST'),
                    'redirect-url': redirectUrl
                };

                try {
                    const paymentGatewayResponse = await paymentClient.initializePayment(paymentRequest);

                    if (!paymentGatewayResponse.success || !paymentGatewayResponse.data) {
                        // Update payment record to failed
                        await updatePaymentStatusToFailed(prisma, paymentRecord.id,
                            paymentGatewayResponse.error || 'Payment gateway initialization failed',);

                        return {
                            success: false,
                            errorMessage: paymentGatewayResponse.error || 'Payment gateway initialization failed'
                        };
                    }

                    // 7. Update payment record with transaction info from gateway
                    try {
                        await prisma.reservationPayment.update({
                            where: { id: paymentRecord.id },
                            data: {
                                transactionReference: paymentGatewayResponse.data['transaction-id'],
                                //TODO: status-url need to update in ReservationModificationPaymment(new table) Table
                                paymentNotes: paymentGatewayResponse.data['status-url'],
                                updatedAt: new Date()
                            }
                        });

                        // 8. Log the successful payment initialization
                        console.log('Modification payment initialized', {
                            action: 'initializeModificationPayment',
                            modificationId,
                            paymentId: paymentRecord.id,
                            transactionId: paymentGatewayResponse.data['transaction-id']
                        });

                        return {
                            success: true,
                            paymentId: paymentRecord.id,
                            redirectUrl: paymentGatewayResponse.data['redirect-url'],
                            statusUrl: paymentGatewayResponse.data['status-url']
                        };
                    } catch (dbUpdateError) {
                        console.log('Failed to update payment record with transaction details', {
                            action: 'initializeModificationPayment',
                            paymentId: paymentRecord.id,
                            error: dbUpdateError
                        });

                        // Even if we fail to update the record, the payment was initialized
                        // so we can still return success with the redirect URL
                        return {
                            success: true,
                            paymentId: paymentRecord.id,
                            redirectUrl: paymentGatewayResponse.data['redirect-url'],
                            statusUrl: paymentGatewayResponse.data['status-url'],
                            errorMessage: 'Warning: Payment record update incomplete'
                        };
                    }
                } catch (gatewayError) {
                    console.log('Payment gateway error:', {
                        action: 'initializeModificationPayment',
                        modificationId,
                        error: gatewayError instanceof Error ? gatewayError.message : 'Unknown gateway error'
                    });

                    await updatePaymentStatusToFailed(prisma, paymentRecord.id,
                        'Payment gateway error: ' + (gatewayError instanceof Error ? gatewayError.message : 'Unknown error'));

                    return {
                        success: false,
                        errorMessage: 'Failed to communicate with payment gateway'
                    };
                }
            } catch (dbError) {
                console.log('Database error creating payment record:', {
                    action: 'initializeModificationPayment',
                    modificationId,
                    error: dbError instanceof Error ? dbError.message : 'Unknown database error'
                });

                return {
                    success: false,
                    errorMessage: 'Failed to create payment record'
                };
            }
        } catch (calculationError) {
            console.log('Amount calculation error:', {
                action: 'initializeModificationPayment',
                modificationId,
                amount: amount.toString(),
                error: calculationError instanceof Error ? calculationError.message : 'Unknown calculation error'
            });

            return {
                success: false,
                errorMessage: 'Invalid payment amount'
            };
        }
    } catch (error) {
        console.log('Failed to initialize modification payment', {
            action: 'initializeModificationPayment',
            modificationId,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });

        // If we created a payment record but encountered an error later, update it to failed
        if (paymentRecord?.id) {
            await updatePaymentStatusToFailed(prisma, paymentRecord.id,
                'Unexpected error: ' + (error instanceof Error ? error.message : 'Unknown error'),
                )
                .catch(e => console.log('Failed to update payment status to failed:', e));
        }

        return {
            success: false,
            errorMessage: 'Failed to initialize payment: ' + (error instanceof Error ? error.message : 'Unknown error')
        };
    }
}

/**
 * Helper function to update payment status to failed
 */
async function updatePaymentStatusToFailed(
    prisma: PrismaClient,
    paymentId: number,
    reason: string,
): Promise<void> {
    try {
        await prisma.reservationPayment.update({
            where: { id: paymentId },
            data: {
                paymentStatus: PaymentStatus.FAILED,
                paymentNotes: reason,
                updatedAt: new Date()
            }
        });
    } catch (error) {
        console.log('Failed to update payment status to failed:', {
            paymentId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        // We don't rethrow since this is a helper function
    }
}

/**
 * Process modification and initialize payment if needed
 */
async function processModificationWithPayment(
    prisma: PrismaClient,
    input: ReservationModificationInput,
): Promise<{
    success: boolean;
    modificationId?: number;
    status?: ModificationStatus;
    errorMessage?: string;
    paymentRequired?: boolean;
    paymentId?: number;
    redirectUrl?: string;
    paymentStatusUrl?: string;
}> {
    try {
        console.log('processModificationWithPayment', input);
        // 1. Process the modification request
        const modificationResult = await processReservationModification(prisma, input);

        // 2. If modification processing failed, return the error
        if (!modificationResult.success) {
            return {
                success: false,
                modificationId: modificationResult.modificationId,
                status: modificationResult.status,
                errorMessage: modificationResult.errorMessage
            };
        }

        // 3. If additional payment is required, initialize payment
        if (modificationResult.requiresPayment && modificationResult.paymentAmount && modificationResult.modificationId) {
            const paymentResult = await initializeModificationPayment(prisma, modificationResult.modificationId, modificationResult.paymentAmount);

            if (!paymentResult.success) {
                return {
                    success: false,
                    modificationId: modificationResult.modificationId,
                    status: ModificationStatus.PAYMENT_PENDING,
                    errorMessage: paymentResult.errorMessage || 'Payment initialization failed',
                    paymentRequired: true
                };
            }

            return {
                success: true,
                modificationId: modificationResult.modificationId,
                status: ModificationStatus.PAYMENT_PENDING,
                paymentRequired: true,
                paymentId: paymentResult.paymentId,
                redirectUrl: paymentResult.redirectUrl,
                paymentStatusUrl: paymentResult.statusUrl,
            };
        }

        // 4. If no payment required, return the modification result
        return {
            success: true,
            modificationId: modificationResult.modificationId,
            status: modificationResult.status,
            paymentRequired: false
        };
    } catch (error) {
        console.log('Error in modification payment flow:', {
            action: 'processModificationWithPayment',
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        });
        return {
            success: false,
            errorMessage: error instanceof Error ? error.message : 'Unknown error occurred'
        };
    }
}

/**
 * Completes the modification process after payment has been made
 */
async function completeModificationAfterPayment(
    prisma: PrismaClient,
    modificationId: number,
): Promise<{
    success: boolean;
    modificationId: number;
    status: ModificationStatus;
    errorMessage?: string;
    reservation?: Reservation;
    additionalDetails?: {
        businessName?: string;
        restaurantName?: string;
        customerEmail?: string;
        merchantEmail?: string;
        merchantContactNumber?: string;
    }
}> {
    try {
        // 1. Get the modification request
        const modRequest = await prisma.reservationModificationRequest.findUnique({
            where: { id: modificationId },
            include: { 
                reservation: {
                    include: {
                        promoCodeUsage: true
                    }
                }
            }
        });

        if (!modRequest) {
            return {
                success: false,
                modificationId,
                status: ModificationStatus.PROCESSING,
                errorMessage: 'Modification request not found'
            };
        }

        // 2. Verify the modification is in the correct state
        if (modRequest.status !== ModificationStatus.PAYMENT_PENDING) {
            return {
                success: false,
                modificationId,
                status: modRequest.status,
                errorMessage: `Modification is not in payment pending status (current: ${modRequest.status})`
            };
        }

        // 3. Update status to PROCESSING
        await updateModificationStatus(
            prisma,
            modificationId,
            ModificationStatus.PAYMENT_PENDING,
            ModificationStatus.PROCESSING,
            'Payment completed, processing modification',
        );

        // 4. Update capacity records
        console.log('Updating capacity records after payment');
        const capacityUpdateResult = await updateCapacity(prisma, modRequest);
        if (!capacityUpdateResult.success) {
            console.log('Failed to update capacity after payment:', {
                action: 'completeModificationAfterPayment',
                error: capacityUpdateResult.errorMessage
            });
            await updateModificationStatus(
                prisma,
                modificationId,
                ModificationStatus.PROCESSING,
                ModificationStatus.REJECTED,
                `Failed to update capacity: ${capacityUpdateResult.errorMessage}`,
            );

            return {
                success: false,
                modificationId,
                status: ModificationStatus.REJECTED,
                errorMessage: capacityUpdateResult.errorMessage || 'Failed to update capacity records'
            };
        }
        console.log('Capacity updated successfully after payment');

        // 5. Apply the modification to the reservation
                const updatedReservation = await applyModificationToReservation(prisma, modRequest);

        // 6. Record modification history
        await recordModificationHistory(prisma, modRequest, updatedReservation);

        // 7. Update PromoCodeUsage if a promo code was applied
        if (modRequest.originalPromoCodeId && modRequest.reservation.promoCodeUsage.length > 0) {
            const promoCodeUsage = modRequest.reservation.promoCodeUsage[0];
            
            if (promoCodeUsage) {
                // Update the PromoCodeUsage record with new values, summing the new discount with the existing one
                const existingPromoCodeUsage = await prisma.promoCodeUsage.findUnique({
                    where: { id: promoCodeUsage.id }
                });
                const existingDiscount = existingPromoCodeUsage?.discountAmount || new Decimal(0);
                const newDiscount = updatedReservation.discountAmount || new Decimal(0);
                const totalDiscount = existingDiscount.add(newDiscount);

                // Update PromoCodeUsage
                await prisma.promoCodeUsage.update({
                    where: { id: promoCodeUsage.id },
                    data: {
                        originalAmount: updatedReservation.totalAmount,
                        discountAmount: totalDiscount,
                        partySize: updatedReservation.adultCount + updatedReservation.childCount,
                        updatedAt: new Date()
                    }
                });

                // Update Reservation with the total discount amount
                await prisma.reservation.update({
                    where: { id: updatedReservation.id },
                    data: {
                        discountAmount: totalDiscount
                    }
                });

                console.log('Updated PromoCodeUsage and Reservation records:', {
                    action: 'completeModificationAfterPayment',
                    usageId: promoCodeUsage.id,
                    reservationId: updatedReservation.id,
                    newOriginalAmount: updatedReservation.totalAmount.toString(),
                    newDiscountAmount: totalDiscount.toString(),
                    newPartySize: updatedReservation.adultCount + updatedReservation.childCount
                });
            }
        }

        // 8. Complete the modification
        await updateModificationStatus(
            prisma,
            modificationId,
            ModificationStatus.PROCESSING,
            ModificationStatus.COMPLETED,
            'Modification completed successfully',
        );

        // 9. Get the business and restaurant details
        const restaurant = await prisma.restaurant.findUnique({
            where: { id: modRequest.reservation.restaurantId }
        });
        const business = await prisma.business.findUnique({
            where: { id: restaurant?.businessId }
        });

        // 10. Get the customer details
        const customer = await prisma.customer.findUnique({
            where: { id: modRequest.reservation.customerId }
        });

        return {
            success: true,
            modificationId,
            status: ModificationStatus.COMPLETED,
            reservation: updatedReservation,
            additionalDetails: {
                businessName: business?.name,
                restaurantName: restaurant?.name,
                customerEmail: customer?.email ?? undefined,
                merchantEmail: business?.email,
                merchantContactNumber: business?.phone
            }
        };
    } catch (error) {
        console.log('Error completing modification after payment:', {
            action: 'completeModificationAfterPayment',
            modificationId,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });

        // Update status to ERROR if possible
        try {
            await updateModificationStatus(
                prisma,
                modificationId,
                ModificationStatus.PROCESSING,
                ModificationStatus.REJECTED,
                `Error during modification completion: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
        } catch (statusError) {
            console.log('Failed to update modification status to ERROR:', {
                action: 'completeModificationAfterPayment',
                error: statusError
            });
        }

        return {
            success: false,
            modificationId,
            status: ModificationStatus.REJECTED,
            errorMessage: error instanceof Error ? error.message : 'Unknown error during modification completion'
        };
    }
}

/**
 * Verifies payment status and completes the modification if successful
 */
async function verifyPaymentAndCompleteModification(
    prisma: PrismaClient,
    modificationId: number,
    paymentStatusData: {
        success: boolean;
        transactionId: string;
        statusCode: string;
        statusDescription: string;
        amount: string;
    },
): Promise<{
    success: boolean;
    modificationId: number;
    status: ModificationStatus;
    paymentVerified: boolean;
    errorMessage?: string;
    reservation?: Reservation;
}> {
    try {
        // 1. Get the modification request and associated payment
        const modRequest = await prisma.reservationModificationRequest.findUnique({
            where: { id: modificationId },
            include: {
                reservation: true,
                payments: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            }
        });

        if (!modRequest) {
            return {
                success: false,
                modificationId,
                status: ModificationStatus.PROCESSING,
                paymentVerified: false,
                errorMessage: 'Modification request not found'
            };
        }

        // 2. Verify the modification is in the correct state
        if (modRequest.status !== ModificationStatus.PAYMENT_PENDING) {
            return {
                success: false,
                modificationId,
                status: modRequest.status,
                paymentVerified: false,
                errorMessage: `Modification is not in payment pending status (current: ${modRequest.status})`
            };
        }

        const payment = modRequest.payments[0];
        if (!payment) {
            return {
                success: false,
                modificationId,
                status: modRequest.status,
                paymentVerified: false,
                errorMessage: 'No payment record found for this modification'
            };
        }

        // 3. Update payment record with status from payment gateway
        await prisma.reservationPayment.update({
            where: { id: payment.id },
            data: {
                paymentStatus: paymentStatusData.success ? PaymentStatus.COMPLETED : PaymentStatus.FAILED,
                transactionReference: paymentStatusData.transactionId,
                paymentNotes: `${paymentStatusData.statusCode}: ${paymentStatusData.statusDescription}`,
                updatedAt: new Date()
            }
        });

        // 4. If payment failed, update modification status and return
        if (!paymentStatusData.success) {
            await updateModificationStatus(
                prisma,
                modificationId,
                ModificationStatus.PAYMENT_PENDING,
                ModificationStatus.PAYMENT_FAILED,
                `Payment failed: ${paymentStatusData.statusDescription}`,
            );

            return {
                success: false,
                modificationId,
                status: ModificationStatus.PAYMENT_FAILED,
                paymentVerified: true,
                errorMessage: `Payment failed: ${paymentStatusData.statusDescription}`
            };
        }

        // 5. Complete the modification process
            const completionResult = await completeModificationAfterPayment(prisma, modificationId);

        return {
            ...completionResult,
            paymentVerified: true
        };
    } catch (error) {
            console.log('Error verifying payment and completing modification:', {
            action: 'verifyPaymentAndCompleteModification',
            modificationId,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });

        return {
            success: false,
            modificationId,
            status: ModificationStatus.REJECTED,
            paymentVerified: false,
            errorMessage: error instanceof Error ? error.message : 'Unknown error processing payment verification'
        };
    }
}

/**
 * Update capacity records for both old and new reservation dates
 * This function actually modifies the capacity records in the database
 */
async function updateCapacity(
    prisma: PrismaClient,
    modRequest: ReservationModificationRequest,
): Promise<{
    success: boolean;
    errorMessage?: string;
    seatsReleased?: number;
    seatsReserved?: number;
}> {
    console.log('Starting capacity update for modification request:', {
        action: 'updateCapacity',
        modificationId: modRequest.id,
        reservationId: modRequest.reservationId
    });

    try {
        // Get the reservation to access all details
        const reservation = await prisma.reservation.findUnique({
            where: { id: modRequest.reservationId }
        });

        if (!reservation) {
            return {
                success: false,
                errorMessage: `Reservation ${modRequest.reservationId} not found`
            };
        }

        // Check if date, party size, or meal type is changing
        const isDateChanged = modRequest.newDate !== null && modRequest.newDate !== undefined && (() => {
            // Extract just the date part by setting hours, minutes, seconds, and milliseconds to 0
            const newDateOnly = new Date(
                Date.UTC(
                    modRequest.newDate.getFullYear(),
                    modRequest.newDate.getMonth(), 
                    modRequest.newDate.getDate()
                )
            );
            
            const originalDateOnly = new Date(Date.UTC(
                reservation.reservationDate.getFullYear(),
                reservation.reservationDate.getMonth(),
                reservation.reservationDate.getDate()
            ));
            
            // Compare the timestamp of date portions only
            return newDateOnly.getTime() !== originalDateOnly.getTime();
        })();
        
        const isAdultCountChanged = modRequest.newAdultCount !== null && 
            modRequest.newAdultCount !== undefined && 
            modRequest.newAdultCount !== reservation.adultCount;
            
        const isChildCountChanged = modRequest.newChildCount !== null && 
            modRequest.newChildCount !== undefined && 
            modRequest.newChildCount !== reservation.childCount;
            
        const isPartyChanged = isAdultCountChanged || isChildCountChanged;
        
        const isMealTypeChanged = modRequest.newMealType !== null && 
            modRequest.newMealType !== undefined && 
            modRequest.newMealType !== reservation.mealType;

        // Log which specific changes are being made
            console.log('🔄 Capacity update - changes detected:', {
            action: 'updateCapacity',
            dateChange: isDateChanged ? "YES" : "NO",
            adultCountChange: isAdultCountChanged ? "YES" : "NO",
            childCountChange: isChildCountChanged ? "YES" : "NO",
            partyChange: isPartyChanged ? "YES" : "NO",
            mealTypeChange: isMealTypeChanged ? "YES" : "NO",
            newDate: modRequest.newDate,
            originalReservationDate: reservation.reservationDate,
            modRequestOriginalDate: modRequest.originalDate,
            newAdultCount: modRequest.newAdultCount,
            originalReservationAdultCount: reservation.adultCount,
            modRequestOriginalAdultCount: modRequest.originalAdultCount,
            newChildCount: modRequest.newChildCount,
            originalReservationChildCount: reservation.childCount,
            modRequestOriginalChildCount: modRequest.originalChildCount,
            newMealType: modRequest.newMealType,
            originalReservationMealType: reservation.mealType,
            modRequestOriginalMealType: modRequest.originalMealType
        });

        // If no changes to capacity-affecting fields, return success immediately
        // Time changes are not considered for capacity updates
        if (!isDateChanged && !isPartyChanged && !isMealTypeChanged) {
            // Still update the request with zero values to ensure consistent tracking
            await prisma.reservationModificationRequest.update({
                where: { id: modRequest.id },
                data: {
                    seatsReleased: 0,
                    seatsReserved: 0,
                    capacityAdjustedAt: new Date()
                }
            });
            return {
                success: true,
                seatsReleased: 0,
                seatsReserved: 0
            };
        }

        // Get the original party size
        const originalPartySize = reservation.adultCount + reservation.childCount;

        // Get the new values
        const newDate = isDateChanged && modRequest.newDate ? modRequest.newDate : reservation.reservationDate;
        const newMealType = modRequest.newMealType ?? reservation.mealType;
        const newAdultCount = modRequest.newAdultCount ?? reservation.adultCount;
        const newChildCount = modRequest.newChildCount ?? reservation.childCount;
        const newPartySize = newAdultCount + newChildCount;

        let seatsReleased = 0; // Initialize with zero instead of undefined/null
        let seatsReserved = 0; // Initialize with zero instead of undefined/null

        // STEP 1: Release capacity from the original date/service if date or meal type changed
        if (isDateChanged || isMealTypeChanged) {
            // Find the original meal service
            const originalMealService = await prisma.restaurantMealService.findFirst({
                where: {
                    restaurantId: reservation.restaurantId,
                    mealType: reservation.mealType,
                    isAvailable: true
                }
            });

            if (originalMealService) {
                // Find capacity record for the original date/service
                const originalCapacityRecord = await prisma.restaurantCapacity.findFirst({
                    where: {
                        restaurantId: reservation.restaurantId,
                        serviceId: originalMealService.id,
                        date: reservation.reservationDate
                    }
                });

                if (originalCapacityRecord) {
                    // Log original capacity before update
                    console.log('Original capacity before update:', {
                        action: 'updateCapacity',
                        id: originalCapacityRecord.id,
                        date: reservation.reservationDate.toISOString().split('T')[0],
                        mealType: reservation.mealType,
                        totalSeats: originalCapacityRecord.totalSeats,
                        bookedSeats: originalCapacityRecord.bookedSeats,
                        availableSeats: originalCapacityRecord.totalSeats - originalCapacityRecord.bookedSeats
                    });

                    // Update capacity record to release seats
                    const updatedBookedSeats = Math.max(0, originalCapacityRecord.bookedSeats - originalPartySize);

                    await prisma.restaurantCapacity.update({
                        where: { id: originalCapacityRecord.id },
                        data: {
                            bookedSeats: updatedBookedSeats
                        }
                    });

                    seatsReleased = originalPartySize;

                    // Log original capacity after update
                    console.log('Original capacity after update:', {
                        action: 'updateCapacity',
                        id: originalCapacityRecord.id,
                        date: reservation.reservationDate.toISOString().split('T')[0],
                        mealType: reservation.mealType,
                        totalSeats: originalCapacityRecord.totalSeats,
                        bookedSeats: updatedBookedSeats,
                        availableSeats: originalCapacityRecord.totalSeats - updatedBookedSeats
                    });

                    console.log('Released seats from original date/service:', {
                        action: 'updateCapacity',
                        originalDate: reservation.reservationDate.toISOString().split('T')[0],
                        originalMealType: reservation.mealType,
                        originalPartySize,
                        previousBookedSeats: originalCapacityRecord.bookedSeats,
                        newBookedSeats: updatedBookedSeats
                    });
                } else {
                    console.log('No capacity record found for original date/service - no seats to release');
                }
            } else {
                console.log('Original meal service not found - no capacity to release');
            }
        }

        // STEP 2: Update capacity for new date/service
        // First find the new meal service
        const newMealService = await prisma.restaurantMealService.findFirst({
            where: {
                restaurantId: reservation.restaurantId,
                mealType: newMealType,
                isAvailable: true
            }
        });

        if (!newMealService) {
            return {
                success: false,
                errorMessage: `Meal service not found for ${newMealType}`
            };
        }

        // Find capacity record for the new date/service
        let newCapacityRecord = await prisma.restaurantCapacity.findFirst({
            where: {
                restaurantId: reservation.restaurantId,
                serviceId: newMealService.id,
                date: newDate,
                isEnabled: true // Only consider enabled capacity records for new bookings
            }
        });

        // If no capacity record exists, create one
        if (!newCapacityRecord) {
            // Get restaurant to determine total seats
            const restaurant = await prisma.restaurant.findUnique({
                where: { id: reservation.restaurantId }
            });

            if (!restaurant) {
                return {
                    success: false,
                    errorMessage: 'Restaurant information not found'
                };
            }

            // Create new capacity record
            newCapacityRecord = await prisma.restaurantCapacity.create({
                data: {
                    restaurantId: reservation.restaurantId,
                    serviceId: newMealService.id,
                    date: newDate,
                    totalSeats: restaurant.capacity,
                    bookedSeats: 0
                }
            });

            console.log('Created new capacity record:', {
                action: 'updateCapacity',
                restaurantId: reservation.restaurantId,
                serviceId: newMealService.id,
                date: newDate.toISOString().split('T')[0],
                totalSeats: restaurant.capacity
            });
        }

        // Calculate how many new seats to book
        let seatsToBook = newPartySize;

        // If date/meal didn't change but party size did, we only need to book the difference
        if (!isDateChanged && !isMealTypeChanged && isPartyChanged) {
            const seatDifference = newPartySize - originalPartySize;
            // If reducing party size, release seats; if increasing, book more
            if (seatDifference <= 0) {
                // Releasing seats (negative number becomes positive release)
                seatsToBook = -seatDifference;
                seatsReleased += seatsToBook;

                // Update capacity record
                await prisma.restaurantCapacity.update({
                    where: { id: newCapacityRecord.id },
                    data: {
                        bookedSeats: Math.max(0, newCapacityRecord.bookedSeats - seatsToBook)
                    }
                });

                console.log('Released seats due to smaller party size:', {
                    action: 'updateCapacity',
                    date: newDate.toISOString().split('T')[0],
                    seatsReleased: seatsToBook,
                    originalPartySize,
                    newPartySize
                });

                // We're done - we've released seats, not booked any
                seatsToBook = 0;
            } else {
                // Booking more seats (only the difference)
                seatsToBook = seatDifference;
                
                // Log capacity before update
                console.log('Capacity before party size update:', {
                    action: 'updateCapacity',
                    id: newCapacityRecord.id,
                    date: newDate.toISOString().split('T')[0],
                    mealType: newMealType,
                    totalSeats: newCapacityRecord.totalSeats,
                    bookedSeats: newCapacityRecord.bookedSeats,
                    availableSeats: newCapacityRecord.totalSeats - newCapacityRecord.bookedSeats
                });
            }
        }

        // Book additional seats if needed
        if (seatsToBook > 0) {
            // Log new capacity before update
            console.log('New capacity before update:', {
                action: 'updateCapacity',
                id: newCapacityRecord.id,
                date: newDate.toISOString().split('T')[0],
                mealType: newMealType,
                totalSeats: newCapacityRecord.totalSeats,
                bookedSeats: newCapacityRecord.bookedSeats,
                availableSeats: newCapacityRecord.totalSeats - newCapacityRecord.bookedSeats
            });

            await prisma.restaurantCapacity.update({
                where: { id: newCapacityRecord.id },
                data: {
                    bookedSeats: newCapacityRecord.bookedSeats + seatsToBook
                }
            });

            seatsReserved = seatsToBook;

            // Log new capacity after update
            console.log('New capacity after update:', {
                action: 'updateCapacity',
                date: newDate.toISOString().split('T')[0],
                mealType: newMealType,
                totalSeats: newCapacityRecord.totalSeats,
                bookedSeats: newCapacityRecord.bookedSeats + seatsToBook,
                availableSeats: newCapacityRecord.totalSeats - (newCapacityRecord.bookedSeats + seatsToBook)
            });

            console.log('Booked new seats:', {
                action: 'updateCapacity',
                date: newDate.toISOString().split('T')[0],
                mealType: newMealType,
                seatsBooked: seatsToBook,
                newTotalBookedSeats: newCapacityRecord.bookedSeats + seatsToBook
            });
        }

        // Update the modification request with capacity info
        // Ensure we're always setting integer values, never null
        await prisma.reservationModificationRequest.update({
            where: { id: modRequest.id },
            data: {
                seatsReleased: seatsReleased,
                seatsReserved: seatsReserved,
                capacityAdjustedAt: new Date()
            }
        });

        return {
            success: true,
            seatsReleased,
            seatsReserved
        };
    } catch (error) {
            console.log('Error updating capacity:', {
            action: 'updateCapacity',
            modificationId: modRequest.id,
            reservationId: modRequest.reservationId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        return {
            success: false,
            errorMessage: error instanceof Error ? error.message : 'Unknown error updating capacity'
        };
    }
}

export {
    validateModificationRequest,
    createModificationRequest,
    calculatePriceDifference,
    updateRequestWithPricing,
    updateModificationStatus,
    processModificationWithPayment,
    initializeModificationPayment,
    completeModificationAfterPayment,
    verifyPaymentAndCompleteModification,
    updateCapacity,
    checkCapacity
};
