import { PrismaClient, ReservationType, FeeType, MealType, DayOfWeek } from "../../prisma/generated/prisma";
import { z } from "zod";

// Input types for policy options
export interface PolicyOptionInput {
  optionName: string;
  description?: string;
  additionalPrice: number;
  additionalPriceType: FeeType;
  requiresPayment: boolean;
  isDefault: boolean;
  displayOrder: number;
  applicableDays?: DayOfWeek[];
}

// Input type for policy options with optional ID (for updates)
export interface PolicyOptionUpdateInput extends PolicyOptionInput {
  id?: number;
}

// Main policy input
export interface ReservationBusinessPolicyInput {
  restaurantId: number;
  name: string;
  title: string;
  content?: string;
  isRefundAllowed: boolean;
  isActive: boolean;
  isVisibleCustomerPortal: boolean;
  isIncludedConfirmationEmail: boolean;
  isOptional: boolean;

  // Payment Configuration
  requiresPayment: boolean;
  paymentType: FeeType;
  paymentValue: number;
  paymentHandledByOptions: boolean;

  // User Selection
  userSelectionAllowed: boolean;

  // Conditions
  partySizeMin?: number;
  partySizeMax?: number;
  applicableDays: DayOfWeek[];
  timeIntervalStart?: Date;
  timeIntervalEnd?: Date;
  applicableSectionIds: number[];
  applicableMealTypes: MealType[];
  applicableReservationTypes: ReservationType[];

  // Options (when userSelectionAllowed is true)
  policyOptions?: PolicyOptionInput[];

  // Metadata
  createdBy: string;
  updatedBy: string;
}

// Update input (allows partial updates and options with IDs)
export interface ReservationBusinessPolicyUpdateInput extends Partial<ReservationBusinessPolicyInput> {
  id: number;
  policyOptions?: PolicyOptionUpdateInput[]; // Override to allow IDs
}

// Validation schemas
const PolicyOptionSchema = z.object({
  optionName: z.string().min(1, "Option name is required"),
  description: z.string().optional(),
  additionalPrice: z.number().min(0, "Price must be non-negative"),
  additionalPriceType: z.enum(['FIXED', 'PERCENTAGE']),
  requiresPayment: z.boolean(),
  isDefault: z.boolean(),
  displayOrder: z.number().min(0),
  applicableDays: z.array(z.nativeEnum(DayOfWeek)).optional()
});

// Schema for policy options with optional ID (for updates)
const PolicyOptionUpdateSchema = PolicyOptionSchema.extend({
  id: z.number().optional()
});

const ReservationBusinessPolicySchema = z.object({
  restaurantId: z.number().positive("Restaurant ID is required"),
  name: z.string().min(1, "Policy name is required").max(100, "Name too long"),
  title: z.string().min(1, "Policy title is required").max(200, "Title too long"),
  content: z.string().optional(),
  isRefundAllowed: z.boolean().default(false),
  isActive: z.boolean(),
  isVisibleCustomerPortal: z.boolean(),
  isIncludedConfirmationEmail: z.boolean(),
  isOptional: z.boolean(),

  // Payment Configuration
  requiresPayment: z.boolean(),
  paymentType: z.enum(['FIXED', 'PERCENTAGE']),
  paymentValue: z.number().min(0, "Payment value must be non-negative"),
  paymentHandledByOptions: z.boolean(),

  // User Selection
  userSelectionAllowed: z.boolean(),

  // Conditions
  partySizeMin: z.number().min(1).optional(),
  partySizeMax: z.number().min(1).optional(),
  applicableDays: z.array(z.nativeEnum(DayOfWeek)).default([DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY]),
  timeIntervalStart: z.date().optional(),
  timeIntervalEnd: z.date().optional(),
  applicableSectionIds: z.array(z.number()),
  applicableMealTypes: z.array(z.enum(['BREAKFAST', 'BRUNCH', 'LUNCH', 'HIGH_TEA', 'DINNER', 'SPECIAL'])),
  applicableReservationTypes: z.array(z.enum(['TABLE_ONLY', 'BUFFET_ONLY', 'BUFFET_AND_TABLE'])),

  // Options
  policyOptions: z.array(PolicyOptionSchema).optional(),

  // Metadata
  createdBy: z.string().min(1, "Created by is required"),
  updatedBy: z.string().min(1, "Updated by is required")
});

