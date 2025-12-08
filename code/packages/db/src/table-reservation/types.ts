import { z } from 'zod';
import { 
  FeeType, 
  TableSlotStatus, 
  ReservationSupportType,
  ReservationType,
  type PrismaClient 
} from '../../prisma/generated/prisma';

// Configuration types
export const TableReservationConfigSchema = z.object({
  id: z.number(),
  restaurantId: z.number().nullable(),
  feeType: z.nativeEnum(FeeType),
  feeValue: z.any().transform(val => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') return parseFloat(val);
    if (val && typeof val === 'object' && 'toNumber' in val) return val.toNumber();
    return 0;
  }),
  requiresAdvancePayment: z.boolean(),
  advancePaymentType: z.nativeEnum(FeeType).nullable(),
  advancePaymentValue: z.any().nullable().transform(val => {
    if (val === null) return null;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') return parseFloat(val);
    if (val && typeof val === 'object' && 'toNumber' in val) return val.toNumber();
    return null;
  }),
  defaultSlotMinutes: z.number(),
  turnoverBufferMinutes: z.number(),
  defaultDwellMinutes: z.number(),
  enableTemporaryHold: z.boolean(),
  holdMinutes: z.number(),
  allowFlexibleAssignment: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type TableReservationConfig = z.infer<typeof TableReservationConfigSchema>;

// Section and Table types
export const RestaurantSectionDataSchema = z.object({
  id: z.number(),
  restaurantId: z.number(),
  sectionName: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  displayOrder: z.number().nullable(),
  capacity: z.number().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const RestaurantTableDataSchema = z.object({
  id: z.number(),
  restaurantId: z.number(),
  sectionId: z.number(),
  tableName: z.string(),
  seatingCapacity: z.number(),
  tableType: z.string().nullable(),
  isActive: z.boolean(),
  position: z.any().nullable(), // JSON
  amenities: z.any().nullable(), // JSON
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type RestaurantSectionData = z.infer<typeof RestaurantSectionDataSchema>;
export type RestaurantTableData = z.infer<typeof RestaurantTableDataSchema>;

// Section with tables
export const SectionWithTablesSchema = RestaurantSectionDataSchema.extend({
  tables: z.array(RestaurantTableDataSchema),
});

export type SectionWithTables = z.infer<typeof SectionWithTablesSchema>;

// Result types
export type GetTableReservationConfigResult = 
  | { success: true; config: TableReservationConfig }
  | { success: false; error: string };

export type GetSectionsAndTablesResult = 
  | { success: true; sections: SectionWithTables[] }
  | { success: false; error: string };

// Input validation schemas
export const GetTableReservationConfigInput = z.object({
  restaurantId: z.number().positive(),
});

export const GetSectionsAndTablesInput = z.object({
  restaurantId: z.number().positive(),
});

export type GetTableReservationConfigInputType = z.infer<typeof GetTableReservationConfigInput>;
export type GetSectionsAndTablesInputType = z.infer<typeof GetSectionsAndTablesInput>;

// Table slot types
export const TableAvailabilitySlotDataSchema = z.object({
  id: z.number(),
  restaurantId: z.number(),
  tableId: z.number(),
  date: z.date(),
  startTime: z.date(),
  endTime: z.date(),
  status: z.nativeEnum(TableSlotStatus),
  reservationId: z.number().nullable(),
  holdExpiresAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type TableAvailabilitySlotData = z.infer<typeof TableAvailabilitySlotDataSchema>;

// Available slot with table and section info
export const AvailableTableSlotSchema = TableAvailabilitySlotDataSchema.extend({
  table: z.object({
    id: z.number(),
    tableName: z.string(),
    seatingCapacity: z.number(),
    tableType: z.string().nullable(),
    section: z.object({
      id: z.number(),
      sectionName: z.string(),
      displayOrder: z.number().nullable(),
    }),
  }),
});

export type AvailableTableSlot = z.infer<typeof AvailableTableSlotSchema>;

// Result types
export type GetAvailableTableSlotsResult = 
  | { success: true; slots: AvailableTableSlot[] }
  | { success: false; error: string };

// Input validation schemas
export const GetAvailableTableSlotsInput = z.object({
  restaurantId: z.number().positive(),
  date: z.date(),
});

export type GetAvailableTableSlotsInputType = z.infer<typeof GetAvailableTableSlotsInput>;

// Get available table slots for specific date and section
export const GetAvailableTableSlotsBySectionInput = z.object({
  restaurantId: z.number().positive(),
  date: z.date(),
  sectionId: z.number().positive(),
});

export type GetAvailableTableSlotsBySectionInputType = z.infer<typeof GetAvailableTableSlotsBySectionInput>;

export type GetAvailableTableSlotsBySectionResult = 
  | { success: true; slots: AvailableTableSlot[] }
  | { success: false; error: string };

// Hold table slot types
export const HoldTableSlotInput = z.object({
  restaurantId: z.number().positive(),
  tableId: z.number().positive(),
  date: z.date(),
  startTime: z.date(),
  endTime: z.date(),
  requestId: z.number().positive(),
  holdMinutes: z.number().positive().default(10),
});

export type HoldTableSlotInputType = z.infer<typeof HoldTableSlotInput>;

export type HoldTableSlotResult = 
  | { success: true; slotId: number; holdExpiresAt: Date }
  | { success: false; error: string };

// Reserve table slot types
export const ReserveTableSlotInput = z.object({
  slotId: z.number().positive().optional(),
  tableId: z.number().positive().optional(),
  date: z.date().optional(),
  startTime: z.date().optional(),
  endTime: z.date().optional(),
  reservationId: z.number().positive(),
  restaurantId: z.number().positive(),
});

export type ReserveTableSlotInputType = z.infer<typeof ReserveTableSlotInput>;

export type ReserveTableSlotResult = 
  | { success: true; slotId: number; reservationId: number }
  | { success: false; error: string };

// Release expired holds types
export const ReleaseExpiredHoldsInput = z.object({
  batchSize: z.number().positive().default(100),
  dryRun: z.boolean().default(false),
});

export type ReleaseExpiredHoldsInputType = z.infer<typeof ReleaseExpiredHoldsInput>;

export type ReleaseExpiredHoldsResult = 
  | { success: true; releasedCount: number; releasedSlotIds: number[] }
  | { success: false; error: string };

// Create table reservation request types
export const CreateTableReservationRequestInput = z.object({
  restaurantId: z.number().positive(),
  customerId: z.number().positive(),
  requestName: z.string().min(1),
  contactPhone: z.string().min(1),
  requestedDate: z.date(),
  requestedTime: z.date(),
  adultCount: z.number().positive(),
  childCount: z.number().min(0),
  mealType: z.enum(['BREAKFAST', 'LUNCH', 'DINNER']),
  mealServiceId: z.number().positive().optional(),
  estimatedTotalAmount: z.number().positive(),
  estimatedServiceCharge: z.number().min(0),
  estimatedTaxAmount: z.number().min(0),
  specialRequests: z.string().optional(),
  dietaryRequirements: z.string().optional(),
  occasion: z.string().optional(),
  reservationType: z.nativeEnum(ReservationType).default(ReservationType.TABLE_ONLY),
  requiresAdvancePayment: z.boolean().default(true),
  promoCodeId: z.number().positive().optional(),
  estimatedDiscountAmount: z.number().min(0).optional(),
  eligiblePromoPartySize: z.number().positive().optional(),
  
  // Table-specific details
  preferredSectionId: z.number().positive().optional(),
  preferredTableId: z.number().positive().optional(),
  preferredTimeSlotStart: z.date().optional(),
  preferredTimeSlotEnd: z.date().optional(),
  isFlexibleWithTable: z.boolean().default(true),
  isFlexibleWithSection: z.boolean().default(true),
  isFlexibleWithTime: z.boolean().default(false),
});

export type CreateTableReservationRequestInputType = z.infer<typeof CreateTableReservationRequestInput>;

export type CreateTableReservationRequestResult = 
  | { success: true; requestId: number; tableDetailsId: number }
  | { success: false; error: string };

// Confirm table reservation types
export const ConfirmTableReservationInput = z.object({
  requestId: z.number().positive(),
  // Table assignment details (can be auto-assigned if flexible)
  assignedSectionId: z.number().positive().optional(),
  assignedTableId: z.number().positive().optional(),
  slotId: z.number().positive().optional(),
  tableStartTime: z.date().optional(),
  tableEndTime: z.date().optional(),
  // Payment details (if payment was made)
  advancePaymentAmount: z.number().min(0).optional(),
  remainingPaymentAmount: z.number().min(0).optional(),
  // Reservation number (auto-generated if not provided)
  reservationNumber: z.string().optional(),
});

export type ConfirmTableReservationInputType = z.infer<typeof ConfirmTableReservationInput>;

export type ConfirmTableReservationResult = 
  | { success: true; reservationId: number; assignmentId: number; slotId?: number }
  | { success: false; error: string };
