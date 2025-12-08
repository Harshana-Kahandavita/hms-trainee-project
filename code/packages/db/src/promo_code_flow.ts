import {PrismaClient, DiscountType, MealType} from '../prisma/generated/prisma';
import Decimal from 'decimal.js';
import {z} from 'zod';

// Input validation schema
export const ValidatePromoCodeInput = z.object({
    code: z.string(),
    restaurantId: z.number(),
    adultCount: z.number(),
    childrenCount: z.number().optional(),
    mealType: z.nativeEnum(MealType),
    customerId: z.number().optional(),
    subTotal: z.number().optional(),
    isPlatterService: z.boolean().optional(),
    platterCount: z.number().optional(),
});

// TypeScript type for the input
export type ValidatePromoCodeInputType = z.infer<typeof ValidatePromoCodeInput>;

// Return types for validation using discriminated union
export type ValidatePromoCodeSuccess = {
    success: true;
    discountAmount?: Decimal;
    grandTotal: Decimal;
    advancePayment: Decimal;
    balanceDue: Decimal;
    promoCodeId: number;
    isPartialApplication?: boolean;
    eligiblePartySize?: number;
    totalPartySize?: number;
    message?: string;
};

export type ValidatePromoCodeFailure = {
    success: false;
    error: string;
};

export type ValidatePromoCodeResult = ValidatePromoCodeSuccess | ValidatePromoCodeFailure;

/**
 * Validates a promo code and calculates the discount amount
 */
