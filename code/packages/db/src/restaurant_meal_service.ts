import { MealType, PrismaClient } from '../prisma/generated/prisma';    
import { z } from 'zod';

// Interface for meal service details
export interface MealServiceDetails {
    id: number;
    mealType: MealType;
    serviceStartTime: Date;
    serviceEndTime: Date;
    isAvailable: boolean;
    // Add platter information
    enableAsPlatter?: boolean;
    paxPerPlatter?: number;
    // Add child information
    isChildEnabled?: boolean;
    childNetPrice?: number;
    childAgeLimit?: number;
    // Add schedule information
    availableDays?: string[];
}

// Validation schema for input
const GetMealServicesInput = z.object({
    restaurantId: z.number(),
    date: z.string(), // Expected in YYYY-MM-DD format
});

type GetMealServicesInputType = z.infer<typeof GetMealServicesInput>;

export async function getAvailableMealServices(
    prisma: PrismaClient,
    input: GetMealServicesInputType
): Promise<MealServiceDetails[]> {
    try {
        // Validate input
        GetMealServicesInput.parse(input);

        if (!input.restaurantId) {
            return [];
        }

        // Check for special closures first
        const requestDate = new Date(input.date);
        const restaurant = await prisma.restaurant.findUnique({
            where: { id: input.restaurantId },
            include: {
                specialClosures: true
            }
        });

        if (!restaurant) {
            console.log('Restaurant not found:', input.restaurantId);
            return [];
        }

        // Check if restaurant has special closures for the requested date
        const isSpeciallyClosed = restaurant.specialClosures.some((closure) => {
            const closureStart = new Date(closure.closureStart.getFullYear(), closure.closureStart.getMonth(), closure.closureStart.getDate());
            const closureEnd = new Date(closure.closureEnd.getFullYear(), closure.closureEnd.getMonth(), closure.closureEnd.getDate());
            const checkDate = new Date(requestDate.getFullYear(), requestDate.getMonth(), requestDate.getDate());
            
            const isWithinClosure = checkDate >= closureStart && checkDate <= closureEnd;
            
            console.log('**** MEAL_SERVICES **** SPECIAL_CLOSURE_CHECK ****', {
                requestDate: input.date,
                checkDate: checkDate.toISOString().split('T')[0],
                closureStart: closureStart.toISOString().split('T')[0],
                closureEnd: closureEnd.toISOString().split('T')[0],
                closureType: closure.closureType,
                isWithinClosure
            });
            
            return isWithinClosure;
        });

        if (isSpeciallyClosed) {
            console.log('**** MEAL_SERVICES **** RESTAURANT_CLOSED **** Restaurant is specially closed for date:', input.date);
            return [];
        }

        // Get restaurant meal services with platter, child, and schedule information
        const mealServices = await prisma.restaurantMealService.findMany({
            where: {
                restaurantId: input.restaurantId,
                isAvailable: true,
            },
            select: {
                id: true,
                mealType: true,
                serviceStartTime: true,
                serviceEndTime: true,
                isAvailable: true,
                // Include child information
                isChildEnabled: true,
                childNetPrice: true,
                childAgeLimit: true,
                // Include platter information
                platters: {
                    where: {
                        isActive: true,
                    },
                    select: {
                        headCount: true,
                    },
                    take: 1, // Get only the default platter
                },
                // Include schedule information
                schedule: {
                    select: {
                        availableDays: true,
                    },
                },
            },
        });

        return mealServices.map(service => {
            const defaultPlatter = service.platters[0]; // Get the first (default) platter if it exists
            
            console.log('Processing meal service:', {
                id: service.id,
                mealType: service.mealType,
                hasPlatter: !!defaultPlatter,
                paxPerPlatter: defaultPlatter?.headCount,
                isChildEnabled: service.isChildEnabled,
                childNetPrice: service.childNetPrice,
                childAgeLimit: service.childAgeLimit,
                availableDays: service.schedule?.availableDays,
            });
            
            return {
                id: service.id,
                mealType: service.mealType,
                serviceStartTime: service.serviceStartTime,
                serviceEndTime: service.serviceEndTime, 
                isAvailable: service.isAvailable,
                // Add platter information
                enableAsPlatter: !!defaultPlatter,
                paxPerPlatter: defaultPlatter?.headCount,
                // Add child information
                isChildEnabled: service.isChildEnabled,
                childNetPrice: service.childNetPrice ? Number(service.childNetPrice) : undefined,
                childAgeLimit: service.childAgeLimit,
                // Add schedule information
                availableDays: service.schedule?.availableDays || [],
            };
        });
    } catch (error) {
        console.error('Error fetching meal services:', error);
        return [];
    }
}

// Interface for price calculation result
export interface MealPriceCalculation {
    success: boolean;
    error?: string;
    subTotal?: number;
    serviceCharge?: number;
    taxAmount?: number;
    grandTotal?: number;
    vatPercentage?: number;
    serviceChargePercentage?: number;
}

// Validation schema for price calculation input
const CalculateMealPriceInput = z.object({
    restaurantId: z.number(),
    mealType: z.string(),
    adultCount: z.number().positive(),
    childrenCount: z.number().min(0).optional().default(0),
    isPlatterRequest: z.boolean().optional().default(false),
});

