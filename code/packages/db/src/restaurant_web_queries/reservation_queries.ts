import { PrismaClient, MealType, RequestCreatorType } from '../../prisma/generated/prisma'
import { checkRestaurantCapacity, updateRestaurantCapacity, CapacityCheckFailure } from '../capacity-service'
import { createInitialReservationRequest } from '../reservation_flow'
import { confirmZeroAmountReservation } from '../reservation-creation-queries'
import { calculateMealPrice } from '../restaurant_meal_service'

interface CustomerDetails {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

interface ReservationDetails {
  date: string;
  mealType: MealType;
  partySize: number;
  adultCount: number;
  childrenCount: number;
  specialRequests?: string;
  dietaryRequirements?: string;
  occasion?: string;
  promoCode?: string;
  requiresAdvancePayment?: boolean;
}

interface CreateRestaurantReservationInput {
  restaurantId: number;
  customerDetails: CustomerDetails;
  reservationDetails: ReservationDetails;
}

export async function createRestaurantReservationAction(
  prisma: PrismaClient,
  input: CreateRestaurantReservationInput
) {
  try {
    // First check if we have capacity
    const capacityCheck = await checkRestaurantCapacity(
      prisma,
      input.restaurantId,
      new Date(input.reservationDetails.date),
      input.reservationDetails.mealType,
      input.reservationDetails.partySize
    );

    if (!capacityCheck.success) {
      return {
        success: false,
        error: (capacityCheck as CapacityCheckFailure).errorMessage
      };
    }

    if (!capacityCheck.hasCapacity) {
      return {
        success: false,
        error: `Sorry, only ${capacityCheck.availableSeats} seats available for ${input.reservationDetails.mealType} on ${input.reservationDetails.date}`
      };
    }

    // Calculate price
    const priceResult = await calculateMealPrice(prisma, {
      restaurantId: input.restaurantId,
      mealType: input.reservationDetails.mealType,
      isPlatterRequest: false,
      adultCount: input.reservationDetails.adultCount,
      childrenCount: input.reservationDetails.childrenCount
    });

    if (!priceResult.success) {
      return {
        success: false,
        error: priceResult.error || 'Failed to calculate price'
      };
    }

    // Create the reservation request
    const result = await createInitialReservationRequest(prisma, {
      restaurantId: input.restaurantId,
      firstName: input.customerDetails.firstName,
      lastName: input.customerDetails.lastName,
      phone: input.customerDetails.phone,
      email: input.customerDetails.email,
      date: input.reservationDetails.date,
      mealType: input.reservationDetails.mealType,
      adults: input.reservationDetails.adultCount,
      children: input.reservationDetails.childrenCount,
      estimatedTotalAmount: priceResult.subTotal || 0,
      estimatedServiceCharge: priceResult.serviceCharge || 0,
      estimatedTaxAmount: priceResult.taxAmount || 0,
      createdBy: RequestCreatorType.MERCHANT,
      specialRequests: input.reservationDetails.specialRequests,
      dietaryRequirements: input.reservationDetails.dietaryRequirements,
      occasion: input.reservationDetails.occasion,
      requiresAdvancePayment: input.reservationDetails.requiresAdvancePayment ?? true
    });

    if (!result.success) {
      return result;
    }

    // Update the capacity with the booked seats
    const capacityUpdate = await updateRestaurantCapacity(
      prisma,
      input.restaurantId,
      new Date(input.reservationDetails.date),
      input.reservationDetails.mealType,
      input.reservationDetails.partySize
    );

    if (!capacityUpdate.success) {
      return {
        success: false,
        error: 'Reservation created but failed to update capacity. Please contact support.'
      };
    }

    // If advance payment is not required, confirm the reservation immediately
    if (input.reservationDetails.requiresAdvancePayment === false) {
      const confirmResult = await confirmZeroAmountReservation(prisma, {
        requestId: result.requestId,
        reservationRequest: {
          restaurantId: input.restaurantId,
          date: input.reservationDetails.date,
          mealType: input.reservationDetails.mealType,
          partySize: input.reservationDetails.partySize,
          firstName: input.customerDetails.firstName,
          lastName: input.customerDetails.lastName,
          email: input.customerDetails.email,
          phone: input.customerDetails.phone,
          createdBy: RequestCreatorType.MERCHANT
        }
      });

      if (!confirmResult.success || !confirmResult.data) {
        return {
          success: false,
          error: 'error' in confirmResult ? confirmResult.error : 'Failed to confirm reservation'
        };
      }

      return {
        success: true,
        requestId: result.requestId,
        customerId: result.customerId,
        reservationNumber: confirmResult.data.reservationNumber,
        priceDetails: {
          subTotal: priceResult.subTotal,
          serviceCharge: priceResult.serviceCharge,
          taxAmount: priceResult.taxAmount,
          grandTotal: priceResult.grandTotal,
          advancePayment: 0,
          remainingAmount: priceResult.grandTotal
        }
      };
    }

    return {
      success: true,
      requestId: result.requestId,
      customerId: result.customerId,
      priceDetails: {
        subTotal: priceResult.subTotal,
        serviceCharge: priceResult.serviceCharge,
        taxAmount: priceResult.taxAmount,
        grandTotal: priceResult.grandTotal
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create reservation'
    };
  }
}