// Create a separate schema for updates without refinements
const ReservationBusinessPolicyUpdateSchema = z.object({
  restaurantId: z.number().positive().optional(),
  name: z.string().min(1).max(100).optional(),
  title: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
  isRefundAllowed: z.boolean().optional(),
  isOptional: z.boolean().optional(),
  isActive: z.boolean().optional(),
  isVisibleCustomerPortal: z.boolean().optional(),
  isIncludedConfirmationEmail: z.boolean().optional(),
  requiresPayment: z.boolean().optional(),
  paymentType: z.enum(['FIXED', 'PERCENTAGE']).optional(),
  paymentValue: z.number().min(0).optional(),
  paymentHandledByOptions: z.boolean().optional(),
  userSelectionAllowed: z.boolean().optional(),
  partySizeMin: z.number().min(1).optional(),
  partySizeMax: z.number().min(1).optional(),
  applicableDays: z.array(z.nativeEnum(DayOfWeek)).optional(),
  timeIntervalStart: z.date().optional(),
  timeIntervalEnd: z.date().optional(),
  applicableSectionIds: z.array(z.number()).optional(),
  applicableMealTypes: z.array(z.enum(['BREAKFAST', 'BRUNCH', 'LUNCH', 'HIGH_TEA', 'DINNER', 'SPECIAL'])).optional(),
  applicableReservationTypes: z.array(z.enum(['TABLE_ONLY', 'BUFFET_ONLY', 'BUFFET_AND_TABLE'])).optional(),
  policyOptions: z.array(PolicyOptionUpdateSchema).optional(),
  updatedBy: z.string().min(1).optional()
});

// Result types using discriminated union
export type CreatePolicyResult =
  | { success: true; policy: { id: number; name: string; title: string; createdAt: Date } }
  | { success: false; error: string };

export type UpdatePolicyResult =
  | { success: true; policy: { id: number; name: string; title: string; updatedAt: Date } }
  | { success: false; error: string };

export type DeletePolicyResult =
  | { success: true; message: string }
  | { success: false; error: string };

export type GetPoliciesResult =
  | { success: true; policies: Array<{
      id: number;
      name: string;
      title: string;
      content: string;
      isRefundAllowed: boolean;
      isActive: boolean;
      isVisibleCustomerPortal: boolean;
      isIncludedConfirmationEmail: boolean;
      isOptional: boolean;
      requiresPayment: boolean;
      paymentType: FeeType | null;
      paymentValue: number | null;
      paymentHandledByOptions: boolean;
      userSelectionAllowed: boolean;
      partySizeMin: number | null;
      partySizeMax: number | null;
      applicableDays: DayOfWeek[];
      timeIntervalStart: Date | null;
      timeIntervalEnd: Date | null;
      applicableSectionIds: number[];
      applicableMealTypes: MealType[];
      applicableReservationTypes: ReservationType[];
      createdAt: Date;
      updatedAt: Date;
      policyOptions: Array<{
        id: number;
        optionName: string;
        description: string | null;
        additionalPrice: number;
        additionalPriceType: FeeType;
        requiresPayment: boolean;
        isDefault: boolean;
        displayOrder: number;
        applicableDays: DayOfWeek[];
      }>;
    }>; totalCount: number }
  | { success: false; error: string };

