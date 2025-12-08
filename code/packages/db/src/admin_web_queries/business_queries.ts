import { PrismaClient, ReservationSupportType } from "../../prisma/generated/prisma";
import { z } from "zod";

export interface RestaurantInput {
  name: string;
  address: string;
  contactNumber: string;
  capacity: number;
  onlineQuota: number;
  description?: string;
  locationId: number;
  advancePaymentPercentage: number;
  reservationSupport: ReservationSupportType;
}

// Input validation schema
const ListBusinessesInput = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(10),
});

type ListBusinessesInputType = z.infer<typeof ListBusinessesInput>;

export type ListBusinessesResult = 
  | { 
      success: true; 
      businesses: Array<{
        businessId: string;
        businessName: string;
        businessAddress: string;
        contactNumber: string;
        website: string | null;
        taxId: string;
        registrationNumber: string;
        onboardDate: string | undefined;
        email: string;
      }>;
      totalCount: number;
      page: number;
      totalPages: number;
    }
  | { success: false; error: string };

export async function listBusinesses(
  prisma: PrismaClient,
  input: ListBusinessesInputType
): Promise<ListBusinessesResult> {
  try {
    const validatedInput = ListBusinessesInput.parse(input);
    const skip = (validatedInput.page - 1) * validatedInput.limit;

    const [totalCount, businesses] = await Promise.all([
      prisma.business.count(),
      prisma.business.findMany({
        select: {
          id: true,
          name: true,
          address: true,
          phone: true,
          email: true,
          website: true,
          taxId: true,
          registrationNumber: true,
          createdAt: true,
        },
        skip,
        take: validatedInput.limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),
    ]);

    const totalPages = Math.ceil(totalCount / validatedInput.limit);

    // Transform the data to match the BusinessTable component structure
    const transformedBusinesses = businesses.map(business => ({
      businessId: business.id.toString(),
      businessName: business.name,
      businessAddress: business.address,
      contactNumber: business.phone,
      website: business.website,
      taxId: business.taxId,
      registrationNumber: business.registrationNumber,
      onboardDate: business.createdAt.toISOString().split('T')[0],
      email: business.email,
    }));

    return {
      success: true,
      businesses: transformedBusinesses,
      totalCount,
      page: validatedInput.page,
      totalPages,
    };
  } catch (error) {
    console.error('Error in listBusinesses:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch businesses',
    };
  }
}

export type UpdateBusinessInput = {
  id: number;
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string | null;
  taxId: string;
  registrationNumber: string;
};

export type UpdateBusinessResult = 
  | { success: true; business: { id: number } }
  | { success: false; error: string };

  export async function updateBusiness(
    prisma: PrismaClient,
    input: UpdateBusinessInput
  ): Promise<UpdateBusinessResult> {
    try {
      return await prisma.$transaction(async (tx) => {
        const business = await tx.business.update({
          where: { id: input.id },
          data: {
            name: input.name,
            address: input.address,
            phone: input.phone,
            email: input.email,
            website: input.website,
            taxId: input.taxId,
            registrationNumber: input.registrationNumber,
          },
          select: { id: true }
        });
  
        return { success: true, business };
      });
    } catch (error) {
      console.error('Error updating business:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to update business'
      };
    }
  }

export type CreateBusinessInput = {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string | null;
  taxId: string;
  registrationNumber: string;
  restaurants?: Array<RestaurantInput>;
};

export type CreateBusinessResult = 
  | { 
      success: true; 
      business: {
        id: number;
        name: string;
        restaurants: Array<{
          id: number;
          name: string;
        }>;
      }
    }
  | { success: false; error: string };

export async function createBusiness(
  prisma: PrismaClient,
  input: CreateBusinessInput
): Promise<CreateBusinessResult> {
  try {
    const business = await prisma.business.create({
      data: {
        name: input.name,
        address: input.address,
        phone: input.phone,
        email: input.email,
        website: input.website,
        taxId: input.taxId,
        registrationNumber: input.registrationNumber,
      },
      select: {
        id: true,
        name: true,
        email: true,
        restaurants: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return { success: true, business };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create business' };
  }
}

export async function addRestaurantsToBusiness(
  prisma: PrismaClient,
  businessId: number,
  restaurants: RestaurantInput[]
): Promise<CreateBusinessResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const business = await tx.business.update({
        where: { id: businessId },
        data: {
          restaurants: {
            create: restaurants.map(restaurant => ({
              name: restaurant.name,
              address: restaurant.address,
              phone: restaurant.contactNumber,
              description: restaurant.description ?? null,
              capacity: restaurant.capacity,
              onlineQuota: restaurant.onlineQuota,
              location: {
                connect: { id: restaurant.locationId }
              },
              advancePaymentPercentage: restaurant.advancePaymentPercentage,
              reservationSupport: restaurant.reservationSupport,
            }))
          }
        },
        select: {
          id: true,
          name: true,
          restaurants: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      return { success: true, business };
    });
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to add restaurants' 
    };
  }
}

interface RestaurantImageInput {
  imageUrl: string;
  imageType: string;
  altText: string;
  displayOrder: number;
  uploadedBy: string;
  lastModifiedBy: string;
}

export type UpdateRestaurantImagesResult = 
  | { success: true; restaurant: { id: number } }
  | { success: false; error: string };

export async function updateRestaurantImages(
  prisma: PrismaClient,
  restaurantId: number,
  thumbnailImage?: RestaurantImageInput,
  galleryImages: RestaurantImageInput[] = [],
  isEdit: boolean = false
): Promise<UpdateRestaurantImagesResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      if (thumbnailImage) {
        if (isEdit) {
          // For edits, update the existing thumbnail record
          const existingThumbnail = await tx.restaurantImage.findFirst({
            where: {
              restaurantId,
              imageType: 'THUMBNAIL',
              isActive: true
            }
          });

          if (existingThumbnail) {
            await tx.restaurantImage.update({
              where: { id: existingThumbnail.id },
              data: {
                imageUrl: thumbnailImage.imageUrl,
                lastModifiedBy: thumbnailImage.lastModifiedBy
              }
            });
          } else {
            // If no thumbnail exists, create new one
            const newThumbnail = await tx.restaurantImage.create({
              data: {
                restaurantId,
                ...thumbnailImage,
                isActive: true
              },
              select: { id: true }
            });

            // Update restaurant with new thumbnail reference
            await tx.restaurant.update({
              where: { id: restaurantId },
              data: { thumbnailImageId: newThumbnail.id }
            });
          }
        } else {
          // For new restaurants, create new thumbnail
          const newThumbnail = await tx.restaurantImage.create({
            data: {
              restaurantId,
              ...thumbnailImage,
              isActive: true
            },
            select: { id: true }
          });

          await tx.restaurant.update({
            where: { id: restaurantId },
            data: { thumbnailImageId: newThumbnail.id }
          });
        }
      }

      // Handle gallery images
      if (galleryImages.length > 0) {
        if (isEdit) {
          // For edits, deactivate existing gallery images
          await tx.restaurantImage.updateMany({
            where: {
              restaurantId,
              imageType: 'GALLERY',
              isActive: true
            },
            data: { isActive: false }
          });
        }

        // Create new gallery images
        await tx.restaurantImage.createMany({
          data: galleryImages.map(img => ({
            restaurantId,
            ...img,
            isActive: true
          }))
        });
      }

      return { 
        success: true, 
        restaurant: { id: restaurantId } 
      };
    });
  } catch (error) {
    console.error('Error updating restaurant images:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update restaurant images'
    };
  }
}

