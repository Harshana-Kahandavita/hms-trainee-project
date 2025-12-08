/// <reference types="node" />
import { PrismaClient, MealType, DayOfWeek, ReservationRequestStatus, DiscountType, RefundType, ModificationType, ModificationStatus, PaymentStatus, PaymentChannel, RefundReason, RefundStatus, CampaignType, RequestCreatorType, PaymentLinkStatus, ReservationSupportType, TableSlotStatus, FeeType, ReservationType } from './generated/prisma'
import { Decimal } from './generated/prisma/runtime/library';
import { addHours, addDays, setHours, setMinutes, startOfMonth } from 'date-fns';
import * as fs from 'fs';
import * as path from 'path';
import { calculateRestaurantReviewStats, updateRestaurantReviewStats } from '../src/restaurant_review_stats';

const prisma = new PrismaClient()

// Timezone configuration for Asia/Colombo (UTC+5:30)
const TIMEZONE_OFFSET_HOURS = 5.5;
const TIMEZONE_OFFSET_MINUTES = TIMEZONE_OFFSET_HOURS * 60;

/**
 * Creates a UTC Date object from local date and time (Asia/Colombo)
 * @param date - Local date
 * @param localHour - Hour in local time (0-23)
 * @param localMinute - Minute in local time (0-59)
 * @returns UTC Date object
 */
