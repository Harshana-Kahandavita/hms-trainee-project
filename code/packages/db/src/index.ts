export * from '../prisma/generated/prisma';
export { default as prisma } from './client';
export type { Decimal } from 'decimal.js';
export * from './queries';
export * from './cleanup-service';
export * from './capacity-service';
export * from './reservation_review';
export * from './table-merge/table-merge-queries';
export * from './payment_flow';
export {
  getRestaurantReviewStats,
  getAllRestaurantReviewStats,
  updateStatsAfterReviewChange
} from './restaurant_review_stats';
export * from './restaurant_web_queries/restaurant_review_queries';
export * from './restaurant_web_queries/latest_reviews_queries'
export * from './restaurant_web_queries/reservation-management-queries';
export * from './restaurant_web_queries/table-reservation-management-queries';
export * from './restaurant_web_queries/policy_queries';

export {
  listPromotions,
  createPromotion,
  updatePromotion,
  updatePromotionStatus,
  deletePromotion,
  type ListPromotionsResult,
  type CreatePromotionResult,
  type UpdatePromotionResult,
  type UpdatePromotionStatusResult,
  type DeletePromotionResult,
} from './admin_web_queries/promotion_queries';

export {
  listRestaurants,
  type ListRestaurantsResult,
} from './admin_web_queries/restaurant_queries';


export {
  listAnalyticsOrders,
  getAnalyticsSalesSummary,
  getMerchantNames,
  type AnalyticsOrderRow,
  type ListAnalyticsOrdersResult,
} from './admin_web_queries/analytics_queries';

export {
  createReservationBusinessPolicy,
  updateReservationBusinessPolicy,
  deleteReservationBusinessPolicy,
  getReservationBusinessPolicies,
  getReservationBusinessPolicyById,
  getApplicablePoliciesForReservation,
  type CreatePolicyResult,
  type ApplicablePolicyInput,
  type GetApplicablePoliciesResult,
  type ApplicablePolicy,
  type UpdatePolicyResult,
  type DeletePolicyResult,
  type GetPoliciesResult,
  type ReservationBusinessPolicyInput,
  type ReservationBusinessPolicyUpdateInput,
  type PolicyOptionInput,
} from './restaurant_web_queries/reservation_business_policy_queries';

export {
  GrowthHackQueries,
} from './admin_web_queries/growthhack_queries';

// Export reservation modification queries
export * from './reservation_modifications/get_modification_price_difference';
export * from './reservation_modifications/get_valid_meal_services';

export {
  getAvailableMealServices,
  calculateMealPrice,
  getMealServicePricingDetails,
  type MealPriceCalculation,
  type MealServiceDetails,
  type MealServicePricingDetails,
} from './restaurant_meal_service';

export {
  getUpcomingMealService,
} from './restaurant_details';

export { getBusinessEmailById } from './restaurant_web_queries/business_queries'
export {
  getRestaurantsByReservationType,
  type RestaurantListingResponse,
  type RestaurantListItem,
  type PaginationMeta,
} from './restaurant_listing';

export { createInitialReservationRequest } from './reservation_flow';
export { createRestaurantReservationAction } from './restaurant_web_queries/reservation_queries';
export { getRestaurantInfo } from './restaurant_info';

// Manual Reservation Database Layer
// Export manual-reservation barrel, but avoid duplicating shared Query types
export {
  ManualReservationQueries,
  PromoCodeQueries,
  CapacityQuotaQueries,
  PlatterQueries,
  PendingRequestsQueries,
} from './manual-reservation'
export type {
  GetMealServiceInput,
  GetCapacityInput,
  UpsertCustomerInput,
  CreateReservationRequestInput,
  MealServiceResult,
  CapacityResult,
  CustomerResult,
  ManualReservationRestaurantSettings,
  ReservationRequestResult,
  GetPlattersByMealServiceInput,
  GetPlatterByIdInput,
  GetDefaultPlatterInput,
  PlatterResult,
  PlatterListResult,
  PlatterDisplay,
  PromoCodeValidationData,
  PromoCodeUsageRecord,
  PromoCodeRestaurantMappingRecord,
  PromoCodeCustomerMappingRecord,
  RecordPromoCodeUsageInput,
  CreateReservationRequestWithPromoCodeInput,
  ConfirmNonAdvanceReservationInput,
  ReservationConfirmationResult,
  ReservationNotificationData,
  AdvancePaymentNotificationData,
} from './manual-reservation/types'
export type {
  GetPendingRequestsInput,
  FilteredRequestsInput,
  PendingRequestResult,
  RequestDetailsResult,
  RequestCountsResult,
  PaginatedPendingRequestsResult,
} from './manual-reservation/pending-requests/types'

