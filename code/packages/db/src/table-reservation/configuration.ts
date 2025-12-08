import { PrismaClient } from '../../prisma/generated/prisma';
import { 
  GetTableReservationConfigInput,
  GetTableReservationConfigResult,
  GetTableReservationConfigInputType,
  TableReservationConfigSchema
} from './types';

/**
 * Get table reservation configuration for a restaurant
 * Returns only restaurant-specific configuration - no platform fallback
 */
export async function getTableReservationConfig(
  prisma: PrismaClient,
  input: GetTableReservationConfigInputType
): Promise<GetTableReservationConfigResult> {
  try {
    // Validate input
    const validatedInput = GetTableReservationConfigInput.parse(input);

    // Only get restaurant-specific configuration (no platform fallback)
    const config = await prisma.tableReservationUtilsConfiguration.findFirst({
      where: {
        restaurantId: validatedInput.restaurantId,
        isActive: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    // If no restaurant-specific config found, return error
    if (!config) {
      return {
        success: false,
        error: `No table reservation configuration found for restaurant ${validatedInput.restaurantId}. Please create a configuration first.`,
      };
    }

    // Validate and return the config
    const validatedConfig = TableReservationConfigSchema.parse(config);

    return {
      success: true,
      config: validatedConfig,
    };
  } catch (error) {
    if (error instanceof Error) {
      return {
        success: false,
        error: `Failed to get table reservation config: ${error.message}`,
      };
    }
    return {
      success: false,
      error: 'Failed to get table reservation config: Unknown error',
    };
  }
}

/**
 * Get dwelling time configuration for a restaurant with platform fallback
 * First tries restaurant-specific config, then falls back to platform default (restaurantId = null)
 * 
 * @param prisma - Prisma client or transaction client
 * @param restaurantId - Restaurant ID (optional, can pass null to get platform default)
 * @param tx - Optional transaction client
 * @returns Dwelling time in minutes (defaults to 90 if no config found)
 */
export async function getDwellingTimeConfiguration(
  prisma: PrismaClient,
  restaurantId: number | null,
  tx?: any
): Promise<number> {
  const client = tx || prisma;

  // First try restaurant-specific configuration
  if (restaurantId !== null) {
    const restaurantConfig = await client.tableReservationUtilsConfiguration.findFirst({
      where: {
        restaurantId: restaurantId,
        isActive: true,
      },
      select: { defaultDwellMinutes: true },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (restaurantConfig) {
      return restaurantConfig.defaultDwellMinutes;
    }
  }

  // Fall back to platform default (restaurantId = null)
  const platformConfig = await client.tableReservationUtilsConfiguration.findFirst({
    where: {
      restaurantId: null,
      isActive: true,
    },
    select: { defaultDwellMinutes: true },
    orderBy: {
      updatedAt: 'desc',
    },
  });

  // Return platform default or fallback to 90 minutes
  return platformConfig?.defaultDwellMinutes || 90;
}