function createUTCDateTimeFromLocal(date: Date, localHour: number, localMinute: number): Date {
  const localTotalMinutes = localHour * 60 + localMinute;
  const utcTotalMinutes = localTotalMinutes - TIMEZONE_OFFSET_MINUTES;
  
  let utcHour = Math.floor(utcTotalMinutes / 60);
  let utcMinute = utcTotalMinutes % 60;
  
  // Handle day boundary crossing
  let utcDate = new Date(date);
  
  if (utcHour < 0) {
    utcHour += 24;
    utcDate.setDate(utcDate.getDate() - 1);
  } else if (utcHour >= 24) {
    utcHour -= 24;
    utcDate.setDate(utcDate.getDate() + 1);
  }
  
  if (utcMinute < 0) {
    utcMinute += 60;
    utcHour -= 1;
    if (utcHour < 0) {
      utcHour += 24;
      utcDate.setDate(utcDate.getDate() - 1);
    }
  }
  
  utcDate.setUTCHours(utcHour, utcMinute, 0, 0);
  return utcDate;
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function generateReservationNumber(restaurantId: number, index: number): string {
  const timestamp = Date.now().toString(36);
  const uuid = generateUUID().slice(0, 8);
  const restaurantPrefix = restaurantId.toString().padStart(3, '0');
  const indexSuffix = index.toString().padStart(4, '0');

  return `RH-${restaurantPrefix}-${timestamp}-${uuid}-${indexSuffix}`;
}

// Helper functions - move these to the top of the file, before main()
function getRandomReview(restaurantName: string): string {
    const reviews = [
        `Exceptional dining experience at ${restaurantName}! The food was outstanding and the service was impeccable.`,
        `Really enjoyed our evening at ${restaurantName}. Great ambiance and delicious food.`,
        `${restaurantName} never disappoints! The flavors were amazing and the staff was very attentive.`,
        `Had a wonderful celebration at ${restaurantName}. Will definitely be coming back!`,
        `The authentic flavors at ${restaurantName} were incredible. A must-visit restaurant in Colombo.`
    ]
    return reviews[Math.floor(Math.random() * reviews.length)]
}

function getRandomResponse(): string {
    const responses = [
        "Thank you for your wonderful review! We're delighted that you enjoyed your dining experience with us.",
        "We appreciate your kind words and feedback. Looking forward to serving you again soon!",
        "Thank you for choosing to dine with us. We're glad we could make your experience memorable.",
        "Your feedback means a lot to us. Thank you for taking the time to share your experience.",
        "We're thrilled to hear you enjoyed your meal. Thank you for your support!"
    ];
    return responses[Math.floor(Math.random() * responses.length)];
}

async function importDiscoveryRestaurants(prisma: PrismaClient) {
  // Read restaurant.json data using fs
  const restaurantJsonPath = path.join(__dirname, 'restaurant.json');

  if (!fs.existsSync(restaurantJsonPath)) {
    console.error(`Restaurant data file not found at ${restaurantJsonPath}`);
    return;
  }

  const restaurantJson = JSON.parse(fs.readFileSync(restaurantJsonPath, 'utf-8'));
  const colomboLocation = await prisma.location.findFirst({ where: { city: 'Colombo' } });

  if (!colomboLocation) {
    console.error('Colombo location not found in database');
    return;
  }

  console.log('Importing discovery restaurants...');

  for (const extRestaurant of restaurantJson) {
    try {
      // Create business for this restaurant
      const business = await prisma.business.create({
        data: {
          name: extRestaurant.name,
          address: extRestaurant.address,
          phone: '+94110000000', // Default phone
          email: `info@${extRestaurant.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
          taxId: `TAX${Math.floor(100000 + Math.random() * 900000)}`,
          registrationNumber: `REG${Math.floor(100000 + Math.random() * 900000)}`
        }
      });

      // Create restaurant
      await prisma.restaurant.create({
        data: {
          businessId: business.id,
          name: extRestaurant.name,
          locationId: colomboLocation.id,
          address: extRestaurant.address,
          phone: '+94110000000', // Default phone
          description: `Discovered restaurant with ${extRestaurant.rating} star rating`,
          capacity: 100,
          onlineQuota: 80,
          advancePaymentPercentage: 35,
          metadata: {
            discoveryData: {
              placeId: extRestaurant.place_id,
              rating: extRestaurant.rating,
              priceLevel: extRestaurant.price_level,
              userRatingsTotal: extRestaurant.user_ratings_total
            }
          }
        }
      });

      console.log(`Imported restaurant: ${extRestaurant.name}`);
    } catch (error) {
      console.error(`Failed to import restaurant ${extRestaurant.name}:`, error);
    }
  }

  console.log('Finished importing discovery restaurants');
}

async function main() {
    // Clear existing data
    await prisma.$transaction([
        // New table-reservation entities
        prisma.reservationTableHold.deleteMany(),
        prisma.reservationTableAssignment.deleteMany(),
        prisma.reservationRequestTableDetails.deleteMany(),
        prisma.tableAvailabilitySlot.deleteMany(),
        prisma.restaurantTable.deleteMany(),
        prisma.restaurantSection.deleteMany(),
        prisma.tableSlotGenerationConfig.deleteMany(),
        prisma.tableReservationUtilsConfiguration.deleteMany(),
        prisma.reservationReviewResponse.deleteMany(),
        prisma.reservationReviewPhoto.deleteMany(),
        prisma.reservationReview.deleteMany(),
        prisma.reservationRequestPayment.deleteMany(),
        prisma.reservationRequestStatusHistory.deleteMany(),
        prisma.reservationPayment.deleteMany(),
        prisma.reservationFinancialData.deleteMany(),
        prisma.reservation.deleteMany(),
        prisma.reservationRequest.deleteMany(),
        prisma.restaurantServiceArea.deleteMany(),
        prisma.promoCodeUsage.deleteMany(),
        prisma.promoCodeRestaurantMapping.deleteMany(),
        prisma.promoCodeCustomerMapping.deleteMany(),
        prisma.promoCode.deleteMany(),
        prisma.restaurantSpecialClosure.deleteMany(),
        prisma.restaurantCapacity.deleteMany(),
        prisma.cleanupLog.deleteMany(),
        prisma.restaurantRefundPolicy.deleteMany(),
        prisma.restaurantPlatter.deleteMany(),
        prisma.restaurantMealServiceSchedule.deleteMany(),
        prisma.restaurantMealService.deleteMany(),
        prisma.restaurantOperatingHours.deleteMany(),
        prisma.restaurantCuisine.deleteMany(),
        prisma.restaurantImage.deleteMany(),
        prisma.restaurant.deleteMany(),
        prisma.business.deleteMany(),
        prisma.customer.deleteMany(),
        prisma.cuisine.deleteMany(),
        prisma.city.deleteMany(),
        prisma.location.deleteMany(),
    ])

    // Create Locations
    const colomboLocation = await prisma.location.create({
        data: {
            city: 'Colombo',
            state: 'Western Province',
            postalCode: '00100'
        }
    })

    // Create Cities
    const cities = await prisma.city.createMany({
        data: [
            {
                cityName: 'Colombo',
                stateName: 'Western Province',
                countryName: 'Sri Lanka',
                latitude: 6.9271,
                longitude: 79.8612,
                postalCodePattern: '00100',
                isActive: true
            },
            {
                cityName: 'Dehiwala',
                stateName: 'Western Province',
                countryName: 'Sri Lanka',
                latitude: 6.8561,
                longitude: 79.8750,
                postalCodePattern: '10350',
                isActive: true
            },
            {
                cityName: 'Mount Lavinia',
                stateName: 'Western Province',
                countryName: 'Sri Lanka',
                latitude: 6.8283,
                longitude: 79.8633,
                postalCodePattern: '10370',
                isActive: true
            },
            {
                cityName: 'Nugegoda',
                stateName: 'Western Province',
                countryName: 'Sri Lanka',
                latitude: 6.8649,
                longitude: 79.8997,
                postalCodePattern: '10250',
                isActive: true
            },
            {
                cityName: 'Rajagiriya',
                stateName: 'Western Province',
                countryName: 'Sri Lanka',
                latitude: 6.9089,
                longitude: 79.8933,
                postalCodePattern: '10100',
                isActive: true
            },
            {
                cityName: 'Kandy',
                stateName: 'Central Province',
                countryName: 'Sri Lanka',
                latitude: 7.2906,
                longitude: 80.6337,
                postalCodePattern: '20000',
                isActive: true
            }
        ]
    })

    // Fetch cities once early in the script to use throughout
    const cities_db = await prisma.city.findMany()

    // Create Cuisines
    const cuisines = await prisma.cuisine.createMany({
        data: [
            { cuisineName: 'Sri Lankan' },
            { cuisineName: 'Chinese' },
            { cuisineName: 'Indian' },
            { cuisineName: 'Italian' },
            { cuisineName: 'Seafood' },
            { cuisineName: 'Japanese' },
            { cuisineName: 'International' },
        ]
    })

    // Create Business
    const business = await prisma.business.create({
        data: {
            name: 'Colombo Fine Dining Group',
            address: '123 Galle Road, Colombo 03',
            phone: '+94112345678',
            email: 'info@colombofinedining.com',
            website: 'www.colombofinedining.com',
            taxId: 'TAX123456',
            registrationNumber: 'REG789012'
        }
    })

    // Create Restaurants with specific ReservationSupportType
    const ministryOfCrab = await prisma.restaurant.create({
        data: {
            businessId: business.id,
            name: 'Ministry of Crab',
            locationId: colomboLocation.id,
            address: 'Old Dutch Hospital, 04 Hospital Street, Colombo 00100',
            phone: '+94112342722',
            description: 'World-renowned seafood restaurant specializing in Sri Lankan crab dishes',
            capacity: 60,
            onlineQuota: 40,
            advancePaymentPercentage: 35,
            reservationSupport: ReservationSupportType.BOTH // Enable both buffet and table reservations
        }
    })

    const kaemasutra = await prisma.restaurant.create({
        data: {
            businessId: business.id,
            name: 'Kaema Sutra',
            locationId: colomboLocation.id,
            address: 'Shangri-La Hotel, 1 Galle Face, Colombo 00200',
            phone: '+94117888288',
            description: 'Modern Sri Lankan cuisine in a contemporary setting',
            capacity: 80,
            onlineQuota: 60,
            advancePaymentPercentage: 40,
            reservationSupport: ReservationSupportType.BUFFET_ONLY // Buffet only
        }
    })

    const nihonbashi = await prisma.restaurant.create({
        data: {
            businessId: business.id,
            name: 'Nihonbashi',
            locationId: colomboLocation.id,
            address: '11 Galle Face Terrace, Colombo 00300',
            phone: '+94112323847',
            description: 'Authentic Japanese cuisine in the heart of Colombo',
            capacity: 70,
            onlineQuota: 50,
            advancePaymentPercentage: 30,
            reservationSupport: ReservationSupportType.BUFFET_ONLY // Buffet only
        }
    })

    const rajaBojun = await prisma.restaurant.create({
        data: {
            businessId: business.id,
            name: 'Raja Bojun',
            locationId: colomboLocation.id,
            address: '85 Galle Road, Colombo 00300',
            phone: '+94112556556',
            description: 'Traditional Sri Lankan buffet restaurant',
            capacity: 100,
            onlineQuota: 80,
            advancePaymentPercentage: 25,
            reservationSupport: ReservationSupportType.BUFFET_ONLY // Buffet only
        }
    })

    // Create new restaurants with table reservation support
    const tableOnlyRestaurant = await prisma.restaurant.create({
        data: {
            businessId: business.id,
            name: 'TableTime Bistro',
            locationId: colomboLocation.id,
            address: '22 Flower Road, Colombo 00700',
            phone: '+94117654321',
            description: 'Casual bistro with table-only reservation flow',
            capacity: 40,
            onlineQuota: 40,
            advancePaymentPercentage: 0,
            reservationSupport: ReservationSupportType.TABLE_ONLY // Table only
        }
    })

    const bothSupportRestaurant = await prisma.restaurant.create({
        data: {
            businessId: business.id,
            name: 'Fusion Dine & Table',
            locationId: colomboLocation.id,
            address: '55 Marine Drive, Colombo 00400',
            phone: '+94113337777',
            description: 'Fine dining with buffet and table reservations',
            capacity: 120,
            onlineQuota: 90,
            advancePaymentPercentage: 30,
            reservationSupport: ReservationSupportType.BUFFET_ONLY // Changed to buffet only
        }
    })

    const policyFeeRestaurant = await prisma.restaurant.create({
        data: {
            businessId: business.id,
            name: 'Celebration Table Lounge',
            locationId: colomboLocation.id,
            address: '18 Independence Avenue, Colombo 00700',
            phone: '+94117650000',
            description: 'Boutique lounge specializing in celebratory table experiences with curated policy add-ons',
            capacity: 48,
            onlineQuota: 40,
            advancePaymentPercentage: 0,
            reservationSupport: ReservationSupportType.TABLE_ONLY // Table reservations with policy fees
        }
    })

    const kingsburyColombo = await prisma.restaurant.create({
        data: {
            businessId: business.id,
            name: 'The Kingsbury Colombo',
            locationId: colomboLocation.id,
            address: '48 Janadhipathi Mawatha, Colombo',
            phone: '+94110763523',
            description: 'The Kingsbury Colombo - A great restaurant in Sri Lanka with international cuisine and luxury dining experience',
            capacity: 150,
            onlineQuota: 120,
            advancePaymentPercentage: 35,
            reservationSupport: ReservationSupportType.BUFFET_ONLY, // Regular buffet reservation merchant
            metadata: {
                discoveryData: {
                    placeId: 'ChIJ-1dhmiVZ4joRGUSviLLrDIw',
                    rating: 4.5,
                    userRatingsTotal: 19662
                }
            }
        }
    })

    // Create Restaurant Service Areas
    const restaurants = [ministryOfCrab, kaemasutra, nihonbashi, rajaBojun, kingsburyColombo]

    const tableReservationRestaurants = [ministryOfCrab, tableOnlyRestaurant, bothSupportRestaurant, policyFeeRestaurant]

    // Reservation business policies for table reservations
    await prisma.reservationBusinessPolicy.create({
        data: {
            restaurantId: tableOnlyRestaurant.id,
            name: 'SUNDAY_DEPOSIT',
            title: 'Sunday advance payment required',
            content: 'A 30% advance payment is required for Sunday reservations to secure your table.',
            isRefundAllowed: true,
            requiresPayment: true,
            paymentType: FeeType.PERCENTAGE,
            paymentValue: new Decimal(30),
            paymentHandledByOptions: false,
            applicableDays: [DayOfWeek.SUNDAY],
            applicableReservationTypes: [ReservationType.TABLE_ONLY],
            priority: 10,
            createdBy: 'SYSTEM',
            updatedBy: 'SYSTEM'
        }
    })

    // Create refund policies for Sri Lankan restaurants
    const sriLankanRestaurantPolicies = restaurants.flatMap(restaurant => [
        {
            restaurantId: restaurant.id,
            mealType: MealType.BREAKFAST,
            allowedRefundTypes: [RefundType.FULL, RefundType.PARTIAL],
            fullRefundBeforeMinutes: 120, // 2 hours before service
            partialRefundBeforeMinutes: 60, // 1 hour before service
            partialRefundPercentage: 50,
            isActive: true,
            createdBy: 'SYSTEM',
            updatedBy: 'SYSTEM'
        },
        {
            restaurantId: restaurant.id,
            mealType: MealType.LUNCH,
            allowedRefundTypes: [RefundType.FULL, RefundType.PARTIAL],
            fullRefundBeforeMinutes: 180, // 3 hours before service
            partialRefundBeforeMinutes: 90, // 1.5 hours before service
            partialRefundPercentage: 50,
            isActive: true,
            createdBy: 'SYSTEM',
            updatedBy: 'SYSTEM'
        },
        {
            restaurantId: restaurant.id,
            mealType: MealType.DINNER,
            allowedRefundTypes: [RefundType.FULL, RefundType.PARTIAL],
            fullRefundBeforeMinutes: 240, // 4 hours before service
            partialRefundBeforeMinutes: 120, // 2 hours before service
            partialRefundPercentage: 50,
            isActive: true,
            createdBy: 'SYSTEM',
            updatedBy: 'SYSTEM'
        }
    ]);

    // TableTime Bistro (restaurantId: tableOnlyRestaurant.id) refund policies
    const tableTimeBistroPolicies = [
        {
            restaurantId: tableOnlyRestaurant.id,
            mealType: MealType.LUNCH,
            allowedRefundTypes: [RefundType.FULL, RefundType.PARTIAL],
            fullRefundBeforeMinutes: 1440, // 24 hours before
            partialRefundBeforeMinutes: 720, // 12 hours before
            partialRefundPercentage: 50,
            isActive: true,
            createdBy: 'SYSTEM',
            updatedBy: 'SYSTEM'
        },
        {
            restaurantId: tableOnlyRestaurant.id,
            mealType: MealType.DINNER,
            allowedRefundTypes: [RefundType.FULL, RefundType.PARTIAL],
            fullRefundBeforeMinutes: 2880, // 48 hours before
            partialRefundBeforeMinutes: 1440, // 24 hours before
            partialRefundPercentage: 40,
            isActive: true,
            createdBy: 'SYSTEM',
            updatedBy: 'SYSTEM'
        }
    ];

    // We will create service areas after both restaurant groups are defined
    // to ensure one-to-one relationship with cities

    // Create all refund policies
    await prisma.restaurantRefundPolicy.createMany({
        data: [...sriLankanRestaurantPolicies, ...tableTimeBistroPolicies],
        skipDuplicates: true,
    });

    // Create specific refund policy for Ministry of Crab Special meal type
    await prisma.restaurantRefundPolicy.create({
        data: {
            restaurantId: ministryOfCrab.id,
            mealType: MealType.SPECIAL,
            allowedRefundTypes: [RefundType.FULL, RefundType.PARTIAL],
            fullRefundBeforeMinutes: 360, // 6 hours before service (more generous for special meals)
            partialRefundBeforeMinutes: 180, // 3 hours before service
            partialRefundPercentage: 75, // Higher partial refund percentage for special meals
            isActive: true,
            createdBy: 'SYSTEM',
            updatedBy: 'SYSTEM'
        }
    });

    // Create Customers
    const customers = await prisma.customer.createMany({
        data: [
            {
                firstName: 'Ashan',
                lastName: 'Perera',
                phone: '+94771234567'
            },
            {
                firstName: 'Malini',
                lastName: 'Silva',
                phone: '+94772345678'
            },
            {
                firstName: 'Raj',
                lastName: 'Kumar',
                email: 'raj.kumar@email.com',
                phone: '+94773456789'
            },
            {
                firstName: 'Sarah',
                lastName: 'Fernando',
                email: 'sarah.fernando@email.com',
                phone: '+94774567890'
            }
        ]
    })

    // Create Promo Codes
    const publicPromoCode = await prisma.promoCode.create({
        data: {
            code: 'WELCOME15',
            description: 'Welcome 15% discount for all customers',
            campaignType: CampaignType.PLATFORM,
            discountType: DiscountType.PERCENTAGE_OFF,
            discountValue: new Decimal(15),
            minimumOrderValue: new Decimal(20),
            maximumDiscountAmount: new Decimal(1000),
            usageLimitPerUser: 10,
            usageLimitTotal: 100,
            partySizeLimit: 20,
            partySizeLimitPerUser: 50,
            partySizeUsed: 0,
            buffetTypes: [MealType.LUNCH, MealType.DINNER],
            isActive: true,
            isDeleted: false,
            firstOrderOnly: false,
            validFrom: new Date('2023-01-01'),
            validUntil: new Date('2025-12-31'),
            createdBy: 'SYSTEM',
            updatedBy: 'SYSTEM',
            // Map to all restaurants
            restaurantMappings: {
                create: restaurants.map(restaurant => ({
                    restaurantId: restaurant.id,
                    isActive: true
                }))
            }
        }
    });

    const publicPromoCode2 = await prisma.promoCode.create({
        data: {
            code: 'WEL15',
            description: 'Welcome 15% discount for all customers',
            campaignType: CampaignType.PLATFORM,
            discountType: DiscountType.PERCENTAGE_OFF,
            discountValue: new Decimal(15),
            minimumOrderValue: new Decimal(20),
            maximumDiscountAmount: new Decimal(1000),
            usageLimitPerUser: 5,
            usageLimitTotal: 10     ,
            partySizeLimit: 10,
            partySizeLimitPerUser: 10,
            partySizeUsed: 0,
            buffetTypes: [MealType.LUNCH, MealType.DINNER, MealType.BREAKFAST],
            isActive: true,
            isDeleted: false,
            firstOrderOnly: true,
            validFrom: new Date('2023-01-01'),
            validUntil: new Date('2025-12-31'),
            createdBy: 'SYSTEM',
            updatedBy: 'SYSTEM',
            // Map to all restaurants
            restaurantMappings: {
                create: restaurants.map(restaurant => ({
                    restaurantId: restaurant.id,
                    isActive: true
                }))
            }
        }
    });


    const restaurantSpecificPromoCode = await prisma.promoCode.create({
        data: {
            code: 'CRAB100',
            description: 'LKR 100 off at Ministry of Crab',
            campaignType: CampaignType.MERCHANT,
            discountType: DiscountType.FIXED_AMOUNT_OFF,
            discountValue: new Decimal(100),
            minimumOrderValue: new Decimal(15),
            maximumDiscountAmount: new Decimal(100),
            usageLimitPerUser: 2,
            usageLimitTotal: 50,
            partySizeLimit: 8,
            partySizeLimitPerUser: 4,
            partySizeUsed: 0,
            buffetTypes: [MealType.DINNER],
            isActive: true,
            isDeleted: false,
            firstOrderOnly: false,
            validFrom: new Date('2023-01-01'),
            validUntil: new Date('2025-12-31'),
            createdBy: 'SYSTEM',
            updatedBy: 'SYSTEM',
            // Map to specific restaurant
            restaurantMappings: {
                create: {
                    restaurantId: ministryOfCrab.id,
                    isActive: true
                }
            }
        }
    });

    // Get customers for targeted promo code
    const vipCustomers = await prisma.customer.findMany({ take: 2 });

    // Create customer-specific promo code
    const customerSpecificPromoCode = await prisma.promoCode.create({
        data: {
            code: 'VIP25',
            description: '25% off for VIP customers only',
            campaignType: CampaignType.PLATFORM,
            discountType: DiscountType.PERCENTAGE_OFF,
            discountValue: new Decimal(25),
            minimumOrderValue: new Decimal(10),
            maximumDiscountAmount: new Decimal(2000),
            usageLimitPerUser: 3,
            usageLimitTotal: 20,
            partySizeLimit: 12,
            partySizeLimitPerUser: 6,
            partySizeUsed: 0,
            buffetTypes: [MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER],
            isActive: true,
            isDeleted: false,
            firstOrderOnly: false,
            validFrom: new Date('2023-01-01'),
            validUntil: new Date('2025-12-31'),
            createdBy: 'SYSTEM',
            updatedBy: 'SYSTEM',
            // Map to all restaurants
            restaurantMappings: {
                create: restaurants.map(restaurant => ({
                    restaurantId: restaurant.id,
                    isActive: true
                }))
            },
            // Map to specific customers
            customerMappings: {
                create: vipCustomers.map(customer => ({
                    customerId: customer.id,
                    isActive: true
                }))
            }
        }
    });

    console.log(`Created 3 promo codes: public (${publicPromoCode.code}), restaurant-specific (${restaurantSpecificPromoCode.code}), and customer-specific (${customerSpecificPromoCode.code})`);

    // Generate reservations for Oct 2024 - Jan 2025 (buffet flow)
    const customers_db = await prisma.customer.findMany()
    const mealTypes = [MealType.LUNCH, MealType.DINNER]
    const reservationStatuses = ['CONFIRMED', 'COMPLETED', 'CANCELLED']

    for (const restaurant of restaurants) {
        for (let month = 9; month < 12; month++) { // 0-based months (9 = October)
            const daysInMonth = new Date(2025, month + 1, 0).getDate()

            for (let day = 1; day <= daysInMonth; day++) {
                for (const mealType of mealTypes) {
                    const numberOfReservations = Math.floor(Math.random() * 5) + 1 // 1-5 reservations per meal type per day

                    for (let i = 0; i < numberOfReservations; i++) {
                        const customer = customers_db[Math.floor(Math.random() * customers_db.length)]
                        const status = reservationStatuses[Math.floor(Math.random() * reservationStatuses.length)]
                        const reservationTime = mealType === MealType.LUNCH ? '13:00:00' : '19:00:00'

                        const request = await prisma.reservationRequest.create({
                            data: {
                                restaurantId: restaurant.id,
                                customerId: customer.id,
                                requestName: `${customer.firstName} ${customer.lastName}`,
                                contactPhone: customer.phone,
                                requestedDate: new Date(2025, month, day),
                                requestedTime: new Date(`2025-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${reservationTime}`),
                                adultCount: Math.floor(Math.random() * 4) + 1,
                                childCount: Math.floor(Math.random() * 3),
                                mealType: mealType,
                                estimatedTotalAmount: 15000.00,
                                estimatedServiceCharge: 1500.00,
                                estimatedTaxAmount: 750.00,
                                status: ReservationRequestStatus.PENDING,
                                createdBy: RequestCreatorType.SYSTEM
                            }
                        })

                        const reservation = await prisma.reservation.create({
                            data: {
                                reservationNumber: generateReservationNumber(restaurant.id, i),
                                restaurantId: restaurant.id,
                                customerId: customer.id,
                                requestId: request.id,
                                reservationName: `${customer.firstName} ${customer.lastName}`,
                                contactPhone: customer.phone,
                                reservationDate: new Date(2025, month, day),
                                reservationTime: new Date(`2025-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${reservationTime}`),
                                adultCount: Math.floor(Math.random() * 4) + 1,
                                childCount: Math.floor(Math.random() * 3),
                                mealType: mealType,
                                totalAmount: 15000.00,
                                serviceCharge: 1500.00,
                                taxAmount: 750.00,
                                advancePaymentAmount: restaurant.advancePaymentPercentage > 0 ? (15000.00 * restaurant.advancePaymentPercentage / 100) : null,
                                remainingPaymentAmount: restaurant.advancePaymentPercentage > 0 ? (15000.00 * (1 - restaurant.advancePaymentPercentage / 100)) : null,
                                status: status,
                                createdBy: RequestCreatorType.SYSTEM
                            }
                        })

                        // Create financial data for the reservation
                        const totalBeforeDiscount = 15000.00;
                        const taxAmount = 750.00;
                        const serviceCharge = 1500.00;
                        const netBuffetPrice = totalBeforeDiscount - taxAmount - serviceCharge;
                        const discount = Math.random() > 0.7 ? 1000.00 : 0; // 30% chance of having a discount
                        const totalAfterDiscount = totalBeforeDiscount - discount;
                        const advancePayment = Math.floor(totalAfterDiscount * 0.3 * 100) / 100; // 30% advance payment
                        const balanceDue = totalAfterDiscount - advancePayment;
                        const isPaid = false;

                        await prisma.reservationFinancialData.create({
                            data: {
                                reservationId: reservation.id,
                                netBuffetPrice,
                                taxAmount,
                                serviceCharge,
                                totalBeforeDiscount,
                                discount,
                                totalAfterDiscount,
                                advancePayment,
                                balanceDue,
                                isPaid
                            }
                        });

                        // Create reviews for completed reservations
                        if (status === 'COMPLETED' && Math.random() > 0.5) {
                            const review = await prisma.reservationReview.create({
                                data: {
                                    reservationId: reservation.id,
                                    customerId: customer.id,
                                    mealRating: Math.floor(Math.random() * 2) + 4, // 4-5 rating
                                    serviceRating: Math.floor(Math.random() * 2) + 4,
                                    platformRating: Math.floor(Math.random() * 2) + 4,
                                    reviewText: getRandomReview(restaurant.name),
                                    isVerified: true,
                                    isPublished: true,
                                    diningDate: new Date(2025, month, day),
                                    moderationStatus: 'APPROVED',
                                    moderatedBy: 'SYSTEM'
                                }
                            })

                            // Add review response
                            if (Math.random() > 0.7) {
                                await prisma.reservationReviewResponse.create({
                                    data: {
                                        reviewId: review.id,
                                        responseText: getRandomResponse(),
                                        respondedBy: 'Restaurant Manager',
                                        isPublished: true
                                    }
                                })
                            }
                        }
                    }
                }
            }
        }
    }

    const restaurantIds = restaurants.map(restaurant => restaurant.id);
    const currentDate = new Date();

    // Set start date to 45 days ago
    const capacityStartDate = new Date();
    capacityStartDate.setDate(capacityStartDate.getDate() - 45);
    capacityStartDate.setHours(0, 0, 0, 0); // Start of day

    // Set end date to 45 days in the future
    const capacityEndDate = new Date();
    capacityEndDate.setDate(capacityEndDate.getDate() + 45);
    capacityEndDate.setHours(23, 59, 59, 999); // End of day

    const operatingHours = [
        // Operating hours for each restaurant
        ...restaurantIds.flatMap(restaurantId =>
            Object.values(DayOfWeek).map(dayOfWeek => ({
                restaurantId,
                dayOfWeek,
                isOpen: true,
                capacity: 100,
                onlineQuota: 80,
                openingTime: new Date('2024-01-01T00:00:00.000Z'),
                closingTime: new Date('2024-01-01T23:00:00.000Z'),
            }))
        )
    ];

    const mealServices = [
        // Meal services for each restaurant
        ...restaurantIds.flatMap(restaurantId => [
            {
                restaurantId,
                mealType: MealType.BREAKFAST,
                isAvailable: true,
                isChildEnabled: true,
                adultGrossPrice: 29.99,
                childGrossPrice: 14.99,
                adultNetPrice: calculateNetPrice(29.99, 10.00, 7.00),
                childNetPrice: calculateNetPrice(14.99, 10.00, 7.00),
                childAgeLimit: 12,
                serviceChargePercentage: 10.00,
                taxPercentage: 7.00,
                priceUpdatedAt: new Date(),
                serviceStartTime: new Date('2025-01-01T06:30:00.000Z'),
                serviceEndTime: new Date('2025-01-01T10:30:00.000Z'),
            },
            {
                restaurantId,
                mealType: MealType.LUNCH,
                isAvailable: true,
                isChildEnabled: true,
                adultGrossPrice: 39.99,
                childGrossPrice: 19.99,
                adultNetPrice: calculateNetPrice(39.99, 10.00, 7.00),
                childNetPrice: calculateNetPrice(19.99, 10.00, 7.00),
                childAgeLimit: 12,
                serviceChargePercentage: 10.00,
                taxPercentage: 7.00,
                priceUpdatedAt: new Date(),
                serviceStartTime: new Date('2025-01-01T11:30:00.000Z'),
                serviceEndTime: new Date('2025-01-01T15:30:00.000Z'),
            },
            {
                restaurantId,
                mealType: MealType.DINNER,
                isAvailable: true,
                isChildEnabled: true,
                adultGrossPrice: 49.99,
                childGrossPrice: 24.99,
                adultNetPrice: calculateNetPrice(49.99, 10.00, 7.00),
                childNetPrice: calculateNetPrice(24.99, 10.00, 7.00),
                childAgeLimit: 12,
                serviceChargePercentage: 10.00,
                taxPercentage: 7.00,
                priceUpdatedAt: new Date(),
                serviceStartTime: new Date('2025-01-01T17:30:00.000Z'),
                serviceEndTime: new Date('2025-01-01T22:00:00.000Z'),
            },
            {
                restaurantId,
                mealType: MealType.HIGH_TEA,
                isAvailable: true,
                isChildEnabled: false,
                adultGrossPrice: 4000.99,
                childGrossPrice: 2000.99,
                adultNetPrice: calculateNetPrice(4000.99, 10.00, 7.00),
                childNetPrice: calculateNetPrice(2000.99, 10.00, 7.00),
                childAgeLimit: 12,
                serviceChargePercentage: 10.00,
                taxPercentage: 7.00,
                priceUpdatedAt: new Date(),
                serviceStartTime: new Date('2025-01-01T15:00:00.000Z'),
                serviceEndTime: new Date('2025-01-01T17:00:00.000Z'),
            },
            {
                restaurantId,
                mealType: MealType.SPECIAL,
                isAvailable: true,
                isChildEnabled: false,
                adultGrossPrice: 34.99,
                childGrossPrice: 17.99,
                adultNetPrice: calculateNetPrice(34.99, 10.00, 7.00),
                childNetPrice: calculateNetPrice(17.99, 10.00, 7.00),
                childAgeLimit: 12,
                serviceChargePercentage: 10.00,
                taxPercentage: 7.00,
                priceUpdatedAt: new Date(),
                serviceStartTime: new Date('2025-01-01T15:00:00.000Z'),
                serviceEndTime: new Date('2025-01-01T17:00:00.000Z'),
            },
        ])
    ];

// Helper function to calculate net price from gross price
    function calculateNetPrice(grossPrice: number, serviceChargePercentage: number, taxPercentage: number): number {
        const serviceChargeAmount = grossPrice * (serviceChargePercentage / 100);
        const taxAmount = grossPrice * (taxPercentage / 100);
        return parseFloat((grossPrice + serviceChargeAmount + taxAmount).toFixed(2));
    }

// Helper function to create restaurant sections with proper Fabric.js canvas data
// Enhanced to support the full JSON layout structure
async function createRestaurantSection(
    prisma: PrismaClient,
    restaurantId: number,
    sectionData: {
        sectionName: string;
        description: string;
        displayOrder: number;
        capacity: number;
        canvasWidth: number;
        canvasHeight: number;
        floorPlanImage: string;
        sectionColor: string;
    }
) {
    const canvasData = {
        version: "5.3.0",
        objects: [
            {
                type: "rect",
                version: "5.3.0",
                originX: "left",
                originY: "top",
                left: 0,
                top: 0,
                width: sectionData.canvasWidth,
                height: sectionData.canvasHeight,
                fill: "transparent",
                stroke: sectionData.sectionColor,
                strokeWidth: 2,
                strokeDashArray: [10, 5],
                selectable: false,
                evented: false,
                hoverCursor: "default",
                objectType: "sectionBoundary"
            }
            // Note: Removed section label as per user request to remove area names
        ],
        background: sectionData.floorPlanImage ? {
            type: "image",
            version: "5.3.0",
            originX: "left",
            originY: "top",
            left: 0,
            top: 0,
            width: sectionData.canvasWidth,
            height: sectionData.canvasHeight,
            src: sectionData.floorPlanImage,
            selectable: false,
            evented: false,
            objectType: "backgroundImage"
        } : undefined,
        metadata: {
            sectionName: sectionData.sectionName,
            canvasWidth: sectionData.canvasWidth,
            canvasHeight: sectionData.canvasHeight,
            lastModified: new Date().toISOString(),
            version: "1.0"
        }
    };

    return await prisma.restaurantSection.create({
        data: {
            restaurantId,
            sectionName: sectionData.sectionName,
            description: sectionData.description,
            displayOrder: sectionData.displayOrder,
            capacity: sectionData.capacity,
            canvasWidth: sectionData.canvasWidth,
            canvasHeight: sectionData.canvasHeight,
            floorPlanImage: sectionData.floorPlanImage,
            isActive: true
        }
    });
}

// Helper function to create restaurant tables with proper Fabric.js data
// Enhanced to support all advanced properties from our type mapping system
async function createRestaurantTable(
    prisma: PrismaClient,
    restaurantId: number,
    sectionId: number,
    tableData: {
        tableName: string;
        seatingCapacity: number;
        tableType: string;
        x: number;
        y: number;
        width: number;
        height: number;
        angle?: number;
        fillColor: string;
        strokeColor: string;
        amenities: Record<string, any>;
        // Enhanced properties
        strokeWidth?: number;
        hasShadow?: boolean;
        cornerStyle?: 'circle' | 'rect';
        cornerColor?: string;
        cornerSize?: number;
        transparentCorners?: boolean;
        borderColor?: string;
        borderScaleFactor?: number;
        isDraggable?: boolean;
        isResizable?: boolean;
    }
) {
    const fabricObjectId = `table-${tableData.tableName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`;

	// Apply a subtle global size scale to reduce table dimensions slightly
	const TABLE_SIZE_SCALE = 0.9;
	const scaledWidth = Math.round(tableData.width * TABLE_SIZE_SCALE);
	const scaledHeight = Math.round(tableData.height * TABLE_SIZE_SCALE);

	const position = {
        x: tableData.x,
        y: tableData.y,
		width: scaledWidth,
		height: scaledHeight,
        angle: tableData.angle || 0,
        scaleX: 1,
        scaleY: 1,
        originX: "center",
        originY: "center"
    };

    const canvasProperties = {
        fill: tableData.fillColor,
        stroke: tableData.strokeColor,
        strokeWidth: tableData.strokeWidth || 2,
        // Only add shadow if explicitly requested (for flat design)
        ...(tableData.hasShadow && {
            shadow: {
                color: "rgba(0,0,0,0.1)",
                blur: 4,
                offsetX: 2,
                offsetY: 2
            }
        }),
        cornerStyle: tableData.cornerStyle || "circle",
        cornerColor: tableData.cornerColor || "#3B82F6",
        cornerSize: tableData.cornerSize || 8,
        transparentCorners: tableData.transparentCorners !== undefined ? tableData.transparentCorners : false,
        borderColor: tableData.borderColor || "#3B82F6",
        borderScaleFactor: tableData.borderScaleFactor || 2
    };

    return await prisma.restaurantTable.create({
        data: {
            restaurantId,
            sectionId,
            tableName: tableData.tableName,
            seatingCapacity: tableData.seatingCapacity,
            tableType: tableData.tableType,
            isActive: true,
            position,
            amenities: tableData.amenities
        }
    });
}

// Helper function to generate dates for the
    const getDatesInRange = (start: Date, end: Date) => {
        const dates: Date[] = [];
        let currentDate = new Date(start);

        while (currentDate <= end) {
            dates.push(new Date(currentDate));
            currentDate = addDays(currentDate, 1);
        }

        return dates;
    };

// Function to create reviews for The Kingsbury Colombo
async function createKingsburyReviews(prisma: PrismaClient) {
    console.log('Creating reviews for The Kingsbury Colombo...');
    
    // Get The Kingsbury restaurant
    const kingsburyRestaurant = await prisma.restaurant.findFirst({
        where: { id: 7 }
    });

    if (!kingsburyRestaurant) {
        console.error('Restaurant 7 (The Kingsbury Colombo) not found');
        return;
    }

    // Get customers for reviews
    const customers = await prisma.customer.findMany();
    if (customers.length === 0) {
        console.error('No customers found for creating reviews');
        return;
    }

    // Create some reservations for The Kingsbury to attach reviews to
    const kingsburyReservations: any[] = [];
    const kingsburyMealTypes = [MealType.BREAKFAST, MealType.LUNCH, MealType.HIGH_TEA, MealType.DINNER];
    
    // Create reservations for the past 3 months
    for (let month = 0; month < 3; month++) {
        const daysInMonth = new Date(2025, month + 1, 0).getDate();
        
        for (let day = 1; day <= Math.min(daysInMonth, 10); day++) { // Create up to 10 reservations per month
            for (const mealType of kingsburyMealTypes) {
                const customer = customers[Math.floor(Math.random() * customers.length)];
                const reservationTime = mealType === MealType.BREAKFAST ? '08:00:00' : 
                                      mealType === MealType.LUNCH ? '13:00:00' :
                                      mealType === MealType.HIGH_TEA ? '15:30:00' : '19:00:00';

                // Create reservation request
                const request = await prisma.reservationRequest.create({
                    data: {
                        restaurantId: 7,
                        customerId: customer.id,
                        requestName: `${customer.firstName} ${customer.lastName}`,
                        contactPhone: customer.phone,
                        requestedDate: new Date(2025, month, day),
                        requestedTime: new Date(`2025-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${reservationTime}`),
                        adultCount: Math.floor(Math.random() * 4) + 1,
                        childCount: Math.floor(Math.random() * 3),
                        mealType: mealType,
                        estimatedTotalAmount: 15000.00,
                        estimatedServiceCharge: 1500.00,
                        estimatedTaxAmount: 750.00,
                        status: ReservationRequestStatus.CONFIRMED,
                        createdBy: RequestCreatorType.SYSTEM
                    }
                });

                // Create reservation
                const reservation = await prisma.reservation.create({
                    data: {
                        reservationNumber: generateReservationNumber(7, kingsburyReservations.length),
                        restaurantId: 7,
                        customerId: customer.id,
                        requestId: request.id,
                        reservationName: `${customer.firstName} ${customer.lastName}`,
                        contactPhone: customer.phone,
                        reservationDate: new Date(2025, month, day),
                        reservationTime: new Date(`2025-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${reservationTime}`),
                        adultCount: Math.floor(Math.random() * 4) + 1,
                        childCount: Math.floor(Math.random() * 3),
                        mealType: mealType,
                        totalAmount: 15000.00,
                        serviceCharge: 1500.00,
                        taxAmount: 750.00,
                        advancePaymentAmount: 5250.00, // 35% advance payment
                        remainingPaymentAmount: 9750.00,
                        status: 'COMPLETED',
                        createdBy: RequestCreatorType.SYSTEM
                    }
                });

                kingsburyReservations.push(reservation);
            }
        }
    }

    // Create reviews for The Kingsbury
    const kingsburyReviews = [
        {
            customerName: "Sarah Johnson",
            mealRating: 5,
            serviceRating: 5,
            platformRating: 5,
            reviewText: "Absolutely exceptional dining experience at The Kingsbury! The high tea service was impeccable with a stunning ocean view. The staff were incredibly attentive and the food was divine. The traditional high tea setup with fresh scones and premium tea selection exceeded all expectations. Will definitely return for special occasions!",
            diningDate: new Date(2025, 0, 15), // January 15
            mealType: MealType.HIGH_TEA
        },
        {
            customerName: "Michael Chen",
            mealRating: 5,
            serviceRating: 4,
            platformRating: 5,
            reviewText: "The breakfast buffet at The Kingsbury is world-class! Fresh pastries, made-to-order omelets, and the most amazing Sri Lankan curry selection. The oceanfront dining area creates such a peaceful morning atmosphere. Service was excellent and the coffee was perfect. Highly recommend for a luxury breakfast experience.",
            diningDate: new Date(2025, 0, 22), // January 22
            mealType: MealType.BREAKFAST
        },
        {
            customerName: "Priya Patel",
            mealRating: 4,
            serviceRating: 5,
            platformRating: 5,
            reviewText: "Celebrated our anniversary at The Kingsbury's dinner service and it was magical! The seafood selection was outstanding, especially the grilled prawns. The wine pairing suggestions were spot-on. The ambiance is elegant and romantic. The staff made us feel so special throughout the evening.",
            diningDate: new Date(2025, 1, 8), // February 8
            mealType: MealType.DINNER
        },
        {
            customerName: "David Thompson",
            mealRating: 5,
            serviceRating: 5,
            platformRating: 4,
            reviewText: "Business lunch at The Kingsbury was perfect. The lunch buffet offers an excellent variety of international and local dishes. The service was professional and efficient. The private dining area was ideal for our meeting. The dessert selection was particularly impressive.",
            diningDate: new Date(2025, 1, 14), // February 14
            mealType: MealType.LUNCH
        },
        {
            customerName: "Emma Rodriguez",
            mealRating: 5,
            serviceRating: 5,
            platformRating: 5,
            reviewText: "The Kingsbury's high tea is a must-experience! The tiered presentation was beautiful, and the selection of teas was extensive. The finger sandwiches were fresh and the pastries were heavenly. The live piano music added such a sophisticated touch. Perfect for afternoon relaxation.",
            diningDate: new Date(2025, 1, 21), // February 21
            mealType: MealType.HIGH_TEA
        },
        {
            customerName: "James Wilson",
            mealRating: 4,
            serviceRating: 4,
            platformRating: 5,
            reviewText: "Great breakfast experience at The Kingsbury. The continental spread was extensive and the made-to-order station was a nice touch. The view of the ocean while dining was spectacular. Service was good, though a bit slow during peak hours. Overall, a wonderful luxury breakfast experience.",
            diningDate: new Date(2025, 2, 5), // March 5
            mealType: MealType.BREAKFAST
        },
        {
            customerName: "Lisa Anderson",
            mealRating: 5,
            serviceRating: 5,
            platformRating: 5,
            reviewText: "Dinner at The Kingsbury was absolutely spectacular! The chef's special seafood platter was incredible. The wine service was impeccable and the sommelier's recommendations were perfect. The sunset view from our table was breathtaking. This is now our favorite fine dining spot in Colombo.",
            diningDate: new Date(2025, 2, 12), // March 12
            mealType: MealType.DINNER
        },
        {
            customerName: "Robert Kim",
            mealRating: 4,
            serviceRating: 5,
            platformRating: 4,
            reviewText: "Lunch at The Kingsbury was excellent. The buffet had a great selection of both Western and Asian dishes. The curry station was particularly good. Service was attentive and the dining room was elegant. Good value for a luxury hotel dining experience.",
            diningDate: new Date(2025, 2, 19), // March 19
            mealType: MealType.LUNCH
        }
    ];

    // Create reviews and responses
    for (let i = 0; i < Math.min(kingsburyReviews.length, kingsburyReservations.length); i++) {
        const reviewData = kingsburyReviews[i];
        const reservation = kingsburyReservations[i];
        const customer = customers[i % customers.length];

        const review = await prisma.reservationReview.create({
            data: {
                reservationId: reservation.id,
                customerId: customer.id,
                mealRating: reviewData.mealRating,
                serviceRating: reviewData.serviceRating,
                platformRating: reviewData.platformRating,
                reviewText: reviewData.reviewText,
                isVerified: true,
                isPublished: true,
                diningDate: reviewData.diningDate,
                moderationStatus: 'APPROVED',
                moderatedBy: 'SYSTEM'
            }
        });

        // Add restaurant response for some reviews
        if (i < 4) { // Add responses to first 4 reviews
            await prisma.reservationReviewResponse.create({
                data: {
                    reviewId: review.id,
                    responseText: "Thank you for your wonderful review! We're delighted that you enjoyed your dining experience at The Kingsbury. We look forward to welcoming you back for another memorable meal.",
                    respondedBy: 'The Kingsbury Management',
                    isPublished: true
                }
            });
        }
    }

    console.log(`Created ${kingsburyReviews.length} reviews for The Kingsbury Colombo`);
}

// Function to create reviews for all internal restaurants
async function createInternalRestaurantReviews(prisma: PrismaClient) {
    console.log('Creating reviews for all internal restaurants...');
    
    // Get all internal restaurants (excluding discovery restaurants)
    const internalRestaurants = await prisma.restaurant.findMany({
        where: {
            id: {
                in: [ministryOfCrab.id, kaemasutra.id, nihonbashi.id, rajaBojun.id, kingsburyColombo.id, gordonRamsaySavoyGrill.id, daviesAndBrook.id]
            }
        }
    });

    // Get customers for reviews
    const customers = await prisma.customer.findMany();
    if (customers.length === 0) {
        console.error('No customers found for creating reviews');
        return;
    }

    // Create reviews for each internal restaurant
    for (const restaurant of internalRestaurants) {
        console.log(`Creating reviews for ${restaurant.name}...`);
        
        // Create some reservations for this restaurant to attach reviews to
        const restaurantReservations: any[] = [];
        const mealTypes = [MealType.LUNCH, MealType.DINNER];
        
        // Create reservations for the past 3 months
        for (let month = 0; month < 3; month++) {
            const daysInMonth = new Date(2025, month + 1, 0).getDate();
            
            for (let day = 1; day <= Math.min(daysInMonth, 8); day++) { // Create up to 8 reservations per month
                for (const mealType of mealTypes) {
                    const customer = customers[Math.floor(Math.random() * customers.length)];
                    const reservationTime = mealType === MealType.LUNCH ? '13:00:00' : '19:00:00';

                    // Create reservation request
                    const request = await prisma.reservationRequest.create({
                        data: {
                            restaurantId: restaurant.id,
                            customerId: customer.id,
                            requestName: `${customer.firstName} ${customer.lastName}`,
                            contactPhone: customer.phone,
                            requestedDate: new Date(2025, month, day),
                            requestedTime: new Date(`2025-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${reservationTime}`),
                            adultCount: Math.floor(Math.random() * 4) + 1,
                            childCount: Math.floor(Math.random() * 3),
                            mealType: mealType,
                            estimatedTotalAmount: 15000.00,
                            estimatedServiceCharge: 1500.00,
                            estimatedTaxAmount: 750.00,
                            status: ReservationRequestStatus.CONFIRMED,
                            createdBy: RequestCreatorType.SYSTEM
                        }
                    });

                    // Create reservation
                    const reservation = await prisma.reservation.create({
                        data: {
                            reservationNumber: generateReservationNumber(restaurant.id, restaurantReservations.length),
                            restaurantId: restaurant.id,
                            customerId: customer.id,
                            requestId: request.id,
                            reservationName: `${customer.firstName} ${customer.lastName}`,
                            contactPhone: customer.phone,
                            reservationDate: new Date(2025, month, day),
                            reservationTime: new Date(`2025-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${reservationTime}`),
                            adultCount: Math.floor(Math.random() * 4) + 1,
                            childCount: Math.floor(Math.random() * 3),
                            mealType: mealType,
                            totalAmount: 15000.00,
                            serviceCharge: 1500.00,
                            taxAmount: 750.00,
                            advancePaymentAmount: 5250.00,
                            remainingPaymentAmount: 9750.00,
                            status: 'COMPLETED',
                            createdBy: RequestCreatorType.SYSTEM
                        }
                    });

                    restaurantReservations.push(reservation);
                }
            }
        }

        // Create reviews for this restaurant
        const restaurantReviews = [
            {
                customerName: "Alex Johnson",
                mealRating: 5,
                serviceRating: 5,
                platformRating: 5,
                reviewText: `Amazing experience at ${restaurant.name}! The food was exceptional and the service was outstanding. Highly recommend!`,
                diningDate: new Date(2025, 0, 10),
                mealType: MealType.DINNER
            },
            {
                customerName: "Maria Garcia",
                mealRating: 4,
                serviceRating: 5,
                platformRating: 5,
                reviewText: `Great lunch at ${restaurant.name}. The ambiance was perfect and the staff were very attentive. Will definitely return!`,
                diningDate: new Date(2025, 0, 15),
                mealType: MealType.LUNCH
            },
            {
                customerName: "John Smith",
                mealRating: 5,
                serviceRating: 4,
                platformRating: 5,
                reviewText: `Excellent dining experience at ${restaurant.name}. The flavors were incredible and the presentation was beautiful.`,
                diningDate: new Date(2025, 1, 5),
                mealType: MealType.DINNER
            },
            {
                customerName: "Lisa Chen",
                mealRating: 4,
                serviceRating: 5,
                platformRating: 4,
                reviewText: `Wonderful meal at ${restaurant.name}. The service was impeccable and the food was delicious.`,
                diningDate: new Date(2025, 1, 12),
                mealType: MealType.LUNCH
            },
            {
                customerName: "David Wilson",
                mealRating: 5,
                serviceRating: 5,
                platformRating: 5,
                reviewText: `Outstanding experience at ${restaurant.name}! Everything was perfect from start to finish.`,
                diningDate: new Date(2025, 2, 8),
                mealType: MealType.DINNER
            }
        ];

        // Create reviews and responses
        for (let i = 0; i < Math.min(restaurantReviews.length, restaurantReservations.length); i++) {
            const reviewData = restaurantReviews[i];
            const reservation = restaurantReservations[i];
            const customer = customers[i % customers.length];

            const review = await prisma.reservationReview.create({
                data: {
                    reservationId: reservation.id,
                    customerId: customer.id,
                    mealRating: reviewData.mealRating,
                    serviceRating: reviewData.serviceRating,
                    platformRating: reviewData.platformRating,
                    reviewText: reviewData.reviewText,
                    isVerified: true,
                    isPublished: true,
                    diningDate: reviewData.diningDate,
                    moderationStatus: 'APPROVED',
                    moderatedBy: 'SYSTEM'
                }
            });

            // Add restaurant response for some reviews
            if (i < 2) { // Add responses to first 2 reviews
                await prisma.reservationReviewResponse.create({
                    data: {
                        reviewId: review.id,
                        responseText: `Thank you for your wonderful review! We're delighted that you enjoyed your dining experience at ${restaurant.name}. We look forward to welcoming you back soon!`,
                        respondedBy: `${restaurant.name} Management`,
                        isPublished: true
                    }
                });
            }
        }

        console.log(`Created ${restaurantReviews.length} reviews for ${restaurant.name}`);
    }
}

// Function to seed capacity data for restaurant 7 (The Kingsbury Colombo)
async function seedKingsburyCapacity(prisma: PrismaClient) {
    console.log('Seeding capacity data for The Kingsbury Colombo (Restaurant ID 7)...');
    
    // Get restaurant 7
    const kingsburyRestaurant = await prisma.restaurant.findFirst({
        where: { id: 7 }
    });

    if (!kingsburyRestaurant) {
        console.error('Restaurant 7 (The Kingsbury Colombo) not found');
        return;
    }

    // Get all meal services for The Kingsbury
    const mealServices = await prisma.restaurantMealService.findMany({
        where: { restaurantId: 7 }
    });

    if (mealServices.length === 0) {
        console.log('No meal services found for The Kingsbury. Creating default meal services...');
        
        // Create default meal services for The Kingsbury
        const defaultMealServices = [
            {
                mealType: MealType.BREAKFAST,
                isAvailable: true,
                isChildEnabled: true,
                adultGrossPrice: new Decimal(45.00),
                childGrossPrice: new Decimal(22.50),
                adultNetPrice: new Decimal(52.65), // 45 + 10% service + 7% tax
                childNetPrice: new Decimal(26.33),
                childAgeLimit: 12,
                serviceChargePercentage: new Decimal(10.00),
                taxPercentage: new Decimal(7.00),
                priceUpdatedAt: new Date(),
                serviceStartTime: new Date('2025-01-01T06:30:00.000Z'),
                serviceEndTime: new Date('2025-01-01T10:30:00.000Z'),
            },
            {
                mealType: MealType.LUNCH,
                isAvailable: true,
                isChildEnabled: true,
                adultGrossPrice: new Decimal(65.00),
                childGrossPrice: new Decimal(32.50),
                adultNetPrice: new Decimal(76.05),
                childNetPrice: new Decimal(38.03),
                childAgeLimit: 12,
                serviceChargePercentage: new Decimal(10.00),
                taxPercentage: new Decimal(7.00),
                priceUpdatedAt: new Date(),
                serviceStartTime: new Date('2025-01-01T12:00:00.000Z'),
                serviceEndTime: new Date('2025-01-01T15:00:00.000Z'),
            },
            {
                mealType: MealType.HIGH_TEA,
                isAvailable: true,
                isChildEnabled: false,
                adultGrossPrice: new Decimal(35.00),
                childGrossPrice: new Decimal(17.50),
                adultNetPrice: new Decimal(40.95),
                childNetPrice: new Decimal(20.48),
                childAgeLimit: 12,
                serviceChargePercentage: new Decimal(10.00),
                taxPercentage: new Decimal(7.00),
                priceUpdatedAt: new Date(),
                serviceStartTime: new Date('2025-01-01T15:00:00.000Z'),
                serviceEndTime: new Date('2025-01-01T17:00:00.000Z'),
            },
            {
                mealType: MealType.DINNER,
                isAvailable: true,
                isChildEnabled: true,
                adultGrossPrice: new Decimal(85.00),
                childGrossPrice: new Decimal(42.50),
                adultNetPrice: new Decimal(99.45),
                childNetPrice: new Decimal(49.73),
                childAgeLimit: 12,
                serviceChargePercentage: new Decimal(10.00),
                taxPercentage: new Decimal(7.00),
                priceUpdatedAt: new Date(),
                serviceStartTime: new Date('2025-01-01T18:00:00.000Z'),
                serviceEndTime: new Date('2025-01-01T22:30:00.000Z'),
            }
        ];

        for (const serviceData of defaultMealServices) {
            await prisma.restaurantMealService.create({
                data: {
                    restaurantId: 7,
                    ...serviceData
                }
            });
        }

        // Refresh meal services after creation
        const updatedMealServices = await prisma.restaurantMealService.findMany({
            where: { restaurantId: 7 }
        });
        mealServices.push(...updatedMealServices);
    }

    // Calculate date range: from today to two months from today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const twoMonthsFromToday = new Date(today);
    twoMonthsFromToday.setMonth(twoMonthsFromToday.getMonth() + 2);
    twoMonthsFromToday.setHours(23, 59, 59, 999);

    const dates = getDatesInRange(today, twoMonthsFromToday);
    
    const capacityRecords: {
        restaurantId: number;
        serviceId: number;
        date: Date;
        totalSeats: number;
        bookedSeats: number;
        isEnabled: boolean;
    }[] = [];

    for (const service of mealServices) {
        for (const date of dates) {
            // Set capacity based on meal type for The Kingsbury (luxury hotel)
            let totalSeats = 120; // Default capacity for luxury hotel

            if (service.mealType === MealType.BREAKFAST) {
                totalSeats = 100; // Breakfast capacity
            } else if (service.mealType === MealType.LUNCH) {
                totalSeats = 120; // Lunch capacity
            } else if (service.mealType === MealType.HIGH_TEA) {
                totalSeats = 60; // High tea is more exclusive
            } else if (service.mealType === MealType.DINNER) {
                totalSeats = 150; // Dinner capacity (most popular)
            }

            // Calculate booked seats with realistic patterns for luxury hotel
            let bookedSeats = 0;
            const dayOfWeek = date.getDay();
            
            // Weekend bookings are higher for luxury hotels
            if (dayOfWeek === 0 || dayOfWeek === 6) { // Sunday or Saturday
                if (service.mealType === MealType.HIGH_TEA) {
                    bookedSeats = Math.floor(Math.random() * 25) + 20; // 20-45 bookings for weekend high tea
                } else if (service.mealType === MealType.DINNER) {
                    bookedSeats = Math.floor(Math.random() * 40) + 30; // 30-70 bookings for weekend dinner
                } else {
                    bookedSeats = Math.floor(Math.random() * 30) + 15; // 15-45 bookings for other weekend meals
                }
            } else {
                // Weekday bookings
                if (service.mealType === MealType.HIGH_TEA) {
                    bookedSeats = Math.floor(Math.random() * 15) + 10; // 10-25 bookings for weekday high tea
                } else if (service.mealType === MealType.DINNER) {
                    bookedSeats = Math.floor(Math.random() * 25) + 20; // 20-45 bookings for weekday dinner
                } else {
                    bookedSeats = Math.floor(Math.random() * 20) + 10; // 10-30 bookings for other weekday meals
                }
            }

            // Ensure booked seats don't exceed total seats
            bookedSeats = Math.min(bookedSeats, totalSeats);

            // Check for special closure dates (Christmas, New Year, etc.)
            const isSpecialClosureDate = 
                (date.getDate() === 25 && date.getMonth() === 11) || // Dec 25
                (date.getDate() === 1 && date.getMonth() === 0) ||   // Jan 1
                (date.getDate() === 31 && date.getMonth() === 11);   // Dec 31

            capacityRecords.push({
                restaurantId: 7,
                serviceId: service.id,
                date,
                totalSeats,
                bookedSeats,
                isEnabled: !isSpecialClosureDate,
            });
        }
    }

    // Create capacity records
    await prisma.restaurantCapacity.createMany({
        data: capacityRecords,
        skipDuplicates: true,
    });

    console.log(`Created ${capacityRecords.length} capacity records for The Kingsbury Colombo`);
}

// Generate capacity records for each restaurant, service, and date
/**
 * Generate table availability slots for the current month
 */
async function generateTableAvailabilitySlotsForCurrentMonth(prisma: PrismaClient) {
    console.log('Starting table availability slots generation for current month...');

    try {
        // Get current date and calculate month boundaries
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // Get first and last day of current month
        const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
        const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);

        console.log(`Generating slots for: ${firstDayOfMonth.toDateString()} to ${lastDayOfMonth.toDateString()}`);

        // Get all restaurants that support table reservations
        const tableRestaurants = await prisma.restaurant.findMany({
            where: {
                OR: [
                    { reservationSupport: ReservationSupportType.TABLE_ONLY },
                    { reservationSupport: ReservationSupportType.BOTH }
                ]
            },
            include: {
                tables: {
                    where: { isActive: true },
                    include: {
                        section: true
                    }
                },
                tableReservationConfigs: {
                    include: {
                        slotGenerationConfig: true
                    }
                }
            }
        });

        console.log(`Found ${tableRestaurants.length} restaurants with table reservation support`);

        let totalSlotsCreated = 0;

        for (const restaurant of tableRestaurants) {
            console.log(`\nProcessing restaurant: ${restaurant.name} (ID: ${restaurant.id})`);
            console.log(`  Tables: ${restaurant.tables.length}`);

            if (restaurant.tables.length === 0) {
                console.log(`  ⚠️  No active tables found, skipping...`);
                continue;
            }

            // Get slot generation configuration for this restaurant
            const slotConfig = restaurant.tableReservationConfigs.find(config =>
                config.slotGenerationConfig && config.isActive
            )?.slotGenerationConfig;

            if (!slotConfig) {
                console.log(`  ⚠️  No slot generation config found, using defaults...`);
                // Use default configuration
                await generateSlotsForRestaurantWithDefaults(
                    prisma,
                    restaurant,
                    firstDayOfMonth,
                    lastDayOfMonth
                );
                continue;
            }

            console.log(`  Using slot config: ${slotConfig.id}`);
            console.log(`  Slot duration: ${slotConfig.slotDurationMinutes} minutes`);
            console.log(`  Buffer time: ${slotConfig.turnoverBufferMinutes} minutes`);
            console.log(`  Start time: ${slotConfig.startTime.toTimeString()}`);
            console.log(`  Enabled days: ${slotConfig.enabledDays.join(', ')}`);

            // Generate slots for each day in the month
            const currentDate = new Date(firstDayOfMonth);
            let restaurantSlotsCreated = 0;

            while (currentDate <= lastDayOfMonth) {
                const dayOfWeek = getDayOfWeekFromDate(currentDate);

                // Check if this day is enabled in the config
                if (slotConfig.enabledDays.includes(dayOfWeek)) {
                    const daySlots = await generateSlotsForDate(
                        prisma,
                        restaurant,
                        slotConfig,
                        new Date(currentDate)
                    );
                    restaurantSlotsCreated += daySlots;
                }

                // Move to next day
                currentDate.setDate(currentDate.getDate() + 1);
            }

            console.log(`  ✅ Created ${restaurantSlotsCreated} slots for ${restaurant.name}`);
            totalSlotsCreated += restaurantSlotsCreated;
        }

        console.log(`\n🎉 Table availability slots generation completed!`);
        console.log(`   Total slots created: ${totalSlotsCreated}`);
        console.log(`   Period: ${firstDayOfMonth.toDateString()} to ${lastDayOfMonth.toDateString()}`);

    } catch (error) {
        console.error('❌ Error generating table availability slots:', error);
        throw error;
    }
}