export async function validatePromoCode(
    prisma: PrismaClient,
    input: ValidatePromoCodeInputType
): Promise<ValidatePromoCodeResult> {
    try {
        console.log('🔍 [PROMO_DEBUG] Starting promo code validation with input:', {
            code: input.code,
            restaurantId: input.restaurantId,
            adultCount: input.adultCount,
            childrenCount: input.childrenCount,
            mealType: input.mealType,
            customerId: input.customerId,
            subTotal: input.subTotal,
            isPlatterService: input.isPlatterService,
            platterCount: input.platterCount
        });

        // Validate input
        ValidatePromoCodeInput.parse(input);

        // Get restaurant meal service details for pricing
        const mealService = await prisma.restaurantMealService.findFirst({
            where: {
                restaurantId: input.restaurantId,
                mealType: input.mealType,
                isAvailable: true,
            },
            include: {
                restaurant: {
                    select: {
                        advancePaymentPercentage: true
                    }
                },
                platters: {
                    where: {
                        isActive: true,
                        isDefault: true
                    },
                    select: {
                        adultNetPrice: true,
                        childNetPrice: true,
                        headCount: true
                    }
                }
            }
        });

        if (!mealService) {
            console.log('❌ [PROMO_DEBUG] Meal service not found for:', {
                restaurantId: input.restaurantId,
                mealType: input.mealType
            });
            return {
                success: false,
                error: 'Meal service not available',
            };
        }

        console.log('✅ [PROMO_DEBUG] Meal service found:', {
            adultNetPrice: mealService.adultNetPrice.toString(),
            childNetPrice: mealService.childNetPrice.toString(),
            isChildEnabled: mealService.isChildEnabled,
            advancePaymentPercentage: mealService.restaurant.advancePaymentPercentage,
            plattersCount: mealService.platters.length
        });

        // Calculate base buffet price based on whether it's a platter service or regular buffet
        let buffetPrice: Decimal;
        if (input.isPlatterService && mealService.platters.length > 0) {
            // Use platter pricing if it's a platter service and default platter exists
            const defaultPlatter = mealService.platters[0];
            if (!defaultPlatter) {
                return {
                    success: false,
                    error: 'No default platter found for this meal service',
                };
            }
            const platterCount = input.platterCount || 1;
            buffetPrice = new Decimal(defaultPlatter.adultNetPrice).mul(platterCount);
        } else {
            // Use regular buffet pricing - separate adult and child pricing
            const adultPrice = new Decimal(mealService.adultNetPrice).mul(input.adultCount);
            let childPrice = new Decimal(0);
            
            // Add child pricing if children are present and child pricing is enabled
            if (input.childrenCount && mealService.isChildEnabled) {
                childPrice = new Decimal(mealService.childNetPrice).mul(input.childrenCount);
            }
            
            buffetPrice = adultPrice.add(childPrice);
        }

        console.log('💰 [PROMO_DEBUG] Buffet price calculated:', {
            isPlatterService: input.isPlatterService,
            buffetPrice: buffetPrice.toString(),
            breakdown: input.isPlatterService 
                ? { platterCount: input.platterCount || 1, pricePerPlatter: mealService.platters[0]?.adultNetPrice.toString() }
                : { 
                    adultPrice: new Decimal(mealService.adultNetPrice).mul(input.adultCount).toString(),
                    childPrice: input.childrenCount && mealService.isChildEnabled 
                        ? new Decimal(mealService.childNetPrice).mul(input.childrenCount).toString() 
                        : '0'
                }
        });

        // Find active promo code
        const promoCode = await prisma.promoCode.findFirst({
            where: {
                code: input.code,
                isActive: true,
                validFrom: {lte: new Date()},
                validUntil: {gte: new Date()},
                isDeleted: false
            },
            include: {
                usageRecords: input.customerId ? {
                    where: {customerId: input.customerId},
                } : undefined,
            },
        });

        if (!promoCode) {
            console.log('❌ [PROMO_DEBUG] Promo code not found or expired:', input.code);
            return {
                success: false,
                error: 'Invalid or expired promo code',
            };
        }

        console.log('✅ [PROMO_DEBUG] Promo code found:', {
            id: promoCode.id,
            code: promoCode.code,
            discountType: promoCode.discountType,
            discountValue: promoCode.discountValue.toString(),
            minimumOrderValue: promoCode.minimumOrderValue.toString(),
            maximumDiscountAmount: promoCode.maximumDiscountAmount.toString(),
            usageLimitPerUser: promoCode.usageLimitPerUser,
            usageLimitTotal: promoCode.usageLimitTotal,
            timesUsed: promoCode.timesUsed,
            partySizeLimit: promoCode.partySizeLimit,
            partySizeLimitPerUser: promoCode.partySizeLimitPerUser,
            partySizeUsed: promoCode.partySizeUsed,
            firstOrderOnly: promoCode.firstOrderOnly,
            buffetTypes: promoCode.buffetTypes,
            usageRecordsCount: promoCode.usageRecords?.length || 0
        });

        // Check if the selected meal type is allowed by the promo code
        console.log('🍽️ [PROMO_DEBUG] Checking meal type eligibility:', {
            requestedMealType: input.mealType,
            allowedBuffetTypes: promoCode.buffetTypes,
            hasRestrictions: promoCode.buffetTypes && promoCode.buffetTypes.length > 0
        });

        if (promoCode.buffetTypes && promoCode.buffetTypes.length > 0) {
            const hasAllTypes = promoCode.buffetTypes.length === Object.keys(MealType).length;
            if (!hasAllTypes && !promoCode.buffetTypes.includes(input.mealType)) {
                const allowedTypes = promoCode.buffetTypes
                    .map(type => type.charAt(0) + type.slice(1).toLowerCase().replace('_', ' '))
                    .join(', ');
                console.log('❌ [PROMO_DEBUG] Meal type not allowed:', {
                    requestedMealType: input.mealType,
                    allowedTypes
                });
                return {
                    success: false,
                    error: `This promotion is only valid for: ${allowedTypes}`
                };
            }
        }

        // Check if promo is first order only and validate customer's reservation count
        if (promoCode.firstOrderOnly && input.customerId) {
            console.log('🥇 [PROMO_DEBUG] Checking first order restriction for customer:', input.customerId);
            
            const customerReservationCount = await prisma.reservation.count({
                where: {
                    customerId: input.customerId,
                    status: {
                        notIn: ['CANCELLED', 'REJECTED']
                    }
                }
            });

            console.log('📊 [PROMO_DEBUG] Customer reservation count:', customerReservationCount);

            if (customerReservationCount > 0) {
                console.log('❌ [PROMO_DEBUG] First order restriction failed - customer has existing reservations');
                return {
                    success: false,
                    error: 'This promotion is only valid for first-time reservations'
                };
            }
        }

        // Check restaurant eligibility (if a restaurant is provided)
        if (input.restaurantId) {
            console.log('🏪 [PROMO_DEBUG] Checking restaurant eligibility for:', input.restaurantId);
            
            // First, check if this promo code has any restaurant mappings
            const hasRestaurantMappings = await prisma.promoCodeRestaurantMapping.count({
                where: {
                    promoCodeId: promoCode.id,
                    isActive: true
                }
            }) > 0;

            console.log('🗺️ [PROMO_DEBUG] Restaurant mapping check:', {
                hasRestaurantMappings,
                promoCodeId: promoCode.id
            });

            // If there are restaurant mappings, then the promo code is restricted to specific restaurants
            if (hasRestaurantMappings) {
                // Check if this specific restaurant is mapped
                const restaurantIsValid = await prisma.promoCodeRestaurantMapping.count({
                    where: {
                        promoCodeId: promoCode.id,
                        restaurantId: input.restaurantId,
                        isActive: true
                    }
                }) > 0;

                console.log('✅ [PROMO_DEBUG] Restaurant validation result:', {
                    restaurantId: input.restaurantId,
                    isValid: restaurantIsValid
                });

                if (!restaurantIsValid) {
                    console.log('❌ [PROMO_DEBUG] Restaurant not eligible for this promo code');
                    return {
                        success: false,
                        error: 'Promo code not valid for this restaurant',
                    };
                }
            }
        }

        // Check customer eligibility (always check if there are customer mappings)
        console.log('👤 [PROMO_DEBUG] Checking customer eligibility for:', input.customerId);
        
        // First, check if this promo code has any customer mappings
        const hasCustomerMappings = await prisma.promoCodeCustomerMapping.count({
            where: {
                promoCodeId: promoCode.id,
                isActive: true
            }
        }) > 0;

        console.log('👥 [PROMO_DEBUG] Customer mapping check:', {
            hasCustomerMappings,
            providedCustomerId: input.customerId,
            promoCodeId: promoCode.id
        });

        // If there are customer mappings, then the promo code is restricted to specific customers
        if (hasCustomerMappings) {
            // If no customerId is provided but promo code requires customer validation
            if (!input.customerId) {
                console.log('❌ [PROMO_DEBUG] Customer ID required but not provided');
                return {
                    success: false,
                    error: 'This promo code is not available for your account',
                };
            }

            // Check if this specific customer is mapped
            const customerIsValid = await prisma.promoCodeCustomerMapping.count({
                where: {
                    promoCodeId: promoCode.id,
                    customerId: input.customerId,
                    isActive: true
                }
            }) > 0;

            console.log('✅ [PROMO_DEBUG] Customer validation result:', {
                customerId: input.customerId,
                isValid: customerIsValid
            });

            if (!customerIsValid) {
                console.log('❌ [PROMO_DEBUG] Customer not eligible for this promo code');
                return {
                    success: false,
                    error: 'This promo code is not available for your account',
                };
            }
        }

        // Check minimum order amount (if subtotal is provided)
        console.log('💵 [PROMO_DEBUG] Checking minimum order value:', {
            minimumOrderValue: promoCode.minimumOrderValue.toString(),
            providedSubTotal: input.subTotal,
            hasMinimumCheck: promoCode.minimumOrderValue && input.subTotal
        });

        if (promoCode.minimumOrderValue && input.subTotal && new Decimal(input.subTotal).lessThan(promoCode.minimumOrderValue)) {
            console.log('❌ [PROMO_DEBUG] Minimum order value not met:', {
                required: promoCode.minimumOrderValue.toString(),
                provided: input.subTotal
            });
            return {
                success: false,
                error: `Order amount must be at least ${promoCode.minimumOrderValue} to use this promo code`,
            };
        }

        // Check total usage limit first (highest priority validation)
        console.log('🔢 [PROMO_DEBUG] Checking global usage limit:', {
            usageLimitTotal: promoCode.usageLimitTotal,
            timesUsed: promoCode.timesUsed,
            remaining: promoCode.usageLimitTotal - promoCode.timesUsed
        });

        if (promoCode.timesUsed >= promoCode.usageLimitTotal) {
            console.log('❌ [PROMO_DEBUG] Global usage limit exceeded');
            return {
                success: false,
                error: 'This promo code has reached its total usage limit',
            };
        }

        // Check party size limit and calculate eligible party size for discount
        const totalPartySize = input.adultCount + (input.childrenCount || 0);
        const remainingPartySize = promoCode.partySizeLimit - promoCode.partySizeUsed;
        
        console.log('👥 [PROMO_DEBUG] Party size calculations:', {
            requestedPartySize: totalPartySize,
            partySizeLimit: promoCode.partySizeLimit,
            partySizeUsed: promoCode.partySizeUsed,
            remainingPartySize,
            adultCount: input.adultCount,
            childrenCount: input.childrenCount || 0
        });
        
        if (remainingPartySize <= 0) {
            console.log('❌ [PROMO_DEBUG] Global party size limit exceeded');
            return {
                success: false,
                error: 'This promo code has reached its total party size limit',
            };
        }

        // Check per-user party size limits and usage count (always enforced)
        let userRemainingPartySize = Math.min(remainingPartySize, promoCode.partySizeLimitPerUser);
        
        if (input.customerId) {
            console.log('🔒 [PROMO_DEBUG] Checking per-user limits for customer:', input.customerId);
            
            // Get total party size used by this customer (default to 0 if no usage records)
            const customerUsage = promoCode.usageRecords 
                ? promoCode.usageRecords.reduce((total, record) => total + record.partySize, 0)
                : 0;
            const userRemainingLimit = promoCode.partySizeLimitPerUser - customerUsage;
            
            console.log('📊 [PROMO_DEBUG] Per-user party size analysis:', {
                partySizeLimitPerUser: promoCode.partySizeLimitPerUser,
                customerPartyUsage: customerUsage,
                userRemainingLimit,
                globalRemainingPartySize: remainingPartySize,
                usageRecordsForCustomer: promoCode.usageRecords?.length || 0
            });
            
            if (userRemainingLimit <= 0) {
                console.log('❌ [PROMO_DEBUG] Per-user party size limit exceeded');
                return {
                    success: false,
                    error: 'You have exceeded the party size limit for this promo code',
                };
            }
            
            // Use the more restrictive limit between global and per-user remaining
            userRemainingPartySize = Math.min(remainingPartySize, userRemainingLimit);

            console.log('🎯 [PROMO_DEBUG] Final user party size limit:', {
                userRemainingPartySize,
                restrictedBy: userRemainingPartySize === remainingPartySize ? 'global' : 'per-user'
            });

            // Check per-user usage count limit
            const customerUsageCount = promoCode.usageRecords ? promoCode.usageRecords.length : 0;
            
            console.log('🔄 [PROMO_DEBUG] Per-user usage count check:', {
                usageLimitPerUser: promoCode.usageLimitPerUser,
                customerUsageCount,
                remaining: promoCode.usageLimitPerUser - customerUsageCount
            });
            
            if (customerUsageCount >= promoCode.usageLimitPerUser) {
                console.log('❌ [PROMO_DEBUG] Per-user usage count limit exceeded');
                return {
                    success: false,
                    error: 'You have exceeded the usage limit for this promo code',
                };
            }
        } else {
            // For anonymous users, enforce the per-user party size limit as a maximum per transaction
            console.log('🔒 [PROMO_DEBUG] Checking per-user limits for anonymous user');
            console.log('📊 [PROMO_DEBUG] Anonymous user party size analysis:', {
                partySizeLimitPerUser: promoCode.partySizeLimitPerUser,
                requestedPartySize: totalPartySize,
                userRemainingPartySize,
                restrictedBy: 'per-user-anonymous'
            });
        }
        
        // Calculate eligible party size for discount (partial application if needed)
        const eligiblePartySize = Math.min(totalPartySize, userRemainingPartySize);
        let discountBuffetPrice: Decimal;

        console.log('🎯 [PROMO_DEBUG] Eligible party size calculation:', {
            requestedPartySize: totalPartySize,
            userRemainingPartySize,
            eligiblePartySize,
            isPartialApplication: eligiblePartySize < totalPartySize
        });
        
        if (eligiblePartySize < totalPartySize) {
            // Partial application - calculate buffet price only for eligible people
            if (input.isPlatterService && mealService.platters.length > 0) {
                // For platter service, apply discount to eligible platters only
                const defaultPlatter = mealService.platters[0];
                if (!defaultPlatter) {
                    return {
                        success: false,
                        error: 'No default platter found for this meal service',
                    };
                }
                const eligiblePlatterCount = Math.min(input.platterCount || 1, eligiblePartySize);
                discountBuffetPrice = new Decimal(defaultPlatter.adultNetPrice).mul(eligiblePlatterCount);
            } else {
                // For regular buffet, apply discount proportionally
                const eligibleAdults = Math.min(input.adultCount, eligiblePartySize);
                const eligibleChildren = Math.max(0, Math.min(input.childrenCount || 0, eligiblePartySize - eligibleAdults));
                
                const adultPrice = new Decimal(mealService.adultNetPrice).mul(eligibleAdults);
                let childPrice = new Decimal(0);
                
                if (eligibleChildren > 0 && mealService.isChildEnabled) {
                    childPrice = new Decimal(mealService.childNetPrice).mul(eligibleChildren);
                }
                
                discountBuffetPrice = adultPrice.add(childPrice);
            }
        } else {
            // Full application - use the already calculated buffetPrice
            discountBuffetPrice = buffetPrice;
        }

        // Note: Total usage limit and per-user usage limits are already checked above

        console.log('💸 [PROMO_DEBUG] Calculating discount on:', {
            originalBuffetPrice: buffetPrice.toString(),
            discountBuffetPrice: discountBuffetPrice.toString(),
            discountType: promoCode.discountType,
            discountValue: promoCode.discountValue.toString(),
            maximumDiscountAmount: promoCode.maximumDiscountAmount.toString()
        });

        const {
            discountAmount,
            grandTotal: discountedTotal
        } = calculateDiscount(
            promoCode,
            discountBuffetPrice
        );

        // Calculate final grand total (original buffet price minus discount amount)
        const grandTotal = buffetPrice.sub(discountAmount || new Decimal(0));

        // Calculate advance payment and balance due
        const advancePayment = grandTotal.mul(new Decimal(mealService.restaurant.advancePaymentPercentage)).div(100);
        const balanceDue = grandTotal.sub(advancePayment);

        console.log('✅ [PROMO_DEBUG] Final calculation results:', {
            originalBuffetPrice: buffetPrice.toString(),
            discountAmount: discountAmount?.toString() || '0',
            grandTotal: grandTotal.toString(),
            advancePayment: advancePayment.toString(),
            balanceDue: balanceDue.toString(),
            advancePaymentPercentage: mealService.restaurant.advancePaymentPercentage
        });

        const result: ValidatePromoCodeSuccess = {
            success: true,
            ...(discountAmount && {discountAmount}),
            grandTotal,
            advancePayment,
            balanceDue,
            promoCodeId: promoCode.id,
            ...(eligiblePartySize < totalPartySize && {
                isPartialApplication: true,
                eligiblePartySize,
                totalPartySize,
                message: `Promo code applied to ${eligiblePartySize} out of ${totalPartySize} people due to party size limit`
            })
        };

        console.log('🎉 [PROMO_DEBUG] Validation successful! Final result:', {
            success: result.success,
            discountAmount: discountAmount?.toString(),
            grandTotal: result.grandTotal.toString(),
            promoCodeId: result.promoCodeId,
            isPartialApplication: result.isPartialApplication,
            eligiblePartySize: result.eligiblePartySize,
            totalPartySize: result.totalPartySize,
            message: result.message
        });

        return result;
    } catch (error) {
        console.log('💥 [PROMO_DEBUG] Validation failed with error:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to validate promo code',
        };
    }
}