export type UpdateRestaurantInput = {
  id: number;
  name: string;
  address: string;
  contactNumber: string;
  description?: string;
  capacity: number;
  onlineQuota: number;
  locationId: number;
  advancePaymentPercentage: number;
  reservationSupport?: ReservationSupportType;
};

export type UpdateRestaurantResult = 
  | { 
      success: true; 
      restaurant: {
        id: number;
        name: string;
        address: string;
        phone: string;
        description: string | null;
        capacity: number;
        onlineQuota: number;
        locationId: number;
        advancePaymentPercentage: number;
      }
    }
  | { success: false; error: string };

export async function updateRestaurant(
  prisma: PrismaClient,
  input: UpdateRestaurantInput
): Promise<UpdateRestaurantResult> {
  try {
    const restaurant = await prisma.restaurant.update({
      where: { id: input.id },
      data: {
        name: input.name,
        address: input.address,
        phone: input.contactNumber,
        description: input.description ?? null,
        capacity: input.capacity,
        onlineQuota: input.onlineQuota,
        locationId: input.locationId,
        advancePaymentPercentage: input.advancePaymentPercentage,
        ...(input.reservationSupport !== undefined && { reservationSupport: input.reservationSupport }),
      },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        description: true,
        capacity: true,
        onlineQuota: true,
        locationId: true,
        advancePaymentPercentage: true,
      }
    });

    return { success: true, restaurant };
  } catch (error) {
    console.error('Error updating restaurant:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update restaurant'
    };
  }
}
