import {PrismaClient, MealType, ReservationRequestStatus, RequestCreatorType} from "../prisma/generated/prisma";
import {z} from "zod";
import { linkPolicyApplicationsToReservation } from './restaurant_web_queries/policy_queries';

const CreateReservationRequestInput = z.object({
    restaurantId: z.number(),
    firstName: z.string(),
    lastName: z.string(),
    phone: z.string(),
    email: z.string().email().optional().or(z.literal('')),
    date: z.string(),
    mealType: z.nativeEnum(MealType),
    partySize: z.number(),
    estimatedTotalAmount: z.number(),
    estimatedServiceCharge: z.number(),
    estimatedTaxAmount: z.number(),
    mealServiceId: z.number().optional(),
    createdBy: z.nativeEnum(RequestCreatorType).default(RequestCreatorType.CUSTOMER),
});

type CreateReservationRequestInputType = z.infer<typeof CreateReservationRequestInput>;

async function getOrCreateCustomer(
    prisma: PrismaClient,
    customerData: {
        email: string;
        firstName: string;
        lastName: string;
        phone: string;
    }
) {
    return await prisma.customer.upsert({
        where: {phone: customerData.phone},
        update: {
            firstName: customerData.firstName,
            lastName: customerData.lastName,
            phone: customerData.phone,
            email: customerData.email || null
        },
        create: {
            firstName: customerData.firstName,
            lastName: customerData.lastName,
            phone: customerData.phone,
            email: customerData.email || null
        },
    });
}

export async function getCustomerByphone(
    prisma: PrismaClient,
    phone: string
) {
    return await prisma.customer.findFirst({
        where: {
            phone: phone
        },
    });
}

export async function createInitialReservationRequest(
    prisma: PrismaClient,
    input: CreateReservationRequestInputType
) {
    try {
        // Validate input
        CreateReservationRequestInput.parse(input);

        // Use the new function instead of inline customer creation
        const customer = await getOrCreateCustomer(prisma, {
            email: input.email || '',
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone,
        });

        // Create reservation request
        const request = await prisma.reservationRequest.create({
            data: {
                restaurantId: input.restaurantId,
                customerId: customer.id,
                requestName: `${input.firstName}${input.lastName ? ' ' + input.lastName : ''}`,
                contactPhone: input.phone,
                requestedDate: new Date(input.date),
                requestedTime: new Date(input.date),
                adultCount: input.partySize,
                childCount: 0,
                mealType: input.mealType as MealType,
                mealServiceId: input.mealServiceId,
                estimatedTotalAmount: input.estimatedTotalAmount,
                estimatedServiceCharge: input.estimatedServiceCharge,
                estimatedTaxAmount: input.estimatedTaxAmount,
                status: ReservationRequestStatus.PENDING,
                createdBy: input.createdBy
            }
        });

        return {
            success: true,
            requestId: request.id,
            customerId: customer.id
        };
    } catch (error) {
        console.error('Error creating reservation request:', error);
        return {
            success: false,
            error: handleDatabaseError(error, 'createInitialReservationRequest')
        };
    }
}

const ConfirmReservationPaymentInput = z.object({
    merchantTxId: z.string(),
    statusCode: z.string(),
    description: z.string(),
    requestId: z.number(),
    reservationRequest: z.object({
        restaurantId: z.number(),
        date: z.string(),
        mealType: z.nativeEnum(MealType),
        partySize: z.number(),
        adultCount: z.number(),
        childCount: z.number(),
        estimatedTotalAmount: z.number(),
        firstName: z.string(),
        lastName: z.string(),
        email: z.string(),
        phone: z.string(),
        discountAmount: z.number().optional(),
    }),
    paymentDetails: z.object({
        amount: z.number(),
        cardBrand: z.string().nullable().optional(),
        cardNumber: z.string().nullable().optional(),
        expiryDate: z.string().nullable().optional(),
        hmsTrxId: z.string().nullable().optional()
    }),
    createdBy: z.nativeEnum(RequestCreatorType).optional()
});

type ConfirmReservationPaymentInputType = z.infer<typeof ConfirmReservationPaymentInput>;