// Re-export a single canonical QueryError/QueryResult to avoid duplicates
export type { QueryError, QueryResult } from './types'

// Restaurant availability functions and types
export {
  findAvailableSlots,
  checkSlotAvailability,
  getAvailableSeatsByMealType,
  type FindAvailableSlotsRequest,
  type FindAvailableSlotsResponse,
  type TimeSlot,
  type MealTypeAvailability,
  type RestaurantAvailabilityResponse,
} from './resturants';

// Payment link management functions and types
export {
  createRestaurantPaymentLink,
  getPaymentLinkByToken,
  getPaymentLinkByRequestId,
  updatePaymentLinkStatus,
  markPaymentLinkClicked,
  expireOldPaymentLinks,
  type CreatePaymentLinkInput,
  type CreatePaymentLinkResult,
  type GetPaymentLinkResult,
  type UpdatePaymentLinkStatusResult,
  type ExpiredLinksResult,
} from './payment-link-queries';

export {
  getRestaurantOperatingData,
  getRestaurantMealServicesWithCapacity,
} from './restaurant_queries';

// Restaurant availability queries
export { RestaurantAvailabilityQueries } from './restaurant/RestaurantAvailabilityQueries';
export { RestaurantContactQueries } from './restaurant/RestaurantContactQueries';
export type { RestaurantContactInfo, RestaurantContactResponse } from './restaurant/RestaurantContactQueries';
export type { MealServiceAvailabilityData } from './restaurant/types';

export { GuestPromoQueries } from './promos/GuestPromoQueries';
export type { GuestPromo } from './promos/GuestPromoQueries';

// Table Reservation Services
export * from './table-reservation';

// Customer Management - explicitly export to avoid conflicts
export {
  getOrCreateCustomer,
  getOrCreateGenericWalkInCustomer,
  getCustomerByPhone,
  getCustomerByEmail,
  type GetOrCreateCustomerInputType,
  type GetOrCreateCustomerResult,
  type GetOrCreateGenericWalkInCustomerResultType,
  type CustomerDetailsResult,
  type CustomerByEmailResult,
  type CustomerByPhoneResult
} from './table-reservation/customer-management';

export * from './table-reservation/table_listing_shared_queries';
export {
  findRestaurantSection,
  applyReservationPolicies,
  type FindRestaurantSectionInput,
  type FindRestaurantSectionResult,
  type ApplyReservationPoliciesInput,
  type ApplyReservationPoliciesResult
} from './table-reservation/table_listing_shared_queries/table_restaurant_setup';

// Table Cancellation orchestrator and helpers
export * from './table-cancellation/table-cancellation-queries'
export { CancellationQueries } from './table-cancellation/cancellation-queries'
export { TableMergeOperations } from './table-cancellation/table-merge-operations'
export * from './table-reservation/cancellation/table-cancellation-db-queries'
export {
  getReservationForCustomerCancellation,
  type CancellationReservationDetails
} from './table-cancellation/customer-cancellation-queries'
export type {
  CancellationValidationInput,
  CancellationValidationData,
  RefundQuote,
  CreateCancellationRequestParams,
  CreatedCancellationRequest,
  ReleaseSingleTableSlotParams,
  ReleaseMergedTableSlotsParams,
  ReservationCancellationSnapshot
} from './table-cancellation/types'

// Favorite Restaurants
export {
  getFavorites,
  isFavorite,
  toggleFavorite,
  type FavoriteRestaurantResult,
  type GetFavoritesResponse,
  type IsFavoriteResponse,
  type ToggleFavoriteResponse,
  type GetFavoritesParams,
  type IsFavoriteParams,
  type ToggleFavoriteParams
} from './favorite_restaurants'

// Guest-web reservation queries
export {
  getReservationsByStatus,
  cancelReservation,
  getReservationById,
  type ReservationData,
  type GetReservationByIdResult
} from './reservations'