// Create policy with options
export async function createReservationBusinessPolicy(
  prisma: PrismaClient,
  input: ReservationBusinessPolicyInput
): Promise<CreatePolicyResult> {
  try {
    // Validate input
    const validatedInput = ReservationBusinessPolicySchema.parse(input);

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Create the main policy
      const policy = await tx.reservationBusinessPolicy.create({
        data: {
          restaurantId: validatedInput.restaurantId,
          name: validatedInput.name,
          title: validatedInput.title,
          content: validatedInput.content || '',
          isRefundAllowed: validatedInput.isRefundAllowed,
          isActive: validatedInput.isActive,
          isVisibleCustomerPortal: validatedInput.isVisibleCustomerPortal,
          isIncludedConfirmationEmail: validatedInput.isIncludedConfirmationEmail,
          isOptional: validatedInput.isOptional,
          requiresPayment: validatedInput.requiresPayment,
          paymentType: validatedInput.paymentType,
          paymentValue: validatedInput.paymentValue,
          paymentHandledByOptions: validatedInput.paymentHandledByOptions,
          userSelectionAllowed: validatedInput.userSelectionAllowed,
          partySizeMin: validatedInput.partySizeMin,
          partySizeMax: validatedInput.partySizeMax,
          applicableDays: validatedInput.applicableDays,
            timeIntervalStart: validatedInput.timeIntervalStart,
            timeIntervalEnd: validatedInput.timeIntervalEnd,
          applicableSectionIds: validatedInput.applicableSectionIds,
          applicableMealTypes: validatedInput.applicableMealTypes,
          applicableReservationTypes: validatedInput.applicableReservationTypes,
          createdBy: validatedInput.createdBy,
          updatedBy: validatedInput.updatedBy
        }
      });

      // Create policy options if user selection is enabled
      if (validatedInput.userSelectionAllowed && validatedInput.policyOptions) {
        await tx.reservationPolicyOption.createMany({
          data: validatedInput.policyOptions.map(option => ({
            policyId: policy.id,
            optionName: option.optionName,
            description: option.description,
            additionalPrice: option.additionalPrice,
            additionalPriceType: option.additionalPriceType,
            requiresPayment: option.requiresPayment,
            isDefault: option.isDefault,
            displayOrder: option.displayOrder,
            applicableDays: option.applicableDays || [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY]
          }))
        });
      }

      return policy;
    });

    return {
      success: true,
      policy: {
        id: result.id,
        name: result.name,
        title: result.title,
        createdAt: result.createdAt
      }
    };

  } catch (error) {
    console.error('Error creating reservation business policy:', error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create policy'
    };
  }
}

