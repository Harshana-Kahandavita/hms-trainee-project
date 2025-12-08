import { PrismaClient, ReservationRequestStatus, TableSlotStatus } from '../prisma/generated/prisma'
import { subMinutes } from 'date-fns'
import { PaymentGatewayClient } from '../../payment-gw/src/payment_client'
import { MealType, Prisma, RequestCreatorType } from '../prisma/generated/prisma'

// Import the existing reservation confirmation function
import { confirmReservationPayment } from './reservation-creation-queries'

interface CleanupResult {
  restaurantId: number
  recordsRemoved: number
}

/**
 * Enhanced cleanup result with additional metadata for different cleanup types
 */
interface CleanupResultWithMetadata extends CleanupResult {
  cleanupType: 'MANUAL' | 'CUSTOMER' | 'TABLE_AVAILABILITY_SLOTS' | 'EXPIRED_TABLE_SLOT_HOLDS'
  retentionMinutes: number
  seatsReleased: number
}

/**
 * Common interface for cleanup request data
 */
interface CleanupRequestData {
  id: number
  restaurantId: number
  requestedDate: Date
  adultCount: number
  childCount: number
  mealType: MealType
  createdBy: RequestCreatorType
}

/**
 * Interface for notification data returned by the cleanup service
 * Enhanced to match ReservationPaymentStatusDetail for comprehensive notifications
 */
export interface NotificationData {
  requestId: number
  restaurantId: number
  firstName: string
  lastName: string
  customerPhone: string
  customerEmail: string | null
  partySize: number
  date: Date
  mealType: MealType
  amount: number
  reservationType: 'BUFFET_ONLY' | 'TABLE_ONLY' | 'BUFFET_AND_TABLE'
  // Enhanced fields for comprehensive email/SMS/notification data
  reservationId: number
  reservationNumber: string
  restaurantName: string
  restaurantContactNumber: string | null
  businessName: string
  businessEmail: string | null
  businessPhone: string
  merchantEmail?: string
  merchantContactNumber?: string
  totalAmount: string
  advancePaidAmount: string
  remainingAmount: string
  advancePaymentPercentage: number
  status: string
  statusCode: string
  statusDescription: string
}

/**
 * Enriches notification data with complete restaurant and business details
 * @param prisma PrismaClient instance
 * @param reservationId Actual reservation ID from confirmation result
 * @param reservationNumber Actual reservation number from confirmation result
 * @param baseData Partial notification data with basic fields
 * @returns Complete NotificationData with all required fields or null if error
 */
async function enrichNotificationData(
  prisma: PrismaClient,
  reservationId: number,
  reservationNumber: string,
  baseData: Partial<NotificationData>
): Promise<NotificationData | null> {
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        customer: true,
        restaurant: {
          include: {
            business: true
          }
        }
      }
    });

    if (!reservation || !reservation.restaurant || !reservation.customer) {
      console.error(`❌ Failed to fetch reservation details for ID ${reservationId}`);
      return null;
    }

    const advancePaidAmount = Number(reservation.advancePaymentAmount || 0);
    const totalAmount = Number(reservation.totalAmount);
    const remainingAmount = totalAmount - advancePaidAmount;

    console.log(`📋 Enriched data for reservation ${reservationNumber}:`, {
      restaurantName: reservation.restaurant.name,
      businessName: reservation.restaurant.business.name,
      totalAmount: totalAmount.toFixed(2),
      advancePaidAmount: advancePaidAmount.toFixed(2),
      remainingAmount: remainingAmount.toFixed(2)
    });

    return {
      requestId: baseData.requestId!,
      restaurantId: reservation.restaurantId,
      firstName: reservation.customer.firstName,
      lastName: reservation.customer.lastName,
      customerPhone: reservation.customer.phone,
      customerEmail: reservation.customer.email ?? '',
      partySize: reservation.adultCount + reservation.childCount,
      date: reservation.reservationDate,
      mealType: reservation.mealType,
      amount: totalAmount,
      reservationType: reservation.reservationType,
      
      // Enhanced fields with actual data from database
      reservationId: reservation.id,
      reservationNumber: reservation.reservationNumber,
      restaurantName: reservation.restaurant.name,
      restaurantContactNumber: reservation.restaurant.phone,
      businessName: reservation.restaurant.business.name,
      businessEmail: reservation.restaurant.business.email ?? '',
      businessPhone: reservation.restaurant.business.phone,
      merchantEmail: reservation.restaurant.business.email ?? '', // Using business email as merchant email
      merchantContactNumber: reservation.restaurant.business.phone,
      totalAmount: totalAmount.toFixed(2),
      advancePaidAmount: advancePaidAmount.toFixed(2),
      remainingAmount: remainingAmount.toFixed(2),
      advancePaymentPercentage: reservation.restaurant.advancePaymentPercentage,
      status: 'SUCCESS',
      statusCode: 'IPG_S_1000',
      statusDescription: 'TRANSACTION_SUCCESS'
    };
  } catch (error) {
    console.error(`❌ Error enriching notification data for reservation ${reservationId}:`, error);
    return null;
  }
}

/**
 * Interface for verification result with notification data
 */
export interface VerificationResultWithNotifications {
  requestId: number
  transactionReference: string
  verified: boolean
  status?: string
  error?: string
  notificationData?: NotificationData
}

