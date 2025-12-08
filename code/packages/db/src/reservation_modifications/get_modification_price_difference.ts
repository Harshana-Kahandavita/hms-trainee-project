import { PrismaClient } from '../../prisma/generated/prisma';
import Decimal from 'decimal.js';
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

/**
 * Interface for the modification price calculation request
 */
export interface ModificationPriceRequest {
  reservationId: number;
  newDate?: Date;
  newAdultCount?: number;
  newChildCount?: number;
  newMealType?: string;
  isPlatterService?: boolean;
  paxPerPlatter?: number;
}

/**
 * Interface for the modification price calculation response
 */
export interface ModificationPriceResponse {
  success: boolean;
  originalAmount?: Decimal;
  newAmount?: Decimal;
  priceDifference?: Decimal;
  additionalPaymentRequired?: boolean;
  refundEligible?: boolean;
  newBalanceDue?: Decimal;
  newAdvancePaymentAmount?: Decimal;
  calculatedNewAdvancePayment?: Decimal;
  newRemainingPaymentAmount?: Decimal;
  errorMessage?: string;
  promoCodeValidation?: {
    isValid: boolean;
    errorMessage?: string;
    discountAmount?: Decimal;
  };
  originalDiscountAmount?: Decimal;
  newDiscountAmount?: Decimal;
  netBuffetPrice?: Decimal;
  grandTotal?: Decimal;
  advancePayment?: Decimal;
  balanceDue?: Decimal;
}

/**
 * Calculates the price difference for a potential reservation modification
 * This is a read-only operation that doesn't modify any data
 */
export async function getModificationPriceDifference(
  prisma: PrismaClient,
  request: ModificationPriceRequest
): Promise<ModificationPriceResponse> {
  try {
    // Get the original reservation to access all needed details
    const reservation = await prisma.reservation.findUnique({
      where: { id: request.reservationId },
      include: {
        promoCode: true
      }
    });


    console.log('db packages === reservation', reservation);
    console.log('db packages reservation.discountAmount', reservation?.discountAmount);

    if (!reservation) {
      return {
        success: false,
        errorMessage: 'Reservation not found'
      };
    }

    // Initialize prices with original values
    const originalAmount = reservation.totalAmount;
    let newAmount = reservation.totalAmount;

    const originalDiscountAmount = reservation.discountAmount || new Decimal(0);
    console.log('db packages === originalDiscountAmount', originalDiscountAmount);
    let newDiscountAmount = new Decimal(0);
    let netBuffetPrice = new Decimal(0);
    let grandTotal = new Decimal(0);
    let advancePayment = new Decimal(0);
    let balanceDue = new Decimal(0);
    let newAdvancePaymentAmount = new Decimal(0);
    let newRemainingPaymentAmount = new Decimal(0);
    let calculatedNewAdvancePayment = new Decimal(0);
    let promoCodeValidation = undefined;

    // Check if party size is changing
    const newAdultCount = request.newAdultCount ?? reservation.adultCount;
    const newChildCount = request.newChildCount ?? reservation.childCount;
    const isPartySizeChanged = request.newAdultCount !== undefined || request.newChildCount !== undefined;

    // Check if meal type is changing
    const newMealType = request.newMealType ? request.newMealType as any : reservation.mealType;
    const isMealTypeChanged = request.newMealType !== undefined;

    // Check if date is changing
    const isDateChanged = request.newDate !== undefined;

    // Recalculate price if needed
    if (isPartySizeChanged || isMealTypeChanged || isDateChanged) {
      // Get meal service details for pricing
      const mealService = await prisma.restaurantMealService.findFirst({
        where: {
          restaurantId: reservation.restaurantId,
          mealType: newMealType,
          isAvailable: true
        }
      });

      if (!mealService) {
        return {
          success: false,
          errorMessage: 'Meal service not available for the requested type'
        };
      }

      // Calculate new base price
      let baseBuffetPrice;
      if (request.isPlatterService) {
        // For platter services, newAdultCount represents the number of platters
        const platterCount = newAdultCount;
        // Calculate total price based on platter count
        baseBuffetPrice = new Decimal(mealService.adultNetPrice).mul(platterCount);
      } else {
        // For regular services, calculate based on per-person price
        baseBuffetPrice = new Decimal(mealService.adultNetPrice).mul(newAdultCount);
      let childPrice = new Decimal(0);
      if (newChildCount > 0 && mealService.childNetPrice) {
        childPrice = new Decimal(mealService.childNetPrice).mul(newChildCount);
      }
        baseBuffetPrice = baseBuffetPrice.add(childPrice);
      }
      netBuffetPrice = baseBuffetPrice;
      newAmount = netBuffetPrice;

      console.log('netBuffetPrice', netBuffetPrice);
      console.log('newAmount', newAmount);

      // Calculate increased pax (if any)
      const increasedPax = Math.max((newAdultCount + newChildCount) - (reservation.adultCount + reservation.childCount), 0);
     

      // If there's a promo code and any modification occurred, validate it
      if (reservation.promoCode && (isPartySizeChanged || isMealTypeChanged || isDateChanged)) {
        const promoValidationResult = await validatePromoCode(prisma, {
          code: reservation.promoCode.code,
          restaurantId: reservation.restaurantId,
          mealType: newMealType,
          adultCount: newAdultCount,
          childrenCount: newChildCount,
          customerId: reservation.customerId,
          subTotal: Number(netBuffetPrice.toString())
        });

        console.log('promoValidationResult', promoValidationResult);

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
      advancePayment = grandTotal.mul(advancePaymentPercentage).div(100);
      balanceDue = grandTotal.sub(advancePayment);
      calculatedNewAdvancePayment = advancePayment;
      // Get original advance payment
      const originalAdvancePayment = reservation.advancePaymentAmount || new Decimal(0);
      // Compare with original advance payment to determine additional payment needed
      if (advancePayment.greaterThan(originalAdvancePayment)) {
        newAdvancePaymentAmount = advancePayment.sub(originalAdvancePayment);
        const totalAdvancePayment = originalAdvancePayment.add(newAdvancePaymentAmount);
        newRemainingPaymentAmount = grandTotal.sub(totalAdvancePayment);
      } else {
        newAdvancePaymentAmount = new Decimal(0);
        newRemainingPaymentAmount = grandTotal.sub(originalAdvancePayment);
        if (newRemainingPaymentAmount.lessThan(0)) {
          newRemainingPaymentAmount = new Decimal(0);
        }
      }
    }

    // Calculate the price difference
    const priceDifference = newAmount.sub(originalAmount);

    // Determine if additional payment or refund is needed
    let requiresAdditionalPayment = newAdvancePaymentAmount.gt(0);
    if (promoCodeValidation && !promoCodeValidation.isValid) {
      requiresAdditionalPayment = false;
    }
    const requiresRefund = priceDifference.lt(0) && newAdvancePaymentAmount.eq(0);

    return {
      success: true,
      originalAmount,
      newAmount,
      priceDifference,
      additionalPaymentRequired: requiresAdditionalPayment,
      refundEligible: requiresRefund,
      newBalanceDue: isPartySizeChanged || isMealTypeChanged || isDateChanged ? balanceDue : undefined,
      newAdvancePaymentAmount: isPartySizeChanged || isMealTypeChanged || isDateChanged ? newAdvancePaymentAmount : undefined,
      calculatedNewAdvancePayment: isPartySizeChanged || isMealTypeChanged || isDateChanged ? calculatedNewAdvancePayment : undefined,
      newRemainingPaymentAmount: isPartySizeChanged || isMealTypeChanged || isDateChanged ? newRemainingPaymentAmount : undefined,
      promoCodeValidation,
      originalDiscountAmount,
      newDiscountAmount,
      netBuffetPrice,
      grandTotal,
      advancePayment,
      balanceDue
    };
  } catch (error) {
    console.error('Error calculating modification price difference:', error);
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error calculating price difference'
    };
  }
}

