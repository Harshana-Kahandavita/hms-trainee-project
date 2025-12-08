import { PrismaClient } from '../../prisma/generated/prisma';

export async function getRestaurantMealServices(
  prisma: PrismaClient,
  restaurantId: number
) {
  try {
    const mealServices = await prisma.restaurantMealService.findMany({
      where: {
        restaurantId,
      },
      select: {
        id: true,
        mealType: true,
        serviceStartTime: true,
        serviceEndTime: true,
        isAvailable: true,
        restaurant: {
          select: {
            name: true
          }
        }
      },
      orderBy: {
        serviceStartTime: 'asc',
      },
    });

    return {
      success: true,
      mealServices: mealServices.map(service => ({
        id: service.id.toString(),
        name: `${service.mealType.charAt(0) + service.mealType.slice(1).toLowerCase()}`,
        type: service.mealType,
        status: service.isAvailable ? 'active' : 'inactive',
        startTime: service.serviceStartTime,
        endTime: service.serviceEndTime,
        restaurantName: service.restaurant.name
      }))
    };
  } catch (error) {
    console.error('Error in getRestaurantMealServices:', error);
    throw error;
  }
} 