/**
 * Calculates the discount amount based on promo code type and rules
 */
function calculateDiscount(
    promoCode: {
        discountType: DiscountType;
        discountValue: Decimal;
        maximumDiscountAmount: Decimal;
    },
    buffetPrice: Decimal,
): {
    discountAmount?: Decimal;
    grandTotal: Decimal;
} {


    // Calculate subtotal (buffet price + service charge + VAT)

    let discountAmount: Decimal | undefined;

    // Calculate discount based on the subtotal
    if (promoCode.discountType === DiscountType.PERCENTAGE_OFF) {
        discountAmount = buffetPrice.mul(promoCode.discountValue).div(100);
    } else {
        discountAmount = promoCode.discountValue;
    }

    // Apply maximum discount limit
    if (discountAmount.greaterThan(promoCode.maximumDiscountAmount)) {
        discountAmount = promoCode.maximumDiscountAmount;
    }

    // Calculate final amount after discount
    const grandTotal = buffetPrice.sub(discountAmount);


    return {
        discountAmount,
        grandTotal
    };
}

// Input type for applying promo code to reservation request
type ApplyPromoCodeInput = {
    requestId: number;
    promoCodeId: number;
    discountAmount: number;
    // Track how many people the promo was applied to
    eligiblePartySize?: number;
};