/**
 * Base cleanup function with shared logic
 * Follows DRY principle and single responsibility
 */
async function performReservationRequestCleanup(
  prisma: PrismaClient,
  minutesOld: number,
  createdByFilter: 'MERCHANT' | 'CUSTOMER',
  cleanupType: 'MANUAL_RESERVATION_REQUESTS' | 'CUSTOMER_RESERVATION_REQUESTS'
): Promise<CleanupResultWithMetadata[]> {
  const cutoffDate = subMinutes(new Date(), minutesOld)
  const cleanupStartTime = new Date()
  const status = createdByFilter === 'MERCHANT' ? 'PENDING_CUSTOMER_PAYMENT' : 'PENDING'
  // Build where clause based on filter type
  const whereClause = {
    status: status as ReservationRequestStatus,
    createdAt: { lt: cutoffDate },
    payments: { none: {} },
    reservation: null,
    createdBy: createdByFilter === 'MERCHANT' 
      ? RequestCreatorType.MERCHANT
      : { not: RequestCreatorType.MERCHANT }
  }

  // First, find all restaurants that have stale requests
  const restaurantsWithStaleRequests = await prisma.reservationRequest.groupBy({
    by: ['restaurantId'],
    where: whereClause
  })

  const results: CleanupResultWithMetadata[] = []
  
  console.log(`🧹 Starting ${createdByFilter} reservation cleanup for ${restaurantsWithStaleRequests.length} restaurants...`)

  // Process each restaurant's stale requests
  for (const { restaurantId } of restaurantsWithStaleRequests) {
    let totalSeatsReleased = 0

    // Find and process stale requests for this restaurant
    const staleRequests = await prisma.reservationRequest.findMany({
      where: {
        ...whereClause,
        restaurantId
      },
      select: {
        id: true,
        restaurantId: true,
        requestedDate: true,
        adultCount: true,
        childCount: true,
        mealType: true,
        createdBy: true
      }
    })

    if (staleRequests.length > 0) {
      console.log(`🧹 Processing ${staleRequests.length} ${createdByFilter.toLowerCase()} requests for restaurant ${restaurantId}`)

      // Release capacity for each request
      totalSeatsReleased = await releaseCapacityForRequests(prisma, staleRequests)

      // Delete related records first to avoid foreign key constraint violations
      console.log(`🧹 Deleting related records for ${staleRequests.length} requests...`)
      
      // Delete restaurant payment links first (foreign key constraint)
      const paymentLinksDeleted = await prisma.restaurantPaymentLink.deleteMany({
        where: {
          requestId: { in: staleRequests.map(req => req.id) }
        }
      })
      
      if (paymentLinksDeleted.count > 0) {
        console.log(`🧹 Deleted ${paymentLinksDeleted.count} payment links`)
      }

      // Delete the requests after processing capacity and related records
      await prisma.reservationRequest.deleteMany({
        where: {
          id: { in: staleRequests.map(req => req.id) }
        }
      })

      // Log the cleanup
      await createCleanupLog(prisma, {
        cleanupType,
        restaurantId,
        recordsRemoved: staleRequests.length,
        cleanupStartTime,
        description: `Cleaned up ${staleRequests.length} ${createdByFilter.toLowerCase()} reservation requests older than ${minutesOld} minutes, released ${totalSeatsReleased} seats`
      });

      results.push({
        restaurantId,
        recordsRemoved: staleRequests.length,
        cleanupType: createdByFilter === 'MERCHANT' ? 'MANUAL' : 'CUSTOMER',
        retentionMinutes: minutesOld,
        seatsReleased: totalSeatsReleased
      })
    }
  }

  console.log(`✅ Completed ${createdByFilter} reservation cleanup: ${results.length} restaurants processed`)
  return results
}

/**
 * Shared function to release capacity for multiple requests
 * Follows single responsibility principle
 */
async function releaseCapacityForRequests(
  prisma: PrismaClient, 
  requests: CleanupRequestData[]
): Promise<number> {
  let totalSeatsReleased = 0

  for (const request of requests) {
    try {
      const seatsReleased = await releaseCapacityForSingleRequest(prisma, request)
      totalSeatsReleased += seatsReleased
    } catch (error) {
      console.error(`❌ Error releasing capacity for request ${request.id}:`, error)
    }
  }

  return totalSeatsReleased
}

/**
 * Release capacity for a single request
 * Extracted for better testability and maintainability
 */