/**
 * Generate slots for a restaurant using default configuration
 */
async function generateSlotsForRestaurantWithDefaults(
    prisma: PrismaClient,
    restaurant: any,
    startDate: Date,
    endDate: Date
) {
    const defaultConfig = {
        slotDurationMinutes: 90,
        turnoverBufferMinutes: 15,
        startTime: new Date('1970-01-01T10:00:00Z'), // 10:00 AM
        enabledDays: [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY,
                     DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY]
    };

    const currentDate = new Date(startDate);
    let totalSlots = 0;

    while (currentDate <= endDate) {
        const dayOfWeek = getDayOfWeekFromDate(currentDate);

        if (defaultConfig.enabledDays.includes(dayOfWeek)) {
            const daySlots = await generateSlotsForDate(
                prisma,
                restaurant,
                defaultConfig,
                new Date(currentDate)
            );
            totalSlots += daySlots;
        }

        currentDate.setDate(currentDate.getDate() + 1);
    }

    return totalSlots;
}

/**
 * Generate slots for a specific date
 */
async function generateSlotsForDate(
    prisma: PrismaClient,
    restaurant: any,
    config: any,
    date: Date
): Promise<number> {
    const slots: any[] = [];
    const startTime = new Date(date);
    startTime.setHours(config.startTime.getHours(), config.startTime.getMinutes(), 0, 0);

    // Generate slots from start time to end of day (22:00)
    const endOfDay = new Date(date);
    endOfDay.setHours(22, 0, 0, 0);

    let currentSlotStart = new Date(startTime);
    let slotCount = 0;

    while (currentSlotStart < endOfDay) {
        const slotEnd = new Date(currentSlotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + config.slotDurationMinutes);

        // Skip if slot would go beyond end of day
        if (slotEnd > endOfDay) {
            break;
        }

        // Create slots for all active tables
        for (const table of restaurant.tables) {
            slots.push({
                restaurantId: restaurant.id,
                tableId: table.id,
                date: date,
                startTime: new Date(currentSlotStart),
                endTime: new Date(slotEnd),
                status: TableSlotStatus.AVAILABLE
            });
        }

        // Move to next slot (add buffer time)
        currentSlotStart.setMinutes(
            currentSlotStart.getMinutes() +
            config.slotDurationMinutes +
            config.turnoverBufferMinutes
        );
        slotCount++;
    }

    if (slots.length > 0) {
        // Batch insert slots
        await prisma.tableAvailabilitySlot.createMany({
            data: slots,
            skipDuplicates: true
        });
    }

    return slots.length;
}

