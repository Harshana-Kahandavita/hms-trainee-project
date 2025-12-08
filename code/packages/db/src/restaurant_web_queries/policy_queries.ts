import { PrismaClient } from '../../prisma/generated/prisma';

/**
 * Store policy applications for a reservation request
 * Used during call-in flow before payment completion
 */
export async function storeRequestPolicyApplications(
  prisma: PrismaClient,
  requestId: number,
  policyApplications: Array<{
    policyId: number;
    wasAccepted: boolean;
    wasSkipped: boolean;
    selectedOptionId?: number;
    appliedAt: Date;
  }>
): Promise<void> {
  await prisma.reservationAppliedPolicies.createMany({
    data: policyApplications.map(app => ({
      requestId,
      reservationId: null, // Will be set after payment
      policyId: app.policyId,
      wasAccepted: app.wasAccepted,
      wasSkipped: app.wasSkipped,
      selectedOptionId: app.selectedOptionId || null,
      appliedAt: app.appliedAt
    })),
    skipDuplicates: true
  });
}

/**
 * Link existing policy applications to a reservation
 * Used after payment completion to connect policies to the final reservation
 */
export async function linkPolicyApplicationsToReservation(
  prisma: any, // Transaction client type
  requestId: number,
  reservationId: number
): Promise<number> {
  const result = await prisma.reservationAppliedPolicies.updateMany({
    where: {
      requestId,
      reservationId: null // Only get policies not yet linked
    },
    data: {
      reservationId
    }
  });

  return result.count;
}
