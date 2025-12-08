import { PrismaClient, PaymentLinkStatus, ReservationRequestStatus } from '../prisma/generated/prisma';

export interface CreatePaymentLinkInput {
  requestId: number;
  expirationHours?: number; // Default 24 hours
}

export interface CreatePaymentLinkResult {
  success: boolean;
  data?: {
    id: number;
    token: string;
    expiresAt: Date;
    paymentUrl: string;
  };
  error?: string;
}

export interface GetPaymentLinkResult {
  success: boolean;
  data?: {
    id: number;
    requestId: number;
    token: string;
    status: PaymentLinkStatus;
    expiresAt: Date;
    createdAt: Date;
    request: {
      id: number;
      restaurantId: number;
      requestName: string;
      contactPhone: string;
      requestedDate: string;
      requestedTime: Date | null;
      mealType: string;
      adultCount: number;
      childCount: number;
      estimatedTotalAmount: number;
      estimatedServiceCharge: number;
      estimatedTaxAmount: number;
      status: ReservationRequestStatus;
      requiresAdvancePayment: boolean;
      reservationType: 'BUFFET_ONLY' | 'TABLE_ONLY' | 'BUFFET_AND_TABLE';
    };
  };
  error?: string;
}

export interface UpdatePaymentLinkStatusResult {
  success: boolean;
  error?: string;
}

export interface ExpiredLinksResult {
  success: boolean;
  expiredCount: number;
  error?: string;
}

/**
 * Generate a secure random token for payment links using Web Crypto API
 * Compatible with both Edge Runtime and Node.js environments
 */
function generatePaymentToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Create a new restaurant payment link
 */
export async function createRestaurantPaymentLink(
  prisma: PrismaClient,
  input: CreatePaymentLinkInput
): Promise<CreatePaymentLinkResult> {
  try {
    console.log('Creating restaurant payment link', {
      requestId: input.requestId,
      expirationHours: input.expirationHours || 24
    });

    // Check if reservation request exists and is valid
    const reservationRequest = await prisma.reservationRequest.findUnique({
      where: { id: input.requestId },
      select: {
        id: true,
        status: true,
        requiresAdvancePayment: true,
        restaurantPaymentLink: true
      }
    });

    if (!reservationRequest) {
      console.warn('Reservation request not found', { requestId: input.requestId });
      return {
        success: false,
        error: 'Reservation request not found'
      };
    }

    if (!reservationRequest.requiresAdvancePayment) {
      console.warn('Reservation request does not require advance payment', { 
        requestId: input.requestId 
      });
      return {
        success: false,
        error: 'Reservation does not require advance payment'
      };
    }

    // Check if payment link already exists
    if (reservationRequest.restaurantPaymentLink) {
      console.warn('Payment link already exists for this request', { 
        requestId: input.requestId,
        existingLinkId: reservationRequest.restaurantPaymentLink.id
      });
      return {
        success: false,
        error: 'Payment link already exists for this reservation'
      };
    }

    // Generate unique token
    let token: string;
    let tokenExists = true;
    let attempts = 0;
    const maxAttempts = 5;

    while (tokenExists && attempts < maxAttempts) {
      token = generatePaymentToken();
      const existingLink = await prisma.restaurantPaymentLink.findUnique({
        where: { token }
      });
      tokenExists = !!existingLink;
      attempts++;
    }

    if (tokenExists) {
      console.error('Failed to generate unique token after maximum attempts', {
        requestId: input.requestId,
        attempts: maxAttempts
      });
      return {
        success: false,
        error: 'Failed to generate unique payment link'
      };
    }

    // Calculate expiration time
    const expirationHours = input.expirationHours || 24;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expirationHours);

    // Create payment link in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the payment link
      const paymentLink = await tx.restaurantPaymentLink.create({
        data: {
          requestId: input.requestId,
          token: token!,
          status: PaymentLinkStatus.ACTIVE,
          expiresAt
        }
      });

      // Update reservation request status
      await tx.reservationRequest.update({
        where: { id: input.requestId },
        data: {
          status: ReservationRequestStatus.PENDING_CUSTOMER_PAYMENT
        }
      });

      return paymentLink;
    });

    const paymentUrl = `/payment-link/${result.token}`;

    console.log('Successfully created restaurant payment link', {
      requestId: input.requestId,
      linkId: result.id,
      token: result.token,
      expiresAt: result.expiresAt,
      paymentUrl
    });

    return {
      success: true,
      data: {
        id: result.id,
        token: result.token,
        expiresAt: result.expiresAt,
        paymentUrl
      }
    };
  } catch (error) {
    console.error('Failed to create restaurant payment link', {
      requestId: input.requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create payment link'
    };
  }
}

/**
 * Get payment link by token with reservation details
 */
