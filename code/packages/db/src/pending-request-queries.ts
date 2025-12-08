import { PrismaClient } from '../prisma/generated/prisma'

/**
 * Find all pending reservation requests that don't have any associated payments or reservations
 * @param prisma PrismaClient instance
 * @returns Array of pending reservation requests without payments or reservations
 */
export async function findPendingRequestsWithoutPaymentsOrReservations(
  prisma: PrismaClient
) {
  return prisma.reservationRequest.findMany({
    where: {
      status: 'PENDING',
      payments: {
        none: {}
      },
      reservation: null
    },
    orderBy: {
      createdAt: 'asc'
    }
  })
}