export async function confirmReservationPayment(
    prisma: PrismaClient,
    input: ConfirmReservationPaymentInputType
) {
    console.log('=== Starting Reservation Payment Confirmation ===');

    try {
        // Validate input
        console.log('Validating input...');
        ConfirmReservationPaymentInput.parse(input);
        console.log('Input validation successful');

        if (input.statusCode !== 'IPG_S_1000') {
            console.log('Payment unsuccessful - Invalid status code:', input.statusCode);
            return {
                success: false,
                error: 'Payment was not successful'
            };
        }

        // Get customer record
        console.log('Finding customer with email:', input.reservationRequest.email);
        let customer;
        
        if (input.reservationRequest.email && input.reservationRequest.email.trim() !== '') {
            // Look up by email if email is provided
            customer = await prisma.customer.findUnique({
                where: {email: input.reservationRequest.email}
            });
        } else {
            // For call-in reservations without email, look up by phone
            console.log('Email is empty, looking up customer by phone:', input.reservationRequest.phone);
            customer = await prisma.customer.findFirst({
                where: {phone: input.reservationRequest.phone}
            });
        }
        
        console.log('Customer lookup result:', customer ? 'Found' : 'Not found');

        if (!customer) {
            console.error('Customer not found for email:', input.reservationRequest.email, 'phone:', input.reservationRequest.phone);
            throw new Error('Customer not found');
        }

        // Get reservation request
        console.log('Finding reservation request by ID:', input.requestId);
        const request = await prisma.reservationRequest.findUnique({
            where: {
                id: input.requestId
            }
        });
        console.log('Reservation request lookup result:', request ? 'Found' : 'Not found');

        if (!request) {
            console.error('Reservation request not found');
            throw new Error('Reservation request not found');
        }

        // Check if reservation already exists for this request
        console.log('Checking for existing reservation with requestId:', request.id);
        const existingReservation = await prisma.reservation.findUnique({
            where: {requestId: request.id}
        });

        if (existingReservation) {
            console.warn('Reservation already exists for this request:', existingReservation);
            // Convert Decimal values to numbers before returning
            const serializedReservation = {
                ...existingReservation,
                totalAmount: Number(existingReservation.totalAmount),
                serviceCharge: Number(existingReservation.serviceCharge),
                taxAmount: Number(existingReservation.taxAmount)
            };
            return {
                success: true,
                data: serializedReservation,
                message: 'Reservation already exists'
            };
        }

        const reservationDateTime = new Date(input.reservationRequest.date);
        console.log('Creating new reservation with datetime:', reservationDateTime);
        console.log('🔍 [CONFIRM-RESERVATION-PAYMENT] Request data:', {
            requestId: request.id,
            reservationType: request.reservationType,
            requestedTime: request.requestedTime,
            requestedDate: request.requestedDate
        });

        const result = await prisma.$transaction(async (tx) => {
            const reservationNumber = generateReservationNumber(
                input.reservationRequest.mealType,
                reservationDateTime,
                input.requestId
            );

            const newReservation = await tx.reservation.create({
                data: {
                    reservationNumber,
                    restaurantId: input.reservationRequest.restaurantId,
                    customerId: customer.id,
                    requestId: request.id,
                    reservationName: `${input.reservationRequest.firstName} ${input.reservationRequest.lastName}`,
                    contactPhone: input.reservationRequest.phone,
                    reservationDate: reservationDateTime,
                    reservationTime: request.requestedTime, // ✅ Fix: Use requestedTime from request, not reservationDateTime
                    adultCount: input.reservationRequest.adultCount,
                    childCount: input.reservationRequest.childCount,
                    mealType: input.reservationRequest.mealType,
                    totalAmount: input.reservationRequest.estimatedTotalAmount,
                    serviceCharge: request.estimatedServiceCharge,
                    taxAmount: request.estimatedTaxAmount,
                    advancePaymentAmount: input.paymentDetails.amount / 100,
                    remainingPaymentAmount: input.reservationRequest.estimatedTotalAmount - (input.paymentDetails.amount / 100),
                    status: 'CONFIRMED',
                    reservationType: request.reservationType, // ✅ Fix: Preserve reservationType from request
                    createdBy: input.createdBy || RequestCreatorType.CUSTOMER,
                    // Copy special requests from the original reservation request
                    specialRequests: request.specialRequests
                }
            });

            console.log('✅ [CONFIRM-RESERVATION-PAYMENT] Reservation created:', {
                reservationId: newReservation.id,
                reservationNumber: newReservation.reservationNumber,
                reservationType: newReservation.reservationType,
                reservationTime: newReservation.reservationTime,
                reservationDate: newReservation.reservationDate
            });

            // Handle table assignment for TABLE_ONLY reservations
            if (request.reservationType === 'TABLE_ONLY') {
                console.log('📋 [TABLE-RESERVATION] Setting up table-specific data for reservation:', {
                    reservationId: newReservation.id,
                    requestId: request.id
                });

                // 1. Handle table holds
                const tableHold = await tx.reservationTableHold.findFirst({
                    where: { requestId: request.id },
                    include: {
                        slot: {
                            include: {
                                table: {
                                    include: {
                                        section: true
                                    }
                                }
                            }
                        }
                    }
                });

                if (!tableHold) {
                    console.warn('⚠️ [TABLE-RESERVATION] No table hold found for request:', request.id);
                } else {
                    console.log('✅ [TABLE-RESERVATION] Found table hold:', {
                        slotId: tableHold.slotId,
                        tableId: tableHold.slot.tableId,
                        sectionId: tableHold.slot.table.sectionId
                    });
                    
                    // Create table assignment
                    await tx.reservationTableAssignment.create({
                        data: {
                            reservationId: newReservation.id,
                            assignedSectionId: tableHold.slot.table.sectionId,
                            assignedTableId: tableHold.slot.tableId,
                            slotId: tableHold.slotId,
                            tableStartTime: tableHold.slot.startTime,
                            tableEndTime: tableHold.slot.endTime
                        }
                    });

                    // Update the slot status to RESERVED
                    await tx.tableAvailabilitySlot.update({
                        where: { id: tableHold.slotId },
                        data: {
                            status: 'RESERVED',
                            reservationId: newReservation.id,
                            holdExpiresAt: null
                        }
                    });

                    // Delete the hold record
                    await tx.reservationTableHold.delete({
                        where: { id: tableHold.id }
                    });

                    console.log('✅ [TABLE-RESERVATION] Table assignment created and hold released');
                }

                // 2. Link existing policy applications to the reservation
                const linkedPolicyCount = await linkPolicyApplicationsToReservation(
                    tx,
                    request.id,
                    newReservation.id
                );

                if (linkedPolicyCount > 0) {
                    console.log('✅ [POLICY-APPLICATION] Successfully linked policies to reservation:', {
                        reservationId: newReservation.id,
                        policyCount: linkedPolicyCount
                    });
                } else {
                    console.log('ℹ️ [POLICY-APPLICATION] No policies to link for this reservation');
                }
            }

            // Create financial data for the reservation
            const totalBeforeDiscount = input.reservationRequest.estimatedTotalAmount;
            const taxAmount = request.estimatedTaxAmount;
            const serviceCharge = request.estimatedServiceCharge;
            const netBuffetPrice = Number(totalBeforeDiscount) - Number(taxAmount) - Number(serviceCharge);

            // Get discount amount if any
            const discount = request.estimatedDiscountAmount || 0;
            const totalAfterDiscount = Number(totalBeforeDiscount) - Number(discount);
            const advancePayment = input.paymentDetails.amount/100;
            const balanceDue = totalAfterDiscount - advancePayment;
            const isPaid = false;

            // Create financial record
            await tx.reservationFinancialData.create({
                data: {
                    reservationId: newReservation.id,
                    netBuffetPrice,
                    taxAmount,
                    serviceCharge,
                    totalBeforeDiscount,
                    discount,
                    totalAfterDiscount,
                    advancePayment,
                    balanceDue,
                    isPaid
                }
            });

            // Then create the payment record
            await tx.reservationPayment.create({
                data: {
                    reservationId: newReservation.id,
                    amount: input.paymentDetails.amount,
                    paymentDate: new Date(),
                    paymentStatus: 'COMPLETED',
                    paymentChannel: 'CREDIT_CARD',
                    transactionReference: input.merchantTxId,
                    paymentNotes: JSON.stringify({
                        cardBrand: input.paymentDetails.cardBrand,
                        cardNumber: input.paymentDetails.cardNumber,
                        expiryDate: input.paymentDetails.expiryDate,
                        hmsTrxId: input.paymentDetails.hmsTrxId
                    }),
                    processedBy: 'SYSTEM',
                }
            });

            // Update ReservationRequest status to COMPLETED
            await tx.reservationRequest.update({
                where: { id: input.requestId },
                data: {
                    status: ReservationRequestStatus.COMPLETED,
                    processingCompletedAt: new Date(),
                    statusHistory: {
                        create: {
                            previousStatus: request.status,
                            newStatus: ReservationRequestStatus.COMPLETED,
                            changeReason: "Payment successful and reservation created",
                            statusChangedAt: new Date(),
                            changedBy: "SYSTEM"
                        }
                    }
                }
            });

            // Update ReservationRequestPayment status to COMPLETED
            // Only update if payment status is not already COMPLETED
            console.log('Checking for existing payment with requestId:', input.requestId);
            const existingPayment = await tx.reservationRequestPayment.findFirst({
                where: { requestId: input.requestId }
            });
            if (existingPayment && existingPayment.paymentStatus !== 'COMPLETED') {
                await tx.reservationRequestPayment.update({
                    where: { id: existingPayment.id },
                    data: {
                        paymentStatus: 'COMPLETED'
                    }
                });
            }

            return {
                success: true,
                data: {
                    id: newReservation.id,
                    reservationNumber: newReservation.reservationNumber,
                    totalAmount: Number(newReservation.totalAmount),
                    serviceCharge: Number(newReservation.serviceCharge),
                    taxAmount: Number(newReservation.taxAmount)
                }
            };
        });

        return result;

    } catch (error) {
        console.error('Reservation confirmation failed:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to confirm reservation'
        };
    }
}