// Return types for applying promo code
export type ApplyPromoCodeSuccess = {
    success: true;
};

export type ApplyPromoCodeFailure = {
    success: false;
    error: string;
};

export type ApplyPromoCodeResult = ApplyPromoCodeSuccess | ApplyPromoCodeFailure;

// Return types for recording promo code usage
export type RecordPromoCodeUsageSuccess = {
    success: true;
};

export type RecordPromoCodeUsageFailure = {
    success: false;
    error: string;
};

export type RecordPromoCodeUsageResult = RecordPromoCodeUsageSuccess | RecordPromoCodeUsageFailure;

/**
 * Applies a validated promo code to a reservation request
 */
export async function applyPromoCodeToRequest(
    prisma: PrismaClient,
    input: ApplyPromoCodeInput
): Promise<ApplyPromoCodeResult> {
    try {
        const decimalDiscountAmount = new Decimal(input.discountAmount);
        await prisma.reservationRequest.update({
            where: {id: input.requestId},
            data: {
                promoCodeId: input.promoCodeId,
                estimatedDiscountAmount: decimalDiscountAmount,
                // Store how many people the promo was applied to
                eligiblePromoPartySize: input.eligiblePartySize,
            },
        });

        return {success: true};
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to apply promo code',
        };
    }
}