export async function getPaymentLinkByToken(
  prisma: PrismaClient,
  token: string
): Promise<GetPaymentLinkResult> {
  try {
    console.log('Fetching payment link by token', { token });

    const paymentLink = await prisma.restaurantPaymentLink.findUnique({
      where: { token },
      include: {
        request: {
          select: {
            id: true,
            restaurantId: true,
            requestName: true,
            contactPhone: true,
            requestedDate: true,
            requestedTime: true,
            mealType: true,
            adultCount: true,
            childCount: true,
            estimatedTotalAmount: true,
            estimatedServiceCharge: true,
            estimatedTaxAmount: true,
            status: true,
            requiresAdvancePayment: true,
            reservationType: true
          }
        }
      }
    });

    if (!paymentLink) {
      console.warn('Payment link not found', { token });
      return {
        success: false,
        error: 'Payment link not found'
      };
    }

    // Check if link is expired
    if (paymentLink.expiresAt < new Date()) {
      console.warn('Payment link has expired', {
        token,
        expiresAt: paymentLink.expiresAt,
        currentTime: new Date()
      });

      // Update status to expired if not already
      if (paymentLink.status !== PaymentLinkStatus.EXPIRED) {
        await updatePaymentLinkStatus(prisma, paymentLink.id, PaymentLinkStatus.EXPIRED);
      }

      return {
        success: false,
        error: 'Payment link has expired'
      };
    }

    // Check if link is still active
    if (paymentLink.status !== PaymentLinkStatus.ACTIVE) {
      console.warn('Payment link is not active', {
        token,
        status: paymentLink.status
      });
      return {
        success: false,
        error: `Payment link is ${paymentLink.status.toLowerCase()}`
      };
    }

    console.log('Successfully retrieved payment link', {
      token,
      linkId: paymentLink.id,
      requestId: paymentLink.requestId,
      status: paymentLink.status
    });

    return {
      success: true,
      data: {
        id: paymentLink.id,
        requestId: paymentLink.requestId,
        token: paymentLink.token,
        status: paymentLink.status,
        expiresAt: paymentLink.expiresAt,
        createdAt: paymentLink.createdAt,
        request: {
          id: paymentLink.request.id,
          restaurantId: paymentLink.request.restaurantId,
          requestName: paymentLink.request.requestName,
          contactPhone: paymentLink.request.contactPhone,
          requestedDate: paymentLink.request.requestedDate.toISOString(),
          requestedTime: paymentLink.request.requestedTime,
          mealType: paymentLink.request.mealType,
          adultCount: paymentLink.request.adultCount,
          childCount: paymentLink.request.childCount,
          estimatedTotalAmount: Number(paymentLink.request.estimatedTotalAmount),
          estimatedServiceCharge: Number(paymentLink.request.estimatedServiceCharge),
          estimatedTaxAmount: Number(paymentLink.request.estimatedTaxAmount),
          status: paymentLink.request.status,
          requiresAdvancePayment: paymentLink.request.requiresAdvancePayment,
          reservationType: paymentLink.request.reservationType
        }
      }
    };
  } catch (error) {
    console.error('Failed to get payment link by token', {
      token,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve payment link'
    };
  }
}

/**
 * Update payment link status
 */
export async function updatePaymentLinkStatus(
  prisma: PrismaClient,
  linkId: number,
  status: PaymentLinkStatus
): Promise<UpdatePaymentLinkStatusResult> {
  try {
    console.log('Updating payment link status', { linkId, status });

    await prisma.restaurantPaymentLink.update({
      where: { id: linkId },
      data: { 
        status,
        updatedAt: new Date()
      }
    });

    console.log('Successfully updated payment link status', { linkId, status });

    return { success: true };
  } catch (error) {
    console.error('Failed to update payment link status', {
      linkId,
      status,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update payment link status'
    };
  }
}

/**
 * Mark payment link as clicked (for tracking purposes)
 */
export async function markPaymentLinkClicked(
  prisma: PrismaClient,
  token: string
): Promise<UpdatePaymentLinkStatusResult> {
  try {
    console.log('Marking payment link as clicked', { token });

    const paymentLink = await prisma.restaurantPaymentLink.findUnique({
      where: { token }
    });

    if (!paymentLink) {
      return {
        success: false,
        error: 'Payment link not found'
      };
    }

    // Only update if not already clicked and still active
    if (paymentLink.status === PaymentLinkStatus.ACTIVE) {
      await prisma.restaurantPaymentLink.update({
        where: { token },
        data: { 
          updatedAt: new Date()
        }
      });

      console.log('Successfully marked payment link as clicked', { 
        token, 
        linkId: paymentLink.id 
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to mark payment link as clicked', {
      token,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to mark payment link as clicked'
    };
  }
}

/**
 * Expire old payment links and update related reservation requests
 */
export async function expireOldPaymentLinks(
  prisma: PrismaClient
): Promise<ExpiredLinksResult> {
  try {
    console.log('Starting payment link expiration job');

    const currentTime = new Date();

    // Find all active links that have expired
    const expiredLinks = await prisma.restaurantPaymentLink.findMany({
      where: {
        status: PaymentLinkStatus.ACTIVE,
        expiresAt: {
          lt: currentTime
        }
      },
      include: {
        request: {
          select: {
            id: true,
            status: true
          }
        }
      }
    });

    if (expiredLinks.length === 0) {
      console.log('No expired payment links found');
      return {
        success: true,
        expiredCount: 0
      };
    }

    console.log(`Found ${expiredLinks.length} expired payment links`);

    // Update expired links and their reservation requests in transaction
    await prisma.$transaction(async (tx) => {
      // Update payment links to expired status
      await tx.restaurantPaymentLink.updateMany({
        where: {
          id: {
            in: expiredLinks.map(link => link.id)
          }
        },
        data: {
          status: PaymentLinkStatus.EXPIRED,
          updatedAt: currentTime
        }
      });

      // Update reservation requests that are still pending customer payment
      const requestsToUpdate = expiredLinks
        .filter(link => link.request.status === ReservationRequestStatus.PENDING_CUSTOMER_PAYMENT)
        .map(link => link.request.id);

      if (requestsToUpdate.length > 0) {
        await tx.reservationRequest.updateMany({
          where: {
            id: {
              in: requestsToUpdate
            }
          },
          data: {
            status: ReservationRequestStatus.PAYMENT_LINK_EXPIRED
          }
        });
      }
    });

    console.log('Successfully expired old payment links', {
      expiredCount: expiredLinks.length,
      updatedRequests: expiredLinks.filter(link => 
        link.request.status === ReservationRequestStatus.PENDING_CUSTOMER_PAYMENT
      ).length
    });

    return {
      success: true,
      expiredCount: expiredLinks.length
    };
  } catch (error) {
    console.error('Failed to expire old payment links', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    return {
      success: false,
      expiredCount: 0,
      error: error instanceof Error ? error.message : 'Failed to expire payment links'
    };
  }
}

/**
 * Get payment link by request ID
 */
export async function getPaymentLinkByRequestId(
  prisma: PrismaClient,
  requestId: number
): Promise<GetPaymentLinkResult> {
  try {
    console.log('Fetching payment link by request ID', { requestId });

    const paymentLink = await prisma.restaurantPaymentLink.findUnique({
      where: { requestId },
      include: {
        request: {
          select: {
            id: true,
            restaurantId: true,
            requestName: true,
            contactPhone: true,
            requestedDate: true,
            requestedTime: true,
            mealType: true,
            adultCount: true,
            childCount: true,
            estimatedTotalAmount: true,
            estimatedServiceCharge: true,
            estimatedTaxAmount: true,
            status: true,
            requiresAdvancePayment: true,
            reservationType: true
          }
        }
      }
    });

    if (!paymentLink) {
      console.warn('Payment link not found for request', { requestId });
      return {
        success: false,
        error: 'Payment link not found for this reservation'
      };
    }

    console.log('Successfully retrieved payment link by request ID', {
      requestId,
      linkId: paymentLink.id,
      token: paymentLink.token,
      status: paymentLink.status
    });

    return {
      success: true,
      data: {
        id: paymentLink.id,
        requestId: paymentLink.requestId,
        token: paymentLink.token,
        status: paymentLink.status,
        expiresAt: paymentLink.expiresAt,
        createdAt: paymentLink.createdAt,
        request: {
          id: paymentLink.request.id,
          restaurantId: paymentLink.request.restaurantId,
          requestName: paymentLink.request.requestName,
          contactPhone: paymentLink.request.contactPhone,
          requestedDate: paymentLink.request.requestedDate.toISOString(),
          requestedTime: paymentLink.request.requestedTime,
          mealType: paymentLink.request.mealType,
          adultCount: paymentLink.request.adultCount,
          childCount: paymentLink.request.childCount,
          estimatedTotalAmount: Number(paymentLink.request.estimatedTotalAmount),
          estimatedServiceCharge: Number(paymentLink.request.estimatedServiceCharge),
          estimatedTaxAmount: Number(paymentLink.request.estimatedTaxAmount),
          status: paymentLink.request.status,
          requiresAdvancePayment: paymentLink.request.requiresAdvancePayment,
          reservationType: paymentLink.request.reservationType
        }
      }
    };
  } catch (error) {
    console.error('Failed to get payment link by request ID', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve payment link'
    };
  }
} 