function generateReservationNumber(mealType: string, reservationDate: Date, requestId: number): string {
    // Get first letter of meal type
    const mealTypePrefix = mealType.charAt(0).toUpperCase();

    // Format date to MMDD
    const month = String(reservationDate.getMonth() + 1).padStart(2, '0');
    const day = String(reservationDate.getDate()).padStart(2, '0');
    const dateString = `${month}${day}`;

    // Format requestId to ensure 4 digits
    const requestIdString = String(requestId).padStart(4, '0').slice(-4);

    // Combine all parts with the specified format
    const reservationNumber = `${mealTypePrefix}${dateString}-${requestIdString}`;

    console.log('Generated reservation number:', reservationNumber, {
        mealType,
        date: reservationDate,
        requestId
    });

    return reservationNumber;
}

export async function getReservationNumberByMerchantTxId(
    prisma: PrismaClient,
    merchantTxId: string
) {
    try {
        const payment = await prisma.reservationPayment.findFirst({
            where: {
                transactionReference: merchantTxId
            },
            select: {
                reservation: {
                    select: {
                        reservationNumber: true
                    }
                }
            }
        });

        if (!payment || !payment.reservation) {
            return {
                success: false,
                error: 'Reservation not found'
            };
        }

        return {
            success: true,
            data: {
                reservationNumber: payment.reservation.reservationNumber
            }
        };
    } catch (error) {
        console.error('Error fetching reservation number:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch reservation number'
        };
    }
}

