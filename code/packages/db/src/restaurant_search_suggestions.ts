import { PrismaClient } from "../prisma/generated/prisma";

export interface SearchSuggestions {
  locations: { id: number; city: string }[];
  cuisines: { id: number; name: string }[];
  restaurants: { 
    id: number; 
    name: string;
    businessName: string;
  }[];
  businesses: { id: number; name: string }[];
}

export type SearchSuggestionsResponse = {
  success: true;
  suggestions: SearchSuggestions;
} | {
  success: false;
  errorMsg: string;
};

export async function getSearchSuggestions(
  prisma: PrismaClient,
  query: string
): Promise<SearchSuggestionsResponse> {
  try {
    if (query.length < 3) {
      return {
        success: true,
        suggestions: { locations: [], cuisines: [], restaurants: [], businesses: [] }
      };
    }

    // Normalize the query by removing special characters and extra spaces
    const normalizedQuery = query.replace(/[^a-zA-Z0-9\s]/g, ' ').trim();

    const [locations, cuisines, restaurants, businesses] = await Promise.all([
      // Location search
      prisma.location.findMany({
        where: {
          OR: [
            { city: { contains: normalizedQuery, mode: 'insensitive' } },
            { state: { contains: normalizedQuery, mode: 'insensitive' } }
          ]
        },
        select: {
          id: true,
          city: true
        },
        take: 5
      }),

      // Cuisine search
      prisma.cuisine.findMany({
        where: {
          cuisineName: { contains: normalizedQuery, mode: 'insensitive' }
        },
        select: {
          id: true,
          cuisineName: true
        },
        take: 5
      }),

      // Enhanced restaurant search with business name
      prisma.restaurant.findMany({
        where: {
          OR: [
            { name: { contains: normalizedQuery, mode: 'insensitive' } },
            { business: { name: { contains: normalizedQuery, mode: 'insensitive' } } }
          ]
        },
        select: {
          id: true,
          name: true,
          business: {
            select: {
              name: true
            }
          }
        },
        take: 5
      }),

      // Add business search
      prisma.business.findMany({
        where: {
          name: { contains: normalizedQuery, mode: 'insensitive' }
        },
        select: {
          id: true,
          name: true
        },
        take: 5
      })
    ]);

    return {
      success: true,
      suggestions: {
        locations,
        cuisines: cuisines.map(c => ({ id: c.id, name: c.cuisineName })),
        restaurants: restaurants.map(r => ({
          id: r.id,
          name: r.name,
          businessName: r.business.name
        })),
        businesses: businesses
      }
    };
  } catch (error) {
    console.error('Error fetching search suggestions:', error);
    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : 'Failed to fetch suggestions'
    };
  }
} 