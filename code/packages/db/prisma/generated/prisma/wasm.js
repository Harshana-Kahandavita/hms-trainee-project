
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 6.6.0
 * Query Engine version: f676762280b54cd07c770017ed3711ddde35f37a
 */
Prisma.prismaVersion = {
  client: "6.6.0",
  engine: "f676762280b54cd07c770017ed3711ddde35f37a"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.BusinessScalarFieldEnum = {
  id: 'id',
  name: 'name',
  address: 'address',
  phone: 'phone',
  email: 'email',
  website: 'website',
  taxId: 'taxId',
  registrationNumber: 'registrationNumber',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RestaurantScalarFieldEnum = {
  id: 'id',
  businessId: 'businessId',
  name: 'name',
  locationId: 'locationId',
  address: 'address',
  phone: 'phone',
  description: 'description',
  capacity: 'capacity',
  onlineQuota: 'onlineQuota',
  thumbnailImageId: 'thumbnailImageId',
  heroImageId: 'heroImageId',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  reservationSupport: 'reservationSupport',
  advancePaymentPercentage: 'advancePaymentPercentage'
};

exports.Prisma.LocationScalarFieldEnum = {
  id: 'id',
  city: 'city',
  state: 'state',
  postalCode: 'postalCode'
};

exports.Prisma.CuisineScalarFieldEnum = {
  id: 'id',
  cuisineName: 'cuisineName'
};

exports.Prisma.RestaurantCuisineScalarFieldEnum = {
  restaurantId: 'restaurantId',
  cuisineId: 'cuisineId'
};

exports.Prisma.RestaurantOperatingHoursScalarFieldEnum = {
  restaurantId: 'restaurantId',
  dayOfWeek: 'dayOfWeek',
  isOpen: 'isOpen',
  capacity: 'capacity',
  onlineQuota: 'onlineQuota',
  openingTime: 'openingTime',
  closingTime: 'closingTime'
};

exports.Prisma.RestaurantMealServiceScalarFieldEnum = {
  id: 'id',
  restaurantId: 'restaurantId',
  mealType: 'mealType',
  isAvailable: 'isAvailable',
  isChildEnabled: 'isChildEnabled',
  adultGrossPrice: 'adultGrossPrice',
  childGrossPrice: 'childGrossPrice',
  adultNetPrice: 'adultNetPrice',
  childNetPrice: 'childNetPrice',
  childAgeLimit: 'childAgeLimit',
  serviceChargePercentage: 'serviceChargePercentage',
  taxPercentage: 'taxPercentage',
  priceUpdatedAt: 'priceUpdatedAt',
  serviceStartTime: 'serviceStartTime',
  serviceEndTime: 'serviceEndTime',
  isLegacyPricing: 'isLegacyPricing'
};

exports.Prisma.RestaurantMealServiceScheduleScalarFieldEnum = {
  id: 'id',
  mealServiceId: 'mealServiceId',
  availableDays: 'availableDays',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RestaurantCapacityScalarFieldEnum = {
  id: 'id',
  restaurantId: 'restaurantId',
  serviceId: 'serviceId',
  date: 'date',
  totalSeats: 'totalSeats',
  bookedSeats: 'bookedSeats',
  isEnabled: 'isEnabled'
};

exports.Prisma.RestaurantImageScalarFieldEnum = {
  id: 'id',
  restaurantId: 'restaurantId',
  imageUrl: 'imageUrl',
  imageType: 'imageType',
  altText: 'altText',
  caption: 'caption',
  displayOrder: 'displayOrder',
  isActive: 'isActive',
  uploadedAt: 'uploadedAt',
  uploadedBy: 'uploadedBy',
  lastModifiedAt: 'lastModifiedAt',
  lastModifiedBy: 'lastModifiedBy'
};

exports.Prisma.RestaurantReviewStatsScalarFieldEnum = {
  id: 'id',
  restaurantId: 'restaurantId',
  totalReviews: 'totalReviews',
  avgServiceRating: 'avgServiceRating',
  avgMealRating: 'avgMealRating',
  avgPlatformRating: 'avgPlatformRating',
  serviceRating1Count: 'serviceRating1Count',
  serviceRating2Count: 'serviceRating2Count',
  serviceRating3Count: 'serviceRating3Count',
  serviceRating4Count: 'serviceRating4Count',
  serviceRating5Count: 'serviceRating5Count',
  lastUpdated: 'lastUpdated'
};

exports.Prisma.CustomerScalarFieldEnum = {
  id: 'id',
  firstName: 'firstName',
  lastName: 'lastName',
  email: 'email',
  phone: 'phone',
  createdAt: 'createdAt'
};

exports.Prisma.ReservationScalarFieldEnum = {
  id: 'id',
  reservationNumber: 'reservationNumber',
  restaurantId: 'restaurantId',
  customerId: 'customerId',
  requestId: 'requestId',
  reservationName: 'reservationName',
  contactPhone: 'contactPhone',
  reservationDate: 'reservationDate',
  reservationTime: 'reservationTime',
  adultCount: 'adultCount',
  childCount: 'childCount',
  mealType: 'mealType',
  totalAmount: 'totalAmount',
  serviceCharge: 'serviceCharge',
  taxAmount: 'taxAmount',
  advancePaymentAmount: 'advancePaymentAmount',
  remainingPaymentAmount: 'remainingPaymentAmount',
  status: 'status',
  specialRequests: 'specialRequests',
  dietaryRequirements: 'dietaryRequirements',
  occasion: 'occasion',
  reservationType: 'reservationType',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  createdBy: 'createdBy',
  promoCodeId: 'promoCodeId',
  discountAmount: 'discountAmount',
  lastModifiedAt: 'lastModifiedAt',
  lastModifiedBy: 'lastModifiedBy',
  lastModificationId: 'lastModificationId'
};

exports.Prisma.ReservationPaymentScalarFieldEnum = {
  id: 'id',
  reservationId: 'reservationId',
  modificationId: 'modificationId',
  paymentType: 'paymentType',
  amount: 'amount',
  paymentDate: 'paymentDate',
  paymentStatus: 'paymentStatus',
  paymentChannel: 'paymentChannel',
  transactionReference: 'transactionReference',
  paymentNotes: 'paymentNotes',
  refundReason: 'refundReason',
  refundAmount: 'refundAmount',
  refundDate: 'refundDate',
  processedBy: 'processedBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RestaurantSpecialClosureScalarFieldEnum = {
  id: 'id',
  restaurantId: 'restaurantId',
  closureStart: 'closureStart',
  closureEnd: 'closureEnd',
  closureType: 'closureType',
  description: 'description',
  createdAt: 'createdAt',
  createdBy: 'createdBy'
};

exports.Prisma.ReservationRequestScalarFieldEnum = {
  id: 'id',
  restaurantId: 'restaurantId',
  customerId: 'customerId',
  requestName: 'requestName',
  contactPhone: 'contactPhone',
  requestedDate: 'requestedDate',
  requestedTime: 'requestedTime',
  adultCount: 'adultCount',
  childCount: 'childCount',
  mealType: 'mealType',
  mealServiceId: 'mealServiceId',
  estimatedTotalAmount: 'estimatedTotalAmount',
  estimatedServiceCharge: 'estimatedServiceCharge',
  estimatedTaxAmount: 'estimatedTaxAmount',
  status: 'status',
  specialRequests: 'specialRequests',
  dietaryRequirements: 'dietaryRequirements',
  occasion: 'occasion',
  rejectionReason: 'rejectionReason',
  reservationType: 'reservationType',
  createdAt: 'createdAt',
  processingStartedAt: 'processingStartedAt',
  processingCompletedAt: 'processingCompletedAt',
  updatedAt: 'updatedAt',
  createdBy: 'createdBy',
  requiresAdvancePayment: 'requiresAdvancePayment',
  promoCodeId: 'promoCodeId',
  estimatedDiscountAmount: 'estimatedDiscountAmount',
  eligiblePromoPartySize: 'eligiblePromoPartySize'
};

exports.Prisma.ReservationRequestStatusHistoryScalarFieldEnum = {
  id: 'id',
  requestId: 'requestId',
  previousStatus: 'previousStatus',
  newStatus: 'newStatus',
  changeReason: 'changeReason',
  statusChangedAt: 'statusChangedAt',
  changedBy: 'changedBy'
};

exports.Prisma.ReservationRequestPaymentScalarFieldEnum = {
  id: 'id',
  requestId: 'requestId',
  amount: 'amount',
  paymentInitiatedAt: 'paymentInitiatedAt',
  paymentStatus: 'paymentStatus',
  paymentProvider: 'paymentProvider',
  paymentChannel: 'paymentChannel',
  transactionReference: 'transactionReference',
  nameOnCard: 'nameOnCard',
  maskedCardNumber: 'maskedCardNumber',
  failureReason: 'failureReason',
  notifiedAt: 'notifiedAt',
  verifiedAt: 'verifiedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  paymentStatusUrl: 'paymentStatusUrl'
};

exports.Prisma.ReservationReviewScalarFieldEnum = {
  id: 'id',
  reservationId: 'reservationId',
  customerId: 'customerId',
  mealRating: 'mealRating',
  serviceRating: 'serviceRating',
  platformRating: 'platformRating',
  reviewText: 'reviewText',
  isVerified: 'isVerified',
  isPublished: 'isPublished',
  diningDate: 'diningDate',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  moderationStatus: 'moderationStatus',
  moderationNotes: 'moderationNotes',
  moderatedAt: 'moderatedAt',
  moderatedBy: 'moderatedBy'
};

exports.Prisma.ReservationReviewPhotoScalarFieldEnum = {
  id: 'id',
  reviewId: 'reviewId',
  photoUrl: 'photoUrl',
  photoCaption: 'photoCaption',
  uploadedAt: 'uploadedAt',
  isApproved: 'isApproved',
  approvedAt: 'approvedAt',
  approvedBy: 'approvedBy'
};

exports.Prisma.ReservationReviewResponseScalarFieldEnum = {
  id: 'id',
  reviewId: 'reviewId',
  responseText: 'responseText',
  respondedBy: 'respondedBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  isPublished: 'isPublished'
};

exports.Prisma.CityScalarFieldEnum = {
  id: 'id',
  cityName: 'cityName',
  stateName: 'stateName',
  countryName: 'countryName',
  latitude: 'latitude',
  longitude: 'longitude',
  postalCodePattern: 'postalCodePattern',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RestaurantServiceAreaScalarFieldEnum = {
  restaurantId: 'restaurantId',
  cityId: 'cityId',
  deliveryRadiusKm: 'deliveryRadiusKm',
  estimatedDeliveryTimeMin: 'estimatedDeliveryTimeMin',
  isActive: 'isActive',
  createdAt: 'createdAt',
  createdBy: 'createdBy',
  updatedAt: 'updatedAt',
  updatedBy: 'updatedBy'
};

exports.Prisma.NotificationScalarFieldEnum = {
  id: 'id',
  restaurantId: 'restaurantId',
  type: 'type',
  title: 'title',
  message: 'message',
  metadata: 'metadata',
  isRead: 'isRead',
  readOn: 'readOn',
  readBy: 'readBy',
  createdAt: 'createdAt'
};

exports.Prisma.CleanupLogScalarFieldEnum = {
  id: 'id',
  cleanupType: 'cleanupType',
  restaurantId: 'restaurantId',
  recordsRemoved: 'recordsRemoved',
  cleanupStartTime: 'cleanupStartTime',
  cleanupEndTime: 'cleanupEndTime',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CancellationRequestScalarFieldEnum = {
  id: 'id',
  reservationId: 'reservationId',
  restaurantId: 'restaurantId',
  requestedBy: 'requestedBy',
  requestedById: 'requestedById',
  requestedAt: 'requestedAt',
  status: 'status',
  reason: 'reason',
  reasonCategory: 'reasonCategory',
  additionalNotes: 'additionalNotes',
  processedAt: 'processedAt',
  processedBy: 'processedBy',
  refundAmount: 'refundAmount',
  refundPercentage: 'refundPercentage',
  refundNotes: 'refundNotes',
  windowType: 'windowType',
  tableSetId: 'tableSetId',
  mergedTableCount: 'mergedTableCount',
  releasedSlotIds: 'releasedSlotIds',
  slotReleaseCompletedAt: 'slotReleaseCompletedAt'
};

exports.Prisma.RestaurantRefundPolicyScalarFieldEnum = {
  id: 'id',
  restaurantId: 'restaurantId',
  mealType: 'mealType',
  allowedRefundTypes: 'allowedRefundTypes',
  fullRefundBeforeMinutes: 'fullRefundBeforeMinutes',
  partialRefundBeforeMinutes: 'partialRefundBeforeMinutes',
  partialRefundPercentage: 'partialRefundPercentage',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  createdBy: 'createdBy',
  updatedBy: 'updatedBy'
};

exports.Prisma.RefundTransactionScalarFieldEnum = {
  id: 'id',
  reservationId: 'reservationId',
  restaurantId: 'restaurantId',
  cancellationId: 'cancellationId',
  amount: 'amount',
  reason: 'reason',
  status: 'status',
  processedAt: 'processedAt',
  processedBy: 'processedBy',
  transactionReference: 'transactionReference',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  modificationRequestId: 'modificationRequestId'
};

exports.Prisma.PromoCodeScalarFieldEnum = {
  id: 'id',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  code: 'code',
  description: 'description',
  campaignType: 'campaignType',
  discountType: 'discountType',
  discountValue: 'discountValue',
  minimumOrderValue: 'minimumOrderValue',
  maximumDiscountAmount: 'maximumDiscountAmount',
  usageLimitPerUser: 'usageLimitPerUser',
  usageLimitTotal: 'usageLimitTotal',
  timesUsed: 'timesUsed',
  partySizeLimit: 'partySizeLimit',
  partySizeLimitPerUser: 'partySizeLimitPerUser',
  partySizeUsed: 'partySizeUsed',
  buffetTypes: 'buffetTypes',
  isActive: 'isActive',
  isDeleted: 'isDeleted',
  firstOrderOnly: 'firstOrderOnly',
  validFrom: 'validFrom',
  validUntil: 'validUntil',
  createdBy: 'createdBy',
  updatedBy: 'updatedBy'
};

exports.Prisma.PromoCodeRestaurantMappingScalarFieldEnum = {
  id: 'id',
  promoCodeId: 'promoCodeId',
  restaurantId: 'restaurantId',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PromoCodeCustomerMappingScalarFieldEnum = {
  id: 'id',
  promoCodeId: 'promoCodeId',
  customerId: 'customerId',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PromoCodeUsageScalarFieldEnum = {
  id: 'id',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  promoCodeId: 'promoCodeId',
  reservationId: 'reservationId',
  customerId: 'customerId',
  originalRequestId: 'originalRequestId',
  originalAmount: 'originalAmount',
  discountAmount: 'discountAmount',
  partySize: 'partySize',
  appliedAt: 'appliedAt',
  appliedBy: 'appliedBy'
};

exports.Prisma.FailedEmailScalarFieldEnum = {
  id: 'id',
  reservationId: 'reservationId',
  restaurantId: 'restaurantId',
  portalType: 'portalType',
  emailType: 'emailType',
  recipient: 'recipient',
  subject: 'subject',
  templateData: 'templateData',
  errorMessage: 'errorMessage',
  retryCount: 'retryCount',
  status: 'status',
  lastRetryAt: 'lastRetryAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MerchantUsersScalarFieldEnum = {
  id: 'id',
  businessId: 'businessId',
  role: 'role',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ReservationModificationRequestScalarFieldEnum = {
  id: 'id',
  reservationId: 'reservationId',
  restaurantId: 'restaurantId',
  requestedBy: 'requestedBy',
  modificationTypes: 'modificationTypes',
  requestedAt: 'requestedAt',
  status: 'status',
  originalDate: 'originalDate',
  originalTime: 'originalTime',
  originalAdultCount: 'originalAdultCount',
  originalChildCount: 'originalChildCount',
  originalMealType: 'originalMealType',
  originalAmount: 'originalAmount',
  originalServiceCharge: 'originalServiceCharge',
  originalTaxAmount: 'originalTaxAmount',
  originalAdvancePaymentAmount: 'originalAdvancePaymentAmount',
  originalRemainingPaymentAmount: 'originalRemainingPaymentAmount',
  originalPromoCodeId: 'originalPromoCodeId',
  originalDiscountAmount: 'originalDiscountAmount',
  newDate: 'newDate',
  newTime: 'newTime',
  newAdultCount: 'newAdultCount',
  newChildCount: 'newChildCount',
  newMealType: 'newMealType',
  newAmount: 'newAmount',
  newServiceCharge: 'newServiceCharge',
  newTaxAmount: 'newTaxAmount',
  newDiscountAmount: 'newDiscountAmount',
  newAdvancePaymentAmount: 'newAdvancePaymentAmount',
  newRemainingPaymentAmount: 'newRemainingPaymentAmount',
  priceDifference: 'priceDifference',
  additionalPaymentRequired: 'additionalPaymentRequired',
  refundRequired: 'refundRequired',
  processedAt: 'processedAt',
  processedBy: 'processedBy',
  rejectionReason: 'rejectionReason',
  notes: 'notes',
  promoCodeReapplied: 'promoCodeReapplied',
  promoCodeAdjustmentNotes: 'promoCodeAdjustmentNotes',
  seatsReleased: 'seatsReleased',
  seatsReserved: 'seatsReserved',
  capacityAdjustedAt: 'capacityAdjustedAt'
};

exports.Prisma.ReservationModificationStatusHistoryScalarFieldEnum = {
  id: 'id',
  modificationId: 'modificationId',
  previousStatus: 'previousStatus',
  newStatus: 'newStatus',
  changeReason: 'changeReason',
  statusChangedAt: 'statusChangedAt',
  changedBy: 'changedBy'
};

exports.Prisma.ReservationModificationHistoryScalarFieldEnum = {
  id: 'id',
  reservationId: 'reservationId',
  modificationId: 'modificationId',
  previousDate: 'previousDate',
  previousTime: 'previousTime',
  previousAdultCount: 'previousAdultCount',
  previousChildCount: 'previousChildCount',
  previousMealType: 'previousMealType',
  previousAmount: 'previousAmount',
  previousServiceCharge: 'previousServiceCharge',
  previousTaxAmount: 'previousTaxAmount',
  previousDiscountAmount: 'previousDiscountAmount',
  previousAdvancePaymentAmount: 'previousAdvancePaymentAmount',
  previousRemainingPaymentAmount: 'previousRemainingPaymentAmount',
  newDate: 'newDate',
  newTime: 'newTime',
  newAdultCount: 'newAdultCount',
  newChildCount: 'newChildCount',
  newMealType: 'newMealType',
  newAmount: 'newAmount',
  newServiceCharge: 'newServiceCharge',
  newTaxAmount: 'newTaxAmount',
  newDiscountAmount: 'newDiscountAmount',
  newAdvancePaymentAmount: 'newAdvancePaymentAmount',
  newRemainingPaymentAmount: 'newRemainingPaymentAmount',
  modifiedAt: 'modifiedAt',
  modifiedBy: 'modifiedBy'
};

exports.Prisma.ReservationFinancialDataScalarFieldEnum = {
  id: 'id',
  reservationId: 'reservationId',
  netBuffetPrice: 'netBuffetPrice',
  taxAmount: 'taxAmount',
  serviceCharge: 'serviceCharge',
  totalBeforeDiscount: 'totalBeforeDiscount',
  discount: 'discount',
  totalAfterDiscount: 'totalAfterDiscount',
  advancePayment: 'advancePayment',
  balanceDue: 'balanceDue',
  isPaid: 'isPaid',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RestaurantPaymentLinkScalarFieldEnum = {
  id: 'id',
  requestId: 'requestId',
  token: 'token',
  status: 'status',
  expiresAt: 'expiresAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RestaurantPlatterScalarFieldEnum = {
  id: 'id',
  restaurantId: 'restaurantId',
  mealServiceId: 'mealServiceId',
  platterName: 'platterName',
  platterDescription: 'platterDescription',
  headCount: 'headCount',
  adultGrossPrice: 'adultGrossPrice',
  childGrossPrice: 'childGrossPrice',
  adultNetPrice: 'adultNetPrice',
  childNetPrice: 'childNetPrice',
  isActive: 'isActive',
  displayOrder: 'displayOrder',
  isDefault: 'isDefault',
  features: 'features',
  images: 'images',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  createdBy: 'createdBy',
  updatedBy: 'updatedBy'
};

exports.Prisma.RestaurantSectionScalarFieldEnum = {
  id: 'id',
  restaurantId: 'restaurantId',
  sectionName: 'sectionName',
  description: 'description',
  isActive: 'isActive',
  displayOrder: 'displayOrder',
  capacity: 'capacity',
  canvasData: 'canvasData',
  canvasWidth: 'canvasWidth',
  canvasHeight: 'canvasHeight',
  floorPlanImage: 'floorPlanImage',
  isCanvasEnabled: 'isCanvasEnabled',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RestaurantTableScalarFieldEnum = {
  id: 'id',
  restaurantId: 'restaurantId',
  sectionId: 'sectionId',
  tableName: 'tableName',
  seatingCapacity: 'seatingCapacity',
  tableType: 'tableType',
  isActive: 'isActive',
  position: 'position',
  amenities: 'amenities',
  fabricObjectId: 'fabricObjectId',
  canvasProperties: 'canvasProperties',
  isDraggable: 'isDraggable',
  isResizable: 'isResizable',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TableAvailabilitySlotScalarFieldEnum = {
  id: 'id',
  restaurantId: 'restaurantId',
  tableId: 'tableId',
  date: 'date',
  startTime: 'startTime',
  endTime: 'endTime',
  status: 'status',
  reservationId: 'reservationId',
  holdExpiresAt: 'holdExpiresAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TableReservationUtilsConfigurationScalarFieldEnum = {
  id: 'id',
  restaurantId: 'restaurantId',
  feeType: 'feeType',
  feeValue: 'feeValue',
  requiresAdvancePayment: 'requiresAdvancePayment',
  advancePaymentType: 'advancePaymentType',
  advancePaymentValue: 'advancePaymentValue',
  defaultSlotMinutes: 'defaultSlotMinutes',
  turnoverBufferMinutes: 'turnoverBufferMinutes',
  enableTemporaryHold: 'enableTemporaryHold',
  holdMinutes: 'holdMinutes',
  allowFlexibleAssignment: 'allowFlexibleAssignment',
  defaultDwellMinutes: 'defaultDwellMinutes',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TableSlotGenerationConfigScalarFieldEnum = {
  id: 'id',
  tableReservationConfigId: 'tableReservationConfigId',
  isActive: 'isActive',
  startTime: 'startTime',
  slotDurationMinutes: 'slotDurationMinutes',
  turnoverBufferMinutes: 'turnoverBufferMinutes',
  advanceBookingDays: 'advanceBookingDays',
  enabledDays: 'enabledDays',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  createdBy: 'createdBy',
  updatedBy: 'updatedBy'
};

exports.Prisma.ReservationRequestTableDetailsScalarFieldEnum = {
  requestId: 'requestId',
  preferredSectionId: 'preferredSectionId',
  preferredTableId: 'preferredTableId',
  preferredTimeSlotStart: 'preferredTimeSlotStart',
  preferredTimeSlotEnd: 'preferredTimeSlotEnd',
  isFlexibleWithTable: 'isFlexibleWithTable',
  isFlexibleWithSection: 'isFlexibleWithSection',
  isFlexibleWithTime: 'isFlexibleWithTime',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ReservationTableAssignmentScalarFieldEnum = {
  reservationId: 'reservationId',
  assignedSectionId: 'assignedSectionId',
  assignedTableId: 'assignedTableId',
  slotId: 'slotId',
  tableStartTime: 'tableStartTime',
  tableEndTime: 'tableEndTime',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ReservationTableHoldScalarFieldEnum = {
  id: 'id',
  requestId: 'requestId',
  slotId: 'slotId',
  holdExpiresAt: 'holdExpiresAt',
  createdAt: 'createdAt'
};

exports.Prisma.TableReservationModificationRequestScalarFieldEnum = {
  id: 'id',
  reservationId: 'reservationId',
  restaurantId: 'restaurantId',
  requestedBy: 'requestedBy',
  modificationTypes: 'modificationTypes',
  requestedAt: 'requestedAt',
  status: 'status',
  originalAdultCount: 'originalAdultCount',
  originalChildCount: 'originalChildCount',
  originalSectionId: 'originalSectionId',
  originalTableId: 'originalTableId',
  originalSlotId: 'originalSlotId',
  originalTableStartTime: 'originalTableStartTime',
  originalTableEndTime: 'originalTableEndTime',
  originalSpecialRequests: 'originalSpecialRequests',
  newAdultCount: 'newAdultCount',
  newChildCount: 'newChildCount',
  newSectionId: 'newSectionId',
  newTableId: 'newTableId',
  newSlotId: 'newSlotId',
  newTableStartTime: 'newTableStartTime',
  newTableEndTime: 'newTableEndTime',
  newSpecialRequests: 'newSpecialRequests',
  processedAt: 'processedAt',
  processedBy: 'processedBy',
  rejectionReason: 'rejectionReason',
  notes: 'notes',
  originalSlotReleased: 'originalSlotReleased',
  newSlotReserved: 'newSlotReserved',
  slotAdjustedAt: 'slotAdjustedAt'
};

exports.Prisma.TableReservationModificationStatusHistoryScalarFieldEnum = {
  id: 'id',
  modificationId: 'modificationId',
  previousStatus: 'previousStatus',
  newStatus: 'newStatus',
  changeReason: 'changeReason',
  statusChangedAt: 'statusChangedAt',
  changedBy: 'changedBy'
};

exports.Prisma.TableReservationModificationHistoryScalarFieldEnum = {
  id: 'id',
  reservationId: 'reservationId',
  modificationId: 'modificationId',
  previousAdultCount: 'previousAdultCount',
  previousChildCount: 'previousChildCount',
  previousSectionId: 'previousSectionId',
  previousTableId: 'previousTableId',
  previousSlotId: 'previousSlotId',
  previousTableStartTime: 'previousTableStartTime',
  previousTableEndTime: 'previousTableEndTime',
  previousSpecialRequests: 'previousSpecialRequests',
  newAdultCount: 'newAdultCount',
  newChildCount: 'newChildCount',
  newSectionId: 'newSectionId',
  newTableId: 'newTableId',
  newSlotId: 'newSlotId',
  newTableStartTime: 'newTableStartTime',
  newTableEndTime: 'newTableEndTime',
  newSpecialRequests: 'newSpecialRequests',
  modifiedAt: 'modifiedAt',
  modifiedBy: 'modifiedBy'
};

exports.Prisma.ReservationBusinessPolicyScalarFieldEnum = {
  id: 'id',
  restaurantId: 'restaurantId',
  name: 'name',
  title: 'title',
  content: 'content',
  isRefundAllowed: 'isRefundAllowed',
  requiresPayment: 'requiresPayment',
  paymentType: 'paymentType',
  paymentValue: 'paymentValue',
  paymentHandledByOptions: 'paymentHandledByOptions',
  isActive: 'isActive',
  isVisibleCustomerPortal: 'isVisibleCustomerPortal',
  isIncludedConfirmationEmail: 'isIncludedConfirmationEmail',
  isOptional: 'isOptional',
  partySizeMin: 'partySizeMin',
  partySizeMax: 'partySizeMax',
  applicableDays: 'applicableDays',
  timeIntervalStart: 'timeIntervalStart',
  timeIntervalEnd: 'timeIntervalEnd',
  applicableSectionIds: 'applicableSectionIds',
  applicableMealTypes: 'applicableMealTypes',
  applicableReservationTypes: 'applicableReservationTypes',
  priority: 'priority',
  skipText: 'skipText',
  userSelectionAllowed: 'userSelectionAllowed',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  createdBy: 'createdBy',
  updatedBy: 'updatedBy'
};

exports.Prisma.ReservationPolicyOptionScalarFieldEnum = {
  id: 'id',
  policyId: 'policyId',
  optionName: 'optionName',
  description: 'description',
  additionalPrice: 'additionalPrice',
  additionalPriceType: 'additionalPriceType',
  requiresPayment: 'requiresPayment',
  isDefault: 'isDefault',
  displayOrder: 'displayOrder',
  applicableDays: 'applicableDays',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ReservationAppliedPoliciesScalarFieldEnum = {
  id: 'id',
  reservationId: 'reservationId',
  requestId: 'requestId',
  policyId: 'policyId',
  selectedOptionId: 'selectedOptionId',
  wasAccepted: 'wasAccepted',
  wasSkipped: 'wasSkipped',
  appliedAt: 'appliedAt'
};

exports.Prisma.TableSetScalarFieldEnum = {
  id: 'id',
  reservationId: 'reservationId',
  slotDate: 'slotDate',
  slotStartTime: 'slotStartTime',
  slotEndTime: 'slotEndTime',
  tableIds: 'tableIds',
  slotIds: 'slotIds',
  primaryTableId: 'primaryTableId',
  originalStatuses: 'originalStatuses',
  status: 'status',
  combinedCapacity: 'combinedCapacity',
  createdAt: 'createdAt',
  createdBy: 'createdBy',
  confirmedAt: 'confirmedAt',
  confirmedBy: 'confirmedBy',
  expiresAt: 'expiresAt',
  dissolvedAt: 'dissolvedAt',
  dissolvedBy: 'dissolvedBy'
};

exports.Prisma.FavoriteRestaurantScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  restaurantId: 'restaurantId',
  externalRestaurantId: 'externalRestaurantId',
  isInternal: 'isInternal',
  createdAt: 'createdAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};
exports.ReservationSupportType = exports.$Enums.ReservationSupportType = {
  BUFFET_ONLY: 'BUFFET_ONLY',
  TABLE_ONLY: 'TABLE_ONLY',
  BOTH: 'BOTH'
};

exports.DayOfWeek = exports.$Enums.DayOfWeek = {
  MONDAY: 'MONDAY',
  TUESDAY: 'TUESDAY',
  WEDNESDAY: 'WEDNESDAY',
  THURSDAY: 'THURSDAY',
  FRIDAY: 'FRIDAY',
  SATURDAY: 'SATURDAY',
  SUNDAY: 'SUNDAY'
};

exports.MealType = exports.$Enums.MealType = {
  BREAKFAST: 'BREAKFAST',
  BRUNCH: 'BRUNCH',
  LUNCH: 'LUNCH',
  HIGH_TEA: 'HIGH_TEA',
  DINNER: 'DINNER',
  SPECIAL: 'SPECIAL'
};

exports.ReservationType = exports.$Enums.ReservationType = {
  BUFFET_ONLY: 'BUFFET_ONLY',
  TABLE_ONLY: 'TABLE_ONLY',
  BUFFET_AND_TABLE: 'BUFFET_AND_TABLE'
};

exports.RequestCreatorType = exports.$Enums.RequestCreatorType = {
  CUSTOMER: 'CUSTOMER',
  MERCHANT: 'MERCHANT',
  MERCHANT_WALK_IN: 'MERCHANT_WALK_IN',
  SYSTEM: 'SYSTEM',
  OTHER: 'OTHER'
};

exports.PaymentStatus = exports.$Enums.PaymentStatus = {
  INITIATED: 'INITIATED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED'
};

exports.PaymentChannel = exports.$Enums.PaymentChannel = {
  CREDIT_CARD: 'CREDIT_CARD',
  DEBIT_CARD: 'DEBIT_CARD',
  BANK_TRANSFER: 'BANK_TRANSFER',
  DIGITAL_WALLET: 'DIGITAL_WALLET',
  CASH: 'CASH',
  OTHER: 'OTHER'
};

exports.ReservationRequestStatus = exports.$Enums.ReservationRequestStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
  MERCHANT_INITIATED: 'MERCHANT_INITIATED',
  PENDING_CUSTOMER_PAYMENT: 'PENDING_CUSTOMER_PAYMENT',
  PAYMENT_LINK_EXPIRED: 'PAYMENT_LINK_EXPIRED',
  PROCESSING: 'PROCESSING',
  SLOTS_NOT_AVAILABLE: 'SLOTS_NOT_AVAILABLE',
  TIMEOUT: 'TIMEOUT',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  MEAL_SERVICE_NOT_AVAILABLE: 'MEAL_SERVICE_NOT_AVAILABLE',
  ERROR: 'ERROR'
};

exports.NotificationType = exports.$Enums.NotificationType = {
  RESERVATION_REQUEST: 'RESERVATION_REQUEST',
  RESERVATION_CONFIRMED: 'RESERVATION_CONFIRMED',
  RESERVATION_CANCELLED: 'RESERVATION_CANCELLED',
  RESERVATION_MODIFIED: 'RESERVATION_MODIFIED',
  MODIFICATION_REQUESTED: 'MODIFICATION_REQUESTED',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  REVIEW_POSTED: 'REVIEW_POSTED',
  SYSTEM_ALERT: 'SYSTEM_ALERT'
};

exports.CancellationRequestedBy = exports.$Enums.CancellationRequestedBy = {
  CUSTOMER: 'CUSTOMER',
  MERCHANT: 'MERCHANT',
  SYSTEM: 'SYSTEM'
};

exports.CancellationStatus = exports.$Enums.CancellationStatus = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  APPROVED_PENDING_REFUND: 'APPROVED_PENDING_REFUND',
  APPROVED_REFUNDED: 'APPROVED_REFUNDED',
  APPROVED_NO_REFUND: 'APPROVED_NO_REFUND',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED'
};

exports.CancellationReasonCategory = exports.$Enums.CancellationReasonCategory = {
  CHANGE_OF_PLANS: 'CHANGE_OF_PLANS',
  EMERGENCY: 'EMERGENCY',
  WEATHER: 'WEATHER',
  RESTAURANT_ISSUE: 'RESTAURANT_ISSUE',
  DOUBLE_BOOKING: 'DOUBLE_BOOKING',
  SYSTEM_ERROR: 'SYSTEM_ERROR',
  OTHER: 'OTHER'
};

exports.CancellationWindowType = exports.$Enums.CancellationWindowType = {
  FREE: 'FREE',
  PARTIAL: 'PARTIAL',
  NO_REFUND: 'NO_REFUND'
};

exports.RefundType = exports.$Enums.RefundType = {
  FULL: 'FULL',
  PARTIAL: 'PARTIAL',
  NONE: 'NONE'
};

exports.RefundReason = exports.$Enums.RefundReason = {
  RESERVATION_CANCELLATION: 'RESERVATION_CANCELLATION',
  RESERVATION_MODIFICATION: 'RESERVATION_MODIFICATION',
  PAX_MODIFICATION: 'PAX_MODIFICATION',
  SPECIAL_CIRCUMSTANCE: 'SPECIAL_CIRCUMSTANCE',
  CUSTOMER_COMPLAINT: 'CUSTOMER_COMPLAINT',
  MERCHANT_INITIATED: 'MERCHANT_INITIATED',
  SYSTEM_ERROR: 'SYSTEM_ERROR'
};

exports.RefundStatus = exports.$Enums.RefundStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  REVERSED: 'REVERSED'
};

exports.CampaignType = exports.$Enums.CampaignType = {
  PLATFORM: 'PLATFORM',
  MERCHANT: 'MERCHANT'
};

exports.DiscountType = exports.$Enums.DiscountType = {
  PERCENTAGE_OFF: 'PERCENTAGE_OFF',
  FIXED_AMOUNT_OFF: 'FIXED_AMOUNT_OFF'
};

exports.PortalType = exports.$Enums.PortalType = {
  MERCHANT: 'MERCHANT',
  GUEST: 'GUEST',
  ADMIN: 'ADMIN'
};

exports.EmailStatus = exports.$Enums.EmailStatus = {
  FAILED: 'FAILED',
  RETRY_PENDING: 'RETRY_PENDING',
  RETRY_SUCCESS: 'RETRY_SUCCESS',
  RETRY_FAILED: 'RETRY_FAILED',
  ABANDONED: 'ABANDONED'
};

exports.KeycloakRole = exports.$Enums.KeycloakRole = {
  admin: 'admin',
  IT: 'IT',
  Finance: 'Finance',
  Staff: 'Staff'
};

exports.ModificationStatus = exports.$Enums.ModificationStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
};

exports.ModificationType = exports.$Enums.ModificationType = {
  DATE_TIME: 'DATE_TIME',
  PARTY_SIZE: 'PARTY_SIZE',
  MEAL_TYPE: 'MEAL_TYPE',
  BOTH: 'BOTH',
  OTHER: 'OTHER'
};

exports.PaymentLinkStatus = exports.$Enums.PaymentLinkStatus = {
  ACTIVE: 'ACTIVE',
  USED: 'USED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED'
};

exports.TableSlotStatus = exports.$Enums.TableSlotStatus = {
  AVAILABLE: 'AVAILABLE',
  HELD: 'HELD',
  RESERVED: 'RESERVED',
  BLOCKED: 'BLOCKED',
  MAINTENANCE: 'MAINTENANCE'
};

exports.FeeType = exports.$Enums.FeeType = {
  PERCENTAGE: 'PERCENTAGE',
  FIXED: 'FIXED'
};

exports.TableModificationStatus = exports.$Enums.TableModificationStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
};

exports.TableModificationType = exports.$Enums.TableModificationType = {
  PARTY_SIZE: 'PARTY_SIZE',
  SECTION_ASSIGNMENT: 'SECTION_ASSIGNMENT',
  TABLE_ASSIGNMENT: 'TABLE_ASSIGNMENT',
  TIME_SLOT: 'TIME_SLOT',
  SPECIAL_REQUESTS: 'SPECIAL_REQUESTS',
  BOTH: 'BOTH',
  OTHER: 'OTHER'
};

exports.TableSetStatus = exports.$Enums.TableSetStatus = {
  PENDING_MERGE: 'PENDING_MERGE',
  ACTIVE: 'ACTIVE',
  DISSOLVED: 'DISSOLVED',
  EXPIRED: 'EXPIRED'
};

exports.Prisma.ModelName = {
  Business: 'Business',
  Restaurant: 'Restaurant',
  Location: 'Location',
  Cuisine: 'Cuisine',
  RestaurantCuisine: 'RestaurantCuisine',
  RestaurantOperatingHours: 'RestaurantOperatingHours',
  RestaurantMealService: 'RestaurantMealService',
  RestaurantMealServiceSchedule: 'RestaurantMealServiceSchedule',
  RestaurantCapacity: 'RestaurantCapacity',
  RestaurantImage: 'RestaurantImage',
  RestaurantReviewStats: 'RestaurantReviewStats',
  Customer: 'Customer',
  Reservation: 'Reservation',
  ReservationPayment: 'ReservationPayment',
  RestaurantSpecialClosure: 'RestaurantSpecialClosure',
  ReservationRequest: 'ReservationRequest',
  ReservationRequestStatusHistory: 'ReservationRequestStatusHistory',
  ReservationRequestPayment: 'ReservationRequestPayment',
  ReservationReview: 'ReservationReview',
  ReservationReviewPhoto: 'ReservationReviewPhoto',
  ReservationReviewResponse: 'ReservationReviewResponse',
  City: 'City',
  RestaurantServiceArea: 'RestaurantServiceArea',
  Notification: 'Notification',
  CleanupLog: 'CleanupLog',
  CancellationRequest: 'CancellationRequest',
  RestaurantRefundPolicy: 'RestaurantRefundPolicy',
  RefundTransaction: 'RefundTransaction',
  PromoCode: 'PromoCode',
  PromoCodeRestaurantMapping: 'PromoCodeRestaurantMapping',
  PromoCodeCustomerMapping: 'PromoCodeCustomerMapping',
  PromoCodeUsage: 'PromoCodeUsage',
  FailedEmail: 'FailedEmail',
  MerchantUsers: 'MerchantUsers',
  ReservationModificationRequest: 'ReservationModificationRequest',
  ReservationModificationStatusHistory: 'ReservationModificationStatusHistory',
  ReservationModificationHistory: 'ReservationModificationHistory',
  ReservationFinancialData: 'ReservationFinancialData',
  RestaurantPaymentLink: 'RestaurantPaymentLink',
  RestaurantPlatter: 'RestaurantPlatter',
  RestaurantSection: 'RestaurantSection',
  RestaurantTable: 'RestaurantTable',
  TableAvailabilitySlot: 'TableAvailabilitySlot',
  TableReservationUtilsConfiguration: 'TableReservationUtilsConfiguration',
  TableSlotGenerationConfig: 'TableSlotGenerationConfig',
  ReservationRequestTableDetails: 'ReservationRequestTableDetails',
  ReservationTableAssignment: 'ReservationTableAssignment',
  ReservationTableHold: 'ReservationTableHold',
  TableReservationModificationRequest: 'TableReservationModificationRequest',
  TableReservationModificationStatusHistory: 'TableReservationModificationStatusHistory',
  TableReservationModificationHistory: 'TableReservationModificationHistory',
  ReservationBusinessPolicy: 'ReservationBusinessPolicy',
  ReservationPolicyOption: 'ReservationPolicyOption',
  ReservationAppliedPolicies: 'ReservationAppliedPolicies',
  TableSet: 'TableSet',
  FavoriteRestaurant: 'FavoriteRestaurant'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }

        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