/**
 * Checks if a reservation is within the full refund window
 */
export async function isWithinFullRefundWindow(
  prisma: PrismaClient,
  reservationId: number
): Promise<boolean> {
  try {
    // Get the reservation and its meal type
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: {
        reservationDate: true,
        reservationTime: true,
        mealType: true,
        restaurantId: true
      }
    });
    console.log('reservation', reservation);

    if (!reservation) {
      return false;
    }

    // Get the restaurant's refund policy and meal service for this meal type
    const [refundPolicy, mealService] = await Promise.all([
      prisma.restaurantRefundPolicy.findUnique({
        where: {
          restaurantId_mealType: {
            restaurantId: reservation.restaurantId,
            mealType: reservation.mealType
          }
        }
      }),
      prisma.restaurantMealService.findFirst({
        where: {
          restaurantId: reservation.restaurantId,
          mealType: reservation.mealType,
          isAvailable: true
        },
        select: {
          serviceStartTime: true
        }
      })
    ]);

    console.log('refundPolicy', refundPolicy);
    console.log('mealService', mealService);

    if (!refundPolicy || !mealService) {
      return false;
    }

    console.log('cancellation policy and meal service found');

    // Create a new date object for the reservation date
    const reservationDate = new Date(reservation.reservationDate);
    
    // Get hours and minutes from the meal service start time
    const mealStartTime = new Date(mealService.serviceStartTime);
    const hours = mealStartTime.getHours();
    const minutes = mealStartTime.getMinutes();
    
    // Set the time on the reservation date
    const reservationDateTime = new Date(reservationDate);
    reservationDateTime.setHours(hours, minutes, 0, 0);

    // Calculate cutoff time by subtracting the full refund window
    const cutoffTime = new Date(reservationDateTime);
    cutoffTime.setMinutes(cutoffTime.getMinutes() - refundPolicy.fullRefundBeforeMinutes);

    // Get current time
    const currentTime = getCurrentTime();

    // Convert both times to ISO format for comparison
    const isoCutoffTime = toISOTime(cutoffTime);
    const isoCurrentTime = toISOTime(currentTime);

    console.log('reservationDate', reservationDate);
    console.log('mealStartTime', mealStartTime);
    console.log('hours', hours);
    console.log('minutes', minutes);
    console.log('reservationDateTime', reservationDateTime);
    console.log('cutoffTime', cutoffTime);
    console.log('isoCutoffTime', isoCutoffTime);
    console.log('Current time', isoCurrentTime);
    console.log('Is before cutoff', isoCurrentTime < isoCutoffTime);

    // Check if current time is before cutoff
    return isoCurrentTime < isoCutoffTime;
  } catch (error) {
    console.error('Error checking refund window:', error);
    return false;
  }
} 