import { PrismaClient } from "../../prisma/generated/prisma";

export type LocationResult = 
  | { 
      success: true; 
      locations: Array<{
        id: number;
        city: string;
        postalCode: string;
      }>;
    }
  | { success: false; error: string };

export async function listLocations(
  prisma: PrismaClient
): Promise<LocationResult> {
  try {
    const locations = await prisma.location.findMany({
      select: {
        id: true,
        city: true,
        postalCode: true,
      },
      orderBy: {
        city: 'asc'
      }
    });

    return { 
      success: true, 
      locations 
    };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch locations' 
    };
  }
} 