// Update policy with options
export async function updateReservationBusinessPolicy(
  prisma: PrismaClient,
  input: ReservationBusinessPolicyUpdateInput
): Promise<UpdatePolicyResult> {
  try {
    // Validate input using update schema
    const validatedInput = ReservationBusinessPolicyUpdateSchema.parse(input);

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Check if policy exists
      const existingPolicy = await tx.reservationBusinessPolicy.findUnique({
        where: { id: input.id },
        include: { policyOptions: true }
      });

      if (!existingPolicy) {
        throw new Error('Policy not found');
      }

      // Update the main policy
      const policy = await tx.reservationBusinessPolicy.update({
        where: { id: input.id },
        data: {
          ...(validatedInput.name !== undefined && { name: validatedInput.name }),
          ...(validatedInput.title !== undefined && { title: validatedInput.title }),
          ...(validatedInput.content !== undefined && { content: validatedInput.content }),
          ...(validatedInput.isRefundAllowed !== undefined && { isRefundAllowed: validatedInput.isRefundAllowed }),
          ...(validatedInput.isActive !== undefined && { isActive: validatedInput.isActive }),
          ...(validatedInput.isVisibleCustomerPortal !== undefined && { isVisibleCustomerPortal: validatedInput.isVisibleCustomerPortal }),
          ...(validatedInput.isIncludedConfirmationEmail !== undefined && { isIncludedConfirmationEmail: validatedInput.isIncludedConfirmationEmail }),
          ...(validatedInput.isOptional !== undefined && { isOptional: validatedInput.isOptional }),
          ...(validatedInput.requiresPayment !== undefined && { requiresPayment: validatedInput.requiresPayment }),
          ...(validatedInput.paymentType !== undefined && { paymentType: validatedInput.paymentType }),
          ...(validatedInput.paymentValue !== undefined && { paymentValue: validatedInput.paymentValue }),
          ...(validatedInput.paymentHandledByOptions !== undefined && { paymentHandledByOptions: validatedInput.paymentHandledByOptions }),
          ...(validatedInput.userSelectionAllowed !== undefined && { userSelectionAllowed: validatedInput.userSelectionAllowed }),
          ...(validatedInput.partySizeMin !== undefined && { partySizeMin: validatedInput.partySizeMin }),
          ...(validatedInput.partySizeMax !== undefined && { partySizeMax: validatedInput.partySizeMax }),
          ...(validatedInput.applicableDays !== undefined && { applicableDays: validatedInput.applicableDays }),
          ...(validatedInput.timeIntervalStart !== undefined && { 
            timeIntervalStart: validatedInput.timeIntervalStart 
          }),
          ...(validatedInput.timeIntervalEnd !== undefined && { 
            timeIntervalEnd: validatedInput.timeIntervalEnd 
          }),
          ...(validatedInput.applicableSectionIds !== undefined && { applicableSectionIds: validatedInput.applicableSectionIds }),
          ...(validatedInput.applicableMealTypes !== undefined && { applicableMealTypes: validatedInput.applicableMealTypes }),
          ...(validatedInput.applicableReservationTypes !== undefined && { applicableReservationTypes: validatedInput.applicableReservationTypes }),
          ...(validatedInput.updatedBy !== undefined && { updatedBy: validatedInput.updatedBy })
        }
      });

      // Handle options update if userSelectionAllowed is being changed or options are provided
      if (validatedInput.userSelectionAllowed !== undefined || validatedInput.policyOptions !== undefined) {
        const shouldHaveOptions = validatedInput.userSelectionAllowed ?? existingPolicy.userSelectionAllowed;

        if (shouldHaveOptions && validatedInput.policyOptions !== undefined) {
          // Smart diff: only update/create/delete changed options to preserve IDs
          const existingOptions = existingPolicy.policyOptions;
          const newOptions = validatedInput.policyOptions;

          // Separate new options into updates (with ID) and creates (without ID)
          const optionsToUpdate = newOptions.filter(opt => opt.id !== undefined);
          const optionsToCreate = newOptions.filter(opt => opt.id === undefined);

          // Get IDs of existing options and new options for comparison
          const existingOptionIds = new Set(existingOptions.map(opt => opt.id));
          const newOptionIds = new Set(optionsToUpdate.map(opt => opt.id));

          // Delete options that exist in DB but not in the new list
          const optionsToDelete = existingOptions
            .filter(opt => !newOptionIds.has(opt.id))
            .map(opt => opt.id);

          if (optionsToDelete.length > 0) {
            await tx.reservationPolicyOption.deleteMany({
              where: {
                policyId: input.id,
                id: { in: optionsToDelete }
              }
            });
          }

          // Update existing options
          for (const newOption of optionsToUpdate) {
            if (newOption.id) {
              await tx.reservationPolicyOption.update({
                where: { id: newOption.id },
                data: {
                  optionName: newOption.optionName,
                  description: newOption.description,
                  additionalPrice: newOption.additionalPrice,
                  additionalPriceType: newOption.additionalPriceType,
                  requiresPayment: newOption.requiresPayment,
                  isDefault: newOption.isDefault,
                  displayOrder: newOption.displayOrder,
                  applicableDays: newOption.applicableDays || [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY]
                }
              });
            }
          }

          // Create new options
          if (optionsToCreate.length > 0) {
            await tx.reservationPolicyOption.createMany({
              data: optionsToCreate.map(option => ({
                policyId: input.id,
                optionName: option.optionName,
                description: option.description,
                additionalPrice: option.additionalPrice,
                additionalPriceType: option.additionalPriceType,
                requiresPayment: option.requiresPayment,
                isDefault: option.isDefault,
                displayOrder: option.displayOrder,
                applicableDays: option.applicableDays || [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY]
              }))
            });
          }
        } else if (!shouldHaveOptions) {
          // Remove all options if user selection is disabled
          await tx.reservationPolicyOption.deleteMany({
            where: { policyId: input.id }
          });
        }
      }

      return policy;
    });

    return {
      success: true,
      policy: {
        id: result.id,
        name: result.name,
        title: result.title,
        updatedAt: result.updatedAt
      }
    };

  } catch (error) {
    console.error('Error updating reservation business policy:', error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update policy'
    };
  }
}

