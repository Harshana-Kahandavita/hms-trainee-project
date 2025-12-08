import { PrismaClient } from "../prisma/generated/prisma";

export interface FavoriteRestaurantResult {
  id: number;
  userId: string;
  restaurantId: number | null;
  externalRestaurantId: string | null;
  isInternal: boolean;
  createdAt: Date;
}

export type GetFavoritesResponse = {
  success: true;
  data: FavoriteRestaurantResult[];
} | {
  success: false;
  errorMsg: string;
};

export type IsFavoriteResponse = {
  success: true;
  isFavorite: boolean;
} | {
  success: false;
  errorMsg: string;
};

export type ToggleFavoriteResponse = {
  success: true;
  isFavorite: boolean;
} | {
  success: false;
  errorMsg: string;
};

export interface GetFavoritesParams {
  userId: string;
}

export interface IsFavoriteParams {
  userId: string;
  restaurantId?: number;
  externalRestaurantId?: string;
}

export interface ToggleFavoriteParams {
  userId: string;
  restaurantId?: number;
  externalRestaurantId?: string;
  isInternal: boolean;
}

export async function getFavorites(
  prisma: PrismaClient,
  params: GetFavoritesParams
): Promise<GetFavoritesResponse> {
  try {
    const { userId } = params;

    if (!userId) {
      return {
        success: false,
        errorMsg: 'User ID is required'
      };
    }

    const favorites = await prisma.favoriteRestaurant.findMany({
      where: {
        userId: userId
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return {
      success: true,
      data: favorites.map(fav => ({
        id: fav.id as unknown as number,
        userId: fav.userId,
        restaurantId: fav.restaurantId,
        externalRestaurantId: fav.externalRestaurantId,
        isInternal: fav.isInternal,
        createdAt: fav.createdAt
      }))
    };
  } catch (error) {
    console.error('Error fetching favorites:', error);
    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : 'Failed to fetch favorites'
    };
  }
}

export async function isFavorite(
  prisma: PrismaClient,
  params: IsFavoriteParams
): Promise<IsFavoriteResponse> {
  try {
    const { userId, restaurantId, externalRestaurantId } = params;

    if (!userId) {
      return {
        success: false,
        errorMsg: 'User ID is required'
      };
    }

    if (!restaurantId && !externalRestaurantId) {
      return {
        success: false,
        errorMsg: 'Restaurant ID or external restaurant ID is required'
      };
    }

    const favorite = await prisma.favoriteRestaurant.findFirst({
      where: {
        userId: userId,
        restaurantId: restaurantId || null,
        externalRestaurantId: externalRestaurantId || null
      }
    });

    return {
      success: true,
      isFavorite: !!favorite
    };
  } catch (error) {
    console.error('Error checking favorite status:', error);
    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : 'Failed to check favorite status'
    };
  }
}

export async function toggleFavorite(
  prisma: PrismaClient,
  params: ToggleFavoriteParams
): Promise<ToggleFavoriteResponse> {
  try {
    const { userId, restaurantId, externalRestaurantId, isInternal } = params;

    if (!userId) {
      return {
        success: false,
        errorMsg: 'User ID is required'
      };
    }

    if (!restaurantId && !externalRestaurantId) {
      return {
        success: false,
        errorMsg: 'Restaurant ID or external restaurant ID is required'
      };
    }

    // Check if favorite already exists
    const existingFavorite = await prisma.favoriteRestaurant.findFirst({
      where: {
        userId: userId,
        restaurantId: restaurantId || null,
        externalRestaurantId: externalRestaurantId || null
      }
    });

    if (existingFavorite) {
      // Remove favorite
      await prisma.favoriteRestaurant.delete({
        where: {
          id: existingFavorite.id
        }
      });

      return {
        success: true,
        isFavorite: false
      };
    } else {
      // Add favorite
      await prisma.favoriteRestaurant.create({
        data: {
          userId: userId,
          restaurantId: restaurantId || null,
          externalRestaurantId: externalRestaurantId || null,
          isInternal: isInternal
        }
      });

      return {
        success: true,
        isFavorite: true
      };
    }
  } catch (error) {
    console.error('Error toggling favorite:', error);
    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : 'Failed to toggle favorite'
    };
  }
}