async function releaseCapacityForSingleRequest(
  prisma: PrismaClient,
  request: CleanupRequestData
): Promise<number> {
  // 1. Find the meal service for this request
  const mealService = await prisma.restaurantMealService.findFirst({
    where: {
      restaurantId: request.restaurantId,
      mealType: request.mealType,
      isAvailable: true
    }
  });

  if (!mealService) {
    console.log(`⚠️ No meal service found for request ${request.id}, mealType: ${request.mealType}`)
    return 0
  }

  // 2. Find capacity record for the date and meal service
  const capacityRecord = await prisma.restaurantCapacity.findFirst({
    where: {
      restaurantId: request.restaurantId,
      serviceId: mealService.id,
      date: request.requestedDate
    }
  });

  if (!capacityRecord) {
    console.log(`⚠️ No capacity record found for request ${request.id}, date: ${request.requestedDate}`)
    return 0
  }

  // Calculate total seats to release
  const totalSeatsToRelease = request.adultCount + (request.childCount || 0);

  // Skip if no seats were allocated (safety check)
  if (totalSeatsToRelease <= 0) {
    console.log(`⚠️ No seats to release for request ${request.id}`)
    return 0
  }

  // 3. Update capacity by decrementing booked seats
  const updatedCapacity = await prisma.restaurantCapacity.update({
    where: { id: capacityRecord.id },
    data: {
      bookedSeats: {
        decrement: totalSeatsToRelease
      }
    }
  });

  console.log(`✅ Capacity released for ${request.createdBy} request ${request.id}: ${totalSeatsToRelease} seats`)

  return totalSeatsToRelease
}

/**
 * Cleanup stale MANUAL reservation requests (created by MERCHANT)
 * @param prisma PrismaClient instance
 * @param minutesOld Number of minutes old to consider for cleanup
 * @returns Array of cleanup results per restaurant
 */
export async function cleanupStaleManualReservationRequests(
  prisma: PrismaClient,
  minutesOld: number
): Promise<CleanupResultWithMetadata[]> {
  console.log(`🏪 Starting manual reservation cleanup for requests older than ${minutesOld} minutes...`)
  
  return performReservationRequestCleanup(
    prisma,
    minutesOld,
    'MERCHANT',
    'MANUAL_RESERVATION_REQUESTS'
  )
}

/**
 * Cleanup stale CUSTOMER reservation requests (created by CUSTOMER, SYSTEM, OTHER)
 * @param prisma PrismaClient instance
 * @param minutesOld Number of minutes old to consider for cleanup
 * @returns Array of cleanup results per restaurant
 */
export async function cleanupStaleCustomerReservationRequests(
  prisma: PrismaClient,
  minutesOld: number
): Promise<CleanupResultWithMetadata[]> {
  console.log(`👥 Starting customer reservation cleanup for requests older than ${minutesOld} minutes...`)
  
  return performReservationRequestCleanup(
    prisma,
    minutesOld,
    'CUSTOMER',
    'CUSTOMER_RESERVATION_REQUESTS'
  )
}

/**
 * Finds pending reservation requests with payments but no reservation
 * @param prisma PrismaClient instance
 * @param minutesOld Consider only requests older than X minutes
 * @returns Array of problematic requests grouped by restaurant
 */
export async function findPendingPaidRequestsWithoutReservation(
  prisma: PrismaClient,
  minutesOld: number
): Promise<Array<{
  restaurantId: number
  requests: Array<{
    id: number
    customerId: number
    requestName: string
    contactPhone: string
    requestedDate: Date
    requestedTime: Date
    adultCount: number
    childCount: number
    mealType: string
    estimatedTotalAmount: Prisma.Decimal
    estimatedServiceCharge: Prisma.Decimal
    estimatedTaxAmount: Prisma.Decimal
    status: string
    createdAt: Date
    payments: Array<{
      id: number
      amount: Prisma.Decimal
      paymentStatus: string
      transactionReference: string
      paymentInitiatedAt: Date
      paymentProvider: string
      paymentChannel: string
      paymentStatusUrl: string | null
    }>
  }>
}>> {
  const cutoffDate = subMinutes(new Date(), minutesOld)
  console.log("🧹 cutoffDate:", cutoffDate);
  // First find restaurants with potential problematic requests
  const restaurantsWithIssues = await prisma.reservationRequest.groupBy({
    by: ['restaurantId'],
    where: {
      status: 'PENDING',
      createdAt: { lt: cutoffDate },
      payments: { some: {} }, // Has at least one payment
      reservation: null
    }
  })
  console.log("🧹 restaurantsWithIssues:", restaurantsWithIssues);
  const results = []

  // Get detailed records for each restaurant
  for (const { restaurantId } of restaurantsWithIssues) {
    const requests = await prisma.reservationRequest.findMany({
      where: {
        restaurantId,
        status: 'PENDING',
        createdAt: { lt: cutoffDate },
        payments: { some: {} },
        reservation: null
      },
      select: {
        id: true,
        customerId: true,
        requestName: true,
        contactPhone: true,
        requestedDate: true,
        requestedTime: true,
        adultCount: true,
        childCount: true,
        mealType: true,
        estimatedTotalAmount: true,
        estimatedServiceCharge: true,
        estimatedTaxAmount: true,
        status: true,
        createdAt: true,
        payments: {
          select: {
            id: true,
            amount: true,
            paymentStatus: true,
            transactionReference: true,
            paymentInitiatedAt: true,
            paymentProvider: true,
            paymentChannel: true,
            paymentStatusUrl: true
          }
        }
      }
    })

    if (requests.length > 0) {
      results.push({
        restaurantId,
        requests
      })
    }
  }

  console.log("Dangling requests:", results);
  return results
}

/**
 * Verifies payment status with IPG for pending requests
 * @param paymentClient PaymentGatewayClient instance
 * @param requests Array of requests with payments to verify
 * @returns Array of verified payment statuses with payment details
 */
