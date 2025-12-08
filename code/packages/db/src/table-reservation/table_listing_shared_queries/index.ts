// Shared Database Queries
// This module exports reusable database queries that can be used across multiple modules
// (admin-web, restaurant-web, mobile apps, etc.)

export {
  // Table Restaurant Setup Queries
  createRestaurantSections,
  createRestaurantTables,
  createRestaurantOperatingHours,
  createTableReservationUtilsConfig,
  generateTableAvailabilitySlots,

  // Update Queries
  updateRestaurantSection,
  updateRestaurantTable,
  updateTableReservationUtilsConfig,

  // Validation Queries
  validateTableRestaurantSetup,

  // Type Definitions
  type RestaurantSectionInput,
  type RestaurantTableInput,
  type OperatingHoursInput,
  type TableReservationUtilsConfigInput,
  type SlotGenerationInput,
  type RefundPolicyInput,

  // Update Input Types
  type UpdateRestaurantSectionInput,
  type UpdateRestaurantTableInput,
  type UpdateTableReservationUtilsConfigInput,

  // Result Types
  type SectionCreationResult,
  type TableCreationResult,
  type OperatingHoursResult,
  type TableReservationConfigResult,
  type SlotGenerationResult,
  type RefundPolicyResult,

  // Update Result Types
  type SectionUpdateResult,
  type TableUpdateResult,
  type ConfigUpdateResult,

  // Other Types
  type ValidationResult,
  type RestaurantTypesSummary,
} from './table_restaurant_setup';
