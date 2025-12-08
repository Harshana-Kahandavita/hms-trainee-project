import { PrismaClient } from '../../prisma/generated/prisma';

/**
 * Get current time in ISO format
 */
const getCurrentTime = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds()
  ));
};

/**
 * Convert date to ISO format
 */
const toISOTime = (date: Date): Date => {
  return new Date(date.toISOString());
};

/**
 * Interface for the valid meal services request
 */
export interface GetValidMealServicesRequest {
  restaurantId: number;
  date: string;
}

/**
 * Interface for the valid meal services response
 */
export interface ValidMealServiceResponse {
  id: number;
  mealType: string;
  serviceStartTime: Date;
  serviceEndTime: Date;
  isAvailable: boolean;
  isPast: boolean;
  isWithinRefundWindow: boolean;
  refundWindowMinutes: number;
  isChildEnabled: boolean;
  childNetPrice: number | null;
  childAgeLimit: number;
  enableAsPlatter: boolean;
  paxPerPlatter: number | null;
}

/**
 * Interface for the query response
 */
export interface GetValidMealServicesResponse {
  success: boolean;
  data?: ValidMealServiceResponse[];
  errorMessage?: string;
}

/**
 * Query class for getting valid meal services
 */
export class GetValidMealServicesQuery {
  constructor(private prisma: PrismaClient) {}

  /**
   * Execute the query to get valid meal services
   */
  async execute(request: GetValidMealServicesRequest): Promise<GetValidMealServicesResponse> {
    try {
      // Get all meal services for the restaurant
      const mealServices = await this.prisma.restaurantMealService.findMany({
        where: {
          restaurantId: request.restaurantId,
          isAvailable: true
        },
        select: {
          id: true,
          mealType: true,
          serviceStartTime: true,
          serviceEndTime: true,
          isAvailable: true,
          isChildEnabled: true,
          childNetPrice: true,
          childAgeLimit: true,
          platters: {
            select: {
              id: true,
              headCount: true,
              isActive: true
            },
            where: {
              isActive: true
            },
            take: 1
          }
        }
      });

      // Get refund policies for all meal types
      const refundPolicies = await this.prisma.restaurantRefundPolicy.findMany({
        where: {
          restaurantId: request.restaurantId,
          mealType: {
            in: mealServices.map(service => service.mealType)
          }
        }
      });

      // Create a map of meal type to refund policy for quick lookup
      const refundPolicyMap = new Map(
        refundPolicies.map(policy => [policy.mealType, policy])
      );

      // Get current time
      const currentTime = getCurrentTime();
      const isoCurrentTime = toISOTime(currentTime);

      // Process each meal service
      const validMealServices = mealServices.map(service => {
        // Create a date object for the service start time on the specified date
        const serviceDate = new Date(request.date);
        const serviceStartTime = new Date(service.serviceStartTime);
        serviceDate.setHours(
          serviceStartTime.getHours(),
          serviceStartTime.getMinutes(),
          0,
          0
        );

        // Calculate cutoff time by subtracting the full refund window
        const refundPolicy = refundPolicyMap.get(service.mealType);
        const refundWindowMinutes = refundPolicy?.fullRefundBeforeMinutes || 0;
        const cutoffTime = new Date(serviceDate);
        cutoffTime.setMinutes(cutoffTime.getMinutes() - refundWindowMinutes);

        // Convert to ISO for comparison
        const isoCutoffTime = toISOTime(cutoffTime);

        // Check if the service is past and if it's within the refund window
        const isPast = isoCurrentTime >= isoCutoffTime;
        const isWithinRefundWindow = !isPast;

        // Determine if this is a platter service
        const enableAsPlatter = service.platters.length > 0;
        const paxPerPlatter = enableAsPlatter ? service.platters[0]?.headCount || null : null;

        return {
          id: service.id,
          mealType: service.mealType,
          serviceStartTime: service.serviceStartTime,
          serviceEndTime: service.serviceEndTime,
          isAvailable: service.isAvailable,
          isPast,
          isWithinRefundWindow,
          refundWindowMinutes,
          isChildEnabled: service.isChildEnabled,
          childNetPrice: service.childNetPrice ? Number(service.childNetPrice.toNumber()) : null,
          childAgeLimit: service.childAgeLimit,
          enableAsPlatter,
          paxPerPlatter
        };
      });

      return {
        success: true,
        data: validMealServices
      };
    } catch (error) {
      console.error('Error getting valid meal services:', error);
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Failed to get valid meal services'
      };
    }
  }
}

/**
 * Helper function to get valid meal services
 */
export async function getValidMealServices(
  prisma: PrismaClient,
  request: GetValidMealServicesRequest
): Promise<GetValidMealServicesResponse> {
  const query = new GetValidMealServicesQuery(prisma);
  return query.execute(request);
} 