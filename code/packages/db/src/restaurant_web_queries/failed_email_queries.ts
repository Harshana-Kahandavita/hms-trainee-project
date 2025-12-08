import { PrismaClient, EmailStatus, PortalType } from "../../prisma/generated/prisma";
import { z } from "zod";

// Input validation schemas
const CreateFailedEmailSchema = z.object({
  reservationId: z.number().optional(),
  restaurantId: z.number().optional(),
  portalType: z.nativeEnum(PortalType),
  emailType: z.string(),
  recipient: z.string().email(),
  subject: z.string(),
  templateData: z.record(z.any()),
  errorMessage: z.string()
});

const UpdateFailedEmailSchema = z.object({
  id: z.number(),
  status: z.nativeEnum(EmailStatus),
  errorMessage: z.string().optional()
});

// Types
type CreateFailedEmailInput = z.infer<typeof CreateFailedEmailSchema>;
type UpdateFailedEmailInput = z.infer<typeof UpdateFailedEmailSchema>;

interface FailedEmailResult {
  id: number;
  reservationId: number | null;
  restaurantId: number | null;
  portalType: PortalType;
  emailType: string;
  recipient: string;
  subject: string;
  templateData: any;
  errorMessage: string;
  retryCount: number;
  status: EmailStatus;
  lastRetryAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type FailedEmailResponse = {
  success: true;
  data: FailedEmailResult;
} | {
  success: false;
  error: string;
};

type FailedEmailListResponse = {
  success: true;
  data: FailedEmailResult[];
} | {
  success: false;
  error: string;
};

export async function createFailedEmail(
  prisma: PrismaClient,
  input: CreateFailedEmailInput
): Promise<FailedEmailResponse> {
  try {
    // Validate input
    const validatedInput = CreateFailedEmailSchema.parse(input);

    const failedEmail = await prisma.failedEmail.create({
      data: {
        portalType: validatedInput.portalType,
        emailType: validatedInput.emailType,
        recipient: validatedInput.recipient,
        subject: validatedInput.subject,
        templateData: validatedInput.templateData,
        errorMessage: validatedInput.errorMessage,
        status: EmailStatus.FAILED,
        retryCount: 0,
        reservationId: validatedInput.reservationId,
        restaurantId: validatedInput.restaurantId
      }
    });

    return {
      success: true,
      data: failedEmail
    };
  } catch (error) {
    console.error('Error creating failed email record:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create failed email record'
    };
  }
}

export async function updateFailedEmailStatus(
  prisma: PrismaClient,
  input: UpdateFailedEmailInput
): Promise<FailedEmailResponse> {
  try {
    // Validate input
    const validatedInput = UpdateFailedEmailSchema.parse(input);

    const updatedEmail = await prisma.failedEmail.update({
      where: { id: validatedInput.id },
      data: {
        status: validatedInput.status,
        lastRetryAt: new Date(),
        retryCount: { increment: 1 },
        errorMessage: validatedInput.errorMessage,
        updatedAt: new Date()
      }
    });

    return {
      success: true,
      data: updatedEmail
    };
  } catch (error) {
    console.error('Error updating failed email status:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update email status'
    };
  }
}

export async function getFailedEmailsByStatus(
  prisma: PrismaClient,
  status: EmailStatus,
  limit: number = 100
): Promise<FailedEmailListResponse> {
  try {
    const failedEmails = await prisma.failedEmail.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
      take: limit
    });

    return {
      success: true,
      data: failedEmails
    };
  } catch (error) {
    console.error('Error fetching failed emails:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch failed emails'
    };
  }
}

export async function getFailedEmailsByPortal(
  prisma: PrismaClient,
  portalType: PortalType,
  status?: EmailStatus
): Promise<FailedEmailListResponse> {
  try {
    const failedEmails = await prisma.failedEmail.findMany({
      where: {
        portalType,
        ...(status && { status })
      },
      orderBy: { createdAt: 'desc' }
    });

    return {
      success: true,
      data: failedEmails
    };
  } catch (error) {
    console.error('Error fetching failed emails by portal:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch failed emails'
    };
  }
}

export async function getRetryableFailedEmails(
  prisma: PrismaClient,
  maxRetries: number = 3
): Promise<FailedEmailListResponse> {
  try {
    const failedEmails = await prisma.failedEmail.findMany({
      where: {
        status: EmailStatus.FAILED,
        retryCount: {
          lt: maxRetries
        }
      },
      orderBy: [
        { retryCount: 'asc' },
        { createdAt: 'asc' }
      ]
    });

    return {
      success: true,
      data: failedEmails
    };
  } catch (error) {
    console.error('Error fetching retryable failed emails:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch retryable emails'
    };
  }
}

export async function abandonFailedEmail(
  prisma: PrismaClient,
  id: number,
  reason: string
): Promise<FailedEmailResponse> {
  try {
    const abandonedEmail = await prisma.failedEmail.update({
      where: { id },
      data: {
        status: EmailStatus.ABANDONED,
        errorMessage: reason,
        updatedAt: new Date()
      }
    });

    return {
      success: true,
      data: abandonedEmail
    };
  } catch (error) {
    console.error('Error abandoning failed email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to abandon email'
    };
  }
} 