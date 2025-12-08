import { PrismaClient } from '../../prisma/generated/prisma'
import {
  GetMealServiceInput,
  GetCapacityInput,
  UpsertCustomerInput,
  CreateReservationRequestInput,
  CreateReservationRequestWithPromoCodeInput,
  MealServiceResult,
  CapacityResult,
  CustomerResult,
  ManualReservationRestaurantSettings,
  ReservationRequestResult,
  QueryError,
  QueryResult,
  ConfirmNonAdvanceReservationInput,
  ReservationConfirmationResult,
  ReservationNotificationData,
  AdvancePaymentNotificationData
} from './types'
import { MealType, RequestCreatorType } from '../../prisma/generated/prisma'

function isValidMealType(mealType: string): mealType is MealType {
  return Object.values(MealType).includes(mealType as MealType)
}

export class ManualReservationQueries {
  constructor(private prisma: PrismaClient) {}

  /**
   * Pure data access: Get meal service by restaurant and meal type
   */
  async getMealService(input: GetMealServiceInput): Promise<QueryResult<MealServiceResult>> {
    try {
      if (!isValidMealType(input.mealType)) {
        return {
          success: false,
          error: {
            code: 'MEAL_SERVICE_NOT_FOUND',
            message: `Invalid meal type provided: ${input.mealType}`
          }
        }
      }

      const mealService = await this.prisma.restaurantMealService.findFirst({
        where: {
          restaurantId: input.restaurantId,
          mealType: input.mealType,
          isAvailable: true,
        },
        select: {
          id: true,
          adultNetPrice: true,
          childNetPrice: true,
          isChildEnabled: true,
          serviceChargePercentage: true,
          taxPercentage: true
        }
      })

      if (!mealService) {
        return {
          success: false,
          error: {
            code: 'MEAL_SERVICE_NOT_FOUND',
            message: `No meal service found for restaurant ${input.restaurantId} and meal type ${input.mealType}`
          }
        }
      }

      return {
        success: true,
        data: {
          id: mealService.id,
          adultNetPrice: Number(mealService.adultNetPrice),
          childNetPrice: Number(mealService.childNetPrice),
          isChildEnabled: mealService.isChildEnabled,
          serviceChargePercentage: Number(mealService.serviceChargePercentage),
          taxPercentage: Number(mealService.taxPercentage)
        }
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'getMealService')
      }
    }
  }

  /**
   * Pure data access: Get restaurant capacity for specific date and service
   */
  async getRestaurantCapacity(input: GetCapacityInput): Promise<QueryResult<CapacityResult>> {
    try {
      const capacityRecord = await this.prisma.restaurantCapacity.findFirst({
        where: {
          restaurantId: input.restaurantId,
          serviceId: input.serviceId,
          date: input.date,
          isEnabled: true // Only consider enabled capacity records
        }
      })

      if (!capacityRecord) {
        return {
          success: false,
          error: {
            code: 'CAPACITY_RECORD_NOT_FOUND',
            message: `No capacity record found for restaurant ${input.restaurantId}, service ${input.serviceId} on ${input.date.toISOString().split('T')[0]}`
          }
        }
      }

      const availableSeats = capacityRecord.totalSeats - capacityRecord.bookedSeats

      return {
        success: true,
        data: {
          id: capacityRecord.id,
          totalSeats: capacityRecord.totalSeats,
          bookedSeats: capacityRecord.bookedSeats,
          availableSeats
        }
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'getRestaurantCapacity')
      }
    }
  }

  /**
   * Pure data access: Create or update customer
   */
  async upsertCustomer(input: UpsertCustomerInput): Promise<QueryResult<CustomerResult>> {
    try {
      const customer = await this.prisma.customer.upsert({
        where: { phone: input.phone },
        update: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email || null
        },
        create: {
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          email: input.email || null
        }
      })

      return {
        success: true,
        data: customer
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'upsertCustomer')
      }
    }
  }

  /**
   * Pure data access: Create reservation request
   */
  async createReservationRequest(input: CreateReservationRequestInput): Promise<QueryResult<ReservationRequestResult>> {
    try {
      const request = await this.prisma.reservationRequest.create({
        data: {
          restaurantId: input.restaurantId,
          customerId: input.customerId,
          requestName: input.requestName,
          contactPhone: input.contactPhone,
          requestedDate: input.requestedDate,
          requestedTime: input.requestedTime,
          adultCount: input.adultCount,
          childCount: input.childCount,
          mealType: input.mealType,
          status: 'PENDING',
          specialRequests: input.specialRequests,
          dietaryRequirements: input.dietaryRequirements,
          occasion: input.occasion,
          estimatedTotalAmount: input.estimatedTotalAmount,
          estimatedServiceCharge: input.estimatedServiceCharge,
          estimatedTaxAmount: input.estimatedTaxAmount,
          createdBy: input.createdBy,
          requiresAdvancePayment: input.requiresAdvancePayment
          
        }
      })

      return {
        success: true,
        data: {
          id: request.id,
          restaurantId: request.restaurantId,
          customerId: request.customerId,
          requestName: request.requestName,
          contactPhone: request.contactPhone,
          requestedDate: request.requestedDate,
          requestedTime: request.requestedTime,
          adultCount: request.adultCount,
          childCount: request.childCount,
          mealType: request.mealType,
          status: request.status,
          specialRequests: request.specialRequests,
          dietaryRequirements: request.dietaryRequirements,
          occasion: request.occasion,
          estimatedTotalAmount: Number(request.estimatedTotalAmount),
          estimatedServiceCharge: Number(request.estimatedServiceCharge),
          estimatedTaxAmount: Number(request.estimatedTaxAmount),
          createdBy: request.createdBy,
          requiresAdvancePayment: request.requiresAdvancePayment,
          createdAt: request.createdAt,
          updatedAt: request.updatedAt
        }
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'createReservationRequest')
      }
    }
  }

  /**
   * Pure data access: Update capacity booked seats
   */
  async updateCapacityBookedSeats(capacityId: number, newBookedSeats: number): Promise<QueryResult<void>> {
    try {
      await this.prisma.restaurantCapacity.update({
        where: { id: capacityId },
        data: { bookedSeats: newBookedSeats }
      })

      return {
        success: true,
        data: undefined
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'updateCapacityBookedSeats')
      }
    }
  }

  /**
   * Pure data access: Get meal service by ID
   */
  async getMealServiceById(serviceId: number): Promise<QueryResult<MealServiceResult>> {
    try {
      const mealService = await this.prisma.restaurantMealService.findUnique({
        where: { id: serviceId },
        select: {
          id: true,
          adultNetPrice: true,
          childNetPrice: true,
          isChildEnabled: true,
          serviceChargePercentage: true,
          taxPercentage: true
        }
      })

      if (!mealService) {
        return {
          success: false,
          error: {
            code: 'MEAL_SERVICE_NOT_FOUND',
            message: `No meal service found with ID ${serviceId}`
          }
        }
      }

      return {
        success: true,
        data: {
          id: mealService.id,
          adultNetPrice: Number(mealService.adultNetPrice),
          childNetPrice: Number(mealService.childNetPrice),
          isChildEnabled: mealService.isChildEnabled,
          serviceChargePercentage: Number(mealService.serviceChargePercentage),
          taxPercentage: Number(mealService.taxPercentage)
        }
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'getMealServiceById')
      }
    }
  }

  /**
   * Pure data access: Get customer by phone
   */
  async getCustomerByPhone(phone: string): Promise<QueryResult<CustomerResult>> {
    try {
      const customer = await this.prisma.customer.findUnique({
        where: { phone }
      })

      if (!customer) {
        return {
          success: false,
          error: {
            code: 'CUSTOMER_NOT_FOUND',
            message: `No customer found with phone ${phone}`
          }
        }
      }

      return {
        success: true,
        data: customer
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'getCustomerByPhone')
      }
    }
  }

  /**
   * Pure data access: Get restaurant settings
   */
  async getRestaurantSettings(restaurantId: number): Promise<QueryResult<ManualReservationRestaurantSettings>> {
    try {
      const restaurant = await this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: {
          id: true,
          advancePaymentPercentage: true
        }
      })

      if (!restaurant) {
        return {
          success: false,
          error: {
            code: 'RESTAURANT_NOT_FOUND',
            message: `Restaurant not found with id ${restaurantId}`
          }
        }
      }

      return {
        success: true,
        data: {
          id: restaurant.id,
          advancePaymentPercentage: Number(restaurant.advancePaymentPercentage)
        }
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to fetch restaurant settings',
          details: error
        }
      }
    }
  }

  /**
   * Pure data access: Get capacity by restaurant and date (for finding service ID)
   */
  async getCapacityByRestaurantAndDate(restaurantId: number, date: Date, mealType: string): Promise<QueryResult<CapacityResult & { serviceId: number }>> {
    try {
      if (!isValidMealType(mealType)) {
        return {
          success: false,
          error: {
            code: 'MEAL_SERVICE_NOT_FOUND',
            message: `Invalid meal type provided: ${mealType}`
          }
        }
      }

      // First find the meal service
      const mealService = await this.prisma.restaurantMealService.findFirst({
        where: {
          restaurantId,
          mealType: mealType,
          isAvailable: true
        }
      })

      if (!mealService) {
        return {
          success: false,
          error: {
            code: 'MEAL_SERVICE_NOT_FOUND',
            message: `No meal service found for restaurant ${restaurantId} and meal type ${mealType}`
          }
        }
      }

      // Then find the capacity record
      const capacityRecord = await this.prisma.restaurantCapacity.findFirst({
        where: {
          restaurantId,
          serviceId: mealService.id,
          date: date,
          isEnabled: true // Only consider enabled capacity records
        }
      })

      if (!capacityRecord) {
        return {
          success: false,
          error: {
            code: 'CAPACITY_RECORD_NOT_FOUND',
            message: `No capacity record found for restaurant ${restaurantId} on ${date.toISOString().split('T')[0]}`
          }
        }
      }

      const availableSeats = capacityRecord.totalSeats - capacityRecord.bookedSeats

      return {
        success: true,
        data: {
          id: capacityRecord.id,
          totalSeats: capacityRecord.totalSeats,
          bookedSeats: capacityRecord.bookedSeats,
          availableSeats,
          serviceId: mealService.id
        }
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'getCapacityByRestaurantAndDate')
      }
    }
  }

  /**
   * Pure data access: Create reservation request with promo code support
   */
  async createReservationRequestWithPromoCode(input: CreateReservationRequestWithPromoCodeInput): Promise<QueryResult<ReservationRequestResult>> {
    try {
      const request = await this.prisma.reservationRequest.create({
        data: {
          restaurantId: input.restaurantId,
          customerId: input.customerId,
          requestName: input.requestName,
          contactPhone: input.contactPhone,
          requestedDate: input.requestedDate,
          requestedTime: input.requestedTime,
          adultCount: input.adultCount,
          childCount: input.childCount,
          mealType: input.mealType,
          status: 'PENDING',
          specialRequests: input.specialRequests,
          dietaryRequirements: input.dietaryRequirements,
          occasion: input.occasion,
          estimatedTotalAmount: input.estimatedTotalAmount,
          estimatedServiceCharge: input.estimatedServiceCharge,
          estimatedTaxAmount: input.estimatedTaxAmount,
          createdBy: input.createdBy,
          requiresAdvancePayment: input.requiresAdvancePayment,
          reservationType: input.reservationType || 'BUFFET_ONLY', // Default to BUFFET_ONLY for backward compatibility
          promoCodeId: input.promoCodeId,
          estimatedDiscountAmount: input.estimatedDiscountAmount || 0,
          eligiblePromoPartySize: input.eligiblePromoPartySize
        }
      })

      return {
        success: true,
        data: {
          id: request.id,
          restaurantId: request.restaurantId,
          customerId: request.customerId,
          requestName: request.requestName,
          contactPhone: request.contactPhone,
          requestedDate: request.requestedDate,
          requestedTime: request.requestedTime,
          adultCount: request.adultCount,
          childCount: request.childCount,
          mealType: request.mealType,
          status: request.status,
          specialRequests: request.specialRequests,
          dietaryRequirements: request.dietaryRequirements,
          occasion: request.occasion,
          estimatedTotalAmount: Number(request.estimatedTotalAmount),
          estimatedServiceCharge: Number(request.estimatedServiceCharge),
          estimatedTaxAmount: Number(request.estimatedTaxAmount),
          createdBy: request.createdBy,
          requiresAdvancePayment: request.requiresAdvancePayment,
          createdAt: request.createdAt,
          updatedAt: request.updatedAt
        }
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'createReservationRequestWithPromoCode')
      }
    }
  }

  /**
   * Pure data access: Confirm non-advance payment reservation
   * Creates reservation record from existing reservation request
   */
  async confirmNonAdvanceReservation(input: ConfirmNonAdvanceReservationInput): Promise<QueryResult<ReservationConfirmationResult>> {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // 1. Get reservation request with customer data
        const request = await tx.reservationRequest.findUnique({
          where: { id: input.requestId },
          include: { customer: true }
        })

        if (!request) {
          throw new Error(`Reservation request not found with ID ${input.requestId}`)
        }

        // 2. Check for existing reservation (idempotency)
        const existingReservation = await tx.reservation.findUnique({
          where: { requestId: input.requestId }
        })

        if (existingReservation) {
          return {
            id: existingReservation.id,
            reservationNumber: existingReservation.reservationNumber,
            status: existingReservation.status
          }
        }

        // 3. Generate reservation number (following existing pattern)
        const reservationNumber = this.generateReservationNumber(
          request.mealType,
          request.requestedDate,
          input.requestId
        )

        // 4. Create reservation record
        const newReservation = await tx.reservation.create({
          data: {
            reservationNumber,
            restaurantId: request.restaurantId,
            customerId: request.customerId,
            requestId: request.id,
            reservationName: request.requestName,
            contactPhone: request.contactPhone,
            reservationDate: request.requestedDate,
            reservationTime: request.requestedTime,
            adultCount: request.adultCount,
            childCount: request.childCount,
            mealType: request.mealType,
            totalAmount: request.estimatedTotalAmount,
            serviceCharge: request.estimatedServiceCharge,
            taxAmount: request.estimatedTaxAmount,
            advancePaymentAmount: 0, // Non-advance payment = 0
            remainingPaymentAmount: request.estimatedTotalAmount,
            status: 'CONFIRMED',
            createdBy: RequestCreatorType.MERCHANT,
            promoCodeId: request.promoCodeId,
            discountAmount: request.estimatedDiscountAmount || 0
          }
        })

        // 5. Create financial data record
        await tx.reservationFinancialData.create({
          data: {
            reservationId: newReservation.id,
            netBuffetPrice: Number(request.estimatedTotalAmount) - Number(request.estimatedServiceCharge) - Number(request.estimatedTaxAmount),
            taxAmount: Number(request.estimatedTaxAmount),
            serviceCharge: Number(request.estimatedServiceCharge),
            totalBeforeDiscount: Number(request.estimatedTotalAmount) + Number(request.estimatedDiscountAmount || 0),
            discount: Number(request.estimatedDiscountAmount || 0),
            totalAfterDiscount: Number(request.estimatedTotalAmount),
            advancePayment: 0,
            balanceDue: Number(request.estimatedTotalAmount),
            isPaid: false
          }
        })

        // 6. Update reservation request status
        await tx.reservationRequest.update({
          where: { id: input.requestId },
          data: {
            status: 'COMPLETED',
            processingCompletedAt: new Date()
          }
        })

        return {
          id: newReservation.id,
          reservationNumber: newReservation.reservationNumber,
          status: newReservation.status
        }
      })

      return {
        success: true,
        data: result
      }
    } catch (error) {
      // Handle specific business logic errors differently
      if (error instanceof Error && error.message.includes('Reservation request not found')) {
        return {
          success: false,
          error: {
            code: 'RECORD_NOT_FOUND',
            message: error.message,
            details: error
          }
        }
      }
      
      return {
        success: false,
        error: this.handleDatabaseError(error, 'confirmNonAdvanceReservation')
      }
    }
  }

  /**
   * Pure data access: Get reservation details for notifications
   * Fetches reservation with customer and restaurant information
   */
  async getReservationForNotifications(reservationId: number): Promise<QueryResult<ReservationNotificationData>> {
    try {
      const reservation = await this.prisma.reservation.findUnique({
        where: { id: reservationId },
        include: {
          customer: {
            select: {
              firstName: true,
              lastName: true,
              phone: true,
              email: true
            }
          },
          restaurant: {
            select: {
              name: true,
              phone: true,
              business: {
                select: {
                  name: true,
                  phone: true,
                  email: true
                }
              }
            }
          }
        }
      })

      if (!reservation) {
        return {
          success: false,
          error: {
            code: 'RECORD_NOT_FOUND',
            message: `Reservation not found with ID ${reservationId}`
          }
        }
      }

      if (!reservation.customer) {
        return {
          success: false,
          error: {
            code: 'CUSTOMER_NOT_FOUND',
            message: `Customer data not found for reservation ${reservationId}`
          }
        }
      }

      if (!reservation.restaurant) {
        return {
          success: false,
          error: {
            code: 'RESTAURANT_NOT_FOUND',
            message: `Restaurant data not found for reservation ${reservationId}`
          }
        }
      }

      // Fetch meal service and platter information
      const mealService = await this.prisma.restaurantMealService.findFirst({
        where: {
          restaurantId: reservation.restaurantId,
          mealType: reservation.mealType,
          isAvailable: true,
        },
        include: {
          platters: {
            where: {
              isActive: true,
            },
            select: {
              id: true,
              platterName: true,
              headCount: true,
            },
          },
        },
      });

      // Determine if this is a platter-based reservation
      const isPlatterBasedReservation = (mealService?.platters?.length ?? 0) > 0;
      const totalGuests = reservation.adultCount + reservation.childCount;
      const platterCount = isPlatterBasedReservation ? 
        Math.ceil(totalGuests / (mealService?.platters?.[0]?.headCount || 1)) : undefined;
      const paxPerPlatter = isPlatterBasedReservation && mealService?.platters?.[0]?.headCount ? 
        mealService.platters[0].headCount : undefined;

      return {
        success: true,
        data: {
          reservationId: reservation.id,
          reservationNumber: reservation.reservationNumber,
          reservationDate: reservation.reservationDate,
          mealType: reservation.mealType,
          adultCount: reservation.adultCount,
          childCount: reservation.childCount,
          totalAmount: Number(reservation.totalAmount),
          restaurantId: reservation.restaurantId,
          customer: {
            firstName: reservation.customer.firstName,
            lastName: reservation.customer.lastName,
            phone: reservation.customer.phone,
            email: reservation.customer.email
          },
          restaurant: {
            name: reservation.restaurant.name,
            phone: reservation.restaurant.phone,
            business: reservation.restaurant.business
          },
          // Include platter information
          isPlatterBasedReservation,
          platterCount,
          paxPerPlatter,
        }
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'getReservationForNotifications')
      }
    }
  }

  /**
   * Pure data access: Get reservation details by reservation number for advance payment notifications
   * Fetches reservation with customer, restaurant and pricing information
   */
  async getReservationByNumberForNotifications(reservationNumber: string): Promise<QueryResult<AdvancePaymentNotificationData>> {
    try {
      const reservation = await this.prisma.reservation.findUnique({
        where: { reservationNumber: reservationNumber },
        include: {
          customer: {
            select: {
              firstName: true,
              lastName: true,
              phone: true,
              email: true
            }
          },
          restaurant: {
            select: {
              name: true,
              phone: true,
              business: {
                select: {
                  name: true,
                  phone: true,
                  email: true
                }
              }
            }
          }
        }
      })

      if (!reservation) {
        return {
          success: false,
          error: {
            code: 'RECORD_NOT_FOUND',
            message: `Reservation not found with number ${reservationNumber}`
          }
        }
      }

      if (!reservation.customer) {
        return {
          success: false,
          error: {
            code: 'CUSTOMER_NOT_FOUND',
            message: `Customer data not found for reservation ${reservationNumber}`
          }
        }
      }

      if (!reservation.restaurant) {
        return {
          success: false,
          error: {
            code: 'RESTAURANT_NOT_FOUND',
            message: `Restaurant data not found for reservation ${reservationNumber}`
          }
        }
      }

      // Fetch meal service and platter information
      const mealService = await this.prisma.restaurantMealService.findFirst({
        where: {
          restaurantId: reservation.restaurantId,
          mealType: reservation.mealType,
          isAvailable: true,
        },
        include: {
          platters: {
            where: {
              isActive: true,
            },
            select: {
              id: true,
              platterName: true,
              headCount: true,
            },
          },
        },
      });

      // Determine if this is a platter-based reservation
      const isPlatterBasedReservation = (mealService?.platters?.length ?? 0) > 0;
      const totalGuests = reservation.adultCount + reservation.childCount;
      const platterCount = isPlatterBasedReservation ? 
        Math.ceil(totalGuests / (mealService?.platters?.[0]?.headCount || 1)) : undefined;
      const paxPerPlatter = isPlatterBasedReservation && mealService?.platters?.[0]?.headCount ? 
        mealService.platters[0].headCount : undefined;

      return {
        success: true,
        data: {
          reservationId: reservation.id,
          reservationNumber: reservation.reservationNumber,
          reservationDate: reservation.reservationDate,
          mealType: reservation.mealType,
          adultCount: reservation.adultCount,
          childCount: reservation.childCount,
          totalAmount: Number(reservation.totalAmount),
          advancePaymentAmount: Number(reservation.advancePaymentAmount || 0),
          remainingAmount: Number(reservation.remainingPaymentAmount || 0),
          restaurantId: reservation.restaurantId,
          customer: {
            firstName: reservation.customer.firstName,
            lastName: reservation.customer.lastName,
            phone: reservation.customer.phone,
            email: reservation.customer.email
          },
          restaurant: {
            name: reservation.restaurant.name,
            phone: reservation.restaurant.phone,
            business: reservation.restaurant.business
          },
          // Include platter information
          isPlatterBasedReservation,
          platterCount,
          paxPerPlatter,
        }
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'getReservationByNumberForNotifications')
      }
    }
  }

  /**
   * Generate reservation number (consistent with existing system)
   */
  private generateReservationNumber(mealType: string, date: Date, requestId: number): string {
    const mealTypePrefix = mealType.charAt(0).toUpperCase()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const dateString = `${month}${day}`
    const requestIdString = String(requestId).padStart(4, '0').slice(-4)
    return `${mealTypePrefix}${dateString}-${requestIdString}`
  }

  /**
   * Error handling utility
   */
  private handleDatabaseError(error: any, operation: string): QueryError {
    const queryError: QueryError = {
      code: 'DATABASE_ERROR',
      message: `Database operation failed: ${operation}`,
      details: error
    }

    // Handle specific Prisma errors
    if (error.code === 'P2002') {
      queryError.code = 'UNIQUE_CONSTRAINT_VIOLATION'
      
      // Check if it's a unique constraint violation on email or phone
      if (error.meta?.target?.includes('email')) {
        queryError.message = 'Enter another email address to proceed'
      } else if (error.meta?.target?.includes('phone')) {
        queryError.message = 'This phone number is already registered. Please use a different phone number.'
      } else {
      queryError.message = 'Unique constraint violation'
      }
    } else if (error.code === 'P2025') {
      queryError.code = 'RECORD_NOT_FOUND'
      queryError.message = 'Record not found'
    } else if (error.code === 'P2003') {
      queryError.code = 'FOREIGN_KEY_CONSTRAINT_VIOLATION'
      queryError.message = 'Foreign key constraint violation'
    } else if (error.code === 'P2014') {
      queryError.code = 'INVALID_ID'
      queryError.message = 'Invalid ID provided'
    }

    return queryError
  }
} 