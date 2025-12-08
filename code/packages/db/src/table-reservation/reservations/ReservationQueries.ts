import { PrismaClient } from '../../../prisma/generated/prisma'
import {
  GetReservationsByDateInput,
  ReservationResult,
  ReservationsByDateResult,
  QueryError,
  QueryResult
} from './types'

export class ReservationQueries {
  constructor(private prisma: PrismaClient) {}

  /**
   * Pure data access: Get reservations for a restaurant on a specific date
   * Includes table assignments and customer details
   */
  async getReservationsByDate(
    input: GetReservationsByDateInput
  ): Promise<QueryResult<ReservationsByDateResult>> {
    try {
      // Parse the date string to Date object
      const targetDate = new Date(input.date)
      
      // Get reservations for the specific date
      const reservations = await this.prisma.reservation.findMany({
        where: {
          restaurantId: input.restaurantId,
          reservationDate: targetDate
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
          tableAssignment: {
            include: {
              assignedTable: {
                select: {
                  id: true,
                  tableName: true
                }
              },
              assignedSection: {
                select: {
                  id: true,
                  sectionName: true
                }
              },
              // FIX: Include slot data for accurate table merge time matching
              slot: {
                select: {
                  id: true,
                  date: true,
                  startTime: true,
                  endTime: true
                }
              }
            }
          }
        },
        orderBy: {
          reservationTime: 'asc'
        }
      })

      // Transform reservations to result format
      const transformedReservations: ReservationResult[] = reservations.map(reservation => ({
        id: reservation.id,
        reservationNumber: reservation.reservationNumber,
        reservationName: reservation.reservationName,
        contactPhone: reservation.contactPhone,
        reservationDate: reservation.reservationDate,
        reservationTime: reservation.reservationTime,
        adultCount: reservation.adultCount,
        childCount: reservation.childCount,
        mealType: reservation.mealType,
        totalAmount: Number(reservation.totalAmount),
        status: reservation.status,
        specialRequests: reservation.specialRequests,
        dietaryRequirements: reservation.dietaryRequirements,
        occasion: reservation.occasion,
        createdAt: reservation.createdAt,
        updatedAt: reservation.updatedAt,
        createdBy: reservation.createdBy,
        customer: {
          firstName: reservation.customer.firstName,
          lastName: reservation.customer.lastName,
          email: reservation.customer.email,
          phone: reservation.customer.phone
        },
        tableAssignment: reservation.tableAssignment ? {
          reservationId: reservation.tableAssignment.reservationId,
          assignedTableId: reservation.tableAssignment.assignedTableId,
          assignedTableName: reservation.tableAssignment.assignedTable?.tableName || null,
          assignedSectionId: reservation.tableAssignment.assignedSectionId,
          assignedSectionName: reservation.tableAssignment.assignedSection?.sectionName || null,
          tableStartTime: reservation.tableAssignment.tableStartTime ? reservation.tableAssignment.tableStartTime.toISOString().split('T')[1]?.substring(0, 5) || null : null,
          tableEndTime: reservation.tableAssignment.tableEndTime ? reservation.tableAssignment.tableEndTime.toISOString().split('T')[1]?.substring(0, 5) || null : null,
          // FIX: Include slot data for accurate table merge time matching
          slotId: reservation.tableAssignment.slotId,
          slotDate: reservation.tableAssignment.slot ? reservation.tableAssignment.slot.date : null,
          slotStartTime: reservation.tableAssignment.slot ? reservation.tableAssignment.slot.startTime : null,
          slotEndTime: reservation.tableAssignment.slot ? reservation.tableAssignment.slot.endTime : null
        } : null
      }))

      // Calculate counts by status
      const totalCount = transformedReservations.length
      const upcomingCount = transformedReservations.filter(r => r.status === 'UPCOMING' || r.status === 'CONFIRMED').length
      const seatedCount = transformedReservations.filter(r => r.status === 'SEATED' || r.status === 'IN_PROGRESS').length
      const completedCount = transformedReservations.filter(r => r.status === 'COMPLETED' || r.status === 'FINISHED').length

      const result: ReservationsByDateResult = {
        reservations: transformedReservations,
        totalCount,
        upcomingCount,
        seatedCount,
        completedCount
      }

      return {
        success: true,
        data: result
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'getReservationsByDate')
      }
    }
  }

  /**
   * Pure data access: Get reservation details by ID
   */
  async getReservationById(
    reservationId: number
  ): Promise<QueryResult<ReservationResult>> {
    try {
      const reservation = await this.prisma.reservation.findUnique({
        where: { id: reservationId },
        include: {
          customer: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phone: true
            }
          },
          tableAssignment: {
            include: {
              assignedTable: {
                select: {
                  id: true,
                  tableName: true
                }
              },
              assignedSection: {
                select: {
                  id: true,
                  sectionName: true
                }
              },
              // FIX: Include slot data for accurate table merge time matching
              slot: {
                select: {
                  id: true,
                  date: true,
                  startTime: true,
                  endTime: true
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
            code: 'NOT_FOUND',
            message: 'Reservation not found'
          }
        }
      }

      const transformedReservation: ReservationResult = {
        id: reservation.id,
        reservationNumber: reservation.reservationNumber,
        reservationName: reservation.reservationName,
        contactPhone: reservation.contactPhone,
        reservationDate: reservation.reservationDate,
        reservationTime: reservation.reservationTime,
        adultCount: reservation.adultCount,
        childCount: reservation.childCount,
        mealType: reservation.mealType,
        totalAmount: Number(reservation.totalAmount),
        status: reservation.status,
        specialRequests: reservation.specialRequests,
        dietaryRequirements: reservation.dietaryRequirements,
        occasion: reservation.occasion,
        createdAt: reservation.createdAt,
        updatedAt: reservation.updatedAt,
        createdBy: reservation.createdBy,
        customer: {
          firstName: reservation.customer.firstName,
          lastName: reservation.customer.lastName,
          email: reservation.customer.email,
          phone: reservation.customer.phone
        },
        tableAssignment: reservation.tableAssignment ? {
          reservationId: reservation.tableAssignment.reservationId,
          assignedTableId: reservation.tableAssignment.assignedTableId,
          assignedTableName: reservation.tableAssignment.assignedTable?.tableName || null,
          assignedSectionId: reservation.tableAssignment.assignedSectionId,
          assignedSectionName: reservation.tableAssignment.assignedSection?.sectionName || null,
          tableStartTime: reservation.tableAssignment.tableStartTime ? reservation.tableAssignment.tableStartTime.toISOString().split('T')[1]?.substring(0, 5) || null : null,
          tableEndTime: reservation.tableAssignment.tableEndTime ? reservation.tableAssignment.tableEndTime.toISOString().split('T')[1]?.substring(0, 5) || null : null,
          // FIX: Include slot data for accurate table merge time matching
          slotId: reservation.tableAssignment.slotId,
          slotDate: reservation.tableAssignment.slot ? reservation.tableAssignment.slot.date : null,
          slotStartTime: reservation.tableAssignment.slot ? reservation.tableAssignment.slot.startTime : null,
          slotEndTime: reservation.tableAssignment.slot ? reservation.tableAssignment.slot.endTime : null
        } : null
      }

      return {
        success: true,
        data: transformedReservation
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'getReservationById')
      }
    }
  }

  /**
   * Pure data access: Get reservations for a restaurant within a date range
   */
  async getReservationsByDateRange(
    input: {
      restaurantId: number
      startDate: string
      endDate: string
    }
  ): Promise<QueryResult<ReservationsByDateResult>> {
    try {
      const startDate = new Date(input.startDate)
      const endDate = new Date(input.endDate)

      const reservations = await this.prisma.reservation.findMany({
        where: {
          restaurantId: input.restaurantId,
          reservationDate: {
            gte: startDate,
            lte: endDate
          }
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
          tableAssignment: {
            include: {
              assignedTable: {
                select: {
                  id: true,
                  tableName: true
                }
              },
              assignedSection: {
                select: {
                  id: true,
                  sectionName: true
                }
              },
              // FIX: Include slot data for accurate table merge time matching
              slot: {
                select: {
                  id: true,
                  date: true,
                  startTime: true,
                  endTime: true
                }
              }
            }
          }
        },
        orderBy: {
          reservationDate: 'asc'
        }
      })

      const transformedReservations: ReservationResult[] = reservations.map(reservation => ({
        id: reservation.id,
        reservationNumber: reservation.reservationNumber,
        reservationName: reservation.reservationName,
        contactPhone: reservation.contactPhone,
        reservationDate: reservation.reservationDate,
        reservationTime: reservation.reservationTime,
        adultCount: reservation.adultCount,
        childCount: reservation.childCount,
        mealType: reservation.mealType,
        totalAmount: Number(reservation.totalAmount),
        status: reservation.status,
        specialRequests: reservation.specialRequests,
        dietaryRequirements: reservation.dietaryRequirements,
        occasion: reservation.occasion,
        createdAt: reservation.createdAt,
        updatedAt: reservation.updatedAt,
        createdBy: reservation.createdBy,
        customer: {
          firstName: reservation.customer.firstName,
          lastName: reservation.customer.lastName,
          email: reservation.customer.email,
          phone: reservation.customer.phone
        },
        tableAssignment: reservation.tableAssignment ? {
          reservationId: reservation.tableAssignment.reservationId,
          assignedTableId: reservation.tableAssignment.assignedTableId,
          assignedTableName: reservation.tableAssignment.assignedTable?.tableName || null,
          assignedSectionId: reservation.tableAssignment.assignedSectionId,
          assignedSectionName: reservation.tableAssignment.assignedSection?.sectionName || null,
          tableStartTime: reservation.tableAssignment.tableStartTime ? reservation.tableAssignment.tableStartTime.toISOString().split('T')[1]?.substring(0, 5) || null : null,
          tableEndTime: reservation.tableAssignment.tableEndTime ? reservation.tableAssignment.tableEndTime.toISOString().split('T')[1]?.substring(0, 5) || null : null,
          // FIX: Include slot data for accurate table merge time matching
          slotId: reservation.tableAssignment.slotId,
          slotDate: reservation.tableAssignment.slot ? reservation.tableAssignment.slot.date : null,
          slotStartTime: reservation.tableAssignment.slot ? reservation.tableAssignment.slot.startTime : null,
          slotEndTime: reservation.tableAssignment.slot ? reservation.tableAssignment.slot.endTime : null
        } : null
      }))

      const totalCount = transformedReservations.length
      const upcomingCount = transformedReservations.filter(r => r.status === 'UPCOMING' || r.status === 'CONFIRMED').length
      const seatedCount = transformedReservations.filter(r => r.status === 'SEATED' || r.status === 'IN_PROGRESS').length
      const completedCount = transformedReservations.filter(r => r.status === 'COMPLETED' || r.status === 'FINISHED').length

      return {
        success: true,
        data: {
          reservations: transformedReservations,
          totalCount,
          upcomingCount,
          seatedCount,
          completedCount
        }
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'getReservationsByDateRange')
      }
    }
  }

  /**
   * Error handling helper
   */
  private handleDatabaseError(error: unknown, operation: string): QueryError {
    console.error(`Database error in ${operation}:`, error)
    
    if (error instanceof Error) {
      return {
        code: 'DATABASE_ERROR',
        message: error.message,
        details: error
      }
    }
    
    return {
      code: 'UNKNOWN_ERROR',
      message: 'An unknown error occurred',
      details: error
    }
  }
}
