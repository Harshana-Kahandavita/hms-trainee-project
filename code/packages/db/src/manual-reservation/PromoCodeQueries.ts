import { PrismaClient } from '../../prisma/generated/prisma'
import {
  PromoCodeValidationData,
  PromoCodeUsageRecord,
  PromoCodeRestaurantMappingRecord,
  PromoCodeCustomerMappingRecord,
  RecordPromoCodeUsageInput,
  QueryError,
  QueryResult
} from './types'

export class PromoCodeQueries {
  constructor(private prisma: PrismaClient) {}

  /**
   * Pure data access: Get promo code with all validation data needed for manual reservation
   */
  async getPromoCodeWithValidationData(
    code: string, 
    restaurantId: number, 
    customerId?: number
  ): Promise<QueryResult<PromoCodeValidationData>> {
    try {
      const promoCode = await this.prisma.promoCode.findFirst({
        where: {
          code: code.toUpperCase(),
          isActive: true,
          isDeleted: false,
          validFrom: { lte: new Date() },
          validUntil: { gte: new Date() }
        },
        include: {
          restaurantMappings: {
            where: { 
              restaurantId,
              isActive: true 
            }
          },
          customerMappings: customerId ? {
            where: { 
              customerId,
              isActive: true 
            }
          } : false,
          usageRecords: customerId ? {
            where: { customerId }
          } : false
        }
      })

      if (!promoCode) {
        return {
          success: false,
          error: {
            code: 'PROMO_CODE_NOT_FOUND',
            message: 'Promo code not found or expired'
          }
        }
      }

      // Get customer reservation count if customer provided
      let customerReservationCount = 0
      if (customerId) {
        customerReservationCount = await this.prisma.reservation.count({
          where: {
            customerId,
            status: { notIn: ['CANCELLED', 'REJECTED'] }
          }
        })
      }

      // Map to our interface
      const validationData: PromoCodeValidationData = {
        id: promoCode.id,
        code: promoCode.code,
        description: promoCode.description,
        discountType: promoCode.discountType,
        discountValue: Number(promoCode.discountValue),
        minimumOrderValue: Number(promoCode.minimumOrderValue),
        maximumDiscountAmount: Number(promoCode.maximumDiscountAmount),
        usageLimitPerUser: promoCode.usageLimitPerUser,
        usageLimitTotal: promoCode.usageLimitTotal,
        timesUsed: promoCode.timesUsed,
        partySizeLimit: promoCode.partySizeLimit,
        partySizeLimitPerUser: promoCode.partySizeLimitPerUser,
        partySizeUsed: promoCode.partySizeUsed,
        buffetTypes: promoCode.buffetTypes,
        firstOrderOnly: promoCode.firstOrderOnly,
        campaignType: promoCode.campaignType,
        isActive: promoCode.isActive,
        isDeleted: promoCode.isDeleted,
        validFrom: promoCode.validFrom,
        validUntil: promoCode.validUntil,
        customerReservationCount,
        isRestaurantEligible: promoCode.restaurantMappings.length > 0 || promoCode.campaignType === 'PLATFORM',
        isCustomerEligible: !customerId || promoCode.customerMappings.length === 0 || promoCode.customerMappings.length > 0,
        usageRecords: (promoCode.usageRecords || []).map(record => ({
          id: record.id,
          promoCodeId: record.promoCodeId,
          customerId: record.customerId,
          reservationId: record.reservationId,
          originalRequestId: record.originalRequestId,
          originalAmount: Number(record.originalAmount),
          discountAmount: Number(record.discountAmount),
          partySize: record.partySize,
          appliedBy: record.appliedBy,
          appliedAt: record.appliedAt
        })),
        restaurantMappings: promoCode.restaurantMappings.map(mapping => ({
          id: mapping.id,
          promoCodeId: mapping.promoCodeId,
          restaurantId: mapping.restaurantId,
          isActive: mapping.isActive
        })),
        customerMappings: (promoCode.customerMappings || []).map(mapping => ({
          id: mapping.id,
          promoCodeId: mapping.promoCodeId,
          customerId: mapping.customerId,
          isActive: mapping.isActive
        }))
      }

      return {
        success: true,
        data: validationData
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'getPromoCodeWithValidationData')
      }
    }
  }

  /**
   * Pure data access: Record promo code usage
   */
  async recordPromoCodeUsage(input: RecordPromoCodeUsageInput): Promise<QueryResult<void>> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Step 1: Update the reservation to record the discount
        await tx.reservation.update({
          where: { id: input.reservationId },
          data: {
            promoCodeId: input.promoCodeId,
            discountAmount: input.discountAmount,
            // Adjust the remaining payment amount if necessary
            remainingPaymentAmount: {
              decrement: input.discountAmount
            }
          }
        })

        // Step 2: Create the promo code usage record
        await tx.promoCodeUsage.create({
          data: {
            promoCodeId: input.promoCodeId,
            customerId: input.customerId,
            reservationId: input.reservationId,
            originalRequestId: input.requestId,
            originalAmount: input.originalAmount,
            discountAmount: input.discountAmount,
            partySize: input.partySize,
            appliedBy: input.appliedBy
          }
        })

        // Step 3: Update promo code counters
        await tx.promoCode.update({
          where: { id: input.promoCodeId },
          data: {
            timesUsed: { increment: 1 },
            partySizeUsed: { increment: input.partySize }
          }
        })
      })

      return { success: true, data: undefined }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'recordPromoCodeUsage')
      }
    }
  }

  /**
   * Pure data access: Get promo code usage by customer
   */
  async getPromoCodeUsageByCustomer(
    promoCodeId: number, 
    customerId: number
  ): Promise<QueryResult<PromoCodeUsageRecord[]>> {
    try {
      const usageRecords = await this.prisma.promoCodeUsage.findMany({
        where: {
          promoCodeId,
          customerId
        },
        orderBy: {
          appliedAt: 'desc'
        }
      })

      const mappedRecords: PromoCodeUsageRecord[] = usageRecords.map(record => ({
        id: record.id,
        promoCodeId: record.promoCodeId,
        customerId: record.customerId,
        reservationId: record.reservationId,
        originalRequestId: record.originalRequestId,
        originalAmount: Number(record.originalAmount),
        discountAmount: Number(record.discountAmount),
        partySize: record.partySize,
        appliedBy: record.appliedBy,
        appliedAt: record.appliedAt
      }))

      return {
        success: true,
        data: mappedRecords
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'getPromoCodeUsageByCustomer')
      }
    }
  }

  /**
   * Pure data access: Get customer's total reservation count
   */
  async getCustomerReservationCount(customerId: number): Promise<QueryResult<number>> {
    try {
      const count = await this.prisma.reservation.count({
        where: {
          customerId,
          status: { notIn: ['CANCELLED', 'REJECTED'] }
        }
      })

      return {
        success: true,
        data: count
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'getCustomerReservationCount')
      }
    }
  }

  /**
   * Pure data access: Get restaurant mappings for promo code
   */
  async getPromoCodeRestaurantMappings(promoCodeId: number): Promise<QueryResult<PromoCodeRestaurantMappingRecord[]>> {
    try {
      const mappings = await this.prisma.promoCodeRestaurantMapping.findMany({
        where: {
          promoCodeId,
          isActive: true
        }
      })

      const mappedRecords: PromoCodeRestaurantMappingRecord[] = mappings.map(mapping => ({
        id: mapping.id,
        promoCodeId: mapping.promoCodeId,
        restaurantId: mapping.restaurantId,
        isActive: mapping.isActive
      }))

      return {
        success: true,
        data: mappedRecords
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'getPromoCodeRestaurantMappings')
      }
    }
  }

  /**
   * Pure data access: Get customer mappings for promo code
   */
  async getPromoCodeCustomerMappings(promoCodeId: number): Promise<QueryResult<PromoCodeCustomerMappingRecord[]>> {
    try {
      const mappings = await this.prisma.promoCodeCustomerMapping.findMany({
        where: {
          promoCodeId,
          isActive: true
        }
      })

      const mappedRecords: PromoCodeCustomerMappingRecord[] = mappings.map(mapping => ({
        id: mapping.id,
        promoCodeId: mapping.promoCodeId,
        customerId: mapping.customerId,
        isActive: mapping.isActive
      }))

      return {
        success: true,
        data: mappedRecords
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'getPromoCodeCustomerMappings')
      }
    }
  }

  /**
   * Error handling helper - following the same pattern as ManualReservationQueries
   */
  private handleDatabaseError(error: any, operation: string): QueryError {
    console.error(`PromoCodeQueries.${operation} error:`, error)
    
    if (error.code === 'P2002') {
      return {
        code: 'UNIQUE_CONSTRAINT_VIOLATION',
        message: 'A record with this data already exists',
        details: error
      }
    }
    
    if (error.code === 'P2025') {
      return {
        code: 'RECORD_NOT_FOUND',
        message: 'The requested record could not be found',
        details: error
      }
    }
    
    if (error.code === 'P2003') {
      return {
        code: 'FOREIGN_KEY_CONSTRAINT_VIOLATION',
        message: 'Foreign key constraint violated',
        details: error
      }
    }
    
    return {
      code: 'DATABASE_ERROR',
      message: error.message || 'An unknown database error occurred',
      details: error
    }
  }
} 