/**
 * Records the usage of a promo code when a reservation is confirmed
 */
export async function recordPromoCodeUsage(
    prisma: PrismaClient,
    input: {
        promoCodeId: number;
        reservationId: number;
        customerId: number;
        requestId: number;
        originalAmount: number;
        discountAmount: number;
        partySize: number;
        isZeroAmount?: boolean;
    }
): Promise<RecordPromoCodeUsageResult> {
    try {
        const decimalDiscountAmount = new Decimal(input.discountAmount);
        const decimalOriginalAmount = new Decimal(input.originalAmount);

        // First check if usage exists
        const existingUsage = await prisma.promoCodeUsage.findFirst({
            where: {
                reservationId: input.reservationId,
                promoCodeId: input.promoCodeId
            }
        });

        if (existingUsage) {
            return { success: true }; // Already recorded, return success
        }

        // Get the eligible promo party size from the reservation request
        const reservationRequest = await prisma.reservationRequest.findUnique({
            where: { id: input.requestId },
            select: { eligiblePromoPartySize: true }
        });

        // Use eligible promo party size if available, otherwise use input party size
        const actualPartySize = reservationRequest?.eligiblePromoPartySize ?? input.partySize;

        // Prepare reservation update data
        const reservationUpdateData: any = {
            promoCodeId: input.promoCodeId,
            discountAmount: decimalDiscountAmount
        };

        // Only decrement remainingPaymentAmount for non-zero amount reservations
        // For zero amount reservations, the remainingPaymentAmount is already correct
        if (!input.isZeroAmount) {
            reservationUpdateData.remainingPaymentAmount = {
                decrement: decimalDiscountAmount
            };
        }

        await prisma.$transaction([
            // Update reservation with promo code info
            prisma.reservation.update({
                where: {id: input.reservationId},
                data: reservationUpdateData
            }),
            // Create usage record with actual party size that got the discount
            prisma.promoCodeUsage.create({
                data: {
                    reservationId: input.reservationId,
                    customerId: input.customerId,
                    promoCodeId: input.promoCodeId,
                    originalRequestId: input.requestId,
                    originalAmount: decimalOriginalAmount,
                    discountAmount: decimalDiscountAmount,
                    partySize: actualPartySize,
                    appliedBy: 'SYSTEM'
                }
            }),
            // Increment times used and party size used with actual party size
            prisma.promoCode.update({
                where: {id: input.promoCodeId},
                data: {
                    timesUsed: {increment: 1},
                    partySizeUsed: {increment: actualPartySize}
                },
            }),
        ]);

        return {success: true};
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to record promo code usage',
        };
    }
}

