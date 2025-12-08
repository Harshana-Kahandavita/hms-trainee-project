import { PrismaClient } from "../../prisma/generated/prisma";
import { z } from "zod";

// Input validation schema for create
const CreateMerchantUserInput = z.object({
  id: z.string(),
  businessId: z.string(),
});

type CreateMerchantUserInputType = z.infer<typeof CreateMerchantUserInput>;

export type CreateMerchantUserResult = 
  | { 
      success: true; 
      user: {
        id: string;
        businessId: string;
      }
    }
  | { success: false; error: string };

export async function createMerchantUser(
  prisma: PrismaClient,
  input: CreateMerchantUserInputType
): Promise<CreateMerchantUserResult> {
  try {
    const validatedInput = CreateMerchantUserInput.parse(input);

    const user = await prisma.merchantUsers.create({
      data: {
        id: validatedInput.id,
        businessId: validatedInput.businessId,
      },
      select: {
        id: true,
        businessId: true,
      }
    });

    return { success: true, user };
  } catch (error) {
    console.error('Error in createMerchantUser:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create merchant user'
    };
  }
}

export type GetMerchantUsersByBusinessIdResult = 
  | { 
      success: true; 
      userIds: Array<{
        id: string;
      }>;
    }
  | { success: false; error: string };

export async function getMerchantUsersByBusinessId(
  prisma: PrismaClient,
  businessId: string
): Promise<GetMerchantUsersByBusinessIdResult> {
  try {
    const users = await prisma.merchantUsers.findMany({
      where: { businessId },
      select: {
        id: true,
      }
    });

    return { success: true, userIds: users };
  } catch (error) {
    console.error('Error in getMerchantUsersByBusinessId:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch merchant users'
    };
  }
}

export type UpdateMerchantUserResult = 
  | { success: true; user: { id: string; updatedAt: Date } }
  | { success: false; error: string };

export async function updateMerchantUserTimestamp(
  prisma: PrismaClient,
  userId: string
): Promise<UpdateMerchantUserResult> {
  try {
    const user = await prisma.merchantUsers.update({
      where: { id: userId },
      data: {}, // Empty data object will trigger @updatedAt
      select: {
        id: true,
        updatedAt: true,
      }
    });

    return { success: true, user };
  } catch (error) {
    console.error('Error in updateMerchantUserTimestamp:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update merchant user timestamp'
    };
  }
} 