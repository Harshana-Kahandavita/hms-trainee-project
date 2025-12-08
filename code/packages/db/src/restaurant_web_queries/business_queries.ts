import prisma from '../client'

/**
 * Fetch the primary email address for a business.
 * Returns null if the business does not exist or the email is empty.
 */
export async function getBusinessEmailById(
  businessId: number
): Promise<string | null> {
  if (!Number.isFinite(businessId) || businessId <= 0) {
    throw new Error('Invalid business ID provided')
  }

  const businessRecord = await prisma.business.findUnique({
    where: { id: businessId },
    select: { email: true }
  })

  const email = businessRecord?.email?.trim() ?? ''
  return email.length > 0 ? email : null
}