/**
 * Fetches a promo code ID by its code
 */
export async function getPromoCodeId(
    prisma: PrismaClient,
    code: string
): Promise<number | null> {
    try {
        const promoCode = await prisma.promoCode.findFirst({
            where: {
                code: code.toUpperCase(),
                isActive: true,
                validFrom: {lte: new Date()},
                validUntil: {gte: new Date()},
            },
            select: {
                id: true
            }
        });

        return promoCode?.id || null;
    } catch (error) {
        return null;
    }
}

export async function getReservationIdFromRequest(
    prisma: PrismaClient,
    requestId: number
): Promise<number | null> {
    try {

        // Query the ReservationRequest table and include the reservation relation
        const request = await prisma.reservationRequest.findUnique({
            where: {id: requestId},
            select: {
                reservation: {
                    select: {
                        id: true
                    }
                }
            }
        });

        if (!request?.reservation) {
            return null;
        }


        return request.reservation.id;
    } catch (error) {
        return null;
    }
}

// Input type for creating a promo code
export type CreatePromoCodeInput = {
    code: string;
    description: string;
    discountType: DiscountType;
    discountValue: Decimal;
    minimumOrderValue: Decimal;
    maximumDiscountAmount: Decimal;
    usageLimitPerUser: number;
    usageLimitTotal: number;
    partySizeLimit?: number;
    partySizeLimitPerUser?: number;
    validFrom: Date;
    validUntil: Date;
    isActive?: boolean;
    createdBy: string;
    restaurantIds?: number[]; // Optional list of restaurant IDs to map the promo code to
    customerIds?: number[]; // Optional list of customer IDs to restrict promo code usage to
};