export async function confirmZeroAmountReservation(
    prisma: PrismaClient,
    input: {
        requestId: number,
        reservationRequest: {
            restaurantId: number,
            date: string,
            mealType: MealType,
            partySize: number,
            firstName: string,
            lastName: string,
            email: string,
            phone: string,
            createdBy?: RequestCreatorType
        }
    }
) {
    console.log('=== Starting Zero Amount Reservation Confirmation ===');

    try {
        // Get customer record
        const customer = await prisma.customer.findUnique({
            where: { email: input.reservationRequest.email }
        });

        if (!customer) {
            throw new Error('Customer not found');
        }

        // Get reservation request
        const request = await prisma.reservationRequest.findUnique({
            where: { id: input.requestId }
        });

        if (!request) {
            throw new Error('Reservation request not found');
        }

        // Check for existing reservation
        const existingReservation = await prisma.reservation.findUnique({
            where: { requestId: request.id }
        });

        if (existingReservation) {
            return {
                success: true,
                data: {
                    id: existingReservation.id,
                    reservationNumber: existingReservation.reservationNumber
                },
                message: 'Reservation already exists'
            };
        }

        const reservationDateTime = new Date(input.reservationRequest.date);

        // Create reservation in transaction
        const result = await prisma.$transaction(async (tx) => {
            const reservationNumber = generateReservationNumber(
                input.reservationRequest.mealType,
                reservationDateTime,
                input.requestId
            );

            const newReservation = await tx.reservation.create({
                data: {
                    reservationNumber,
                    restaurantId: input.reservationRequest.restaurantId,
                    customerId: customer.id,
                    requestId: request.id,
                    reservationName: `${input.reservationRequest.firstName} ${input.reservationRequest.lastName}`,
                    contactPhone: input.reservationRequest.phone,
                    reservationDate: reservationDateTime,
                    reservationTime: reservationDateTime,
                    adultCount: request.adultCount,
                    childCount: request.childCount,
                    mealType: input.reservationRequest.mealType,
                    totalAmount: request.estimatedTotalAmount,
                    serviceCharge: request.estimatedServiceCharge,
                    taxAmount: request.estimatedTaxAmount,
                    advancePaymentAmount: 0,
                    remainingPaymentAmount: request.estimatedTotalAmount,
                    status: 'CONFIRMED',
                    createdBy: input.reservationRequest.createdBy || RequestCreatorType.CUSTOMER,
                    // Copy special requests from the original reservation request
                    specialRequests: request.specialRequests
                }
            });

            // Calculate financial data from the reservation request
            const netBuffetPrice = request.estimatedTotalAmount.toNumber() -
                (request.estimatedServiceCharge?.toNumber() || 0) -
                (request.estimatedTaxAmount?.toNumber() || 0);

            const discountAmount = request.estimatedDiscountAmount?.toNumber() || 0;
            const totalBeforeDiscount = netBuffetPrice + discountAmount;
            const totalAfterDiscount = request.estimatedTotalAmount.toNumber();
            const advancePayment = 0; // Zero amount reservation
            const balanceDue = totalAfterDiscount - advancePayment;

            console.log('Financial data:', {
                netBuffetPrice,
                discountAmount,
                totalBeforeDiscount,
                totalAfterDiscount,
                advancePayment,
                balanceDue
            });

            // Create financial data for the reservation
            await tx.reservationFinancialData.create({
                data: {
                    reservationId: newReservation.id,
                    netBuffetPrice: netBuffetPrice,
                    taxAmount: request.estimatedTaxAmount?.toNumber() || 0,
                    serviceCharge: request.estimatedServiceCharge?.toNumber() || 0,
                    totalBeforeDiscount: totalBeforeDiscount,
                    discount: discountAmount,
                    totalAfterDiscount: totalAfterDiscount,
                    advancePayment: advancePayment,
                    balanceDue: balanceDue,
                    isPaid: false
                }
            });

            // Update ReservationRequest status to COMPLETED
            await tx.reservationRequest.update({
                where: { id: input.requestId },
                data: {
                    status: ReservationRequestStatus.COMPLETED,
                    processingCompletedAt: new Date(),
                    statusHistory: {
                        create: {
                            previousStatus: request.status,
                            newStatus: ReservationRequestStatus.COMPLETED,
                            changeReason: "Zero amount reservation confirmed",
                            statusChangedAt: new Date(),
                            changedBy: "SYSTEM"
                        }
                    }
                }
            });

            return {
                success: true,
                data: {
                    id: newReservation.id,
                    reservationNumber: newReservation.reservationNumber
                }
            };
        });

        return result;

    } catch (error) {
        console.error('Zero amount reservation confirmation failed:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to confirm reservation'
        };
    }
}

