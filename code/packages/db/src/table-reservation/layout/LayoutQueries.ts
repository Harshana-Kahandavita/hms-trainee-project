import { PrismaClient } from '../../../prisma/generated/prisma'
import {
  GetLayoutDataInput,
  LayoutSectionResult,
  LayoutTableResult,
  LayoutDataResult,
  QueryError,
  QueryResult
} from './types'

export class LayoutQueries {
  constructor(private prisma: PrismaClient) {}

  /**
   * Pure data access: Get complete layout data for a restaurant
   * Returns sections and tables with their configurations
   */
  async getLayoutDataByRestaurant(
    input: GetLayoutDataInput
  ): Promise<QueryResult<LayoutDataResult>> {
    try {
      // Get restaurant information
      const restaurant = await this.prisma.restaurant.findUnique({
        where: { id: input.restaurantId },
        select: {
          id: true,
          name: true
        }
      })

      if (!restaurant) {
        return {
          success: false,
          error: {
            code: 'RESTAURANT_NOT_FOUND',
            message: `Restaurant with ID ${input.restaurantId} not found`
          }
        }
      }

      // Get all active sections for the restaurant
      const sections = await this.prisma.restaurantSection.findMany({
        where: {
          restaurantId: input.restaurantId,
          isActive: true
        },
        orderBy: {
          displayOrder: 'asc'
        }
      })

      // Get all active tables for the restaurant
      const tables = await this.prisma.restaurantTable.findMany({
        where: {
          restaurantId: input.restaurantId,
          isActive: true
        },
        orderBy: {
          tableName: 'asc'
        }
      })

      // Transform sections to result format
      const transformedSections: LayoutSectionResult[] = sections.map(section => ({
        id: section.id,
        restaurantId: section.restaurantId,
        sectionName: section.sectionName,
        description: section.description,
        isActive: section.isActive,
        displayOrder: section.displayOrder,
        capacity: section.capacity,
        createdAt: section.createdAt,
        updatedAt: section.updatedAt
      }))

      // Transform tables to result format
      const transformedTables: LayoutTableResult[] = tables.map(table => ({
        id: table.id,
        restaurantId: table.restaurantId,
        sectionId: table.sectionId,
        tableName: table.tableName,
        seatingCapacity: table.seatingCapacity,
        tableType: table.tableType,
        isActive: table.isActive,
        position: table.position,
        amenities: table.amenities,
        createdAt: table.createdAt,
        updatedAt: table.updatedAt
      }))

      const result: LayoutDataResult = {
        sections: transformedSections,
        tables: transformedTables
      }

      return {
        success: true,
        data: result
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'getLayoutDataByRestaurant')
      }
    }
  }

  /**
   * Update table positions for a given restaurant/section using fabricObjectId mapping
   */
  async updateTablePositions(
    restaurantId: number,
    sectionId: number,
    positionsByFabricId: Record<string, {
      x: number;
      y: number;
      width?: number;
      height?: number;
      angle?: number;
      scaleX?: number;
      scaleY?: number;
      originX?: string;
      originY?: string;
    }>
  ): Promise<QueryResult<void>> {
    try {
      const updates = Object.entries(positionsByFabricId)
        .filter(([fabricObjectId]) => !!fabricObjectId)
        .map(([fabricObjectId, position]) =>
          this.prisma.restaurantTable.updateMany({
            where: {
              restaurantId,
              sectionId,
              fabricObjectId,
              isActive: true,
            },
            data: { position: position as any },
          })
        );

      if (updates.length === 0) {
        return { success: true };
      }

      await this.prisma.$transaction(updates);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'updateTablePositions')
      };
    }
  }

  /**
   * Pure data access: Get sections for a restaurant
   */
  async getSectionsByRestaurant(
    restaurantId: number
  ): Promise<QueryResult<LayoutSectionResult[]>> {
    try {
      const sections = await this.prisma.restaurantSection.findMany({
        where: {
          restaurantId,
          isActive: true
        },
        orderBy: {
          displayOrder: 'asc'
        }
      })

      const transformedSections: LayoutSectionResult[] = sections.map(section => ({
        id: section.id,
        restaurantId: section.restaurantId,
        sectionName: section.sectionName,
        description: section.description,
        isActive: section.isActive,
        displayOrder: section.displayOrder,
        capacity: section.capacity,
        createdAt: section.createdAt,
        updatedAt: section.updatedAt
      }))

      return {
        success: true,
        data: transformedSections
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'getSectionsByRestaurant')
      }
    }
  }

  /**
   * Pure data access: Get tables for a restaurant
   */
  async getTablesByRestaurant(
    restaurantId: number
  ): Promise<QueryResult<LayoutTableResult[]>> {
    try {
      const tables = await this.prisma.restaurantTable.findMany({
        where: {
          restaurantId,
          isActive: true
        },
        orderBy: {
          tableName: 'asc'
        }
      })

      const transformedTables: LayoutTableResult[] = tables.map(table => ({
        id: table.id,
        restaurantId: table.restaurantId,
        sectionId: table.sectionId,
        tableName: table.tableName,
        seatingCapacity: table.seatingCapacity,
        tableType: table.tableType,
        isActive: table.isActive,
        position: table.position,
        amenities: table.amenities,
        createdAt: table.createdAt,
        updatedAt: table.updatedAt
      }))

      return {
        success: true,
        data: transformedTables
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'getTablesByRestaurant')
      }
    }
  }

  /**
   * Pure data access: Get tables for a specific section
   */
  async getTablesBySection(
    sectionId: number
  ): Promise<QueryResult<LayoutTableResult[]>> {
    try {
      const tables = await this.prisma.restaurantTable.findMany({
        where: {
          sectionId,
          isActive: true
        },
        orderBy: {
          tableName: 'asc'
        }
      })

      const transformedTables: LayoutTableResult[] = tables.map(table => ({
        id: table.id,
        restaurantId: table.restaurantId,
        sectionId: table.sectionId,
        tableName: table.tableName,
        seatingCapacity: table.seatingCapacity,
        tableType: table.tableType,
        isActive: table.isActive,
        position: table.position,
        amenities: table.amenities,
        createdAt: table.createdAt,
        updatedAt: table.updatedAt
      }))

      return {
        success: true,
        data: transformedTables
      }
    } catch (error) {
      return {
        success: false,
        error: this.handleDatabaseError(error, 'getTablesBySection')
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