async function verifyPaymentStatuses(
  paymentClient: PaymentGatewayClient,
  requests: Array<{
    id: number
    payments: Array<{
      transactionReference: string
      paymentStatusUrl: string | null
    }>
  }>
): Promise<Array<{
  requestId: number
  transactionReference: string
  verified: boolean
  status?: string
  error?: string
  paymentDetails?: {
    hmsTrxId: string
    amount: string
    amountFormatted: number
    cardBrand: string
    cardNumber: string
    expiryDate: string
    additionalDetail?: any
  }
}>> {
  const results = []

  for (const request of requests) {
    for (const payment of request.payments) {
      try {
        if (!payment.paymentStatusUrl) {
          results.push({
            requestId: request.id,
            transactionReference: payment.transactionReference,
            verified: false,
            error: 'Missing payment status URL'
          })
          continue
        }

        // Verify with IPG using the injected client instance
        const ipgResult = await paymentClient.getIPGTransactionStatus(
          payment.transactionReference,
          payment.paymentStatusUrl
        )
        console.log("#### IPG Result:", ipgResult);

        if (!ipgResult.success || !ipgResult.data) {
          results.push({
            requestId: request.id,
            transactionReference: payment.transactionReference,
            verified: false,
            status: ipgResult.data?.statusCode,
            error: ipgResult.error
          })
        } else {
          // If successful, include the formatted payment details
          const formattedAmount = Number(ipgResult.data.amount);
          
          results.push({
            requestId: request.id,
            transactionReference: payment.transactionReference,
            verified: ipgResult.success,
            status: ipgResult.data.statusCode,
            error: ipgResult.error,
            paymentDetails: {
              hmsTrxId: ipgResult.data.hmsTrxId || "",
              amount: ipgResult.data.amount || "0",
              amountFormatted: formattedAmount,
              cardBrand: ipgResult.data.cardBrand || "Unknown",
              cardNumber: ipgResult.data.cardNumber || "XXXX",
              expiryDate: ipgResult.data.expiry || "XX/XX",
              additionalDetail: ipgResult.data.additionalDetail
            }
          })
        }
      } catch (error) {
        results.push({
          requestId: request.id,
          transactionReference: payment.transactionReference,
          verified: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  }

  return results
}

/**
 * Finds and verifies pending reservation requests with payments but no reservation
 * @param prisma PrismaClient instance
 * @param paymentClient PaymentGatewayClient instance
 * @param minutesOld Number of minutes old to consider for verification
 * @param notificationServices Optional notification services for SMS and Firebase
 * @returns Array of verification results
 */
export async function findAndVerifyPendingPaidRequests(
  prisma: PrismaClient,
  paymentClient: PaymentGatewayClient,
  minutesOld: number
): Promise<VerificationResultWithNotifications[]> {
  // First find all pending paid requests with customer and reservation details
  const pendingRequests = await findPendingPaidRequestsWithoutReservation(prisma, minutesOld)
  
  // If no requests found, return empty array
  if (pendingRequests.length === 0) {
    return [];
  }

  let allEnrichedResults: any[] = [];
  const cleanupStartTime = new Date();
  
  // Track notification data for successful payments
  const notificationDataByRequestId: Record<number, NotificationData> = {};
  
  // Arrays to track requests that need to be cleaned up or were successfully processed
  const requestsToCleanup: number[] = [];
  const successfullyProcessedRequests: number[] = [];

  // For each restaurant's requests, verify payment statuses and enrich with details
  for (const restaurant of pendingRequests) {
    // Get full request details including customer info
    const requestsWithDetails = await prisma.reservationRequest.findMany({
      where: {
        id: {
          in: restaurant.requests.map(req => req.id)
        }
      },
      select: {
        id: true,
        restaurantId: true,
        customerId: true,
        requestName: true,
        contactPhone: true,
        requestedDate: true,
        requestedTime: true,
        adultCount: true,
        childCount: true,
        mealType: true,
        estimatedTotalAmount: true,
        estimatedServiceCharge: true,
        estimatedTaxAmount: true,
        status: true,
        createdAt: true,
        createdBy: true,
        // Include customer details
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true
          }
        },
        // Include payment details
        payments: {
          select: {
            id: true,
            amount: true,
            paymentStatus: true,
            transactionReference: true,
            paymentInitiatedAt: true,
            paymentProvider: true,
            paymentChannel: true,
            paymentStatusUrl: true
          }
        },
        // Include any special requests or dietary requirements
        specialRequests: true,
        dietaryRequirements: true,
        occasion: true
      }
    })

    // Verify payment statuses
    const verificationResults = await verifyPaymentStatuses(
      paymentClient,
      requestsWithDetails.map(req => ({
        id: req.id,
        payments: req.payments.map(p => ({
          transactionReference: p.transactionReference,
          paymentStatusUrl: p.paymentStatusUrl
        }))
      }))
    )

    // Process payments based on verification results
    for (const result of verificationResults) {
      console.log("Result:", result);

      const requestDetails = requestsWithDetails.find(r => r.id === result.requestId);
      
      if (!requestDetails) {
        console.log(`⚠️ Request details not found for request ${result.requestId}`);
        continue;
      }

      // Handle successful payments
      if (result.verified && result.status === 'IPG_S_1000') {
        if (requestDetails.customer) {
          try {
            // Use the payment details directly from the verification result
            // No need to call the payment gateway again
            if (!result.paymentDetails) {
              console.error(`❌ Missing payment details for request ${result.requestId}`);
              requestsToCleanup.push(result.requestId);
              continue;
            }
            
            // Log the payment details we're using
            console.log(`📋 Using payment details for request ${result.requestId}:`, {
              hmsTrxId: result.paymentDetails.hmsTrxId,
              amount: result.paymentDetails.amount,
              amountFormatted: result.paymentDetails.amountFormatted,
              cardBrand: result.paymentDetails.cardBrand,
              cardNumber: result.paymentDetails.cardNumber,
              expiryDate: result.paymentDetails.expiryDate
            });
            
            // 1. Confirm the reservation payment
            const confirmationResult = await confirmReservationPayment(prisma, {
              merchantTxId: result.transactionReference,
              statusCode: 'IPG_S_1000', // Success code expected by the function
              description: 'Payment verified by cleanup service',
              requestId: result.requestId,
              reservationRequest: {
                restaurantId: requestDetails.restaurantId,
                date: requestDetails.requestedDate.toISOString(),
                mealType: requestDetails.mealType as MealType,
                partySize: requestDetails.adultCount + (requestDetails.childCount || 0),
                adultCount: requestDetails.adultCount,
                childCount: requestDetails.childCount || 0,
                estimatedTotalAmount: Number(requestDetails.estimatedTotalAmount),
                firstName: requestDetails.customer.firstName,
                lastName: requestDetails.customer.lastName,
                email: requestDetails.customer.email ?? '',
                phone: requestDetails.customer.phone
              },
              paymentDetails: {
                amount: result.paymentDetails.amountFormatted,
                cardBrand: result.paymentDetails.cardBrand,
                cardNumber: result.paymentDetails.cardNumber,
                expiryDate: result.paymentDetails.expiryDate,
                hmsTrxId: result.paymentDetails.hmsTrxId
              },
              // Pass the createdBy from the request details
              createdBy: requestDetails.createdBy
            });

            // Check if confirmation result is valid
            if (!confirmationResult) {
              console.error(`❌ Confirmation result is undefined for request ${result.requestId}`);
              requestsToCleanup.push(result.requestId);
              continue;
            }

            if (confirmationResult.success) {
              console.log(`✅ Successfully confirmed payment for request ${result.requestId}`);
              successfullyProcessedRequests.push(result.requestId);

              // 2. Create reservation notification
              const notificationCreated = await createReservationNotification(prisma, {
                restaurantId: requestDetails.restaurantId,
                firstName: requestDetails.customer.firstName,
                lastName: requestDetails.customer.lastName,
                partySize: requestDetails.adultCount + (requestDetails.childCount || 0),
                date: requestDetails.requestedDate,
                mealType: requestDetails.mealType,
                amount: Number(requestDetails.estimatedTotalAmount) || 0
              });

              // 3. Enrich notification data with complete restaurant and business details
              if (notificationCreated && confirmationResult.data) {
                console.log(`📋 Enriching notification data for request ${result.requestId}`);
                const enrichedData = await enrichNotificationData(
                  prisma,
                  confirmationResult.data.id, // actual reservation ID
                  confirmationResult.data.reservationNumber, // actual reservation number
                  {
                    requestId: result.requestId,
                    amount: Number(requestDetails.estimatedTotalAmount) || 0
                  }
                );

                if (enrichedData) {
                  notificationDataByRequestId[result.requestId] = enrichedData;
                  console.log(`✅ Enhanced notification data stored for request ${result.requestId}`);
                } else {
                  console.error(`❌ Failed to enrich notification data for request ${result.requestId}`);
                }
              }
            } else {
              console.error(`❌ Failed to confirm payment for request ${result.requestId}:`, confirmationResult ?? "");
              // Add to cleanup list since confirmation failed
              requestsToCleanup.push(result.requestId);
            }
          } catch (error) {
            console.error(`❌ Error processing payment for request ${result.requestId}:`, error);
            // Add to cleanup list since processing failed
            requestsToCleanup.push(result.requestId);
          }
        }
      } else {
        // Payment verification failed or payment status is not successful
        console.log(`🧹 Adding request ${result.requestId} to cleanup list - Payment verification failed or status not successful`);
        console.log(`   Status: ${result.status || 'Unknown'}, Verified: ${result.verified}`);
        requestsToCleanup.push(result.requestId);
      }
    }

    // Combine verification results with request details
    const enrichedResults = verificationResults.map(result => {
      const requestDetails = requestsWithDetails.find(r => r.id === result.requestId)
      return {
        ...result,
        customerDetails: requestDetails?.customer,
        reservationDetails: {
          requestName: requestDetails?.requestName,
          contactPhone: requestDetails?.contactPhone,
          requestedDate: requestDetails?.requestedDate,
          requestedTime: requestDetails?.requestedTime,
          adultCount: requestDetails?.adultCount,
          childCount: requestDetails?.childCount,
          mealType: requestDetails?.mealType,
          estimatedTotalAmount: requestDetails?.estimatedTotalAmount,
          specialRequests: requestDetails?.specialRequests,
          dietaryRequirements: requestDetails?.dietaryRequirements,
          occasion: requestDetails?.occasion
        }
      }
    })

    console.log(`Payment verification results for restaurant ${restaurant.restaurantId}:`,
      enrichedResults
    )

    // Add this restaurant's results to the combined results
    allEnrichedResults = [...allEnrichedResults, ...enrichedResults];
  }

  // Clean up requests with failed payments
  if (requestsToCleanup.length > 0) {
    console.log(`🧹 Starting cleanup for ${requestsToCleanup.length} requests with failed payments...`);

    // Get all requests to clean up with their details
    const requestsToCleanupDetails = await prisma.reservationRequest.findMany({
      where: {
        id: { in: requestsToCleanup },
        status: 'PENDING',
        reservation: null
      },
      select: {
        id: true,
        restaurantId: true,
        requestedDate: true,
        adultCount: true,
        childCount: true,
        mealType: true
      }
    });

    // Get unique restaurant IDs
    const uniqueRestaurantIds = Array.from(new Set(requestsToCleanupDetails.map(req => req.restaurantId)));

    // Process each restaurant's failed requests
    for (const restaurantId of uniqueRestaurantIds) {
      // Get requests for this restaurant
      const requests = requestsToCleanupDetails.filter(req => req.restaurantId === restaurantId);

      console.log(`🧹 Processing ${requests.length} failed requests for restaurant ${restaurantId}`);

      let capacityReleasedCount = 0;

      // Process each request to release capacity
      for (const request of requests) {
        try {
          // 1. Find the meal service for this request
          const mealService = await prisma.restaurantMealService.findFirst({
            where: {
              restaurantId: request.restaurantId,
              mealType: request.mealType,
              isAvailable: true
            }
          });

          if (!mealService) {
            console.log(`⚠️ No meal service found for failed request ${request.id}, mealType: ${request.mealType}`);
            continue;
          }

          // 2. Find capacity record for the date and meal service
          const capacityRecord = await prisma.restaurantCapacity.findFirst({
            where: {
              restaurantId: request.restaurantId,
              serviceId: mealService.id,
              date: request.requestedDate
            }
          });

          if (!capacityRecord) {
            console.log(`⚠️ No capacity record found for failed request ${request.id}, date: ${request.requestedDate}`);
            continue;
          }

          // Calculate total seats to release
          const totalSeatsToRelease = request.adultCount + (request.childCount || 0);

          // Skip if no seats were allocated (safety check)
          if (totalSeatsToRelease <= 0) {
            console.log(`⚠️ No seats to release for failed request ${request.id}`);
            continue;
          }

          // 3. Update capacity by decrementing booked seats
          const updatedCapacity = await prisma.restaurantCapacity.update({
            where: { id: capacityRecord.id },
            data: {
              bookedSeats: {
                decrement: totalSeatsToRelease
              }
            }
          });

          // Log capacity after update
          console.log(`✅ Capacity released for failed request ${request.id}:`, {
            capacityId: updatedCapacity.id,
            date: updatedCapacity.date,
            seatsReleased: totalSeatsToRelease,
            newBookedSeats: updatedCapacity.bookedSeats,
            availableSeats: updatedCapacity.totalSeats - updatedCapacity.bookedSeats
          });

          capacityReleasedCount++;
        } catch (error) {
          console.error(`❌ Error releasing capacity for failed request ${request.id}:`, error);
        }
      }

      // Update request status to PAYMENT_FAILED
      await prisma.reservationRequest.updateMany({
        where: {
          id: { in: requests.map(r => r.id) }
        },
        data: {
          status: 'PAYMENT_FAILED',
          processingCompletedAt: new Date()
        }
      });

      // Log the cleanup using the new utility function
      await createCleanupLog(prisma, {
        cleanupType: 'FAILED_PAYMENT_REQUESTS',
        restaurantId,
        recordsRemoved: requests.length,
        cleanupStartTime,
        description: `Cleaned up ${requests.length} reservation requests with failed payments, releasing ${capacityReleasedCount} seats`
      });

      console.log(`✅ Completed cleanup for restaurant ${restaurantId}:`, {
        requestsCleaned: requests.length,
        capacityReleasedCount
      });
    }
  }

  // Return verification results with notification data where available
  const finalResults: VerificationResultWithNotifications[] = [];

  // For each restaurant, process its verification results
  for (const restaurant of pendingRequests) {
    const verificationResults = await verifyPaymentStatuses(
      paymentClient,
      restaurant.requests.map(req => ({
        id: req.id,
        payments: req.payments.map(p => ({
          transactionReference: p.transactionReference,
          paymentStatusUrl: p.paymentStatusUrl
        }))
      }))
    );

    // Add verification results to final results
    for (const result of verificationResults) {
      finalResults.push({
        requestId: result.requestId,
        transactionReference: result.transactionReference,
        verified: result.verified,
        status: result.status,
        error: result.error,
        notificationData: notificationDataByRequestId[result.requestId]
      });
    }
  }

  return finalResults;
}



// Helper function to create reservation notification
async function createReservationNotification(
  prisma: PrismaClient,
  params: {
    restaurantId: number;
    firstName: string;
    lastName: string;
    partySize: number;
    date: Date;
    mealType: MealType;
    amount: number;
  }
) {
  try {
    await prisma.notification.create({
      data: {
        restaurantId: params.restaurantId,
        type: 'RESERVATION_CONFIRMED',
        title: 'New Reservation Confirmed',
        message: `New reservation confirmed for ${params.firstName} ${params.lastName}`,
        metadata: {
          customerName: `${params.firstName} ${params.lastName}`,
          partySize: params.partySize,
          reservationDate: params.date,
          mealType: params.mealType,
          amount: params.amount
        }
      }
    });

    return true;
  } catch (error) {
    console.error('Failed to create reservation notification:', error);
    return false;
  }
}

// Helper function to send reservation notification
// In a real implementation, this would send emails, SMS, etc.
// async function sendReservationNotification(
//   params: {
//     requestId: number;
//     restaurantId: number;
//     firstName: string;
//     lastName: string;
//     partySize: number;
//     date: Date;
//     mealType: MealType;
//     amount: number;
//   }
// ) {
//   try {
//     console.log(`Sending notification for reservation: ${params.firstName} ${params.lastName}`);
//     // Here you would implement the actual notification sending logic
//     // This could include sending emails, SMS, or other notifications

//     return true;
//   } catch (error) {
//     console.error('Failed to send reservation notification:', error);
//     return false;
//   }
// }

/**
 * Creates a cleanup log entry to track cleanup operations
 * @param prisma PrismaClient instance
 * @param params Cleanup log parameters
 * @returns The created cleanup log entry
 */
export async function createCleanupLog(
  prisma: PrismaClient,
  params: {
    cleanupType: string;
    restaurantId: number;
    recordsRemoved: number;
    cleanupStartTime: Date;
    description?: string;
  }
) {
  try {
    console.log(`📝 Creating cleanup log for ${params.cleanupType}:`, {
      restaurantId: params.restaurantId,
      recordsRemoved: params.recordsRemoved,
      description: params.description || 'No additional details'
    });

    const cleanupLog = await prisma.cleanupLog.create({
      data: {
        cleanupType: params.cleanupType,
        restaurantId: params.restaurantId,
        recordsRemoved: params.recordsRemoved,
        cleanupStartTime: params.cleanupStartTime,
        cleanupEndTime: new Date(),
      }
    });

    console.log(`✅ Cleanup log created successfully with ID: ${cleanupLog.id}`);
    return cleanupLog;
  } catch (error) {
    console.error('❌ Error creating cleanup log:', error);
    throw error;
  }
}

/**
 * Creates a cleanup log entry for ad-hoc cleanup operations
 * This is useful for manual cleanup operations or one-time scripts
 */
export async function logAdHocCleanup(
  prisma: PrismaClient,
  params: {
    cleanupType: string;
    restaurantId: number;
    recordsRemoved: number;
    description: string;
  }
) {
  const cleanupStartTime = new Date();
  cleanupStartTime.setMinutes(cleanupStartTime.getMinutes() - 1); // Set start time 1 minute before now

  return createCleanupLog(prisma, {
    ...params,
    cleanupStartTime
  });
}

/**
 * Cleanup stale table availability slots (past unused entries that are no longer needed)
 * @param prisma PrismaClient instance
 * @returns Array of cleanup results per restaurant
 */
export async function cleanupStaleTableAvailabilitySlots(
  prisma: PrismaClient
): Promise<CleanupResultWithMetadata[]> {
  const cutoffDate = new Date();
  cutoffDate.setHours(0, 0, 0, 0); // Start of today
  const cleanupStartTime = new Date();

  console.log(`🕐 Starting table availability slots cleanup for unused past slots (before ${cutoffDate.toISOString().split('T')[0]})...`);

  try {
    // First, find all restaurants that have stale table availability slots
    const restaurantsWithStaleSlots = await prisma.tableAvailabilitySlot.groupBy({
      by: ['restaurantId'],
      where: {
        date: { lt: cutoffDate },
        // Only clean up slots that are not currently reserved
        reservationId: null,
        // Only clean up slots that are not currently held
        holdExpiresAt: null
      }
    });

    const results: CleanupResultWithMetadata[] = [];
    
    console.log(`🧹 Found ${restaurantsWithStaleSlots.length} restaurants with stale table availability slots`);

    // Process each restaurant's stale slots
    for (const { restaurantId } of restaurantsWithStaleSlots) {
      // Find stale slots for this restaurant
      const staleSlots = await prisma.tableAvailabilitySlot.findMany({
        where: {
          restaurantId,
          date: { lt: cutoffDate },
          reservationId: null,
          holdExpiresAt: null
        },
        select: {
          id: true,
          restaurantId: true,
          date: true,
          startTime: true,
          endTime: true,
          status: true
        }
      });

      if (staleSlots.length > 0) {
        console.log(`🧹 Processing ${staleSlots.length} stale table availability slots for restaurant ${restaurantId}`);

        // Delete the stale slots
        await prisma.tableAvailabilitySlot.deleteMany({
          where: {
            id: { in: staleSlots.map(slot => slot.id) }
          }
        });

        // Log the cleanup
        await createCleanupLog(prisma, {
          cleanupType: 'TABLE_AVAILABILITY_SLOTS',
          restaurantId,
          recordsRemoved: staleSlots.length,
          cleanupStartTime,
          description: `Cleaned up ${staleSlots.length} unused past table availability slots for restaurant ${restaurantId}`
        });

        results.push({
          restaurantId,
          recordsRemoved: staleSlots.length,
          cleanupType: 'TABLE_AVAILABILITY_SLOTS' as const,
          retentionMinutes: 0, // No retention - delete unused past slots immediately
          seatsReleased: 0 // Table slots don't affect seat capacity
        });

        console.log(`✅ Cleaned up ${staleSlots.length} stale table availability slots for restaurant ${restaurantId}`);
      }
    }

    console.log(`✅ Completed table availability slots cleanup: ${results.length} restaurants processed, ${results.reduce((sum, r) => sum + r.recordsRemoved, 0)} total slots removed`);
    return results;

  } catch (error) {
    console.error('❌ Error during table availability slots cleanup:', error);
    throw new Error(`Failed to cleanup stale table availability slots: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Cleanup expired table slot holds
 * This should be run frequently (e.g., every 5-10 minutes) to release expired holds quickly
 * @param prisma PrismaClient instance
 * @returns Cleanup result with metadata
 */
export async function cleanupExpiredTableSlotHolds(
  prisma: PrismaClient
): Promise<CleanupResultWithMetadata[]> {
  const cleanupStartTime = new Date();
  const now = new Date();

  console.log(`🕐 Starting expired table slot holds cleanup at ${now.toISOString()}...`);

  try {
    // Find all restaurants that have expired holds
    const restaurantsWithExpiredHolds = await prisma.tableAvailabilitySlot.groupBy({
      by: ['restaurantId'],
      where: {
        status: TableSlotStatus.HELD,
        holdExpiresAt: {
          lt: now
        }
      }
    });

    const results: CleanupResultWithMetadata[] = [];
    
    console.log(`🧹 Found ${restaurantsWithExpiredHolds.length} restaurants with expired table slot holds`);

    // Process each restaurant's expired holds
    for (const { restaurantId } of restaurantsWithExpiredHolds) {
      try {
        // Find expired holds for this restaurant
        const expiredHolds = await prisma.tableAvailabilitySlot.findMany({
          where: {
            restaurantId,
            status: TableSlotStatus.HELD,
            holdExpiresAt: {
              lt: now
            }
          },
          select: {
            id: true,
            restaurantId: true,
            date: true,
            startTime: true,
            endTime: true,
            holdExpiresAt: true
          }
        });

        if (expiredHolds.length > 0) {
          console.log(`🧹 Processing ${expiredHolds.length} expired table slot holds for restaurant ${restaurantId}`);

          // Process in smaller batches if there are many holds
          const batchSize = 50;
          let totalReleased = 0;

          for (let i = 0; i < expiredHolds.length; i += batchSize) {
            const batch = expiredHolds.slice(i, i + batchSize);
            
            // Release expired holds in a transaction with increased timeout
            const releasedCount = await prisma.$transaction(async (tx) => {
              // Update all expired slots to AVAILABLE
              const updateResult = await tx.tableAvailabilitySlot.updateMany({
                where: {
                  id: {
                    in: batch.map(hold => hold.id)
                  },
                  status: TableSlotStatus.HELD,
                  holdExpiresAt: {
                    lt: now
                  }
                },
                data: {
                  status: TableSlotStatus.AVAILABLE,
                  holdExpiresAt: null
                }
              });

              // Delete the hold records
              await tx.reservationTableHold.deleteMany({
                where: {
                  slotId: {
                    in: batch.map(hold => hold.id)
                  }
                }
              });

              return updateResult.count;
            }, {
              timeout: 30000 // 30 seconds timeout
            });

            totalReleased += releasedCount;
            console.log(`✅ Released ${releasedCount} expired holds (batch ${Math.floor(i / batchSize) + 1}) for restaurant ${restaurantId}`);
          }

          // Log the cleanup
          await createCleanupLog(prisma, {
            cleanupType: 'EXPIRED_TABLE_SLOT_HOLDS',
            restaurantId,
            recordsRemoved: totalReleased,
            cleanupStartTime,
            description: `Released ${totalReleased} expired table slot holds for restaurant ${restaurantId}`
          });

          results.push({
            restaurantId,
            recordsRemoved: totalReleased,
            cleanupType: 'EXPIRED_TABLE_SLOT_HOLDS' as const,
            retentionMinutes: 0, // No retention - release expired holds immediately
            seatsReleased: 0 // Table slots don't affect seat capacity
          });

          console.log(`✅ Released ${totalReleased} expired table slot holds for restaurant ${restaurantId}`);
        }
      } catch (error) {
        console.error(`❌ Error processing expired holds for restaurant ${restaurantId}:`, error);
        // Continue with other restaurants even if one fails
        results.push({
          restaurantId,
          recordsRemoved: 0,
          cleanupType: 'EXPIRED_TABLE_SLOT_HOLDS' as const,
          retentionMinutes: 0,
          seatsReleased: 0
        });
      }
    }

    const totalReleased = results.reduce((sum, r) => sum + r.recordsRemoved, 0);
    console.log(`✅ Completed expired table slot holds cleanup: ${results.length} restaurants processed, ${totalReleased} total holds released`);
    return results;

  } catch (error) {
    console.error('❌ Error during expired table slot holds cleanup:', error);
    throw new Error(`Failed to cleanup expired table slot holds: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