// Delete policy
export async function deleteReservationBusinessPolicy(
  prisma: PrismaClient,
  policyId: number
): Promise<DeletePolicyResult> {
  try {
    // Check if policy exists and get related data
    const policy = await prisma.reservationBusinessPolicy.findUnique({
      where: { id: policyId },
      include: {
        appliedPolicies: {
          include: {
            reservation: true,
            request: true
          }
        }
      }
    });

    if (!policy) {
      return {
        success: false,
        error: 'Policy not found'
      };
    }

    // Check if policy has been applied to any reservations
    if (policy.appliedPolicies.length > 0) {
      return {
        success: false,
        error: 'Cannot delete policy that has been applied to reservations. Deactivate it instead.'
      };
    }

    // Use transaction to delete policy and all related data
    await prisma.$transaction(async (tx) => {
      // Delete policy options first (cascade delete should handle this, but being explicit)
      await tx.reservationPolicyOption.deleteMany({
        where: { policyId: policyId }
      });

      // Delete the policy (this will cascade to applied policies if any existed, but we checked above)
      await tx.reservationBusinessPolicy.delete({
        where: { id: policyId }
      });
    });

    return {
      success: true,
      message: `Policy "${policy.name}" deleted successfully`
    };

  } catch (error) {
    console.error('Error deleting reservation business policy:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete policy'
    };
  }
}

