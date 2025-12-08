import { PrismaClient, DayOfWeek } from '../../../prisma/generated/prisma';
import type {
  ReservationSupportType,
  FeeType,
  RefundType,
  MealType,
} from '../../../prisma/generated/prisma';

// ============================================================================
// Type Definitions for Table Restaurant Setup
// ============================================================================

export interface RestaurantSectionInput {
  sectionName: string;
  description?: string;
  capacity?: number;
  displayOrder?: number;
  isActive?: boolean;
}

export interface RestaurantTableInput {
  sectionId: number;
  tableName: string;
  seatingCapacity: number;
  tableType?: string;
  position?: {
    x: number;
    y: number;
  };
  amenities?: string[];
  isActive?: boolean;
}

export interface TableReservationUtilsConfigInput {
  feeType: FeeType;
  feeValue: number;
  requiresAdvancePayment: boolean;
  advancePaymentType?: FeeType;
  advancePaymentValue?: number;
  defaultSlotMinutes: number;
  turnoverBufferMinutes: number;
  enableTemporaryHold: boolean;
  holdMinutes: number;
  allowFlexibleAssignment: boolean;
  defaultDwellMinutes?: number;
  // Optional: create operating hours if they don't exist
  createDefaultOperatingHours?: boolean;
}

export interface SlotGenerationInput {
  daysAhead: number;
  startTime: string; // "HH:mm:ss" format
  endTime: string; // "HH:mm:ss" format
  slotDurationMinutes: number;
  turnoverBufferMinutes: number;
  enabledDays: DayOfWeek[];
  targetTableIds?: number[]; // Optional: specific tables, if not provided, all active tables
}

export interface RefundPolicyInput {
  mealType: MealType;
  allowedRefundTypes: RefundType[];
  fullRefundBeforeMinutes: number;
  partialRefundBeforeMinutes?: number;
  partialRefundPercentage?: number;
  isActive: boolean;
  createdBy: string;
}

export interface OperatingHoursInput {
  dayOfWeek: DayOfWeek;
  isOpen: boolean;
  capacity: number;
  onlineQuota: number;
  openingTime: string; // ISO-8601 DateTime format (e.g., "2000-01-01T00:00:00.000Z")
  closingTime: string; // ISO-8601 DateTime format (e.g., "2000-01-01T23:59:59.000Z")
}

// ============================================================================
// Update Input Types
// ============================================================================

export interface UpdateRestaurantSectionInput {
  sectionName?: string;
  description?: string;
  capacity?: number;
  displayOrder?: number;
  isActive?: boolean;
}

export interface UpdateRestaurantTableInput {
  sectionId?: number;
  tableName?: string;
  seatingCapacity?: number;
  tableType?: string;
  position?: {
    x: number;
    y: number;
  };
  amenities?: string[];
  isActive?: boolean;
}

export interface UpdateTableReservationUtilsConfigInput {
  feeType?: FeeType;
  feeValue?: number;
  requiresAdvancePayment?: boolean;
  advancePaymentType?: FeeType;
  advancePaymentValue?: number;
  defaultSlotMinutes?: number;
  turnoverBufferMinutes?: number;
  enableTemporaryHold?: boolean;
  holdMinutes?: number;
  allowFlexibleAssignment?: boolean;
}

// Result type definitions
export interface SectionCreationResult {
  success: boolean;
  data?: {
    sectionsCreated: number;
    sections: Array<{
      id: number;
      sectionName: string;
      displayOrder: number;
    }>;
  };
  error?: string;
}

export interface TableCreationResult {
  success: boolean;
  data?: {
    tablesCreated: number;
    tables: Array<{
      id: number;
      tableName: string;
      sectionId: number;
      seatingCapacity: number;
    }>;
  };
  error?: string;
}

export interface TableReservationConfigResult {
  success: boolean;
  data?: {
    configId: number;
    restaurantId: number;
  };
  error?: string;
}

export interface SlotGenerationResult {
  success: boolean;
  data?: {
    slotsGenerated: number;
    dateRange: {
      startDate: string;
      endDate: string;
    };
    tablesAffected: number;
  };
  error?: string;
}

export interface RefundPolicyResult {
  success: boolean;
  data?: {
    policiesCreated: number;
    policies: Array<{
      id: number;
      mealType: string;
    }>;
  };
  error?: string;
}

export interface OperatingHoursResult {
  success: boolean;
  data?: {
    hoursCreated: number;
    operatingHours: Array<{
      id: number;
      dayOfWeek: string;
      isOpen: boolean;
    }>;
  };
  error?: string;
}