// Return types for creating a promo code
export type CreatePromoCodeSuccess = {
    success: true;
    promoCode: {
        id: number;
        code: string;
    };
};

export type CreatePromoCodeFailure = {
    success: false;
    error: string;
};

export type CreatePromoCodeResult = CreatePromoCodeSuccess | CreatePromoCodeFailure;

/**
 * Creates a new promo code and optionally maps it to specific restaurants and/or customers
 */
export async function createPromoCode(
    prisma: PrismaClient,
    input: CreatePromoCodeInput
): Promise<CreatePromoCodeResult> {
    try {
        // Check if a promo code with the same code already exists
        const existingPromoCode = await prisma.promoCode.findUnique({
            where: { code: input.code.toUpperCase() }
        });

        if (existingPromoCode) {
            return {
                success: false,
                error: `Promo code with code ${input.code} already exists`
            };
        }

        // Create the promo code
        const promoCode = await prisma.promoCode.create({
            data: {
                code: input.code.toUpperCase(),
                description: input.description,
                discountType: input.discountType,
                discountValue: input.discountValue,
                minimumOrderValue: input.minimumOrderValue,
                maximumDiscountAmount: input.maximumDiscountAmount,
                usageLimitPerUser: input.usageLimitPerUser,
                usageLimitTotal: input.usageLimitTotal,
                partySizeLimit: input.partySizeLimit ?? 100,
                partySizeLimitPerUser: input.partySizeLimitPerUser ?? 10,
                timesUsed: 0,
                partySizeUsed: 0,
                isActive: input.isActive ?? true,
                validFrom: input.validFrom,
                validUntil: input.validUntil,
                createdBy: input.createdBy,
                updatedBy: input.createdBy
            }
        });

        // If restaurant IDs are provided, create restaurant mappings
        if (input.restaurantIds && input.restaurantIds.length > 0) {
            await prisma.promoCodeRestaurantMapping.createMany({
                data: input.restaurantIds.map(restaurantId => ({
                    promoCodeId: promoCode.id,
                    restaurantId,
                    isActive: true
                }))
            });
        }

        // If customer IDs are provided, create customer mappings
        if (input.customerIds && input.customerIds.length > 0) {
            await prisma.promoCodeCustomerMapping.createMany({
                data: input.customerIds.map(customerId => ({
                    promoCodeId: promoCode.id,
                    customerId,
                    isActive: true
                }))
            });
        }

        return {
            success: true,
            promoCode: {
                id: promoCode.id,
                code: promoCode.code
            }
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create promo code'
        };
    }
}

/**
 * Gets the reservation request details needed for promo code usage
 */
export async function getReservationRequestDetails(
    prisma: PrismaClient,
    requestId: number
  ): Promise<{
    success: boolean;
    request?: {
      promoCodeId: number | null;
      customerId: number;
      estimatedTotalAmount: Decimal;
      estimatedDiscountAmount: Decimal | null;
    };
    error?: string;
  }> {
    try {
      const request = await prisma.reservationRequest.findUnique({
        where: { id: requestId },
        select: {
          promoCodeId: true,
          customerId: true,
          estimatedTotalAmount: true,
          estimatedDiscountAmount: true,
        }
      });

      if (!request || !request.customerId) {
        return { success: false, error: 'Request or customer not found' };
      }

      return {
        success: true,
        request
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get reservation request details'
      };
    }
  }
