import { PrismaClient } from '../../../prisma/generated/prisma'
import {
  GetPendingRequestsInput,
  FilteredRequestsInput,
  PendingRequestResult,
  RequestDetailsResult,
  RequestCountsResult,
  PaginatedPendingRequestsResult,
} from './types'
import type { QueryError, QueryResult } from '../types'

export class PendingRequestsQueries {
  constructor(private prisma: PrismaClient) {}

  /**
   * Pure data access: Get paginated pending requests for a restaurant
   * Filters for PENDING status and MERCHANT created requests only
   */
  async getPendingRequestsByRestaurant(
    input: GetPendingRequestsInput
  ): Promise<QueryResult<PaginatedPendingRequestsResult>> {
    try {
      const offset = (input.page - 1) * input.limit

      // Filter for PENDING status and MERCHANT created requests only
      const whereClause = {
        restaurantId: input.restaurantId,
        status: 'PENDING_CUSTOMER_PAYMENT' as const,
        createdBy: 'MERCHANT' as const
      }

      // Get total count
      const totalCount = await this.prisma.reservationRequest.count({
        where: whereClause
      })

      // Get requests with customer data
      const requests = await this.prisma.reservationRequest.findMany({
        where: whereClause,
        include: {
          customer: {
            select: {
              firstName: true,
              lastName: true,
              phone: true
            }
          },
          restaurantPaymentLink: {
            select: {
              token: true,
              status: true,
              expiresAt: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip: offset,
        take: input.limit
      })

      const transformedRequests: PendingRequestResult[] = requests.map(request => ({
        id: request.id,
        contactPhone: request.contactPhone,
        requestedDate: request.requestedDate,
        requestedTime: request.requestedTime,
        adultCount: request.adultCount,
        childCount: request.childCount,
        mealType: request.mealType,
        estimatedTotalAmount: Number(request.estimatedTotalAmount),
        status: request.status,
        createdAt: request.createdAt,
        customer: {
          firstName: request.customer.firstName,
          lastName: request.customer.lastName,
          phone: request.customer.phone
        },
        paymentLink: request.restaurantPaymentLink ? {
          token: request.restaurantPaymentLink.token,
          status: request.restaurantPaymentLink.status,
          expiresAt: request.restaurantPaymentLink.expiresAt
        } : null
      }))

      const totalPages = Math.ceil(totalCount / input.limit)

      return {
        success: true,
        data: {
          requests: transformedRequests,
          totalCount,
          currentPage: input.page,
          totalPages
        }
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'getPendingRequestsByRestaurant')
      }
    }
  }

  /**
   * Pure data access: Get single request details with customer info
   * Only returns details for MERCHANT created requests
   */
  async getRequestDetails(requestId: number): Promise<QueryResult<RequestDetailsResult>> {
    try {
      const request = await this.prisma.reservationRequest.findUnique({
        where: { 
          id: requestId,
        },
        include: {
          customer: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phone: true
            }
          },
          restaurantPaymentLink: {
            select: {
              token: true,
              status: true,
              expiresAt: true
            }
          }
        }
      })

      if (!request) {
        return {
          success: false,
          error: {
            code: 'REQUEST_NOT_FOUND',
            message: `No request found with ID ${requestId}`
          }
        }
      }

      // Verify this is a MERCHANT created request
      if (request.createdBy !== 'MERCHANT') {
        return {
          success: false,
          error: {
            code: 'REQUEST_NOT_FOUND',
            message: `Request ${requestId} was not created by merchant`
          }
        }
      }

      const result: RequestDetailsResult = {
        id: request.id,
        contactPhone: request.contactPhone,
        requestedDate: request.requestedDate,
        requestedTime: request.requestedTime,
        adultCount: request.adultCount,
        childCount: request.childCount,
        mealType: request.mealType,
        estimatedTotalAmount: Number(request.estimatedTotalAmount),
        status: request.status,
        createdAt: request.createdAt,
        customer: {
          firstName: request.customer.firstName,
          lastName: request.customer.lastName,
          email: request.customer.email ?? '',
          phone: request.customer.phone
        },
        paymentLink: request.restaurantPaymentLink ? {
          token: request.restaurantPaymentLink.token,
          status: request.restaurantPaymentLink.status,
          expiresAt: request.restaurantPaymentLink.expiresAt
        } : null,
        specialRequests: request.specialRequests,
        dietaryRequirements: request.dietaryRequirements,
        occasion: request.occasion,
        estimatedServiceCharge: Number(request.estimatedServiceCharge),
        estimatedTaxAmount: Number(request.estimatedTaxAmount),
        requiresAdvancePayment: request.requiresAdvancePayment
      }

      return {
        success: true,
        data: result
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'getRequestDetails')
      }
    }
  }

  /**
   * Pure data access: Get count of pending requests by status
   * Only counts PENDING_CUSTOMER_PAYMENT status and MERCHANT created requests
   */
  async getPendingRequestsCounts(restaurantId: number): Promise<QueryResult<RequestCountsResult>> {
    try {
      const counts = await this.prisma.reservationRequest.groupBy({
        by: ['status'],
        where: {
          restaurantId,
          status: 'PENDING_CUSTOMER_PAYMENT',
          createdBy: 'MERCHANT'
        },
        _count: {
          id: true
        }
      })

      const result: RequestCountsResult = {
        total: 0,
        pending: 0,
        processing: 0,
        merchantInitiated: 0,
        pendingPayment: 0
      }

      counts.forEach(count => {
        const statusCount = count._count.id
        result.total += statusCount

        // Since we're only filtering for PENDING_CUSTOMER_PAYMENT status, all counts will be pendingPayment
        if (count.status === 'PENDING_CUSTOMER_PAYMENT') {
          result.pendingPayment = statusCount
        }
      })

      return {
        success: true,
        data: result
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'getPendingRequestsCounts')
      }
    }
  }

  /**
   * Pure data access: Get requests with filtering (date range, status, etc.)
   */
  async getFilteredRequests(
    input: FilteredRequestsInput
  ): Promise<QueryResult<PaginatedPendingRequestsResult>> {
    try {
      const offset = (input.page - 1) * input.limit

      const whereClause: any = {
        restaurantId: input.restaurantId
      }

      if (input.statusFilter && input.statusFilter.length > 0) {
        whereClause.status = { in: input.statusFilter }
      }

      if (input.dateFrom || input.dateTo) {
        whereClause.requestedDate = {}
        if (input.dateFrom) {
          whereClause.requestedDate.gte = input.dateFrom
        }
        if (input.dateTo) {
          whereClause.requestedDate.lte = input.dateTo
        }
      }

      // Get total count
      const totalCount = await this.prisma.reservationRequest.count({
        where: whereClause
      })

      // Get filtered requests
      const requests = await this.prisma.reservationRequest.findMany({
        where: whereClause,
        include: {
          customer: {
            select: {
              firstName: true,
              lastName: true,
              phone: true
            }
          },
          restaurantPaymentLink: {
            select: {
              token: true,
              status: true,
              expiresAt: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip: offset,
        take: input.limit
      })

      const transformedRequests: PendingRequestResult[] = requests.map(request => ({
        id: request.id,
        contactPhone: request.contactPhone,
        requestedDate: request.requestedDate,
        requestedTime: request.requestedTime,
        adultCount: request.adultCount,
        childCount: request.childCount,
        mealType: request.mealType,
        estimatedTotalAmount: Number(request.estimatedTotalAmount),
        status: request.status,
        createdAt: request.createdAt,
        customer: {
          firstName: request.customer.firstName,
          lastName: request.customer.lastName,
          phone: request.customer.phone
        },
        paymentLink: request.restaurantPaymentLink ? {
          token: request.restaurantPaymentLink.token,
          status: request.restaurantPaymentLink.status,
          expiresAt: request.restaurantPaymentLink.expiresAt
        } : null
      }))

      const totalPages = Math.ceil(totalCount / input.limit)

      return {
        success: true,
        data: {
          requests: transformedRequests,
          totalCount,
          currentPage: input.page,
          totalPages
        }
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'getFilteredRequests')
      }
    }
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
      queryError.message = 'Unique constraint violation'
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