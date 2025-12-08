import { PrismaClient, NotificationType } from "../prisma/generated/prisma";
import { z } from "zod";

// Input validation schema
const GetNotificationsSchema = z.object({
  restaurantId: z.number().positive(),
  limit: z.number().min(1).max(100).optional().default(10),
  cursor: z.number().positive().optional(),
});

// Input validation schema for create notification
const CreateNotificationSchema = z.object({
  restaurantId: z.number().positive(),
  type: z.enum(['RESERVATION_REQUEST', 'RESERVATION_CONFIRMED', 'RESERVATION_CANCELLED', 'PAYMENT_RECEIVED', 'PAYMENT_FAILED', 'REVIEW_POSTED', 'SYSTEM_ALERT']),
  title: z.string().min(1),
  message: z.string().min(1),
  metadata: z.record(z.any()).optional(),
});

// Input validation schema for update notification
const UpdateNotificationSchema = z.object({
  id: z.number().positive(),
  isRead: z.boolean(),
  readBy: z.string().optional(),
});

export interface NotificationResult {
  id: number;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, any> | null;
  isRead: boolean;
  readOn: Date | null;
  readBy: string | null;
  createdAt: Date;
}

export type GetNotificationsResponse = {
  success: true;
  notifications: NotificationResult[];
  nextCursor: number | null;
  totalCount: number;
} | {
  success: false;
  errorMsg: string;
};

export type CreateNotificationResponse = {
  success: true;
  notification: NotificationResult;
} | {
  success: false;
  errorMsg: string;
};

export type UpdateNotificationResponse = {
  success: true;
  notification: NotificationResult;
} | {
  success: false;
  errorMsg: string;
};

export async function getNotifications(
  prisma: PrismaClient,
  restaurantId: number,
  limit?: number,
  cursor?: number
): Promise<GetNotificationsResponse> {
  try {
    // Get total count (no isRead filter)
    const totalCount = await prisma.notification.count({
      where: {
        restaurantId: restaurantId
      }
    });

    // Fetch all notifications (removed isRead filter)
    const notifications = await prisma.notification.findMany({
      where: {
        restaurantId: restaurantId,
        ...(cursor ? { id: { lt: cursor } } : {})
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit ? limit + 1 : undefined,
    });

    // Determine next cursor
    const hasMore = notifications.length > (limit || 0);
    const items = hasMore ? notifications.slice(0, -1) : notifications;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return {
      success: true,
      notifications: items.map(notification => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        metadata: notification.metadata as Record<string, any> | null,
        isRead: notification.isRead,
        readOn: notification.readOn,
        readBy: notification.readBy,
        createdAt: notification.createdAt
      })),
      nextCursor,
      totalCount
    };
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : 'Failed to fetch notifications'
    };
  }
}

export async function createNotification(
  prisma: PrismaClient,
  data: {
    restaurantId: number;
    type: NotificationType;
    title: string;
    message: string;
    metadata?: Record<string, any>;
  }
): Promise<CreateNotificationResponse> {
  try {
    // Validate input
    const validationResult = CreateNotificationSchema.safeParse(data);
    if (!validationResult.success) {
      return {
        success: false,
        errorMsg: validationResult.error.errors[0]?.message || "Invalid input"
      };
    }

    // Create notification
    const notification = await prisma.notification.create({
      data: {
        restaurantId: data.restaurantId,
        type: data.type,
        title: data.title,
        message: data.message,
        metadata: data.metadata as any || undefined,
        isRead: false
      }
    });

    return {
      success: true,
      notification: {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        metadata: notification.metadata as Record<string, any> | null,
        isRead: notification.isRead,
        readOn: notification.readOn,
        readBy: notification.readBy,
        createdAt: notification.createdAt
      }
    };

  } catch (error) {
    console.error('Error creating notification:', error);
    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : 'Failed to create notification'
    };
  }
}

export async function updateNotification(
  prisma: PrismaClient,
  data: {
    id: number;
    isRead: boolean;
    readBy?: string;
  }
): Promise<UpdateNotificationResponse> {
  try {
    // Validate input
    const validationResult = UpdateNotificationSchema.safeParse(data);
    if (!validationResult.success) {
      return {
        success: false,
        errorMsg: validationResult.error.errors[0]?.message || "Invalid input"
      };
    }

    // Update notification
    const notification = await prisma.notification.update({
      where: { id: data.id },
      data: {
        isRead: data.isRead,
        readBy: data.readBy,
        readOn: data.isRead ? new Date() : null
      }
    });

    return {
      success: true,
      notification: {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        metadata: notification.metadata as Record<string, any> | null,
        isRead: notification.isRead,
        readOn: notification.readOn,
        readBy: notification.readBy,
        createdAt: notification.createdAt
      }
    };

  } catch (error) {
    console.error('Error updating notification:', error);
    return {
      success: false,
      errorMsg: error instanceof Error ? error.message : 'Failed to update notification'
    };
  }
}