/**
 * Convert JavaScript Date to Prisma DayOfWeek enum
 */
function getDayOfWeekFromDate(date: Date): DayOfWeek {
    const dayOfWeek = date.getDay();
    switch (dayOfWeek) {
        case 0: return DayOfWeek.SUNDAY;
        case 1: return DayOfWeek.MONDAY;
        case 2: return DayOfWeek.TUESDAY;
        case 3: return DayOfWeek.WEDNESDAY;
        case 4: return DayOfWeek.THURSDAY;
        case 5: return DayOfWeek.FRIDAY;
        case 6: return DayOfWeek.SATURDAY;
        default: return DayOfWeek.MONDAY;
    }
}

/**
 * Seed table merge test data for testing
 */
async function seedTableMergeData(prisma: PrismaClient, restaurantId: number) {
    console.log('Creating table merge test data...');

    // Create a section for merge testing
    const mergeSection = await prisma.restaurantSection.create({
        data: {
            restaurantId,
            sectionName: 'Merge Test Section',
            description: 'Section for testing table merge functionality',
            displayOrder: 99,
            capacity: 15,
            canvasWidth: 800,
            canvasHeight: 600,
            isActive: true
        }
    });

    // Create 3 tables for merge testing (Table 5, Table 7, Table 9)
    const table5 = await prisma.restaurantTable.create({
        data: {
            restaurantId,
            sectionId: mergeSection.id,
            tableName: 'MT5',
            seatingCapacity: 6,
            tableType: 'STANDARD',
            isActive: true,
            position: { x: 100, y: 100, width: 80, height: 80 },
            amenities: { isIndoor: true }
        }
    });

    const table7 = await prisma.restaurantTable.create({
        data: {
            restaurantId,
            sectionId: mergeSection.id,
            tableName: 'MT7',
            seatingCapacity: 4,
            tableType: 'STANDARD',
            isActive: true,
            position: { x: 300, y: 100, width: 80, height: 80 },
            amenities: { isIndoor: true }
        }
    });

    const table9 = await prisma.restaurantTable.create({
        data: {
            restaurantId,
            sectionId: mergeSection.id,
            tableName: 'MT9',
            seatingCapacity: 5,
            tableType: 'STANDARD',
            isActive: true,
            position: { x: 500, y: 100, width: 80, height: 80 },
            amenities: { isIndoor: true }
        }
    });

    // Create a test customer for merge reservation
    const mergeCustomer = await prisma.customer.create({
        data: {
            firstName: 'Merge',
            lastName: 'Tester',
            email: 'tablemerge@test.com',
            phone: '+94777777777'
        }
    });

    // Create test date and times
    const testDate = new Date('2025-11-01');
    const slot1Start = new Date('1970-01-01T19:00:00Z');
    const slot1End = new Date('1970-01-01T20:30:00Z');

    // Create availability slots for all 3 tables
    const slot5 = await prisma.tableAvailabilitySlot.create({
        data: {
            restaurantId,
            tableId: table5.id,
            date: testDate,
            startTime: slot1Start,
            endTime: slot1End,
            status: 'AVAILABLE'
        }
    });

    const slot7 = await prisma.tableAvailabilitySlot.create({
        data: {
            restaurantId,
            tableId: table7.id,
            date: testDate,
            startTime: slot1Start,
            endTime: slot1End,
            status: 'AVAILABLE'
        }
    });

    const slot9 = await prisma.tableAvailabilitySlot.create({
        data: {
            restaurantId,
            tableId: table9.id,
            date: testDate,
            startTime: slot1Start,
            endTime: slot1End,
            status: 'AVAILABLE'
        }
    });

    // Create a test reservation request
    const mergeRequest = await prisma.reservationRequest.create({
        data: {
            restaurantId,
            customerId: mergeCustomer.id,
            requestName: 'Merge Tester',
            contactPhone: mergeCustomer.phone,
            requestedDate: testDate,
            requestedTime: slot1Start,
            adultCount: 6,
            childCount: 0,
            mealType: MealType.DINNER,
            estimatedTotalAmount: 5000.00,
            estimatedServiceCharge: 500.00,
            estimatedTaxAmount: 250.00,
            status: ReservationRequestStatus.CONFIRMED,
            createdBy: RequestCreatorType.SYSTEM,
            reservationType: ReservationType.TABLE_ONLY
        }
    });

    // Create a test reservation assigned to Table 5
    const mergeReservation = await prisma.reservation.create({
        data: {
            reservationNumber: `RH-TEST-MERGE-${Date.now()}`,
            restaurantId,
            customerId: mergeCustomer.id,
            requestId: mergeRequest.id,
            reservationName: 'Merge Tester',
            contactPhone: mergeCustomer.phone,
            reservationDate: testDate,
            reservationTime: slot1Start,
            adultCount: 6,
            childCount: 0,
            mealType: MealType.DINNER,
            totalAmount: 5000.00,
            serviceCharge: 500.00,
            taxAmount: 250.00,
            status: 'CONFIRMED',
            createdBy: RequestCreatorType.SYSTEM,
            reservationType: ReservationType.TABLE_ONLY
        }
    });

    // Assign reservation to Table 5
    await prisma.reservationTableAssignment.create({
        data: {
            reservationId: mergeReservation.id,
            assignedSectionId: mergeSection.id,
            assignedTableId: table5.id,
            slotId: slot5.id,
            tableStartTime: slot1Start,
            tableEndTime: slot1End
        }
    });

    // Update slot5 to RESERVED status
    await prisma.tableAvailabilitySlot.update({
        where: { id: slot5.id },
        data: {
            status: 'RESERVED',
            reservationId: mergeReservation.id
        }
    });

    console.log('✅ Table merge test data seeded:');
    console.log(`   • Section: ${mergeSection.sectionName} (ID: ${mergeSection.id})`);
    console.log(`   • Table 5 (6-pax): ${table5.id} - RESERVED`);
    console.log(`   • Table 7 (4-pax): ${table7.id} - AVAILABLE`);
    console.log(`   • Table 9 (5-pax): ${table9.id} - AVAILABLE`);
    console.log(`   • Reservation: ${mergeReservation.reservationNumber} (ID: ${mergeReservation.id})`);
    console.log(`   • Test Date: ${testDate.toISOString().split('T')[0]}`);
}

const generateCapacityRecords = async (
  prisma: PrismaClient,
  targetRestaurantIds: number[] // Add parameter to specify which restaurants to process
): Promise<
  {
    restaurantId: number;
    serviceId: number;
    date: Date;
    totalSeats: number;
    bookedSeats: number;
    isEnabled: boolean;
  }[]