export interface ValidationResult {
  isValid: boolean;
  missingComponents: string[];
  warnings: string[];
}

export interface RestaurantTypesSummary {
  buffetOnly: number;
  tableOnly: number;
  both: number;
  total: number;
}

// ============================================================================
// Update Result Types
// ============================================================================

export interface SectionUpdateResult {
  success: boolean;
  data?: {
    sectionId: number;
    updatedFields: string[];
  };
  error?: string;
}

export interface TableUpdateResult {
  success: boolean;
  data?: {
    tableId: number;
    updatedFields: string[];
  };
  error?: string;
}

export interface ConfigUpdateResult {
  success: boolean;
  data?: {
    configId: number;
    updatedFields: string[];
  };
  error?: string;
}

// ============================================================================
// 1. Create Restaurant Sections
// ============================================================================

export async function createRestaurantSections(
  prisma: PrismaClient,
  restaurantId: number,
  sections: RestaurantSectionInput[]
): Promise<SectionCreationResult> {
  try {
    // Validate restaurant exists and supports table reservations
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, reservationSupport: true }
    });

    if (!restaurant) {
      return {
        success: false,
        error: `Restaurant with ID ${restaurantId} not found`
      };
    }

    if (restaurant.reservationSupport !== 'TABLE_ONLY' && restaurant.reservationSupport !== 'BOTH') {
      return {
        success: false,
        error: `Restaurant does not support table reservations (current: ${restaurant.reservationSupport})`
      };
    }

    // Create sections in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const createdSections = [];

      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        if (!section) continue;
        
        const created = await tx.restaurantSection.create({
          data: {
            restaurantId,
            sectionName: section.sectionName,
            description: section.description,
            capacity: section.capacity,
            displayOrder: section.displayOrder ?? (i + 1),
            isActive: section.isActive ?? true,
          },
          select: {
            id: true,
            sectionName: true,
            displayOrder: true,
          }
        });
        createdSections.push(created);
      }

      return createdSections;
    });

    return {
      success: true,
      data: {
        sectionsCreated: result.length,
        sections: result.map(s => ({
          ...s,
          displayOrder: s.displayOrder ?? 0
        }))
      }
    };

  } catch (error) {
    console.error('Error creating restaurant sections:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

// ============================================================================
// 2. Create Restaurant Tables within Sections
// ============================================================================

export async function createRestaurantTables(
  prisma: PrismaClient,
  restaurantId: number,
  tables: RestaurantTableInput[]
): Promise<TableCreationResult> {
  try {
    // Validate restaurant exists and supports table reservations
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, reservationSupport: true }
    });

    if (!restaurant) {
      return {
        success: false,
        error: `Restaurant with ID ${restaurantId} not found`
      };
    }

    if (restaurant.reservationSupport !== 'TABLE_ONLY' && restaurant.reservationSupport !== 'BOTH') {
      return {
        success: false,
        error: `Restaurant does not support table reservations (current: ${restaurant.reservationSupport})`
      };
    }

    // Validate all section IDs exist for this restaurant
    const sectionIds = Array.from(new Set(tables.map(t => t.sectionId)));
    const existingSections = await prisma.restaurantSection.findMany({
      where: {
        id: { in: sectionIds },
        restaurantId
      },
      select: { id: true }
    });

    const existingSectionIds = existingSections.map(s => s.id);
    const missingSectionIds = sectionIds.filter(id => !existingSectionIds.includes(id));

    if (missingSectionIds.length > 0) {
      return {
        success: false,
        error: `Section IDs not found for this restaurant: ${missingSectionIds.join(', ')}`
      };
    }

    // Check for duplicate table names within the restaurant
    const tableNames = tables.map(t => t.tableName);
    const duplicateNames = tableNames.filter((name, index) => tableNames.indexOf(name) !== index);
    
    if (duplicateNames.length > 0) {
      return {
        success: false,
        error: `Duplicate table names found: ${duplicateNames.join(', ')}`
      };
    }

    // Check if table names already exist in the restaurant
    const existingTables = await prisma.restaurantTable.findMany({
      where: {
        restaurantId,
        tableName: { in: tableNames }
      },
      select: { tableName: true }
    });

    if (existingTables.length > 0) {
      const conflictingNames = existingTables.map(t => t.tableName);
      return {
        success: false,
        error: `Table names already exist: ${conflictingNames.join(', ')}`
      };
    }

    // Create tables in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const createdTables = [];

      for (const table of tables) {
        const created = await tx.restaurantTable.create({
          data: {
            restaurantId,
            sectionId: table.sectionId,
            tableName: table.tableName,
            seatingCapacity: table.seatingCapacity,
            tableType: table.tableType,
            position: table.position ? `${table.position.x},${table.position.y}` : undefined,
            amenities: table.amenities ? JSON.stringify(table.amenities) : undefined,
            isActive: table.isActive ?? true,
          },
          select: {
            id: true,
            tableName: true,
            sectionId: true,
            seatingCapacity: true,
          }
        });
        createdTables.push(created);
      }

      return createdTables;
    });

    return {
      success: true,
      data: {
        tablesCreated: result.length,
        tables: result
      }
    };

  } catch (error) {
    console.error('Error creating restaurant tables:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

// ============================================================================
// 3. Create Restaurant Operating Hours
// ============================================================================

export async function createRestaurantOperatingHours(
  prisma: PrismaClient,
  restaurantId: number,
  operatingHours: OperatingHoursInput[]
): Promise<OperatingHoursResult> {
  try {
    // Validate restaurant exists and supports table reservations
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, reservationSupport: true }
    });

    if (!restaurant) {
      return {
        success: false,
        error: `Restaurant with ID ${restaurantId} not found`
      };
    }

    if (restaurant.reservationSupport !== 'TABLE_ONLY' && restaurant.reservationSupport !== 'BOTH') {
      return {
        success: false,
        error: `Restaurant ${restaurantId} does not support table reservations`
      };
    }

    // Validate operating hours input
    if (!operatingHours || operatingHours.length === 0) {
      return {
        success: false,
        error: 'At least one operating hours entry is required'
      };
    }

    // Validate that we have exactly 7 days (one for each day of the week)
    if (operatingHours.length !== 7) {
      return {
        success: false,
        error: 'Operating hours must be provided for all 7 days of the week'
      };
    }

    // Check for duplicate days
    const days = operatingHours.map(h => h.dayOfWeek);
    const uniqueDays = new Set(days);
    if (uniqueDays.size !== 7) {
      return {
        success: false,
        error: 'Duplicate days found in operating hours. Each day of the week must be specified exactly once.'
      };
    }

    // Validate time formats and logic for each day
    for (const hours of operatingHours) {
      // Validate ISO datetime format
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
      if (!isoRegex.test(hours.openingTime)) {
        return {
          success: false,
          error: `Invalid opening time format for ${hours.dayOfWeek}. Expected ISO-8601 DateTime format.`
        };
      }
      if (!isoRegex.test(hours.closingTime)) {
        return {
          success: false,
          error: `Invalid closing time format for ${hours.dayOfWeek}. Expected ISO-8601 DateTime format.`
        };
      }

      // Parse dates for comparison
      const openingDate = new Date(hours.openingTime);
      const closingDate = new Date(hours.closingTime);

      // If closed, times should be the same (or we could allow null, but keeping consistent)
      if (!hours.isOpen) {
        if (openingDate.getTime() !== closingDate.getTime()) {
          return {
            success: false,
            error: `For closed days (${hours.dayOfWeek}), opening and closing times must be the same`
          };
        }
      } else {
        // For open days, opening time should be before closing time
        if (openingDate >= closingDate) {
          return {
            success: false,
            error: `Opening time must be before closing time for ${hours.dayOfWeek}`
          };
        }
      }

      // Validate capacity and online quota
      if (hours.capacity < 0) {
        return {
          success: false,
          error: `Capacity must be non-negative for ${hours.dayOfWeek}`
        };
      }
      if (hours.onlineQuota < 0 || hours.onlineQuota > hours.capacity) {
        return {
          success: false,
          error: `Online quota must be between 0 and capacity for ${hours.dayOfWeek}`
        };
      }
    }

    // Create operating hours using transaction for consistency
    await prisma.$transaction(async (tx) => {
      await tx.restaurantOperatingHours.createMany({
        data: operatingHours.map(hours => ({
          restaurantId,
          dayOfWeek: hours.dayOfWeek,
          isOpen: hours.isOpen,
          capacity: hours.capacity,
          onlineQuota: hours.onlineQuota,
          openingTime: hours.openingTime,
          closingTime: hours.closingTime,
        }))
      });
    });

    // Fetch the created hours to return in the result
    const createdHours = await prisma.restaurantOperatingHours.findMany({
      where: { restaurantId },
      select: {
        dayOfWeek: true,
        isOpen: true,
      }
    });

    return {
      success: true,
      data: {
        hoursCreated: createdHours.length,
        operatingHours: createdHours.map(hour => ({
          id: 0, // Not applicable for composite key
          dayOfWeek: hour.dayOfWeek,
          isOpen: hour.isOpen
        }))
      }
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

// ============================================================================
// 4. Create Table Reservation Utils Configuration
// ============================================================================

export async function createTableReservationUtilsConfig(
  prisma: PrismaClient,
  restaurantId: number,
  config: TableReservationUtilsConfigInput
): Promise<TableReservationConfigResult> {
  try {
    // Validate restaurant exists and supports table reservations
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, reservationSupport: true }
    });

    if (!restaurant) {
      return {
        success: false,
        error: `Restaurant with ID ${restaurantId} not found`
      };
    }

    if (restaurant.reservationSupport !== 'TABLE_ONLY' && restaurant.reservationSupport !== 'BOTH') {
      return {
        success: false,
        error: `Restaurant does not support table reservations (current: ${restaurant.reservationSupport})`
      };
    }

    // Check if configuration already exists
    const existingConfig = await prisma.tableReservationUtilsConfiguration.findFirst({
      where: { restaurantId }
    });

    let configResult;

    if (existingConfig) {
      // Update existing configuration
      configResult = await prisma.tableReservationUtilsConfiguration.update({
        where: { id: existingConfig.id },
        data: {
          feeType: config.feeType,
          feeValue: config.feeValue,
          requiresAdvancePayment: config.requiresAdvancePayment,
          advancePaymentType: config.advancePaymentType,
          advancePaymentValue: config.advancePaymentValue,
          defaultSlotMinutes: config.defaultSlotMinutes,
          turnoverBufferMinutes: config.turnoverBufferMinutes,
          enableTemporaryHold: config.enableTemporaryHold,
          holdMinutes: config.holdMinutes,
          allowFlexibleAssignment: config.allowFlexibleAssignment,
          defaultDwellMinutes: config.defaultDwellMinutes || 90,
          updatedAt: new Date(),
        },
        select: {
          id: true,
          restaurantId: true,
        }
      });
    } else {
      // Create new configuration
      configResult = await prisma.tableReservationUtilsConfiguration.create({
        data: {
          restaurantId,
          feeType: config.feeType,
          feeValue: config.feeValue,
          requiresAdvancePayment: config.requiresAdvancePayment,
          advancePaymentType: config.advancePaymentType,
          advancePaymentValue: config.advancePaymentValue,
          defaultSlotMinutes: config.defaultSlotMinutes,
          turnoverBufferMinutes: config.turnoverBufferMinutes,
          enableTemporaryHold: config.enableTemporaryHold,
          holdMinutes: config.holdMinutes,
          allowFlexibleAssignment: config.allowFlexibleAssignment,
          defaultDwellMinutes: config.defaultDwellMinutes || 90,
        },
        select: {
          id: true,
          restaurantId: true,
        }
      });
    }

    // Check if operating hours already exist for this restaurant
    const existingHours = await prisma.restaurantOperatingHours.findMany({
      where: { restaurantId },
      select: { restaurantId: true }
    });

    if (existingHours.length === 0) {
      // Create default operating hours to display on most popular section in guestweb (for both create and update)
      // Helper function to create UTC DateTime objects from time strings
      const createUTCTimeDate = (timeString: string): Date => {
        // Create a date object with time set to the specified time in UTC
        // Using a fixed date (2000-01-01) since we only care about the time part
        const [hours, minutes, seconds] = timeString.split(':').map(Number);
        const date = new Date(Date.UTC(2000, 0, 1, hours, minutes, seconds));
        return date;
      };

      const defaultHours: OperatingHoursInput[] = Object.values(DayOfWeek).map(dayOfWeek => ({
        dayOfWeek,
        isOpen: true,
        capacity: 100,
        onlineQuota: 100,
        openingTime: createUTCTimeDate('00:00:00').toISOString(),
        closingTime: createUTCTimeDate('23:59:59').toISOString()
      }));

      const hoursResult = await createRestaurantOperatingHours(prisma, restaurantId, defaultHours);
      if (!hoursResult.success) {
        // Don't fail the entire operation for this - operating hours can be created separately
        // The config creation will still succeed
      }
    }

    return {
      success: true,
      data: {
        configId: configResult.id,
        restaurantId: configResult.restaurantId ?? restaurantId,
      }
    };

  } catch (error) {
    console.error('Error creating table reservation configuration:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

// ============================================================================
// 4. Generate Table Availability Slots
// ============================================================================

export async function generateTableAvailabilitySlots(
  prisma: PrismaClient,
  restaurantId: number,
  slotConfig: SlotGenerationInput
): Promise<SlotGenerationResult> {
  try {
    // Validate restaurant exists and supports table reservations
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, reservationSupport: true }
    });

    if (!restaurant) {
      return {
        success: false,
        error: `Restaurant with ID ${restaurantId} not found`
      };
    }

    if (restaurant.reservationSupport !== 'TABLE_ONLY' && restaurant.reservationSupport !== 'BOTH') {
      return {
        success: false,
        error: `Restaurant does not support table reservations (current: ${restaurant.reservationSupport})`
      };
    }

    // Get target tables
    let targetTables;
    if (slotConfig.targetTableIds && slotConfig.targetTableIds.length > 0) {
      targetTables = await prisma.restaurantTable.findMany({
        where: {
          id: { in: slotConfig.targetTableIds },
          restaurantId,
          isActive: true
        },
        select: { id: true }
      });

      if (targetTables.length !== slotConfig.targetTableIds.length) {
        const foundIds = targetTables.map(t => t.id);
        const missingIds = slotConfig.targetTableIds.filter(id => !foundIds.includes(id));
        return {
          success: false,
          error: `Some table IDs not found or inactive: ${missingIds.join(', ')}`
        };
      }
    } else {
      // Use all active tables
      targetTables = await prisma.restaurantTable.findMany({
        where: {
          restaurantId,
          isActive: true
        },
        select: { id: true }
      });

      if (targetTables.length === 0) {
        return {
          success: false,
          error: 'No active tables found for this restaurant'
        };
      }
    }

    // Generate slots in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(startDate.getDate() + slotConfig.daysAhead);

      let totalSlotsGenerated = 0;
      const slotsToCreate = [];

      // Generate slots for each day
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase() as DayOfWeek;
        
        if (!slotConfig.enabledDays.includes(dayOfWeek)) {
          continue;
        }

        // Parse start and end times
        const startTimeParts = slotConfig.startTime.split(':');
        const endTimeParts = slotConfig.endTime.split(':');
        const startHour = parseInt(startTimeParts[0] || '0');
        const startMinute = parseInt(startTimeParts[1] || '0');
        const endHour = parseInt(endTimeParts[0] || '0');
        const endMinute = parseInt(endTimeParts[1] || '0');

        const dayStart = new Date(d);
        dayStart.setHours(startHour, startMinute, 0, 0);

        const dayEnd = new Date(d);
        dayEnd.setHours(endHour, endMinute, 0, 0);

        // Generate time slots for the day
        const slotDuration = slotConfig.slotDurationMinutes + slotConfig.turnoverBufferMinutes;
        
        for (let slotStart = new Date(dayStart); slotStart < dayEnd; slotStart.setMinutes(slotStart.getMinutes() + slotDuration)) {
          const slotEnd = new Date(slotStart);
          slotEnd.setMinutes(slotStart.getMinutes() + slotConfig.slotDurationMinutes);

          if (slotEnd > dayEnd) break;

          // Create slots for each table  
          for (const table of targetTables) {
            // Set date part only (no time)
            const slotDate = new Date(d);
            slotDate.setHours(0, 0, 0, 0);
            
            // Set time part only (no date)
            const startTimeOnly = new Date(slotStart);
            const endTimeOnly = new Date(slotEnd);
            
            slotsToCreate.push({
              restaurantId,
              tableId: table.id,
              date: slotDate,
              startTime: startTimeOnly,
              endTime: endTimeOnly,
              status: 'AVAILABLE' as const,
            });
            totalSlotsGenerated++;
          }
        }
      }

      // Batch create slots (in chunks to avoid memory issues)
      const chunkSize = 1000;
      for (let i = 0; i < slotsToCreate.length; i += chunkSize) {
        const chunk = slotsToCreate.slice(i, i + chunkSize);
        await tx.tableAvailabilitySlot.createMany({
          data: chunk,
          skipDuplicates: true
        });
      }

      return {
        slotsGenerated: totalSlotsGenerated,
        dateRange: {
          startDate: startDate.toISOString().split('T')[0] || '',
          endDate: endDate.toISOString().split('T')[0] || '',
        },
        tablesAffected: targetTables.length
      };
    });

    return {
      success: true,
      data: result
    };

  } catch (error) {
    console.error('Error generating table availability slots:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

// ============================================================================
// 5. Create Restaurant Refund Policies (reusable for both buffet and table)
// Note: RefundPolicy model structure needs to be confirmed in schema
// ============================================================================

// export async function createRestaurantRefundPolicies(
//   prisma: PrismaClient,
//   restaurantId: number,
//   policies: RefundPolicyInput[]
// ): Promise<RefundPolicyResult> {
//   // TODO: Implement when RefundPolicy model structure is confirmed in schema
//   console.warn('RefundPolicy model not found in current schema - implementation skipped');
  
//   return {
//     success: false,
//     error: 'RefundPolicy model not implemented in current schema'
//   };
// }

// ============================================================================
// Validation Queries
// ============================================================================

// Check if restaurant supports table reservations
// export async function checkTableSupport(
//   prisma: PrismaClient,
//   restaurantId: number
// ): Promise<boolean> {
//   try {
//     const restaurant = await prisma.restaurant.findUnique({
//       where: { id: restaurantId },
//       select: { reservationSupport: true }
//     });

//     return restaurant?.reservationSupport === 'TABLE_ONLY' || restaurant?.reservationSupport === 'BOTH';
//   } catch (error) {
//     console.error('Error checking table support:', error);
//     return false;
//   }
// }

// Validate table restaurant completeness
export async function validateTableRestaurantSetup(
  prisma: PrismaClient,
  restaurantId: number
): Promise<ValidationResult> {
  try {
    const missingComponents: string[] = [];
    const warnings: string[] = [];

    // Check restaurant exists and supports tables
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, reservationSupport: true }
    });

    if (!restaurant) {
      return {
        isValid: false,
        missingComponents: ['Restaurant not found'],
        warnings: []
      };
    }

    if (restaurant.reservationSupport !== 'TABLE_ONLY' && restaurant.reservationSupport !== 'BOTH') {
      missingComponents.push('Table reservation support not enabled');
    }

    // Check sections
    const sections = await prisma.restaurantSection.findMany({
      where: { restaurantId, isActive: true },
      select: { id: true }
    });

    if (sections.length === 0) {
      missingComponents.push('Restaurant sections');
    }

    // Check tables
    const tables = await prisma.restaurantTable.findMany({
      where: { restaurantId, isActive: true },
      select: { id: true }
    });

    if (tables.length === 0) {
      missingComponents.push('Restaurant tables');
    } else if (tables.length < 3) {
      warnings.push(`Only ${tables.length} tables configured - consider adding more`);
    }

    // Check reservation configuration
    const config = await prisma.tableReservationUtilsConfiguration.findFirst({
      where: { restaurantId }
    });

    if (!config) {
      missingComponents.push('Table reservation configuration');
    }

    // Check availability slots (at least for today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const todaySlots = await prisma.tableAvailabilitySlot.findFirst({
      where: {
        restaurantId,
        startTime: {
          gte: today,
          lt: tomorrow
        }
      }
    });

    if (!todaySlots) {
      missingComponents.push('Availability slots');
    }

    // Check operating hours
    const operatingHours = await prisma.restaurantOperatingHours.findMany({
      where: { restaurantId }
    });

    if (operatingHours.length === 0) {
      missingComponents.push('Operating hours');
    } else if (operatingHours.length < 7) {
      warnings.push('Not all days of the week have operating hours configured');
    }

    return {
      isValid: missingComponents.length === 0,
      missingComponents,
      warnings
    };

  } catch (error) {
    console.error('Error validating table restaurant setup:', error);
    return {
      isValid: false,
      missingComponents: ['Validation error occurred'],
      warnings: []
    };
  }
}

