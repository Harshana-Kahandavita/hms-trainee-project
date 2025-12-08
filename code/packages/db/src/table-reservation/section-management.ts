import { PrismaClient } from '../../prisma/generated/prisma';
import { z } from 'zod';

// Input validation schema for section operations
export const FindSectionByIdInput = z.object({
  sectionId: z.number().positive(),
  restaurantId: z.number().positive(),
});

export const FindSectionByNameInput = z.object({
  sectionName: z.string().min(1),
  restaurantId: z.number().positive(),
});

export type FindSectionByIdInputType = z.infer<typeof FindSectionByIdInput>;
export type FindSectionByNameInputType = z.infer<typeof FindSectionByNameInput>;

export type FindSectionResult = 
  | { success: true; sectionId: number; sectionName: string }
  | { success: false; error: string };

/**
 * Finds a restaurant section by ID
 */
export async function findSectionById(
  prisma: PrismaClient,
  input: FindSectionByIdInputType
): Promise<FindSectionResult> {
  try {
    // Validate input
    const validatedInput = FindSectionByIdInput.parse(input);
    
    const section = await prisma.restaurantSection.findFirst({
      where: {
        id: validatedInput.sectionId,
        restaurantId: validatedInput.restaurantId,
        isActive: true
      }
    });

    if (!section) {
      return {
        success: false,
        error: 'Section not found or not active'
      };
    }

    return {
      success: true,
      sectionId: section.id,
      sectionName: section.sectionName
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.errors.map(e => e.message).join(', ')}`
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Finds a restaurant section by name
 */
export async function findSectionByName(
  prisma: PrismaClient,
  input: FindSectionByNameInputType
): Promise<FindSectionResult> {
  try {
    // Validate input
    const validatedInput = FindSectionByNameInput.parse(input);
    
    const section = await prisma.restaurantSection.findFirst({
      where: {
        restaurantId: validatedInput.restaurantId,
        sectionName: validatedInput.sectionName,
        isActive: true
      }
    });

    if (!section) {
      return {
        success: false,
        error: 'Section not found or not active'
      };
    }

    return {
      success: true,
      sectionId: section.id,
      sectionName: section.sectionName
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.errors.map(e => e.message).join(', ')}`
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Resolves preferred section ID from either areaId or preferredArea
 * Returns the section ID if found, or undefined if not found
 */
export async function resolvePreferredSectionId(
  prisma: PrismaClient,
  input: {
    restaurantId: number;
    areaId?: number;
    preferredArea?: string;
  }
): Promise<{ sectionId?: number; error?: string }> {
  try {
    // If areaId is provided, validate it exists
    if (input.areaId) {
      const sectionResult = await findSectionById(prisma, {
        sectionId: input.areaId,
        restaurantId: input.restaurantId
      });

      if (sectionResult.success) {
        return { sectionId: sectionResult.sectionId };
      } else {
        return { error: (sectionResult as { success: false; error: string }).error };
      }
    }

    // If preferredArea is provided and not 'any', find section by name
    if (input.preferredArea && input.preferredArea !== 'any') {
      const sectionResult = await findSectionByName(prisma, {
        sectionName: input.preferredArea,
        restaurantId: input.restaurantId
      });

      if (sectionResult.success) {
        return { sectionId: sectionResult.sectionId };
      } else {
        return { error: (sectionResult as { success: false; error: string }).error };
      }
    }

    // No section preference
    return { sectionId: undefined };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}
