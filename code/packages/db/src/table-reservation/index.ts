// Export types
export * from './types';

// Export reservations module
export * from './reservations';

// Export layout module
export * from './layout';

// Export configuration services
export { getTableReservationConfig, getDwellingTimeConfiguration } from './configuration';

// Export availability services
export { getSectionsAndTables, getAvailableTableSlots, getAvailableTableSlotsBySection, filterSlotsByDwellTimeConflicts, markExpiredHeldSlotsAsAvailable } from './availability';

// Export slot management services
export {
  holdTableSlot,
  reserveTableSlot,
  releaseExpiredHolds,
  getAvailableSlotsForBlocking,
  blockRestaurantAvailability,
  getBlockedSlotsForUnblocking,
  unblockRestaurantAvailability
} from './slot-management';

// Export request management services
export { 
  createTableReservationRequest, 
  confirmTableReservation,
  findAndHoldBestTableSlot,
  releaseTableSlot,
  validateHeldSlot,
  reassignTableReservation,
  updateTableReservationDetails,
  hasOverlappingReservations
} from './request-management';

// Export reservation creation services
export {
  createTableReservation,
  type CreateTableReservationInputType,
  type CreateTableReservationResult
} from './reservation-creation';

// Export table modification services
export {
  processTableReservationModification,
  type TableReservationModificationInput,
  type TableModificationResult
} from './table-modification-flow';

// Export restaurant web queries
export {
  getTableReservations,
  completeTableReservation,
  acceptTableReservation,
  seatTableReservation,
  pendingTableReservation,
  cancelTableReservation,
  getAvailableTablesForSection,
  getAvailableSectionsForTimeSlot,
  validatePartySizeChange,
  updateTableReservationDetailsQuery,
  updateTableReservationDetailsWithTimeBasedSlots,
  updateSpecialRequests,
  getRestaurantSections,
  getRestaurantTables,
  checkTableAvailabilityForReservation,
  getAvailableTablesForSectionOnDate,
  getAvailableTablesForTimeSlot,
  getAvailableTablesForReservationTime,
  validateTableAvailabilityForUpdate
} from '../restaurant_web_queries/table-reservation-management-queries';

// Export meal services
export { getMealServices } from '../restaurant_web_queries/reservation-management-queries';

export { 
  releaseExpiredTableSlotHolds,
  getTableSlotHoldStats
} from './cleanup';

// Export edit reservation services
export {
  editTableReservationWithSlots,
  type EditTableReservationInput,
  type EditTableReservationResult
} from './edit-reservation-with-slots';

// Export edit reservation query helpers
export {
  fetchReservationForEdit,
  fetchTableWithSection,
  fetchSection,
  releaseTableSlot as releaseTableSlotQuery,
  findAvailableSlot,
  findConflictingSlot,
  reserveExistingSlot,
  createAndReserveSlot,
  updateReservationFields,
  updateTableAssignment,
  createTableAssignment,
  createModificationRequest as createTableModificationRequest,
  updateModificationRequest as updateTableModificationRequest,
  createModificationStatusHistory as createTableModificationStatusHistory,
  createModificationHistory as createTableModificationHistory,
  fetchModificationStatus,
  fetchFinalReservationState
} from './edit-reservation-queries';

// Export time utilities
export {
  normalizeTimeForStorage,
  formatTime,
  formatTimeFromDate,
  calculateEndTime,
  normalizeDateToMidnight,
  isPastDate,
  timesOverlap,
  parseTimeString,
  combineDateAndTime,
  extractNormalizedTime,
  getDayBoundaries,
  isWithinOperatingHours,
  addBufferTime
} from './time-utils';

// Export slot availability queries
export {
  checkTableSlotAvailability,
  getAvailableTimeSlotsForTable,
  getAvailableTablesForDateTime,
  type CheckSlotAvailabilityInput,
  type CheckSlotAvailabilityResult
} from './slot-availability-queries';

// Export reservation request queries
export {
  updateReservationRequestStatus,
  type UpdateReservationRequestStatusResult
} from './reservation-request-queries';

// Export payment queries
export {
  updatePaymentStatusByTransaction,
  type UpdatePaymentStatusByTransactionResult
} from './payment-queries';