// ============================================================================
// Update Functions
// ============================================================================

// ============================================================================
// Update Restaurant Section
// ============================================================================

export async function updateRestaurantSection(
  prisma: PrismaClient,
  sectionId: number,
  restaurantId: number,
  updates: UpdateRestaurantSectionInput
): Promise<SectionUpdateResult> {
  try {
    // Validate that the section exists and belongs to the restaurant
    const existingSection = await prisma.restaurantSection.findFirst({
      where: {
        id: sectionId,
        restaurantId,
      },
      select: { id: true }
    });

    if (!existingSection) {
      return {
        success: false,
        error: `Section with ID ${sectionId} not found for restaurant ${restaurantId}`
      };
    }

    // Check for duplicate section names within the restaurant (if name is being updated)
    if (updates.sectionName) {
      const duplicateSection = await prisma.restaurantSection.findFirst({
        where: {
          restaurantId,
          sectionName: updates.sectionName,
          id: { not: sectionId } // Exclude current section
        }
      });

      if (duplicateSection) {
        return {
          success: false,
          error: `Section name "${updates.sectionName}" already exists in this restaurant`
        };
      }
    }

    // Track which fields are being updated
    const updatedFields: string[] = [];
    const updateData: any = {};

    if (updates.sectionName !== undefined) {
      updateData.sectionName = updates.sectionName;
      updatedFields.push('sectionName');
    }
    if (updates.description !== undefined) {
      updateData.description = updates.description;
      updatedFields.push('description');
    }
    if (updates.capacity !== undefined) {
      updateData.capacity = updates.capacity;
      updatedFields.push('capacity');
    }
    if (updates.displayOrder !== undefined) {
      updateData.displayOrder = updates.displayOrder;
      updatedFields.push('displayOrder');
    }
    if (updates.isActive !== undefined) {
      updateData.isActive = updates.isActive;
      updatedFields.push('isActive');
    }

    // Update the section
    await prisma.restaurantSection.update({
      where: { id: sectionId },
      data: updateData
    });

    return {
      success: true,
      data: {
        sectionId,
        updatedFields
      }
    };

  } catch (error) {
    console.error('Error updating restaurant section:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

// ============================================================================
// Update Restaurant Table
// ============================================================================

export async function updateRestaurantTable(
  prisma: PrismaClient,
  tableId: number,
  restaurantId: number,
  updates: UpdateRestaurantTableInput
): Promise<TableUpdateResult> {
  try {
    // Validate that the table exists and belongs to the restaurant
    const existingTable = await prisma.restaurantTable.findFirst({
      where: {
        id: tableId,
        restaurantId,
      },
      select: { id: true, sectionId: true }
    });

    if (!existingTable) {
      return {
        success: false,
        error: `Table with ID ${tableId} not found for restaurant ${restaurantId}`
      };
    }

    // If sectionId is being updated, validate the new section exists and belongs to the restaurant
    if (updates.sectionId !== undefined && updates.sectionId !== existingTable.sectionId) {
      const newSection = await prisma.restaurantSection.findFirst({
        where: {
          id: updates.sectionId,
          restaurantId,
          isActive: true
        }
      });

      if (!newSection) {
        return {
          success: false,
          error: `Section with ID ${updates.sectionId} not found or inactive for restaurant ${restaurantId}`
        };
      }
    }

    // Check for duplicate table names within the restaurant (if name is being updated)
    if (updates.tableName) {
      const duplicateTable = await prisma.restaurantTable.findFirst({
        where: {
          restaurantId,
          tableName: updates.tableName,
          id: { not: tableId } // Exclude current table
        }
      });

      if (duplicateTable) {
        return {
          success: false,
          error: `Table name "${updates.tableName}" already exists in this restaurant`
        };
      }
    }

    // Track which fields are being updated
    const updatedFields: string[] = [];
    const updateData: any = {};

    if (updates.sectionId !== undefined) {
      updateData.sectionId = updates.sectionId;
      updatedFields.push('sectionId');
    }
    if (updates.tableName !== undefined) {
      updateData.tableName = updates.tableName;
      updatedFields.push('tableName');
    }
    if (updates.seatingCapacity !== undefined) {
      updateData.seatingCapacity = updates.seatingCapacity;
      updatedFields.push('seatingCapacity');
    }
    if (updates.tableType !== undefined) {
      updateData.tableType = updates.tableType;
      updatedFields.push('tableType');
    }
    if (updates.position !== undefined) {
      updateData.position = updates.position ? `${updates.position.x},${updates.position.y}` : null;
      updatedFields.push('position');
    }
    if (updates.amenities !== undefined) {
      updateData.amenities = updates.amenities ? JSON.stringify(updates.amenities) : null;
      updatedFields.push('amenities');
    }
    if (updates.isActive !== undefined) {
      updateData.isActive = updates.isActive;
      updatedFields.push('isActive');
    }

    // Update the table
    await prisma.restaurantTable.update({
      where: { id: tableId },
      data: updateData
    });

    return {
      success: true,
      data: {
        tableId,
        updatedFields
      }
    };

  } catch (error) {
    console.error('Error updating restaurant table:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

// ============================================================================
// Update Table Reservation Configuration
// ============================================================================

export async function updateTableReservationUtilsConfig(
  prisma: PrismaClient,
  restaurantId: number,
  updates: UpdateTableReservationUtilsConfigInput
): Promise<ConfigUpdateResult> {
  try {
    // Check if configuration exists for this restaurant
    const existingConfig = await prisma.tableReservationUtilsConfiguration.findFirst({
      where: { restaurantId }
    });

    if (!existingConfig) {
      return {
        success: false,
        error: `No table reservation configuration found for restaurant ${restaurantId}. Please create a configuration first.`
      };
    }

    // Track which fields are being updated
    const updatedFields: string[] = [];
    const updateData: any = {};

    if (updates.feeType !== undefined) {
      updateData.feeType = updates.feeType;
      updatedFields.push('feeType');
    }
    if (updates.feeValue !== undefined) {
      updateData.feeValue = updates.feeValue;
      updatedFields.push('feeValue');
    }
    if (updates.requiresAdvancePayment !== undefined) {
      updateData.requiresAdvancePayment = updates.requiresAdvancePayment;
      updatedFields.push('requiresAdvancePayment');
    }
    if (updates.advancePaymentType !== undefined) {
      updateData.advancePaymentType = updates.advancePaymentType;
      updatedFields.push('advancePaymentType');
    }
    if (updates.advancePaymentValue !== undefined) {
      updateData.advancePaymentValue = updates.advancePaymentValue;
      updatedFields.push('advancePaymentValue');
    }
    if (updates.defaultSlotMinutes !== undefined) {
      updateData.defaultSlotMinutes = updates.defaultSlotMinutes;
      updatedFields.push('defaultSlotMinutes');
    }
    if (updates.turnoverBufferMinutes !== undefined) {
      updateData.turnoverBufferMinutes = updates.turnoverBufferMinutes;
      updatedFields.push('turnoverBufferMinutes');
    }
    if (updates.enableTemporaryHold !== undefined) {
      updateData.enableTemporaryHold = updates.enableTemporaryHold;
      updatedFields.push('enableTemporaryHold');
    }
    if (updates.holdMinutes !== undefined) {
      updateData.holdMinutes = updates.holdMinutes;
      updatedFields.push('holdMinutes');
    }
    if (updates.allowFlexibleAssignment !== undefined) {
      updateData.allowFlexibleAssignment = updates.allowFlexibleAssignment;
      updatedFields.push('allowFlexibleAssignment');
    }

    // Update the configuration
    await prisma.tableReservationUtilsConfiguration.update({
      where: { id: existingConfig.id },
      data: {
        ...updateData,
        updatedAt: new Date()
      }
    });

    return {
      success: true,
      data: {
        configId: existingConfig.id,
        updatedFields
      }
    };

  } catch (error) {
    console.error('Error updating table reservation configuration:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}


// ============================================================================
// Additional Helper Functions for Table Reservations
// ============================================================================

// Restaurant section lookup functions
export interface FindRestaurantSectionInput {
  restaurantId: number;
  sectionName?: string;
  areaId?: number;
}

export interface FindRestaurantSectionResult {
  success: boolean;
  sectionId?: number;
  error?: string;
}

export async function findRestaurantSection(
  prisma: PrismaClient,
  input: FindRestaurantSectionInput
): Promise<FindRestaurantSectionResult> {
  try {
    let sectionId: number | undefined;

    if (input.areaId) {
      // Use the provided area ID directly
      sectionId = input.areaId;
    } else if (input.sectionName && input.sectionName !== "any") {
      // Find section by name if area ID is not provided
      const section = await prisma.restaurantSection.findFirst({
        where: {
          restaurantId: input.restaurantId,
          sectionName: input.sectionName,
          isActive: true
        }
      });
      sectionId = section?.id;
    }

    return {
      success: true,
      sectionId
    };
  } catch (error) {
    console.error("Error finding restaurant section:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to find restaurant section"
    };
  }
}

// Apply reservation policies function
export interface ApplyReservationPoliciesInput {
  reservationId: number;
  requestId: number;
  policyApplications: Array<{
    policyId: number;
    selectedOptionId?: number;
    wasAccepted: boolean;
    wasSkipped: boolean;
    appliedAt: Date;
  }>;
}

export interface ApplyReservationPoliciesResult {
  success: boolean;
  error?: string;
}

export async function applyReservationPolicies(
  prisma: PrismaClient,
  input: ApplyReservationPoliciesInput
): Promise<ApplyReservationPoliciesResult> {
  try {
    const policyApplications = input.policyApplications.map(app => ({
      reservationId: input.reservationId,
      requestId: input.requestId,
      policyId: app.policyId,
      selectedOptionId: app.selectedOptionId || null,
      wasAccepted: app.wasAccepted,
      wasSkipped: app.wasSkipped,
      appliedAt: app.appliedAt
    }));

    await prisma.reservationAppliedPolicies.createMany({
      data: policyApplications,
      skipDuplicates: true
    });

    return { success: true };
  } catch (error) {
    console.error("Error applying reservation policies:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to apply policies to reservation"
    };
  }
}