// Get policies for a restaurant
export async function getReservationBusinessPolicies(
  prisma: PrismaClient,
  restaurantId: number,
  options: {
    page?: number;
    limit?: number;
    includeInactive?: boolean;
  } = {}
): Promise<GetPoliciesResult> {
  try {
    const { page = 1, limit = 50, includeInactive = false } = options;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      restaurantId: restaurantId
    };

    if (!includeInactive) {
      where.isActive = true;
    }

    // Get total count
    const totalCount = await prisma.reservationBusinessPolicy.count({ where });

    // Get policies
    const rawPolicies = await prisma.reservationBusinessPolicy.findMany({
      where,
      include: {
        policyOptions: {
          orderBy: { displayOrder: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    });

    // Convert Decimal to number for client components
    const policies = rawPolicies.map(policy => ({
      ...policy,
      paymentValue: policy.paymentValue ? Number(policy.paymentValue) : null,
      applicableDays: policy.applicableDays,
      policyOptions: policy.policyOptions.map(option => ({
        ...option,
        additionalPrice: Number(option.additionalPrice),
        applicableDays: option.applicableDays
      }))
    }));

    return {
      success: true,
      policies,
      totalCount
    };

  } catch (error) {
    console.error('Error fetching reservation business policies:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch policies'
    };
  }
}

// Get single policy with full details
export async function getReservationBusinessPolicyById(
  prisma: PrismaClient,
  policyId: number
): Promise<
  | { success: true; policy: any }
  | { success: false; error: string }
> {
  try {
    const policy = await prisma.reservationBusinessPolicy.findUnique({
      where: { id: policyId },
      include: {
        policyOptions: {
          orderBy: { displayOrder: 'asc' }
        },
        appliedPolicies: {
          take: 5, // Recent applications
          orderBy: { appliedAt: 'desc' },
          include: {
            reservation: {
              select: { id: true, reservationNumber: true, reservationDate: true }
            },
            request: {
              select: { id: true, requestedDate: true, adultCount: true, childCount: true }
            }
          }
        }
      }
    });

    if (!policy) {
      return {
        success: false,
        error: 'Policy not found'
      };
    }

    return {
      success: true,
      policy
    };

  } catch (error) {
    console.error('Error fetching reservation business policy:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch policy'
    };
  }
}

// Guest-web specific types and functions
export interface ApplicablePolicyInput {
  restaurantId: number;
  partySize: number;
  reservationDate: Date;
  reservationTime: string; // HH:mm format
  selectedSectionId?: number;
  reservationType: ReservationType;
}

export interface ApplicablePolicy {
  id: number;
  name: string;
  title: string;
  content: string;
  isOptional: boolean;
  requiresPayment: boolean;
  paymentType: FeeType | null;
  paymentValue: number | null;
  paymentHandledByOptions: boolean;
  userSelectionAllowed: boolean;
  priority: number;
  skipText: string | null;
  policyOptions: {
    id: number;
    optionName: string;
    description: string | null;
    additionalPrice: number;
    additionalPriceType: FeeType;
    requiresPayment: boolean;
    isDefault: boolean;
    displayOrder: number;
  }[];
}

export type GetApplicablePoliciesResult =
  | { success: true; policies: ApplicablePolicy[]; totalCount: number }
  | { success: false; error: string };

// Get applicable policies for guest reservation
export async function getApplicablePoliciesForReservation(
  prisma: PrismaClient,
  input: ApplicablePolicyInput
): Promise<GetApplicablePoliciesResult> {
  try {
    console.log('🔍 [POLICY] Starting getApplicablePoliciesForReservation', {
      restaurantId: input.restaurantId,
      partySize: input.partySize,
      reservationDate: input.reservationDate.toISOString().split('T')[0],
      reservationTime: input.reservationTime,
      selectedSectionId: input.selectedSectionId,
      reservationType: input.reservationType,
      timestamp: new Date().toISOString()
    });

    // Parse reservation time for comparison
    const timeParts = input.reservationTime.split(':');
    if (timeParts.length !== 2) {
      throw new Error('Invalid time format. Expected HH:mm');
    }
    const hoursNum = Number(timeParts[0]);
    const minutesNum = Number(timeParts[1]);
    if (isNaN(hoursNum) || isNaN(minutesNum)) {
      throw new Error('Invalid time format. Expected HH:mm');
    }
    const hours = hoursNum;
    const minutes = minutesNum;
    const reservationTimeMinutes = hours * 60 + minutes;
    
    console.log('🕒 [POLICY] Parsed reservation time', {
      originalTime: input.reservationTime,
      hours,
      minutes,
      totalMinutes: reservationTimeMinutes
    });

    // Build base where clause
    const baseWhere = {
      restaurantId: input.restaurantId,
      isActive: true,
      isVisibleCustomerPortal: true,
      applicableReservationTypes: {
        has: input.reservationType
      }
    };

    console.log('🔍 [POLICY] Base where clause', baseWhere);

    // Get all potentially applicable policies
    const rawPolicies = await prisma.reservationBusinessPolicy.findMany({
      where: baseWhere,
      include: {
        policyOptions: {
          orderBy: { displayOrder: 'asc' }
        }
      },
      orderBy: { priority: 'desc' } // Higher priority first
    });

    console.log('📋 [POLICY] Found raw policies', {
      count: rawPolicies.length,
      inputSectionId: input.selectedSectionId,
      policies: rawPolicies.map(p => ({
        id: p.id,
        name: p.name,
        isActive: p.isActive,
        isVisibleCustomerPortal: p.isVisibleCustomerPortal,
        applicableReservationTypes: p.applicableReservationTypes,
        applicableSectionIds: p.applicableSectionIds,
        timeIntervalStart: p.timeIntervalStart?.toTimeString().slice(0,5),
        timeIntervalEnd: p.timeIntervalEnd?.toTimeString().slice(0,5),
        requiresPayment: p.requiresPayment,
        paymentValue: p.paymentValue
      }))
    });

    // Filter policies based on conditions
    const applicablePolicies: ApplicablePolicy[] = [];

    for (const policy of rawPolicies) {
      let isApplicable = true;
      const conditions = [];

      // Check party size conditions
      if (policy.partySizeMin !== null && input.partySize < policy.partySizeMin) {
        isApplicable = false;
        conditions.push(`partySize ${input.partySize} < min ${policy.partySizeMin}`);
      }
      if (policy.partySizeMax !== null && input.partySize > policy.partySizeMax) {
        isApplicable = false;
        conditions.push(`partySize ${input.partySize} > max ${policy.partySizeMax}`);
      }

      // Check day-of-week conditions
      const reservationDayOfWeek = new Date(input.reservationDate).toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase() as DayOfWeek;
      if (policy.applicableDays.length > 0 && !policy.applicableDays.includes(reservationDayOfWeek)) {
        isApplicable = false;
        conditions.push(`day ${reservationDayOfWeek} not in applicable days [${policy.applicableDays.join(',')}]`);
      }

      // Check time interval conditions
      if (policy.timeIntervalStart || policy.timeIntervalEnd) {
        const startMinutes = policy.timeIntervalStart ? 
          policy.timeIntervalStart.getHours() * 60 + policy.timeIntervalStart.getMinutes() : 0;
        const endMinutes = policy.timeIntervalEnd ? 
          policy.timeIntervalEnd.getHours() * 60 + policy.timeIntervalEnd.getMinutes() : 1440; // 24:00

        if (reservationTimeMinutes < startMinutes || reservationTimeMinutes > endMinutes) {
          isApplicable = false;
          conditions.push(`time ${input.reservationTime} outside interval ${policy.timeIntervalStart?.toTimeString().slice(0,5)}-${policy.timeIntervalEnd?.toTimeString().slice(0,5)}`);
        }
      }

      // Check section conditions
      if (policy.applicableSectionIds.length > 0) {
        // Policy has specific sections - only applicable if no section selected OR selected section is in the list
        if (input.selectedSectionId && !policy.applicableSectionIds.includes(input.selectedSectionId)) {
          isApplicable = false;
          conditions.push(`section ${input.selectedSectionId} not in applicable sections [${policy.applicableSectionIds.join(',')}]`);
        }
      }

      console.log(`🔍 [POLICY] Policy ${policy.id} (${policy.name}) evaluation`, {
        isApplicable,
        conditions: conditions.length > 0 ? conditions : ['all conditions met'],
        partySizeRange: `${policy.partySizeMin || 'no min'} - ${policy.partySizeMax || 'no max'}`,
        applicableDays: policy.applicableDays,
        timeRange: `${policy.timeIntervalStart?.toTimeString().slice(0,5) || 'no start'} - ${policy.timeIntervalEnd?.toTimeString().slice(0,5) || 'no end'}`,
        applicableSections: policy.applicableSectionIds.length > 0 ? policy.applicableSectionIds : 'all sections'
      });

      if (isApplicable) {
        applicablePolicies.push({
          id: policy.id,
          name: policy.name,
          title: policy.title,
          content: policy.content || '',
          isOptional: policy.isOptional,
          requiresPayment: policy.requiresPayment,
          paymentType: policy.paymentType,
          paymentValue: policy.paymentValue ? Number(policy.paymentValue) : null,
          paymentHandledByOptions: policy.paymentHandledByOptions,
          userSelectionAllowed: policy.userSelectionAllowed,
          priority: policy.priority,
          skipText: policy.skipText,
          policyOptions: policy.policyOptions
            .filter(option => {
              // Filter options by day-of-week if applicable
              if (option.applicableDays.length > 0 && !option.applicableDays.includes(reservationDayOfWeek)) {
                return false;
              }
              return true;
            })
            .map(option => ({
              id: option.id,
              optionName: option.optionName,
              description: option.description,
              additionalPrice: Number(option.additionalPrice),
              additionalPriceType: option.additionalPriceType,
              requiresPayment: option.requiresPayment,
              isDefault: option.isDefault,
              displayOrder: option.displayOrder,
              applicableDays: option.applicableDays
            }))
        });
      }
    }

    console.log('✅ [POLICY] Final applicable policies', {
      totalFound: rawPolicies.length,
      totalApplicable: applicablePolicies.length,
      applicablePolicyIds: applicablePolicies.map(p => p.id),
      applicablePolicyNames: applicablePolicies.map(p => p.name),
      mandatoryCount: applicablePolicies.filter(p => !p.isOptional).length,
      optionalCount: applicablePolicies.filter(p => p.isOptional).length,
      withOptionsCount: applicablePolicies.filter(p => p.userSelectionAllowed).length
    });

    return {
      success: true,
      policies: applicablePolicies,
      totalCount: applicablePolicies.length
    };

  } catch (error) {
    console.error('❌ [POLICY] Error fetching applicable policies:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch applicable policies'
    };
  }
}