type CalculateMealPriceInputType = z.infer<typeof CalculateMealPriceInput>;

export async function calculateMealPrice(
    prisma: PrismaClient,
    input: CalculateMealPriceInputType
): Promise<MealPriceCalculation> {
    try {
        // Validate input
        CalculateMealPriceInput.parse(input);

        // Convert mealType to uppercase and validate
        const normalizedMealType = input.mealType.toUpperCase() as MealType;
        
        // Get restaurant meal service details with child pricing and platter info
        const mealService = await prisma.restaurantMealService.findFirst({
            where: {
                restaurantId: input.restaurantId,
                mealType: normalizedMealType,
                isAvailable: true,
            },
            select: {
                adultNetPrice: true,
                childNetPrice: true,
                isChildEnabled: true,
                serviceChargePercentage: true,
                taxPercentage: true,
                // Include platter information
                platters: {
                    where: {
                        isActive: true,
                    },
                    select: {
                        headCount: true,
                        adultNetPrice: true,
                    },
                    take: 1, // Get only the default platter
                },
            }
        });

        if (!mealService) {
            return {
                success: false,
                error: 'Meal service not available'
            };
        }

        let subTotal: number;
        const defaultPlatter = mealService.platters[0];
        const isPlatterService = !!defaultPlatter;

        if (isPlatterService && input.isPlatterRequest && defaultPlatter) {
            // For platter services: adultCount represents number of platters
            const pricePerPlatter = Number(defaultPlatter.adultNetPrice);
            subTotal = pricePerPlatter * input.adultCount;
        } else {
            // For regular services: calculate adult + child pricing
            const adultPrice = Number(mealService.adultNetPrice) * input.adultCount;
            let childPrice = 0;

            // Add child pricing if enabled and children count > 0
            if (mealService.isChildEnabled && input.childrenCount && input.childrenCount > 0) {
                childPrice = Number(mealService.childNetPrice || 0) * input.childrenCount;
            }

            subTotal = adultPrice + childPrice;
        }

        const serviceCharge = (subTotal * Number(mealService.serviceChargePercentage)) / 100;
        const taxAmount = (subTotal * Number(mealService.taxPercentage)) / 100;
        const grandTotal = subTotal + serviceCharge + taxAmount;

        return {
            success: true,
            subTotal: Number(subTotal.toFixed(2)),
            serviceCharge: Number(serviceCharge.toFixed(2)),
            taxAmount: Number(taxAmount.toFixed(2)),
            grandTotal: Number(grandTotal.toFixed(2)),
            vatPercentage: Number(mealService.taxPercentage),
            serviceChargePercentage: Number(mealService.serviceChargePercentage)
        };
    } catch (error) {
        console.error('Failed to calculate meal price:', error);
        return {
            success: false,
            error: 'Failed to calculate meal price'
        };
    }
}

// Interface for meal service pricing details
export interface MealServicePricingDetails {
    adultNetPrice: number;
    childNetPrice: number | null;
    isChildEnabled: boolean;
    serviceChargePercentage: number;
    taxPercentage: number;
    platters: {
        headCount: number;
        adultNetPrice: number;
    }[];
}

// Validation schema for price calculation input
const GetMealServicePricingInput = z.object({
    restaurantId: z.number(),
    mealType: z.string(),
});

type GetMealServicePricingInputType = z.infer<typeof GetMealServicePricingInput>;

export async function getMealServicePricingDetails(
    prisma: PrismaClient,
    input: GetMealServicePricingInputType
): Promise<MealServicePricingDetails | null> {
    try {
        // Validate input
        GetMealServicePricingInput.parse(input);

        // Convert mealType to uppercase and validate
        const normalizedMealType = input.mealType.toUpperCase() as MealType;
        
        // Get restaurant meal service details with platter and child information
        const mealService = await prisma.restaurantMealService.findFirst({
            where: {
                restaurantId: input.restaurantId,
                mealType: normalizedMealType,
                isAvailable: true,
            },
            select: {
                adultNetPrice: true,
                childNetPrice: true,
                isChildEnabled: true,
                serviceChargePercentage: true,
                taxPercentage: true,
                // Include platter information
                platters: {
                    where: {
                        isActive: true,
                    },
                    select: {
                        headCount: true,
                        adultNetPrice: true,
                    },
                    take: 1, // Get only the default platter
                },
            }
        });

        if (!mealService) {
            return null;
        }

        return {
            adultNetPrice: Number(mealService.adultNetPrice),
            childNetPrice: mealService.childNetPrice ? Number(mealService.childNetPrice) : null,
            isChildEnabled: mealService.isChildEnabled,
            serviceChargePercentage: Number(mealService.serviceChargePercentage),
            taxPercentage: Number(mealService.taxPercentage),
            platters: mealService.platters.map(platter => ({
                headCount: platter.headCount,
                adultNetPrice: Number(platter.adultNetPrice),
            })),
        };
    } catch (error) {
        console.error('Error fetching meal service pricing details:', error);
        return null;
    }
} 