> => {
  const dates: Date[] = getDatesInRange(capacityStartDate, capacityEndDate);
  const capacityRecords: {
    restaurantId: number;
    serviceId: number;
    date: Date;
    totalSeats: number;
    bookedSeats: number;
    isEnabled: boolean;
  }[] = [];

  // Get only meal services for the specified restaurants
  const services = await prisma.restaurantMealService.findMany({
    where: {
      restaurantId: {
        in: targetRestaurantIds,
      },
    },
  });

  for (const service of services) {
    for (const date of dates) {
      // Skip December 15th as it's a special closure date
      if (date.getDate() === 15 && date.getMonth() === 11) continue;

      // Skip breakfast on December 14th
      if (
        date.getDate() === 14 &&
        date.getMonth() === 11 &&
        service.mealType === MealType.BREAKFAST
      )
        continue;

      // Set capacity based on meal type
      let totalSeats = 100; // Default capacity

      // Lower capacity for HIGH_TEA since it's a specialized service
      if (service.mealType === MealType.HIGH_TEA) {
        totalSeats = 50;
      } else if (service.mealType === MealType.DINNER) {
        totalSeats = 120; // Higher capacity for dinner
      } else if (service.mealType === MealType.LUNCH) {
        totalSeats = 100; // Standard capacity for lunch
      }

      // Calculate booked seats (more bookings for HIGH_TEA to show popularity)
      const bookedSeats = service.mealType === MealType.HIGH_TEA
        ? Math.floor(Math.random() * 20) + 15 // 15-35 bookings for high tea
        : Math.floor(Math.random() * 30); // 0-29 bookings for other meals

      // Check if this date is in special closures to set isEnabled appropriately
      const isSpecialClosureDate = (date.getDate() === 15 && date.getMonth() === 10) || // Nov 15
                                   (date.getDate() === 25 && date.getMonth() === 11) || // Dec 25
                                   (date.getDate() === 1 && date.getMonth() === 0);     // Jan 1

      capacityRecords.push({
        restaurantId: service.restaurantId,
        serviceId: service.id,
        date,
        totalSeats,
        bookedSeats,
        isEnabled: !isSpecialClosureDate, // Disable on special closure dates
      });
    }
  }

  return capacityRecords;
};

    // Create special closures for maintenance or holidays
    const specialClosures = [
        // Ministry of Crab - Christmas Day
        {
            restaurantId: ministryOfCrab.id,
            closureStart: new Date('2025-12-25T00:00:00.000Z'),
            closureEnd: new Date('2025-12-25T23:59:59.999Z'),
            closureType: 'Holiday',
            description: 'Closed for Christmas Day',
            createdAt: new Date(),
            createdBy: 'System',
        },
        // Nihonbashi - New Year's Day
        {
            restaurantId: nihonbashi.id,
            closureStart: new Date('2026-01-01T00:00:00.000Z'),
            closureEnd: new Date('2026-01-01T23:59:59.999Z'),
            closureType: 'Holiday',
            description: 'Closed for New Year\'s Day',
            createdAt: new Date(),
            createdBy: 'System',
        },
        // All restaurants - November 15th for test case
        {
            restaurantId: ministryOfCrab.id,
            closureStart: new Date('2025-11-15T00:00:00.000Z'),
            closureEnd: new Date('2025-11-15T23:59:59.999Z'),
            closureType: 'Maintenance',
            description: 'Closed for maintenance',
            createdAt: new Date(),
            createdBy: 'System',
        },
        {
            restaurantId: nihonbashi.id,
            closureStart: new Date('2025-11-15T00:00:00.000Z'),
            closureEnd: new Date('2025-11-15T23:59:59.999Z'),
            closureType: 'Maintenance',
            description: 'Closed for maintenance',
            createdAt: new Date(),
            createdBy: 'System',
        },
        {
            restaurantId: kaemasutra.id,
            closureStart: new Date('2025-11-15T00:00:00.000Z'),
            closureEnd: new Date('2025-11-15T23:59:59.999Z'),
            closureType: 'Maintenance',
            description: 'Closed for maintenance',
            createdAt: new Date(),
            createdBy: 'System',
        },
        {
            restaurantId: rajaBojun.id,
            closureStart: new Date('2025-11-15T00:00:00.000Z'),
            closureEnd: new Date('2025-11-15T23:59:59.999Z'),
            closureType: 'Maintenance',
            description: 'Closed for maintenance',
            createdAt: new Date(),
            createdBy: 'System',
        },
    ];

    // Create Restaurant Images
    const restaurantImages = [
        // Ministry of Crab Images
        {
            restaurantId: ministryOfCrab.id,
            imageUrl: `/images/restaurants/${ministryOfCrab.id}/000.png`,
            imageType: 'THUMBNAIL',
            altText: 'Ministry of Crab Restaurant Thumbnail',
            caption: 'Historic Dutch Hospital Complex',
            displayOrder: 0,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: ministryOfCrab.id,
            imageUrl: `/images/restaurants/${ministryOfCrab.id}/001.png`,
            imageType: 'GALLERY',
            altText: 'Ministry of Crab Dining Area',
            caption: 'Elegant dining space with colonial architecture',
            displayOrder: 1,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: ministryOfCrab.id,
            imageUrl: `/images/restaurants/${ministryOfCrab.id}/002.png`,
            imageType: 'GALLERY',
            altText: 'Ministry of Crab Seafood Display',
            caption: 'Fresh seafood selection',
            displayOrder: 2,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: ministryOfCrab.id,
            imageUrl: `/images/restaurants/${ministryOfCrab.id}/003.png`,
            imageType: 'GALLERY',
            altText: 'Ministry of Crab Outdoor Seating',
            caption: 'Al fresco dining experience',
            displayOrder: 3,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        // Kaema Sutra Images
        {
            restaurantId: kaemasutra.id,
            imageUrl: `/images/restaurants/${kaemasutra.id}/000.png`,
            imageType: 'THUMBNAIL',
            altText: 'Kaema Sutra Restaurant Thumbnail',
            caption: 'Modern Sri Lankan dining at Shangri-La',
            displayOrder: 0,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: kaemasutra.id,
            imageUrl: `/images/restaurants/${kaemasutra.id}/001.png`,
            imageType: 'GALLERY',
            altText: 'Kaema Sutra Bar Area',
            caption: 'Contemporary bar with ocean views',
            displayOrder: 1,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: kaemasutra.id,
            imageUrl: `/images/restaurants/${kaemasutra.id}/002.png`,
            imageType: 'GALLERY',
            altText: 'Kaema Sutra Dining Room',
            caption: 'Elegant dining space',
            displayOrder: 2,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: kaemasutra.id,
            imageUrl: `/images/restaurants/${kaemasutra.id}/003.png`,
            imageType: 'GALLERY',
            altText: 'Kaema Sutra Kitchen View',
            caption: 'Open kitchen concept',
            displayOrder: 3,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        // Nihonbashi Images
        {
            restaurantId: nihonbashi.id,
            imageUrl: `/images/restaurants/${nihonbashi.id}/000.png`,
            imageType: 'THUMBNAIL',
            altText: 'Nihonbashi Restaurant Thumbnail',
            caption: 'Japanese architectural elements',
            displayOrder: 0,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: nihonbashi.id,
            imageUrl: `/images/restaurants/${nihonbashi.id}/001.png`,
            imageType: 'GALLERY',
            altText: 'Nihonbashi Sushi Counter',
            caption: 'Traditional sushi preparation area',
            displayOrder: 1,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: nihonbashi.id,
            imageUrl: `/images/restaurants/${nihonbashi.id}/002.png`,
            imageType: 'GALLERY',
            altText: 'Nihonbashi Private Dining',
            caption: 'Private dining room',
            displayOrder: 2,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: nihonbashi.id,
            imageUrl: `/images/restaurants/${nihonbashi.id}/003.png`,
            imageType: 'GALLERY',
            altText: 'Nihonbashi Garden View',
            caption: 'Serene garden setting',
            displayOrder: 3,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        // Raja Bojun Images
        {
            restaurantId: rajaBojun.id,
            imageUrl: `/images/restaurants/${rajaBojun.id}/000.png`,
            imageType: 'THUMBNAIL',
            altText: 'Raja Bojun Restaurant Thumbnail',
            caption: 'Traditional Sri Lankan architecture',
            displayOrder: 0,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: rajaBojun.id,
            imageUrl: `/images/restaurants/${rajaBojun.id}/001.png`,
            imageType: 'GALLERY',
            altText: 'Raja Bojun Buffet Setup',
            caption: 'Extensive Sri Lankan buffet spread',
            displayOrder: 1,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: rajaBojun.id,
            imageUrl: `/images/restaurants/${rajaBojun.id}/002.png`,
            imageType: 'GALLERY',
            altText: 'Raja Bojun Curry Station',
            caption: 'Traditional curry preparation',
            displayOrder: 2,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: rajaBojun.id,
            imageUrl: `/images/restaurants/${rajaBojun.id}/003.png`,
            imageType: 'GALLERY',
            altText: 'Raja Bojun Outdoor Seating',
            caption: 'Garden dining area',
            displayOrder: 3,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        // The Kingsbury Colombo Images (using fallback images)
        {
            restaurantId: kingsburyColombo.id,
            imageUrl: '/images/restaurants/fallback-restaurants-images/000.png',
            imageType: 'THUMBNAIL',
            altText: 'The Kingsbury Colombo Thumbnail',
            caption: 'Luxury hotel and dining experience',
            displayOrder: 0,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: kingsburyColombo.id,
            imageUrl: '/images/restaurants/fallback-restaurants-images/001.png',
            imageType: 'HERO',
            altText: 'The Kingsbury Colombo Hero Image',
            caption: 'Elegant lobby and dining areas',
            displayOrder: 1,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: kingsburyColombo.id,
            imageUrl: '/images/restaurants/fallback-restaurants-images/002.png',
            imageType: 'GALLERY',
            altText: 'The Kingsbury Colombo Dining',
            caption: 'Fine dining restaurant',
            displayOrder: 2,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: kingsburyColombo.id,
            imageUrl: '/images/restaurants/fallback-restaurants-images/003.png',
            imageType: 'GALLERY',
            altText: 'The Kingsbury Colombo Buffet',
            caption: 'International buffet spread',
            displayOrder: 3,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: kingsburyColombo.id,
            imageUrl: '/images/restaurants/fallback-restaurants-images/004.png',
            imageType: 'GALLERY',
            altText: 'The Kingsbury Colombo Ambience',
            caption: 'Sophisticated dining atmosphere',
            displayOrder: 4,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: kingsburyColombo.id,
            imageUrl: '/images/restaurants/fallback-restaurants-images/005.png',
            imageType: 'GALLERY',
            altText: 'The Kingsbury Colombo Pool',
            caption: 'Poolside dining area',
            displayOrder: 5,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        }
    ];

    // Create images and set thumbnail for each restaurant
    for (const restaurant of restaurants) {
        const restaurantImageData = restaurantImages.filter(img => img.restaurantId === restaurant.id);

        for (const imageData of restaurantImageData) {
            await prisma.restaurantImage.create({
                data: imageData
            });
        }

        // Set first image as thumbnail
        const firstImage = await prisma.restaurantImage.findFirst({
            where: { restaurantId: restaurant.id }
        });

        if (firstImage) {
            await prisma.restaurant.update({
                where: { id: restaurant.id },
                data: { thumbnailImageId: firstImage.id }
            });
        }
    }

    // Create images for table reservation restaurants (IDs 5 & 6)
    const tableReservationRestaurantImages = [
        // TableTime Bistro (ID: 5) Images
        {
            restaurantId: tableOnlyRestaurant.id,
            imageUrl: `/images/restaurants/${tableOnlyRestaurant.id}/000.png`,
            imageType: 'THUMBNAIL',
            altText: 'TableTime Bistro Restaurant Thumbnail',
            caption: 'Modern casual bistro setting',
            displayOrder: 0,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: tableOnlyRestaurant.id,
            imageUrl: `/images/restaurants/${tableOnlyRestaurant.id}/001.png`,
            imageType: 'GALLERY',
            altText: 'TableTime Bistro Main Dining Area',
            caption: 'Spacious dining room with contemporary decor',
            displayOrder: 1,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: tableOnlyRestaurant.id,
            imageUrl: `/images/restaurants/${tableOnlyRestaurant.id}/002.png`,
            imageType: 'GALLERY',
            altText: 'TableTime Bistro Bar Area',
            caption: 'Cozy bar with craft cocktails',
            displayOrder: 2,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: tableOnlyRestaurant.id,
            imageUrl: `/images/restaurants/${tableOnlyRestaurant.id}/003.png`,
            imageType: 'GALLERY',
            altText: 'TableTime Bistro Outdoor Seating',
            caption: 'Al fresco dining experience',
            displayOrder: 3,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        // Fusion Dine & Table (ID: 6) Images
        {
            restaurantId: bothSupportRestaurant.id,
            imageUrl: `/images/restaurants/${bothSupportRestaurant.id}/000.png`,
            imageType: 'THUMBNAIL',
            altText: 'Fusion Dine & Table Restaurant Thumbnail',
            caption: 'Elegant fusion dining concept',
            displayOrder: 0,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: bothSupportRestaurant.id,
            imageUrl: `/images/restaurants/${bothSupportRestaurant.id}/001.png`,
            imageType: 'GALLERY',
            altText: 'Fusion Dine & Table Main Hall',
            caption: 'Sophisticated dining hall with buffet and table service',
            displayOrder: 1,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: bothSupportRestaurant.id,
            imageUrl: `/images/restaurants/${bothSupportRestaurant.id}/002.png`,
            imageType: 'GALLERY',
            altText: 'Fusion Dine & Table Buffet Station',
            caption: 'Extensive international buffet selection',
            displayOrder: 2,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: bothSupportRestaurant.id,
            imageUrl: `/images/restaurants/${bothSupportRestaurant.id}/003.png`,
            imageType: 'GALLERY',
            altText: 'Fusion Dine & Table Private Dining',
            caption: 'Exclusive private dining rooms',
            displayOrder: 3,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        }
    ];

    // Create images and set thumbnail for table reservation restaurants
    for (const restaurant of tableReservationRestaurants) {
        const restaurantImageData = tableReservationRestaurantImages.filter(img => img.restaurantId === restaurant.id);

        for (const imageData of restaurantImageData) {
            await prisma.restaurantImage.create({
                data: imageData
            });
        }

        // Set first image as thumbnail
        const firstImage = await prisma.restaurantImage.findFirst({
            where: { restaurantId: restaurant.id }
        });

        if (firstImage) {
            await prisma.restaurant.update({
                where: { id: restaurant.id },
                data: { thumbnailImageId: firstImage.id }
            });
        }
    }

        // Create operating hours
        await prisma.restaurantOperatingHours.createMany({
            data: operatingHours,
            skipDuplicates: true,
        });

        // Create meal services
        await prisma.restaurantMealService.createMany({
            data: mealServices,
            skipDuplicates: true,
        });

        // Create capacity records
        const capacityRecords = await generateCapacityRecords(prisma, restaurantIds);
        await prisma.restaurantCapacity.createMany({
            data: capacityRecords,
            skipDuplicates: true,
        });

        // Create special closures
        await prisma.restaurantSpecialClosure.createMany({
            data: specialClosures,
            skipDuplicates: true,
        });

    // Fetch existing cuisines and restaurants
    const cuisines_db = await prisma.cuisine.findMany();
    const restaurants_db = await prisma.restaurant.findMany();

    // Map cuisine names to their IDs for easy reference
    const cuisineMap = new Map();
    for (const cuisine of cuisines_db) {
        cuisineMap.set(cuisine.cuisineName, cuisine.id);
    }

    // Associate cuisines with restaurants
    await prisma.restaurantCuisine.createMany({
        data: [
            // Ministry of Crab - Sri Lankan and Seafood
            {
                restaurantId: ministryOfCrab.id,
                cuisineId: cuisineMap.get('Sri Lankan')!,
            },
            {
                restaurantId: ministryOfCrab.id,
                cuisineId: cuisineMap.get('Seafood')!,
            },
            // Kaema Sutra - Sri Lankan and Indian
            {
                restaurantId: kaemasutra.id,
                cuisineId: cuisineMap.get('Sri Lankan')!,
            },
            {
                restaurantId: kaemasutra.id,
                cuisineId: cuisineMap.get('Indian')!,
            },
            // Raja Bojun - Sri Lankan and Buffet
            {
                restaurantId: rajaBojun.id,
                cuisineId: cuisineMap.get('Sri Lankan')!,
            },
            // The Kingsbury Colombo - International
            {
                restaurantId: kingsburyColombo.id,
                cuisineId: cuisineMap.get('International')!,
            },
        ],
    });

    // Create another Business
    const savoyBusiness = await prisma.business.create({
        data: {
            name: 'The Savoy',
            address: 'The Strand, London WC2R 0EZ, United Kingdom',
            phone: '+442074836000',
            email: 'info@thesavoy.com',
            website: 'www.thesavoy.com',
            taxId: 'TAX654321',
            registrationNumber: 'REG210987'
        }
    })

    // Create Restaurants for "The Savoy"
    const gordonRamsaySavoyGrill = await prisma.restaurant.create({
        data: {
            businessId: savoyBusiness.id,
            name: 'Gordon Ramsay\'s Savoy Grill',
            locationId: colomboLocation.id, // Update with the correct location ID
            address: 'The Savoy, The Strand, London WC2R 0EZ',
            phone: '+442074836000',
            description: 'Classic British and French cuisine in an elegant setting',
            capacity: 100,
            onlineQuota: 70,
            advancePaymentPercentage: 50,
            reservationSupport: ReservationSupportType.BUFFET_ONLY // Buffet only
        }
    })

    const daviesAndBrook = await prisma.restaurant.create({
        data: {
            businessId: savoyBusiness.id,
            name: 'Davies and Brook',
            locationId: colomboLocation.id, // Update with the correct location ID
            address: 'The Savoy, The Strand, London WC2R 0EZ',
            phone: '+442074836000',
            description: 'Modern European cuisine with a focus on seasonal ingredients',
            capacity: 80,
            onlineQuota: 60,
            advancePaymentPercentage: 45,
            reservationSupport: ReservationSupportType.BUFFET_ONLY // Buffet only
        }
    })

    // Add Service Areas for Savoy restaurants
    const savoyRestaurants = [gordonRamsaySavoyGrill, daviesAndBrook];

    // Now create service areas for all restaurants to ensure one-to-one relationship with cities
    const allRestaurants = [...restaurants, ...tableReservationRestaurants, ...savoyRestaurants];

    // Make sure we have enough cities for all restaurants
    if (cities_db.length < allRestaurants.length) {
        console.warn(`Warning: You have ${allRestaurants.length} restaurants but only ${cities_db.length} cities. Some cities will have multiple service areas.`);
    }

    // Create exactly one service area for each restaurant-city pair
    // Use a Set to track which cities have been assigned
    const assignedCityIds = new Set();

    for (let i = 0; i < allRestaurants.length; i++) {
        const restaurant = allRestaurants[i];
        let cityIndex = i % cities_db.length;
        let city = cities_db[cityIndex];

        // Find an unassigned city if this one is already taken
        while (assignedCityIds.has(city.id) && assignedCityIds.size < cities_db.length) {
            cityIndex = (cityIndex + 1) % cities_db.length;
            city = cities_db[cityIndex];
        }

        // Add this city to the assigned set
        assignedCityIds.add(city.id);

        await prisma.restaurantServiceArea.create({
            data: {
                restaurantId: restaurant.id,
                cityId: city.id,
                deliveryRadiusKm: 5.0,
                estimatedDeliveryTimeMin: 45,
                isActive: true,
                createdBy: 'SYSTEM',
                updatedBy: 'SYSTEM'
            }
        });
    }

    // Add Restaurant Images for Savoy restaurants
    const savoyRestaurantImages = [
        // Gordon Ramsay's Savoy Grill Images
        {
            restaurantId: gordonRamsaySavoyGrill.id,
            imageUrl: `/images/restaurants/${gordonRamsaySavoyGrill.id}/000.png`,
            imageType: 'THUMBNAIL',
            altText: 'Gordon Ramsay Savoy Grill Thumbnail',
            caption: 'Iconic Art Deco dining room',
            displayOrder: 0,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: gordonRamsaySavoyGrill.id,
            imageUrl: `/images/restaurants/${gordonRamsaySavoyGrill.id}/001.png`,
            imageType: 'GALLERY',
            altText: 'Savoy Grill Interior',
            caption: 'Elegant dining space with classic decor',
            displayOrder: 1,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: gordonRamsaySavoyGrill.id,
            imageUrl: `/images/restaurants/${gordonRamsaySavoyGrill.id}/002.png`,
            imageType: 'GALLERY',
            altText: 'Savoy Grill Wine Cellar',
            caption: 'Extensive wine collection',
            displayOrder: 2,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: gordonRamsaySavoyGrill.id,
            imageUrl: `/images/restaurants/${gordonRamsaySavoyGrill.id}/003.png`,
            imageType: 'GALLERY',
            altText: 'Savoy Grill Private Dining',
            caption: 'Exclusive private dining room',
            displayOrder: 3,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        // Davies and Brook Images
        {
            restaurantId: daviesAndBrook.id,
            imageUrl: `/images/restaurants/${daviesAndBrook.id}/000.png`,
            imageType: 'THUMBNAIL',
            altText: 'Davies and Brook Restaurant Thumbnail',
            caption: 'Contemporary fine dining space',
            displayOrder: 0,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: daviesAndBrook.id,
            imageUrl: `/images/restaurants/${daviesAndBrook.id}/001.png`,
            imageType: 'GALLERY',
            altText: 'Davies and Brook Dining Area',
            caption: 'Modern sophisticated interior',
            displayOrder: 1,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: daviesAndBrook.id,
            imageUrl: `/images/restaurants/${daviesAndBrook.id}/002.png`,
            imageType: 'GALLERY',
            altText: 'Davies and Brook Chef\'s Table',
            caption: 'Interactive chef\'s table experience',
            displayOrder: 2,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        },
        {
            restaurantId: daviesAndBrook.id,
            imageUrl: `/images/restaurants/${daviesAndBrook.id}/003.png`,
            imageType: 'GALLERY',
            altText: 'Davies and Brook Terrace',
            caption: 'Seasonal outdoor dining',
            displayOrder: 3,
            uploadedBy: 'SYSTEM',
            lastModifiedBy: 'SYSTEM'
        }
    ];

    // Create images and set thumbnail for Savoy restaurants
    for (const restaurant of savoyRestaurants) {
        const restaurantImageData = savoyRestaurantImages.filter(img => img.restaurantId === restaurant.id);

        for (const imageData of restaurantImageData) {
            await prisma.restaurantImage.create({
                data: imageData
            });
        }

        // Set first image as thumbnail
        const firstImage = await prisma.restaurantImage.findFirst({
            where: { restaurantId: restaurant.id }
        });

        if (firstImage) {
            await prisma.restaurant.update({
                where: { id: restaurant.id },
                data: { thumbnailImageId: firstImage.id }
            });
        }
    }



    // Add Operating Hours for Savoy restaurants
    const savoyOperatingHours = savoyRestaurants.flatMap(restaurant =>
        Object.values(DayOfWeek).map(dayOfWeek => ({
            restaurantId: restaurant.id,
            dayOfWeek,
            isOpen: true,
            capacity: 120,
            onlineQuota: 90,
            openingTime: new Date('2025-01-01T11:30:00.000Z'), // Opens for lunch
            closingTime: new Date('2025-01-01T23:00:00.000Z'), // Closes late
        }))
    );

    // Add Meal Services for Savoy restaurants
    const savoyMealServices = savoyRestaurants.flatMap(restaurant => [
        {
            restaurantId: restaurant.id,
            mealType: MealType.LUNCH,
            isAvailable: true,
            isChildEnabled: false,
            adultNetPrice: 89.99,
            childNetPrice: 44.99,
            adultGrossPrice: calculateNetPrice(89.99, 12.50, 8.00),
            childGrossPrice: calculateNetPrice(44.99, 12.50, 8.00),
            childAgeLimit: 12,
            serviceChargePercentage: 12.50,
            taxPercentage: 8.00,
            priceUpdatedAt: new Date(),
            serviceStartTime: new Date('2025-01-01T11:30:00.000Z'),
            serviceEndTime: new Date('2025-01-01T14:30:00.000Z'),
        },
        {
            restaurantId: restaurant.id,
            mealType: MealType.DINNER,
            isAvailable: true,
            isChildEnabled: true,
            adultNetPrice: 129.99,
            childNetPrice: 64.99,
            adultGrossPrice: calculateNetPrice(129.99, 12.50, 8.00),
            childGrossPrice: calculateNetPrice(64.99, 12.50, 8.00),
            childAgeLimit: 12,
            serviceChargePercentage: 12.50,
            taxPercentage: 8.00,
            priceUpdatedAt: new Date(),
            serviceStartTime: new Date('2025-01-01T18:00:00.000Z'),
            serviceEndTime: new Date('2025-01-01T22:30:00.000Z'),
        }
    ]);

    // Create operating hours for Savoy restaurants
    await prisma.restaurantOperatingHours.createMany({
        data: savoyOperatingHours,
        skipDuplicates: true,
    });

    // Create meal services for Savoy restaurants
    await prisma.restaurantMealService.createMany({
        data: savoyMealServices,
        skipDuplicates: true,
    });

    // Create restaurant platters based on planning documents
    console.log('Creating restaurant platters...');

    // Get only SPECIAL meal services to create platters for
    const specialMealServicesForPlatters = await prisma.restaurantMealService.findMany({
        where: {
            mealType: MealType.SPECIAL
        },
        include: {
            restaurant: true
        }
    });

    let plattersCreated = 0;

    for (const mealService of specialMealServicesForPlatters) {
        // Create platter options only for SPECIAL meal type
        const plattersToCreate = [
            {
                platterName: "Special Experience",
                platterDescription: "Exclusive special dining experience",
                headCount: 2,
                adultGrossPrice: mealService.adultGrossPrice,
                childGrossPrice: mealService.childGrossPrice,
                adultNetPrice: mealService.adultNetPrice,
                childNetPrice: mealService.childNetPrice,
                displayOrder: 1,
                isDefault: true,
                features: ["Chef's special", "Unique menu", "Limited availability"]
            },
            {
                platterName: "Premium Special",
                platterDescription: "Enhanced special dining with premium selections",
                headCount: 4,
                adultGrossPrice: new Decimal(mealService.adultGrossPrice.toNumber() * 1.15), // 15% premium
                childGrossPrice: new Decimal(mealService.childGrossPrice.toNumber() * 1.15),
                adultNetPrice: new Decimal(mealService.adultNetPrice.toNumber() * 1.15),
                childNetPrice: new Decimal(mealService.childNetPrice.toNumber() * 1.15),
                displayOrder: 2,
                isDefault: false,
                features: ["Premium ingredients", "Wine pairing", "Private dining area", "Personalized service"]
            },
            {
                platterName: "Group Special",
                platterDescription: "Special celebration package for larger groups",
                headCount: 8,
                adultGrossPrice: new Decimal(mealService.adultGrossPrice.toNumber() * 0.90), // 10% group discount
                childGrossPrice: new Decimal(mealService.childGrossPrice.toNumber() * 0.90),
                adultNetPrice: new Decimal(mealService.adultNetPrice.toNumber() * 0.90),
                childNetPrice: new Decimal(mealService.childNetPrice.toNumber() * 0.90),
                displayOrder: 3,
                isDefault: false,
                features: ["Group celebration", "Extended seating", "Special arrangements", "Group photo opportunity"]
            }
        ];

        // Create platters for this special meal service
        for (const platterData of plattersToCreate) {
            await prisma.restaurantPlatter.create({
                data: {
                    restaurantId: mealService.restaurantId,
                    mealServiceId: mealService.id,
                    platterName: platterData.platterName,
                    platterDescription: platterData.platterDescription,
                    headCount: platterData.headCount,
                    adultGrossPrice: platterData.adultGrossPrice,
                    childGrossPrice: platterData.childGrossPrice,
                    adultNetPrice: platterData.adultNetPrice,
                    childNetPrice: platterData.childNetPrice,
                    displayOrder: platterData.displayOrder,
                    isDefault: platterData.isDefault,
                    features: platterData.features,
                    images: [], // Empty array for now, can be populated later
                    createdBy: 'SYSTEM',
                    updatedBy: 'SYSTEM'
                }
            });
            plattersCreated++;
        }
    }

    console.log(`Created ${plattersCreated} restaurant platters for SPECIAL meal services only`);

    // NOTE: Meal service schedules will be created AFTER all meal services are created
    // This is moved to after seedKingsburyCapacity() to ensure all meal services exist

    // Associate cuisines with Savoy restaurants
    await prisma.restaurantCuisine.createMany({
        data: [
            // Gordon Ramsay's Savoy Grill - French and Seafood
            {
                restaurantId: gordonRamsaySavoyGrill.id,
                cuisineId: cuisineMap.get('Seafood')!
            },
            // Davies and Brook - Italian and Japanese fusion
            {
                restaurantId: daviesAndBrook.id,
                cuisineId: cuisineMap.get('Italian')!
            },
            {
                restaurantId: daviesAndBrook.id,
                cuisineId: cuisineMap.get('Japanese')!
            },
        ],
    });



    // Generate capacity records for Savoy restaurants
    const savoyRestaurantIds = savoyRestaurants.map(restaurant => restaurant.id);
    const savoyCapacityRecords = await generateCapacityRecords(prisma, savoyRestaurantIds);
    await prisma.restaurantCapacity.createMany({
        data: savoyCapacityRecords,
        skipDuplicates: true,
    });

    // Add special closures for Savoy restaurants
    const savoySpecialClosures = savoyRestaurants.map(restaurant => ({
        restaurantId: restaurant.id,
        closureStart: new Date('2025-12-25T00:00:00.000Z'),
        closureEnd: new Date('2025-12-25T23:59:59.999Z'),
        closureType: 'HOLIDAY',
        description: 'Christmas Day Closure',
        createdAt: new Date(),
        createdBy: 'SYSTEM',
    }));

    await prisma.restaurantSpecialClosure.createMany({
        data: savoySpecialClosures,
        skipDuplicates: true,
    });

    // Create reviews and capacity for The Kingsbury Colombo (Restaurant ID 7)
    console.log('\n=== CREATING KINGSBURY COLOMBO DATA ===');
    await createKingsburyReviews(prisma);
    await seedKingsburyCapacity(prisma);

    // Create reviews for all internal restaurants
    console.log('\n=== CREATING INTERNAL RESTAURANT REVIEWS ===');
    await createInternalRestaurantReviews(prisma);

    // NOW create meal service schedules with different availability patterns
    // This must happen AFTER all meal services are created (including Kingsbury's)
    console.log('\n=== CREATING MEAL SERVICE SCHEDULES ===');
    console.log('Creating meal service schedules...');

    // Get all meal services (including Kingsbury's which were just created)
    const allMealServices = await prisma.restaurantMealService.findMany();
    console.log(`Found ${allMealServices.length} meal services to create schedules for`);

    // Create schedules with different availability patterns
    let schedulesCreated = 0;

    for (const mealService of allMealServices) {
        // Different schedule patterns based on meal type and restaurant
        let availableDays: DayOfWeek[] = [];

        // Basic pattern: BREAKFAST only on weekdays for all restaurants
        if (mealService.mealType === MealType.BREAKFAST) {
            availableDays = [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY];
        }
        // LUNCH available all days
        else if (mealService.mealType === MealType.LUNCH) {
            availableDays = [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY];
        }
        // DINNER available all days except Monday for some restaurants
        else if (mealService.mealType === MealType.DINNER) {
            // Ministry of Crab and Nihonbashi closed on Mondays for dinner
            if (mealService.restaurantId === ministryOfCrab.id || mealService.restaurantId === nihonbashi.id) {
                availableDays = [DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY];
            } else {
                availableDays = [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY];
            }
        }
        // HIGH_TEA only on weekends and Fridays
        else if (mealService.mealType === MealType.HIGH_TEA) {
            availableDays = [DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY];
        }
        // SPECIAL only on Saturdays for demonstration
        else if (mealService.mealType === MealType.SPECIAL) {
            availableDays = [DayOfWeek.SATURDAY];
        }

        // Create schedule directly
        await prisma.restaurantMealServiceSchedule.create({
            data: {
                mealServiceId: mealService.id,
                availableDays: availableDays
            }
        });

        schedulesCreated++;
    }

    console.log(`Created ${schedulesCreated} meal service schedules`);

    // Import discovery restaurants
    await importDiscoveryRestaurants(prisma);

    // ------------------------------------------------------
    // Seed platform-level and per-restaurant table reservation configs
    // ------------------------------------------------------

    // Platform default: skip advance payment by default for table reservations
    const platformConfig = await prisma.tableReservationUtilsConfiguration.create({
        data: {
            restaurantId: null,
            feeType: FeeType.FIXED,
            feeValue: 0,
            requiresAdvancePayment: false,
            advancePaymentType: null,
            advancePaymentValue: null,
            defaultSlotMinutes: 90,
            turnoverBufferMinutes: 15,
            enableTemporaryHold: true,
            holdMinutes: 10,
            allowFlexibleAssignment: true,
            isActive: true
        }
    })

    // Table-only restaurant: require advance payment (override)
    const tableOnlyConfig = await prisma.tableReservationUtilsConfiguration.create({
        data: {
            restaurantId: tableOnlyRestaurant.id,
            feeType: FeeType.PERCENTAGE,
            feeValue: 5,
            requiresAdvancePayment: true,
            advancePaymentType: FeeType.PERCENTAGE,
            advancePaymentValue: 30,
            defaultSlotMinutes: 90,
            turnoverBufferMinutes: 15,
            enableTemporaryHold: true,
            holdMinutes: 8,
            allowFlexibleAssignment: true,
            isActive: true
        }
    })

    // BOTH-support restaurant: skip payment (override example)
    const bothSupportConfig = await prisma.tableReservationUtilsConfiguration.create({
        data: {
            restaurantId: bothSupportRestaurant.id,
            feeType: FeeType.FIXED,
            feeValue: 0,
            requiresAdvancePayment: false,
            advancePaymentType: null,
            advancePaymentValue: null,
            defaultSlotMinutes: 120,
            turnoverBufferMinutes: 20,
            enableTemporaryHold: true,
            holdMinutes: 12,
            allowFlexibleAssignment: true,
            isActive: true
        }
    })

    const celebrationConfig = await prisma.tableReservationUtilsConfiguration.create({
        data: {
            restaurantId: policyFeeRestaurant.id,
            feeType: FeeType.FIXED,
            feeValue: 0,
            requiresAdvancePayment: false,
            advancePaymentType: null,
            advancePaymentValue: null,
            defaultSlotMinutes: 90,
            turnoverBufferMinutes: 15,
            enableTemporaryHold: true,
            holdMinutes: 10,
            allowFlexibleAssignment: true,
            isActive: true
        }
    })

    // ------------------------------------------------------
    // Seed table slot generation configs
    // ------------------------------------------------------

    // Platform default slot generation config
    await prisma.tableSlotGenerationConfig.create({
        data: {
            tableReservationConfigId: platformConfig.id,
            isActive: true,
            startTime: new Date('2025-01-01T18:00:00.000Z'), // 6:00 PM start time
            slotDurationMinutes: 90,
            turnoverBufferMinutes: 15,
            advanceBookingDays: 30,
            enabledDays: [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY],
            createdBy: 'SYSTEM',
            updatedBy: 'SYSTEM'
        }
    })

    // Table-only restaurant slot generation config
    await prisma.tableSlotGenerationConfig.create({
        data: {
            tableReservationConfigId: tableOnlyConfig.id,
            isActive: true,
            startTime: new Date('2025-01-01T17:00:00.000Z'), // 5:00 PM start time (earlier for table-only)
            slotDurationMinutes: 90,
            turnoverBufferMinutes: 15,
            advanceBookingDays: 60, // Longer advance booking for table-only
            enabledDays: [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY],
            createdBy: 'SYSTEM',
            updatedBy: 'SYSTEM'
        }
    })

    // Both-support restaurant slot generation config
    await prisma.tableSlotGenerationConfig.create({
        data: {
            tableReservationConfigId: bothSupportConfig.id,
            isActive: true,
            startTime: new Date('2025-01-01T18:30:00.000Z'), // 6:30 PM start time
            slotDurationMinutes: 120, // Longer slots for both-support
            turnoverBufferMinutes: 20,
            advanceBookingDays: 45,
            enabledDays: [DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY], // Closed Mondays
            createdBy: 'SYSTEM',
            updatedBy: 'SYSTEM'
        }
    })

    await prisma.tableSlotGenerationConfig.create({
        data: {
            tableReservationConfigId: celebrationConfig.id,
            isActive: true,
            startTime: new Date('2025-01-01T17:30:00.000Z'),
            slotDurationMinutes: 90,
            turnoverBufferMinutes: 20,
            advanceBookingDays: 45,
            enabledDays: [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY],
            createdBy: 'SYSTEM',
            updatedBy: 'SYSTEM'
        }
    })

    // ------------------------------------------------------
    // Celebration Table Lounge Reservation Policies
    // ------------------------------------------------------
    console.log('\n=== Creating table reservation policies for Celebration Table Lounge ===');

    const celebrationDamageDepositPolicy = await prisma.reservationBusinessPolicy.create({
        data: {
            restaurantId: policyFeeRestaurant.id,
            name: 'celebration_damage_deposit',
            title: 'Event Damage Deposit',
            content: 'A refundable damage deposit is collected for celebration setups. This amount covers potential damages to decor, furniture, or special equipment and will be refunded after the event if no damages are reported.',
            requiresPayment: true,
            paymentType: FeeType.FIXED,
            paymentValue: new Decimal(5000),
            paymentHandledByOptions: false,
            isActive: true,
            isVisibleCustomerPortal: true,
            isIncludedConfirmationEmail: true,
            isOptional: false,
            partySizeMin: 4,
            applicableReservationTypes: { set: [ReservationType.TABLE_ONLY] },
            applicableDays: { set: [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY] },
            priority: 1,
            createdBy: 'SYSTEM',
            updatedBy: 'SYSTEM'
        }
    });

    const celebrationPackagePolicy = await prisma.reservationBusinessPolicy.create({
        data: {
            restaurantId: policyFeeRestaurant.id,
            name: 'celebration_package_selection',
            title: 'Celebration Package Selection',
            content: 'Select a celebration package to tailor your experience. Premium options include themed decor, music coordination, and extended table time.',
            requiresPayment: false,
            paymentHandledByOptions: true,
            userSelectionAllowed: true,
            isActive: true,
            isVisibleCustomerPortal: true,
            isIncludedConfirmationEmail: true,
            isOptional: false,
            partySizeMin: 2,
            applicableReservationTypes: { set: [ReservationType.TABLE_ONLY] },
            applicableDays: { set: [DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY] },
            priority: 2,
            createdBy: 'SYSTEM',
            updatedBy: 'SYSTEM'
        }
    });

    await prisma.reservationPolicyOption.createMany({
        data: [
            {
                policyId: celebrationPackagePolicy.id,
                optionName: 'Standard Celebration',
                description: 'Complimentary standard setup with table linen and ambient lighting.',
                additionalPrice: new Decimal(0),
                additionalPriceType: FeeType.FIXED,
                requiresPayment: false,
                isDefault: true,
                displayOrder: 0,
                applicableDays: [DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY]
            },
            {
                policyId: celebrationPackagePolicy.id,
                optionName: 'Premium Celebration',
                description: 'Includes premium decor, themed centerpiece, and celebration cake display.',
                additionalPrice: new Decimal(3500),
                additionalPriceType: FeeType.FIXED,
                requiresPayment: true,
                isDefault: false,
                displayOrder: 1,
                applicableDays: [DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY]
            },
            {
                policyId: celebrationPackagePolicy.id,
                optionName: 'Signature Celebration',
                description: 'All premium benefits plus live music coordination and extended table time.',
                additionalPrice: new Decimal(5500),
                additionalPriceType: FeeType.FIXED,
                requiresPayment: true,
                isDefault: false,
                displayOrder: 2,
                applicableDays: [DayOfWeek.FRIDAY, DayOfWeek.SATURDAY]
            }
        ]
    });

    const celebrationCorkagePolicy = await prisma.reservationBusinessPolicy.create({
        data: {
            restaurantId: policyFeeRestaurant.id,
            name: 'celebration_beverage_policy',
            title: 'Bring Your Own Beverage',
            content: 'If you wish to bring your own beverages, a corkage fee applies per bottle opened by our staff.',
            requiresPayment: true,
            paymentType: FeeType.FIXED,
            paymentValue: new Decimal(1500),
            paymentHandledByOptions: false,
            isActive: true,
            isVisibleCustomerPortal: true,
            isIncludedConfirmationEmail: true,
            isOptional: true,
            skipText: 'We will use in-house beverages',
            applicableReservationTypes: { set: [ReservationType.TABLE_ONLY] },
            applicableDays: { set: [DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY] },
            priority: 3,
            createdBy: 'SYSTEM',
            updatedBy: 'SYSTEM'
        }
    });



    // ------------------------------------------------------
    // Enhanced Table Configuration Helper
    // ------------------------------------------------------

    // Helper function to create sample layout JSON data for testing
    function createSampleLayoutJson(
        restaurantId: number,
        restaurantName: string,
        sections: any[],
        tables: any[]
    ) {
        return {
            metadata: {
                version: "1.0.0",
                restaurantId: restaurantId,
                restaurantName: restaurantName,
                lastModified: new Date().toISOString(),
                createdBy: "SYSTEM",
                totalSections: sections.length,
                totalTables: tables.length
            },
            canvas: {
                width: 1200,
                height: 800,
                backgroundColor: "#ffffff",
                gridSize: 20,
                snapToGrid: true
            },
            sections: sections.map((section, index) => ({
                id: section.id,
                sectionName: section.sectionName,
                description: section.description,
                displayOrder: section.displayOrder || index + 1,
                capacity: section.capacity || 0,
                isActive: section.isActive !== false,
                canvasWidth: section.canvasWidth || 800,
                canvasHeight: section.canvasHeight || 600,
                floorPlanImage: section.floorPlanImage,
                isCanvasEnabled: section.isCanvasEnabled !== false,
                canvasData: section.canvasData,
                color: section.sectionColor || "#666666",
                opacity: 0.8,
                visible: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            })),
            tables: tables.map((table, index) => ({
                id: table.id,
                restaurantId: restaurantId,
                sectionId: table.sectionId,
                tableName: table.tableName,
                seatingCapacity: table.seatingCapacity,
                tableType: table.tableType || "RECTANGLE",
                isActive: table.isActive !== false,
                fabricObjectId: table.fabricObjectId || `table-${table.tableName.toLowerCase()}-${Date.now()}`,
                position: table.position,
                canvasProperties: table.canvasProperties,
                amenities: table.amenities,
                isDraggable: table.isDraggable !== false,
                isResizable: table.isResizable !== false,
                isSelected: false,
                isHovered: false,
                isReserved: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            })),
            settings: {
                allowDrag: true,
                allowResize: true,
                showGrid: true,
                showLabels: true,
                autoSave: true,
                snapToGrid: true
            }
        };
    }

    // Helper function to create enhanced table configuration with all type mapping properties
    function createEnhancedTableConfig(
        tableName: string,
        seatingCapacity: number,
        tableType: string,
        x: number,
        y: number,
        width: number,
        height: number,
        fillColor: string,
        strokeColor: string,
        amenities: Record<string, any>,
        options: {
            hasShadow?: boolean;
            strokeWidth?: number;
            cornerStyle?: 'circle' | 'rect';
            cornerColor?: string;
            cornerSize?: number;
            transparentCorners?: boolean;
            borderColor?: string;
            borderScaleFactor?: number;
            isDraggable?: boolean;
            isResizable?: boolean;
            angle?: number;
        } = {}
    ) {
        return {
            tableName,
            seatingCapacity,
            tableType,
            x,
            y,
            width,
            height,
            fillColor,
            strokeColor,
            amenities,
            // Enhanced properties with defaults for flat design
            hasShadow: options.hasShadow || false, // Flat design - no shadows
            strokeWidth: options.strokeWidth || 2,
            cornerStyle: options.cornerStyle || 'circle',
            cornerColor: options.cornerColor || '#3B82F6',
            cornerSize: options.cornerSize || 8,
            transparentCorners: options.transparentCorners || false,
            borderColor: options.borderColor || '#3B82F6',
            borderScaleFactor: options.borderScaleFactor || 2,
            isDraggable: options.isDraggable !== undefined ? options.isDraggable : true,
            isResizable: options.isResizable !== undefined ? options.isResizable : true,
            angle: options.angle || 0
        };
    }

    // ------------------------------------------------------
    // Table Reservation Test Setup for Restaurant 5 (TableTime Bistro)
    // ------------------------------------------------------
    console.log('Setting up table reservation data for Restaurant 5 (TableTime Bistro)...');

    // Create Terrace section for Restaurant 5
    const terraceSection = await createRestaurantSection(
        prisma,
        tableOnlyRestaurant.id,
            {
                sectionName: 'Terrace',
            description: 'Outdoor terrace seating with natural lighting',
            displayOrder: 1,
            capacity: 52, // Total capacity: 4×6 + 2×6 + 4×4 = 24 + 12 + 16 = 52
                canvasWidth: 900,
                canvasHeight: 600,
            floorPlanImage: '', // No background image for now
            sectionColor: '#228B22' // Green for terrace
        }
    );

    console.log(`Created Terrace section (ID: ${terraceSection.id}) for Restaurant 5`);

    // Define table configurations based on detailed image analysis
    const terraceTables = [
        // Left Column - All 6-pax RECTANGULAR tables (T10, T9, T8, T7)
        // Increased table dimensions by 20px each
        {
            tableName: 'T10',
            seatingCapacity: 6,
            tableType: 'RECTANGLE',
            x: 135, // Left column position (15% of 900px canvas)
            y: 70,  // Top position with increased spacing
            width: 140,  // Increased from 120 to 140 (+20px)
            height: 100, // Increased from 80 to 100 (+20px)
            fillColor: '#FFFFFF',
            strokeColor: '#228B22',
            amenities: { hasUmbrella: true, isOutdoor: true }
        },
        {
            tableName: 'T9',
            seatingCapacity: 6,
            tableType: 'RECTANGLE',
            x: 135,
            y: 210, // Increased spacing: 70 + 100 + 40 = 210
            width: 140,  // Increased from 120 to 140 (+20px)
            height: 100, // Increased from 80 to 100 (+20px)
            fillColor: '#FFFFFF',
            strokeColor: '#228B22',
            amenities: { hasUmbrella: true, isOutdoor: true }
        },
        {
            tableName: 'T8',
            seatingCapacity: 6,
            tableType: 'RECTANGLE',
            x: 135,
            y: 350, // Increased spacing: 210 + 100 + 40 = 350
            width: 140,  // Increased from 120 to 140 (+20px)
            height: 100, // Increased from 80 to 100 (+20px)
            fillColor: '#FFFFFF',
            strokeColor: '#228B22',
            amenities: { hasUmbrella: true, isOutdoor: true }
        },
        {
            tableName: 'T7',
            seatingCapacity: 6,
            tableType: 'RECTANGLE',
            x: 135,
            y: 490, // Increased spacing: 350 + 100 + 40 = 490
            width: 140,  // Increased from 120 to 140 (+20px)
            height: 100, // Increased from 80 to 100 (+20px)
            fillColor: '#FFFFFF',
            strokeColor: '#228B22',
            amenities: { hasUmbrella: true, isOutdoor: true }
        },
        
        // Right Column - Mixed capacity tables
        {
            tableName: 'T6',
            seatingCapacity: 6, // 5-6 Pax → 6 Pax (maximum)
            tableType: 'RECTANGLE',
            x: 585, // Right column position (65% of 900px canvas)
            y: 70,  // Top position with increased spacing
            width: 140,  // Increased from 120 to 140 (+20px)
            height: 100, // Increased from 80 to 100 (+20px)
            fillColor: '#FFFFFF',
            strokeColor: '#228B22',
            amenities: { hasUmbrella: true, isOutdoor: true }
        },
        {
            tableName: 'T5',
            seatingCapacity: 6, // 5-6 Pax → 6 Pax (maximum)
            tableType: 'RECTANGLE',
            x: 585,
            y: 170, // Closer to T6: 70 + 100 + 0 = 170 (adjusted for larger tables)
            width: 140,  // Increased from 120 to 140 (+20px)
            height: 100, // Increased from 80 to 100 (+20px)
            fillColor: '#FFFFFF',
            strokeColor: '#228B22',
            amenities: { hasUmbrella: true, isOutdoor: true }
        },
        
        // Staggered 4-pax SQUARE tables (2-4 Pax → 4 Pax maximum)
        // Complex staggered pattern with left-aligned borders
        {
            tableName: 'T4',
            seatingCapacity: 4,
            tableType: 'RECTANGLE',
            x: 562.5, // Left border aligned with T5/T6 left borders
            y: 350, // Same row as T8 but offset
            width: 95,   // Increased from 75 to 95 (+20px)
            height: 95,  // Increased from 75 to 95 (+20px)
            fillColor: '#FFFFFF',
            strokeColor: '#228B22',
            amenities: { hasUmbrella: true, isOutdoor: true }
        },
        {
            tableName: 'T3',
            seatingCapacity: 4,
            tableType: 'RECTANGLE',
            x: 720, // Moved further right to avoid overlapping with T4 (562.5 + 75 + 15 = 652.5, using 720 for better spacing)
            y: 395, // Offset down from T4 for staggered effect
            width: 95,   // Increased from 75 to 95 (+20px)
            height: 95,  // Increased from 75 to 95 (+20px)
            fillColor: '#FFFFFF',
            strokeColor: '#228B22',
            amenities: { hasUmbrella: true, isOutdoor: true }
        },
        {
            tableName: 'T2',
            seatingCapacity: 4,
            tableType: 'RECTANGLE',
            x: 562.5, // Left border aligned with T5/T6 left borders
            y: 460, // Lower than T4 for staggered pattern
            width: 95,   // Increased from 75 to 95 (+20px)
            height: 95,  // Increased from 75 to 95 (+20px)
            fillColor: '#FFFFFF',
            strokeColor: '#228B22',
            amenities: { hasUmbrella: true, isOutdoor: true }
        },
        {
            tableName: 'T1',
            seatingCapacity: 4,
            tableType: 'RECTANGLE',
            x: 720, // Same x as T3 (right side) - moved to avoid overlapping with T2
            y: 505, // Lower than T3 for staggered pattern
            width: 95,   // Increased from 75 to 95 (+20px)
            height: 95,  // Increased from 75 to 95 (+20px)
            fillColor: '#FFFFFF',
            strokeColor: '#228B22',
            amenities: { hasUmbrella: true, isOutdoor: true }
        }
    ];

    // Create all terrace tables
    console.log('Creating terrace tables...');
    for (const tableData of terraceTables) {
        await createRestaurantTable(
                    prisma,
            tableOnlyRestaurant.id,
            terraceSection.id,
                    tableData
                );
        console.log(`Created table ${tableData.tableName} (${tableData.seatingCapacity} pax) at (${tableData.x}, ${tableData.y})`);
    }

    console.log(`✅ Created ${terraceTables.length} tables for Terrace section`);
    console.log(`   • 6 tables with 6-pax capacity (140×100px RECTANGULAR)`);
    console.log(`   • 4 tables with 4-pax capacity (95×95px SQUARE)`);
    console.log(`   • Total capacity: 52 seats`);
    console.log(`   • Canvas: 900×600px`);
    console.log(`   • Increased table dimensions by 20px each`);
    console.log(`   • Complex staggered pattern for T1-T4 tables`);

    // ===== OUTDOOR SECTION =====
    console.log('\n🏞️ Creating Outdoor section...');
    const outdoorSection = await createRestaurantSection(
        prisma,
        tableOnlyRestaurant.id,
        {
            sectionName: 'Outdoor',
            description: 'Outdoor seating area with symmetrical table arrangement',
            displayOrder: 2,
            canvasWidth: 800,
            canvasHeight: 600,
            capacity: 20,
            floorPlanImage: '', // No background image for now
            sectionColor: '#90EE90' // Light green for outdoor
        }
    );
    console.log(`✅ Created Outdoor section: ${outdoorSection.id}`);

    // Define outdoor tables - 4 tables in symmetrical square formation
    const outdoorTables = [
        {
            tableName: 'L3', // Top-Left quadrant
            seatingCapacity: 5,
            tableType: 'RECTANGLE',
            x: 220, // moved inward toward center
            y: 135, // below L2 for staggered look
            width: 95,  // Increased from 75 to 95 (+20px)
            height: 95, // Increased from 75 to 95 (+20px)
            fillColor: '#FFFFFF',
            strokeColor: '#90EE90',
            amenities: { hasUmbrella: true, isOutdoor: true }
        },
        {
            tableName: 'L2', // Top-Right quadrant
            seatingCapacity: 5,
            tableType: 'RECTANGLE',
            x: 460, // moved inward toward center
            y: 115, // slightly lower than L3 for staggered look
            width: 95,  // Increased from 75 to 95 (+20px)
            height: 95, // Increased from 75 to 95 (+20px)
            fillColor: '#FFFFFF',
            strokeColor: '#90EE90',
            amenities: { hasUmbrella: true, isOutdoor: true }
        },
        {
            tableName: 'L4', // Bottom-Left quadrant
            seatingCapacity: 5,
            tableType: 'RECTANGLE',
            x: 220, // moved inward toward center
            y: 455, // below L1 for staggered look
            width: 95,  // Increased from 75 to 95 (+20px)
            height: 95, // Increased from 75 to 95 (+20px)
            fillColor: '#FFFFFF',
            strokeColor: '#90EE90',
            amenities: { hasUmbrella: true, isOutdoor: true }
        },
        {
            tableName: 'L1', // Bottom-Right quadrant
            seatingCapacity: 5,
            tableType: 'RECTANGLE',
            x: 460, // moved inward toward center
            y: 435, // slightly lower than L4 for staggered look
            width: 95,  // Increased from 75 to 95 (+20px)
            height: 95, // Increased from 75 to 95 (+20px)
            fillColor: '#FFFFFF',
            strokeColor: '#90EE90',
            amenities: { hasUmbrella: true, isOutdoor: true }
        }
    ];

    // Create all outdoor tables
    console.log('Creating outdoor tables...');
    for (const tableData of outdoorTables) {
        await createRestaurantTable(
                    prisma,
            tableOnlyRestaurant.id,
            outdoorSection.id,
                    tableData
                );
        console.log(`Created table ${tableData.tableName} (${tableData.seatingCapacity} pax) at (${tableData.x}, ${tableData.y})`);
    }

    console.log(`✅ Created ${outdoorTables.length} tables for Outdoor section`);
    console.log(`   • 4 tables with 5-pax capacity (75×75px SQUARE)`);
    console.log(`   • Total capacity: 20 seats`);
    console.log(`   • Canvas: 800×600px`);
    console.log(`   • Symmetrical square formation in four quadrants`);
    console.log(`   • Significant empty space in center and around edges`);

    

    // ===== MAIN DINING SECTION =====
    console.log('\n🍽️ Creating Main Dining section...');
    const mainDiningSection = await createRestaurantSection(
                        prisma,
        tableOnlyRestaurant.id,
        {
            sectionName: 'Main Dining',
            description: 'Primary indoor seating with mixed 3-pax and 4-pax tables',
            displayOrder: 3,
            canvasWidth: 900,
            canvasHeight: 1000, // Further increased height to ensure bottom tables are visible
            capacity: 32, // updated after table creation below
            floorPlanImage: '',
            sectionColor: '#228B22'
        }
    );
    console.log(`✅ Created Main Dining section: ${mainDiningSection.id}`);

    // Define main dining tables
    const mainDiningTables = [
        // Top row (two 3-pax tables)
        { tableName: '4', seatingCapacity: 3, tableType: 'RECTANGLE', x: 260, y: 110, width: 65, height: 95, fillColor: '#FFFFFF', strokeColor: '#228B22', amenities: { isIndoor: true } },
        { tableName: '3', seatingCapacity: 3, tableType: 'RECTANGLE', x: 620, y: 110, width: 65, height: 95, fillColor: '#FFFFFF', strokeColor: '#228B22', amenities: { isIndoor: true } },

        // Second row (side 3-pax, center 4-pax squares)
        { tableName: '5', seatingCapacity: 3, tableType: 'RECTANGLE', x: 120, y: 210, width: 65, height: 95, fillColor: '#FFFFFF', strokeColor: '#228B22', amenities: { isIndoor: true } },
        { tableName: '9', seatingCapacity: 4, tableType: 'RECTANGLE', x: 360, y: 220, width: 75, height: 75, fillColor: '#FFFFFF', strokeColor: '#228B22', amenities: { isIndoor: true } },
        { tableName: '10', seatingCapacity: 4, tableType: 'RECTANGLE', x: 520, y: 220, width: 75, height: 75, fillColor: '#FFFFFF', strokeColor: '#228B22', amenities: { isIndoor: true } },
        { tableName: '2', seatingCapacity: 3, tableType: 'RECTANGLE', x: 760, y: 210, width: 65, height: 95, fillColor: '#FFFFFF', strokeColor: '#228B22', amenities: { isIndoor: true } },

        // Third row (side 3-pax, center 4-pax squares)
        { tableName: '6', seatingCapacity: 3, tableType: 'RECTANGLE', x: 120, y: 330, width: 65, height: 95, fillColor: '#FFFFFF', strokeColor: '#228B22', amenities: { isIndoor: true } },
        { tableName: '8', seatingCapacity: 4, tableType: 'RECTANGLE', x: 360, y: 340, width: 75, height: 75, fillColor: '#FFFFFF', strokeColor: '#228B22', amenities: { isIndoor: true } },
        { tableName: '11', seatingCapacity: 4, tableType: 'RECTANGLE', x: 520, y: 340, width: 75, height: 75, fillColor: '#FFFFFF', strokeColor: '#228B22', amenities: { isIndoor: true } },
        { tableName: '1', seatingCapacity: 3, tableType: 'RECTANGLE', x: 760, y: 330, width: 65, height: 95, fillColor: '#FFFFFF', strokeColor: '#228B22', amenities: { isIndoor: true } },

        // Added third-band: slightly below previous row for better separation
        { tableName: '24', seatingCapacity: 3, tableType: 'RECTANGLE', x: 120, y: 550, width: 65, height: 95, fillColor: '#FFFFFF', strokeColor: '#228B22', amenities: { isIndoor: true } },
        { tableName: '23', seatingCapacity: 3, tableType: 'RECTANGLE', x: 420, y: 560, width: 65, height: 95, fillColor: '#FFFFFF', strokeColor: '#228B22', amenities: { isIndoor: true } },
        { tableName: '22', seatingCapacity: 3, tableType: 'RECTANGLE', x: 580, y: 560, width: 65, height: 95, fillColor: '#FFFFFF', strokeColor: '#228B22', amenities: { isIndoor: true } },
        { tableName: '25', seatingCapacity: 3, tableType: 'RECTANGLE', x: 740, y: 550, width: 65, height: 95, fillColor: '#FFFFFF', strokeColor: '#228B22', amenities: { isIndoor: true } },

        // Bottom row (two 4-pax squares centered) - positioned higher within increased canvas height
        { tableName: '20', seatingCapacity: 4, tableType: 'RECTANGLE', x: 420, y: 880, width: 75, height: 75, fillColor: '#FFFFFF', strokeColor: '#228B22', amenities: { isIndoor: true } },
        { tableName: '21', seatingCapacity: 4, tableType: 'RECTANGLE', x: 560, y: 880, width: 75, height: 75, fillColor: '#FFFFFF', strokeColor: '#228B22', amenities: { isIndoor: true } }
    ];

    // Compute and update capacity
    const mainDiningCapacity = mainDiningTables.reduce((sum, t) => sum + t.seatingCapacity, 0);
    if (mainDiningCapacity !== 44) {
        console.log(`ℹ️ Recalculating Main Dining capacity to ${mainDiningCapacity}`);
    }

    // Create all main dining tables
    console.log('Creating main dining tables...');
    for (const tableData of mainDiningTables) {
        await createRestaurantTable(
            prisma,
            tableOnlyRestaurant.id,
            mainDiningSection.id,
            tableData
        );
        console.log(`Created table ${tableData.tableName} (${tableData.seatingCapacity} pax) at (${tableData.x}, ${tableData.y})`);
    }

    console.log(`✅ Created ${mainDiningTables.length} tables for Main Dining section`);
    console.log(`   • 10 tables with 3-pax capacity (65×95px RECTANGULAR CIRCLE)`);
    console.log(`   • 6 tables with 4-pax capacity (75×75px SQUARE)`);
    console.log(`   • Total capacity: ${mainDiningCapacity} seats`);
    console.log(`   • Canvas: 900×1000px`);

    // ===== CELEBRATION TABLE LOUNGE SETUP =====
    console.log('\n🎉 Creating Celebration Table Lounge layout...');
    const celebrationLoungeSection = await createRestaurantSection(
        prisma,
        policyFeeRestaurant.id,
        {
            sectionName: 'Celebration Lounge',
            description: 'Intimate lounge with premium celebration tables',
            displayOrder: 1,
            capacity: 32,
            canvasWidth: 760,
            canvasHeight: 560,
            floorPlanImage: '',
            sectionColor: '#B56576'
        }
    );
    console.log(`✅ Created Celebration Lounge section: ${celebrationLoungeSection.id}`);

    const celebrationTables = [
        {
            tableName: 'CL1',
            seatingCapacity: 6,
            tableType: 'RECTANGLE',
            x: 180,
            y: 140,
            width: 130,
            height: 95,
            fillColor: '#FFFFFF',
            strokeColor: '#B56576',
            amenities: { hasBackdrop: true, includesCenterpiece: true }
        },
        {
            tableName: 'CL2',
            seatingCapacity: 6,
            tableType: 'RECTANGLE',
            x: 560,
            y: 140,
            width: 130,
            height: 95,
            fillColor: '#FFFFFF',
            strokeColor: '#B56576',
            amenities: { hasBackdrop: true, includesCenterpiece: true }
        },
        {
            tableName: 'CL3',
            seatingCapacity: 8,
            tableType: 'RECTANGLE',
            x: 180,
            y: 360,
            width: 150,
            height: 110,
            fillColor: '#FFFFFF',
            strokeColor: '#B56576',
            amenities: { includesCustomLighting: true, isIndoor: true }
        },
        {
            tableName: 'CL4',
            seatingCapacity: 8,
            tableType: 'RECTANGLE',
            x: 560,
            y: 360,
            width: 150,
            height: 110,
            fillColor: '#FFFFFF',
            strokeColor: '#B56576',
            amenities: { includesCustomLighting: true, isIndoor: true }
        },
        {
            tableName: 'CL5',
            seatingCapacity: 4,
            tableType: 'RECTANGLE',
            x: 370,
            y: 250,
            width: 90,
            height: 90,
            fillColor: '#FFFFFF',
            strokeColor: '#B56576',
            amenities: { includesCakeDisplay: true }
        },
        {
            tableName: 'CL6',
            seatingCapacity: 4,
            tableType: 'RECTANGLE',
            x: 370,
            y: 430,
            width: 90,
            height: 90,
            fillColor: '#FFFFFF',
            strokeColor: '#B56576',
            amenities: { includesCakeDisplay: true }
        }
    ];

    for (const tableData of celebrationTables) {
        await createRestaurantTable(
            prisma,
            policyFeeRestaurant.id,
            celebrationLoungeSection.id,
            tableData
        );
        console.log(`Created Celebration Lounge table ${tableData.tableName} (${tableData.seatingCapacity} pax)`);
    }

    



    // ------------------------------------------------------
    // Connect tables to slot generation configs
    // ------------------------------------------------------
    console.log('Connecting tables to slot generation configs...');

    // Get all slot generation configs
    const slotConfigs = await prisma.tableSlotGenerationConfig.findMany({
        include: {
            tableReservationConfig: true
        }
    });

    // Get all tables for table reservation restaurants
    const allTables = await prisma.restaurantTable.findMany({
        where: {
            restaurantId: {
                in: [ministryOfCrab.id, tableOnlyRestaurant.id, bothSupportRestaurant.id]
            }
        }
    });

    // Connect tables to their respective configs
    for (const config of slotConfigs) {
        const restaurantId = config.tableReservationConfig.restaurantId;
        if (restaurantId) {
            // Find tables for this restaurant
            const restaurantTables = allTables.filter(table => table.restaurantId === restaurantId);
            
            if (restaurantTables.length > 0) {
                // Connect tables to this config
                await prisma.tableSlotGenerationConfig.update({
                    where: { id: config.id },
                    data: {
                        targetTables: {
                            connect: restaurantTables.map(table => ({ id: table.id }))
                        }
                    }
                });
                console.log(`Connected ${restaurantTables.length} tables to slot generation config ${config.id} (restaurant ${restaurantId})`);
            }
        } else {
            // Platform default config - connect all tables
            await prisma.tableSlotGenerationConfig.update({
                where: { id: config.id },
                data: {
                    targetTables: {
                        connect: allTables.map(table => ({ id: table.id }))
                    }
                }
            });
            console.log(`Connected ${allTables.length} tables to platform default slot generation config ${config.id}`);
        }
    }

    // ------------------------------------------------------
    // Table Reservation Test Scenarios for Restaurant 5 - October 23, 2025
    // ------------------------------------------------------
    console.log('Skipping table reservation creation for now - will be created after slot generation...');

    // ------------------------------------------------------
    // Generate Table Availability Slots for Upcoming Month
    // ------------------------------------------------------
    console.log('Generating table availability slots for upcoming month...');

    // Get all restaurants with table reservation support
    const restaurantsWithTableSupport = await prisma.restaurant.findMany({
        where: {
            reservationSupport: {
                in: [ReservationSupportType.TABLE_ONLY, ReservationSupportType.BOTH]
            }
        },
        include: {
            sections: {
                where: { isActive: true },
                include: {
                    tables: {
                        where: { isActive: true }
                    }
                }
            },
            tableReservationConfigs: {
                where: { isActive: true },
                include: {
                    slotGenerationConfig: {
                        include: {
                            targetTables: true
                        }
                    }
                }
            }
        }
    });

    console.log(`Found ${restaurantsWithTableSupport.length} restaurants with table reservation support`);

    for (const restaurant of restaurantsWithTableSupport) {
        if (restaurant.sections.length === 0) {
            console.log(`Skipping restaurant ${restaurant.id} (${restaurant.name}) - no active sections`);
            continue;
        }

        const config = restaurant.tableReservationConfigs[0];
        if (!config || !config.slotGenerationConfig) {
            console.log(`Skipping restaurant ${restaurant.id} (${restaurant.name}) - no slot generation config`);
            continue;
        }

        const slotConfig = config.slotGenerationConfig;
        const targetTables = slotConfig.targetTables.length > 0 ? slotConfig.targetTables : restaurant.sections.flatMap(s => s.tables);
        
        if (targetTables.length === 0) {
            console.log(`Skipping restaurant ${restaurant.id} (${restaurant.name}) - no target tables`);
            continue;
        }

        console.log(`Generating slots for restaurant ${restaurant.id} (${restaurant.name}) with ${targetTables.length} tables`);

        // Generate slots for the next 30 days
        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);
        endDate.setHours(23, 59, 59, 999);

        // Get the start time from slot generation config
        const startTimeHours = slotConfig.startTime.getUTCHours();
        const startTimeMinutes = slotConfig.startTime.getUTCMinutes();
        const slotDurationMinutes = slotConfig.slotDurationMinutes;
        const turnoverBufferMinutes = slotConfig.turnoverBufferMinutes;

        // Calculate how many slots can fit in a day
        // For restaurants, typically operate from 6 AM to 11 PM (17 hours)
        const operatingHours = 17; // 6 AM to 11 PM
        const slotsPerDay = Math.floor((operatingHours * 60) / (slotDurationMinutes + turnoverBufferMinutes));

        let slotsCreated = 0;
        let currentDate = new Date(startDate);

        while (currentDate <= endDate) {
            const dayOfWeek = currentDate.getDay();
            const dayName = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][dayOfWeek];
            
            // Check if this day is enabled in the slot generation config
            if (!slotConfig.enabledDays.includes(dayName as any)) {
                currentDate.setDate(currentDate.getDate() + 1);
                continue;
            }

            // Generate slots for this day
            for (let slotIndex = 0; slotIndex < slotsPerDay; slotIndex++) {
                const slotStartMinutes = startTimeHours * 60 + startTimeMinutes + (slotIndex * (slotDurationMinutes + turnoverBufferMinutes));
                const slotStartHour = Math.floor(slotStartMinutes / 60);
                const slotStartMinute = slotStartMinutes % 60;

                // Skip if slot would be after midnight
                if (slotStartHour >= 24) {
                    break;
                }

                const slotStartTime = createUTCDateTimeFromLocal(currentDate, slotStartHour, slotStartMinute);
                const slotEndTime = createUTCDateTimeFromLocal(currentDate, slotStartHour, slotStartMinute + slotDurationMinutes);

                // Create slots for all target tables
                for (const table of targetTables) {
                    try {
                        await prisma.tableAvailabilitySlot.create({
                            data: {
                                restaurantId: restaurant.id,
                                tableId: table.id,
                                date: currentDate,
                                startTime: slotStartTime,
                                endTime: slotEndTime,
                                status: TableSlotStatus.AVAILABLE
                            }
                        });
                        slotsCreated++;
                    } catch (error) {
                        // Skip if slot already exists (unique constraint violation)
                        if ((error as any).code !== 'P2002') {
                            console.error(`Error creating slot for table ${table.id} on ${currentDate.toISOString().split('T')[0]} at ${slotStartTime.toTimeString()}:`, error);
                        }
                    }
                }
            }

            currentDate.setDate(currentDate.getDate() + 1);
        }

        console.log(`Created ${slotsCreated} availability slots for restaurant ${restaurant.id} (${restaurant.name})`);
    }

    console.log('Table availability slots generation completed successfully');
    console.log('Table reservation test scenarios completed successfully');

  // ------------------------------------------------------
  // Generate slots and reservations for 2025/10/30 for TableTime Bistro
  // ------------------------------------------------------
  console.log('\n📅 Generating slots and reservations for 2025/10/30 for TableTime Bistro...');
  try {
    const tableTimeBistro30 = await prisma.restaurant.findUnique({
      where: { id: 5 },
      include: {
        tables: { where: { isActive: true }, include: { section: true } },
        tableReservationConfigs: { include: { slotGenerationConfig: true } },
      },
    });

    if (tableTimeBistro30 && tableTimeBistro30.tables.length > 0) {
      const targetDate30 = new Date('2025-10-30');
      console.log(`   • Target date: ${targetDate30.toDateString()}`);

      const config30 =
        tableTimeBistro30.tableReservationConfigs[0]?.slotGenerationConfig || {
          startTime: new Date('1970-01-01T10:00:00'),
          slotDurationMinutes: 90,
          turnoverBufferMinutes: 15,
          enabledDays: [
            DayOfWeek.MONDAY,
            DayOfWeek.TUESDAY,
            DayOfWeek.WEDNESDAY,
            DayOfWeek.THURSDAY,
            DayOfWeek.FRIDAY,
            DayOfWeek.SATURDAY,
            DayOfWeek.SUNDAY,
          ],
        };

      const slotsCreated30 = await generateSlotsForDate(
        prisma,
        tableTimeBistro30,
        config30,
        targetDate30,
      );
      console.log(`   ✅ Created ${slotsCreated30} slots for ${targetDate30.toDateString()}`);
      console.log('   ⏭️  Skipping reservation creation for 2025/10/30 as requested');
    } else {
      console.log('   ⚠️  TableTime Bistro not found or has no active tables');
    }
  } catch (error) {
    console.error('   ❌ Error generating slots and reservations for 2025/10/30:', error);
  }

    // ------------------------------------------------------
    // Seed Table Merge Test Data
    // ------------------------------------------------------
    console.log('\n=== SEEDING TABLE MERGE TEST DATA ===');
    await seedTableMergeData(prisma, ministryOfCrab.id);

    // ------------------------------------------------------
    // Generate Table Availability Slots for Current Month
    // ------------------------------------------------------
    console.log('\n=== GENERATING TABLE AVAILABILITY SLOTS FOR CURRENT MONTH ===');

    await generateTableAvailabilitySlotsForCurrentMonth(prisma);

    // ------------------------------------------------------
    // Create Table Reservations for October 23, 2025 (TableTime Bistro)
    // ------------------------------------------------------
    console.log('\n=== CREATING TABLE RESERVATIONS FOR OCTOBER 23, 2025 ===');

    // Get customers for reservations
    const customersForTableRes = await prisma.customer.findMany();

    // Define the target date: October 23, 2025
    const targetDate = new Date(2025, 9, 23); // Month is 0-indexed, so 9 = October

    // Get available slots for this date
    const availableSlots = await prisma.tableAvailabilitySlot.findMany({
        where: {
            restaurantId: tableOnlyRestaurant.id,
            date: targetDate,
            status: TableSlotStatus.AVAILABLE
        },
        include: {
            table: {
                include: {
                    section: true
                }
            }
        }
    });

    console.log(`Found ${availableSlots.length} available slots for ${targetDate.toDateString()}`);

    // Create sample reservations
    const reservationScenarios = [
        {
            customerIndex: 0,
            adultCount: 4,
            childCount: 0,
            specialRequests: 'Window seating preferred',
            slotPreference: { sectionName: 'Terrace', timeRange: [17, 19] } // 5 PM - 7 PM
        },
        {
            customerIndex: 1,
            adultCount: 2,
            childCount: 2,
            specialRequests: 'High chairs needed for children',
            slotPreference: { sectionName: 'Main Dining', timeRange: [18, 20] } // 6 PM - 8 PM
        },
        {
            customerIndex: 2,
            adultCount: 6,
            childCount: 0,
            specialRequests: 'Celebrating anniversary',
            slotPreference: { sectionName: 'Terrace', timeRange: [19, 21] } // 7 PM - 9 PM
        },
        {
            customerIndex: 3,
            adultCount: 5,
            childCount: 0,
            specialRequests: 'Quiet area preferred',
            slotPreference: { sectionName: 'Outdoor', timeRange: [18, 20] } // 6 PM - 8 PM
        },
        {
            customerIndex: 0,
            adultCount: 3,
            childCount: 1,
            specialRequests: 'Early dinner',
            slotPreference: { sectionName: 'Main Dining', timeRange: [17, 19] } // 5 PM - 7 PM
        }
    ];

    let reservationsCreated = 0;

    for (const scenario of reservationScenarios) {
        const customer = customersForTableRes[scenario.customerIndex % customersForTableRes.length];
        const partySize = scenario.adultCount + scenario.childCount;

        // Find a suitable slot based on preferences
        const suitableSlot = availableSlots.find(slot => {
            const slotHour = slot.startTime.getHours();
            const matchesSection = slot.table.section.sectionName === scenario.slotPreference.sectionName;
            const matchesTimeRange = slotHour >= scenario.slotPreference.timeRange[0] && slotHour < scenario.slotPreference.timeRange[1];
            const hasCapacity = slot.table.seatingCapacity >= partySize;
            const isAvailable = slot.status === TableSlotStatus.AVAILABLE;

            return matchesSection && matchesTimeRange && hasCapacity && isAvailable;
        });

        if (!suitableSlot) {
            console.log(`⚠️  No suitable slot found for scenario ${reservationsCreated + 1}, skipping...`);
            continue;
        }

        // Create reservation request
        const request = await prisma.reservationRequest.create({
            data: {
                restaurantId: tableOnlyRestaurant.id,
                customerId: customer.id,
                requestName: `${customer.firstName} ${customer.lastName}`,
                contactPhone: customer.phone,
                requestedDate: targetDate,
                requestedTime: suitableSlot.startTime,
                adultCount: scenario.adultCount,
                childCount: scenario.childCount,
                mealType: MealType.DINNER,
                estimatedTotalAmount: 0, // No charge for table-only
                estimatedServiceCharge: 0,
                estimatedTaxAmount: 0,
                status: ReservationRequestStatus.CONFIRMED,
                specialRequests: scenario.specialRequests,
                reservationType: ReservationType.TABLE_ONLY,
                createdBy: RequestCreatorType.CUSTOMER,
                requiresAdvancePayment: false
            }
        });

        // Create table details for the request
        await prisma.reservationRequestTableDetails.create({
            data: {
                requestId: request.id,
                preferredSectionId: suitableSlot.table.sectionId,
                preferredTableId: suitableSlot.tableId,
                preferredTimeSlotStart: suitableSlot.startTime,
                preferredTimeSlotEnd: suitableSlot.endTime,
                isFlexibleWithTable: false,
                isFlexibleWithSection: false,
                isFlexibleWithTime: false
            }
        });

        // Create reservation
        const reservation = await prisma.reservation.create({
            data: {
                reservationNumber: generateReservationNumber(tableOnlyRestaurant.id, reservationsCreated),
                restaurantId: tableOnlyRestaurant.id,
                customerId: customer.id,
                requestId: request.id,
                reservationName: `${customer.firstName} ${customer.lastName}`,
                contactPhone: customer.phone,
                reservationDate: targetDate,
                reservationTime: suitableSlot.startTime,
                adultCount: scenario.adultCount,
                childCount: scenario.childCount,
                mealType: MealType.DINNER,
                totalAmount: 0, // No charge for table-only
                serviceCharge: 0,
                taxAmount: 0,
                status: 'CONFIRMED',
                specialRequests: scenario.specialRequests,
                reservationType: ReservationType.TABLE_ONLY,
                createdBy: RequestCreatorType.CUSTOMER
            }
        });

        // Create table assignment
        await prisma.reservationTableAssignment.create({
            data: {
                reservationId: reservation.id,
                assignedSectionId: suitableSlot.table.sectionId,
                assignedTableId: suitableSlot.tableId,
                slotId: suitableSlot.id,
                tableStartTime: suitableSlot.startTime,
                tableEndTime: suitableSlot.endTime
            }
        });

        // Update slot status to RESERVED
        await prisma.tableAvailabilitySlot.update({
            where: { id: suitableSlot.id },
            data: {
                status: TableSlotStatus.RESERVED,
                reservationId: reservation.id
            }
        });

        // Remove this slot from available slots array
        const slotIndex = availableSlots.indexOf(suitableSlot);
        if (slotIndex > -1) {
            availableSlots.splice(slotIndex, 1);
        }

        reservationsCreated++;
        console.log(`✅ Created reservation ${reservation.reservationNumber}: ${scenario.adultCount + scenario.childCount} guests at ${suitableSlot.table.section.sectionName} - Table ${suitableSlot.table.tableName} (${suitableSlot.startTime.toTimeString().slice(0, 5)})`);
    }

    console.log(`\n🎉 Successfully created ${reservationsCreated} table reservations for October 23, 2025`);

    // ------------------------------------------------------
    // Sunday table reservations with advance payments (TableTime Bistro)
    // ------------------------------------------------------
    console.log('\n=== CREATING SUNDAY TABLE RESERVATIONS WITH ADVANCE PAYMENTS ===');

    const sundayDate = new Date('2025-11-16');
    const sundaySlots = await prisma.tableAvailabilitySlot.findMany({
        where: {
            restaurantId: tableOnlyRestaurant.id,
            date: sundayDate,
            status: TableSlotStatus.AVAILABLE
        },
        include: {
            table: {
                include: {
                    section: true
                }
            }
        }
    });

    if (sundaySlots.length === 0) {
        console.warn('No available Sunday slots found for TableTime Bistro. Skipping Sunday prepayment seed.');
    } else {
        const sundayCustomers = customersForTableRes.slice(0, 2);
        let sundayCreated = 0;

        for (const [index, customer] of sundayCustomers.entries()) {
            const targetSlot = sundaySlots[index] ?? sundaySlots[0];
            if (!targetSlot) {
                continue;
            }

            const totalAmount = 18000;
            const advancePaymentAmount = totalAmount * 0.3;
            const remainingAmount = totalAmount - advancePaymentAmount;

            const sundayRequest = await prisma.reservationRequest.create({
                data: {
                    restaurantId: tableOnlyRestaurant.id,
                    customerId: customer.id,
                    requestName: `${customer.firstName} ${customer.lastName}`,
                    contactPhone: customer.phone,
                    requestedDate: sundayDate,
                    requestedTime: targetSlot.startTime,
                    adultCount: 4,
                    childCount: 0,
                    mealType: MealType.DINNER,
                    estimatedTotalAmount: totalAmount,
                    estimatedServiceCharge: 0,
                    estimatedTaxAmount: 0,
                    status: ReservationRequestStatus.CONFIRMED,
                    specialRequests: 'Prepayment Sunday test booking',
                    reservationType: ReservationType.TABLE_ONLY,
                    createdBy: RequestCreatorType.CUSTOMER,
                    requiresAdvancePayment: true
                }
            });

            const sundayReservation = await prisma.reservation.create({
                data: {
                    reservationNumber: generateReservationNumber(tableOnlyRestaurant.id, 500 + index),
                    restaurantId: tableOnlyRestaurant.id,
                    customerId: customer.id,
                    requestId: sundayRequest.id,
                    reservationName: `${customer.firstName} ${customer.lastName}`,
                    contactPhone: customer.phone,
                    reservationDate: sundayDate,
                    reservationTime: targetSlot.startTime,
                    adultCount: 4,
                    childCount: 0,
                    mealType: MealType.DINNER,
                    totalAmount,
                    serviceCharge: 0,
                    taxAmount: 0,
                    advancePaymentAmount,
                    remainingPaymentAmount: remainingAmount,
                    status: 'CONFIRMED',
                    specialRequests: 'Advance payment applied',
                    reservationType: ReservationType.TABLE_ONLY,
                    createdBy: RequestCreatorType.CUSTOMER
                }
            });

            await prisma.reservationTableAssignment.create({
                data: {
                    reservationId: sundayReservation.id,
                    assignedSectionId: targetSlot.table.sectionId,
                    assignedTableId: targetSlot.tableId,
                    slotId: targetSlot.id,
                    tableStartTime: targetSlot.startTime,
                    tableEndTime: targetSlot.endTime
                }
            });

            await prisma.tableAvailabilitySlot.update({
                where: { id: targetSlot.id },
                data: {
                    status: TableSlotStatus.RESERVED,
                    reservationId: sundayReservation.id
                }
            });

            await prisma.reservationPayment.create({
                data: {
                    reservationId: sundayReservation.id,
                    paymentType: 'RESERVATION',
                    amount: advancePaymentAmount,
                    paymentDate: new Date(),
                    paymentStatus: PaymentStatus.COMPLETED,
                    paymentChannel: PaymentChannel.CREDIT_CARD,
                    transactionReference: `TTB-SUN-${sundayReservation.id}`,
                    processedBy: 'SYSTEM',
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            });

            sundayCreated++;
        }

        console.log(`✅ Created ${sundayCreated} Sunday table reservations with advance payments for TableTime Bistro`);
    }

    // ------------------------------------------------------
    // Enhanced Type Mapping System Summary
    // ------------------------------------------------------
    console.log('\n=== ENHANCED TYPE MAPPING SYSTEM ===');
    console.log('✅ Enhanced table seeding with full type mapping support:');
    console.log('   • Flat design (no shadows) for modern UI');
    console.log('   • Complete canvas properties (fill, stroke, corners, borders)');
    console.log('   • Advanced amenities (privacy, accessibility, special features)');
    console.log('   • Draggable/resizable controls');
    console.log('   • Fabric.js object synchronization');
    console.log('   • Sample layout JSON generation for testing');
    console.log('   • Support for all TableCanvasProperties and TableAmenities');
    console.log('   • Enhanced section boundaries without area labels');
    console.log('\n✅ Database schema fully supports:');
    console.log('   • RestaurantSection with canvasData (Fabric.js JSON)');
    console.log('   • RestaurantTable with position, canvasProperties, amenities');
    console.log('   • TableAvailabilitySlot for reservation management');
    console.log('   • ReservationTableAssignment for table assignments');
    console.log('   • All type mappings from JSON layout to database');
    console.log('\n✅ Table Availability Slots Generated:');
    console.log('   • Current month slots for all table reservation restaurants');
    console.log('   • Configurable slot durations and buffer times');
    console.log('   • Day-of-week scheduling support');
    console.log('   • Batch insertion for performance');
    console.log('   • Duplicate prevention with skipDuplicates');
    console.log('\n✅ Table Reservations for October 23, 2025:');
    console.log('   • Created reservations for TableTime Bistro');
    console.log('   • Assigned tables to specific sections');
    console.log('   • Marked slots as RESERVED');
    console.log('   • Complete with customer details and special requests');

    // Update restaurant review statistics after seeding reviews
    console.log('\n📊 Updating restaurant review statistics...');
    try {
        // Get all restaurants to ensure we update stats for all of them
        const allRestaurants = await prisma.restaurant.findMany({
            select: { id: true }
        });
        
        console.log(`   • Processing ${allRestaurants.length} restaurants...`);
        
        let updatedCount = 0;
        let restaurantsWithReviews = 0;
        let restaurantsWithoutReviews = 0;
        
        // Calculate and update stats for each restaurant
        for (const restaurant of allRestaurants) {
            const stats = await calculateRestaurantReviewStats(prisma, restaurant.id);
            if (stats) {
                await updateRestaurantReviewStats(prisma, stats);
                updatedCount++;
                
                if (stats.totalReviews > 0) {
                    restaurantsWithReviews++;
                } else {
                    restaurantsWithoutReviews++;
                }
            }
        }
        
        console.log(`   ✅ Updated review statistics for ${updatedCount} restaurants`);
        console.log(`   • Restaurants with reviews: ${restaurantsWithReviews}`);
        console.log(`   • Restaurants without reviews: ${restaurantsWithoutReviews}`);
    } catch (error) {
        console.error('   ❌ Error updating restaurant review statistics:', error);
        throw error;
    }

    console.log('\n🎉 Seed completed successfully with enhanced type mapping system!');
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