export async function getReservationRequestCreatedBy(
    prisma: PrismaClient,
    requestId: number
) {
    try {
        const reservationRequest = await prisma.reservationRequest.findUnique({
            where: { id: requestId },
            select: { createdBy: true }
        });

        if (!reservationRequest) {
            return {
                success: false,
                error: 'Reservation request not found'
            };
        }

        return {
            success: true,
            data: {
                createdBy: reservationRequest.createdBy
            }
        };
    } catch (error) {
        console.error('Error fetching reservation request createdBy:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch reservation request createdBy'
        };
    }
}

/**
 * Error handling utility for database operations
 */
function handleDatabaseError(error: any, operation: string): string {
    // Handle specific Prisma errors
    if (error.code === 'P2002') {
        // Check if it's a unique constraint violation on email or phone
        if (error.meta?.target?.includes('email')) {
            return 'Enter another email address to proceed'
        } else if (error.meta?.target?.includes('phone')) {
            return 'This phone number is already registered. Please use a different phone number.'
        } else {
            return 'Unique constraint violation'
        }
    } else if (error.code === 'P2025') {
        return 'Record not found'
    } else if (error.code === 'P2003') {
        return 'Foreign key constraint violation'
    } else if (error.code === 'P2014') {
        return 'Invalid ID provided'
    }

    // Default error message
    return error instanceof Error ? error.message : `Database operation failed: ${operation}`
}

