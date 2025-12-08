/**
 * Time Utility Functions for Table Reservations
 * Centralized time normalization and calculation logic
 */

/**
 * Normalize time to proper format for database storage
 * Converts to 1970-01-01T${HH:MM:SS} format for @db.Time() fields
 */
export function normalizeTimeForStorage(time: Date): Date {
  const hours = time.getHours();
  const minutes = time.getMinutes();
  const seconds = time.getSeconds();
  return new Date(`1970-01-01T${formatTime(hours, minutes, seconds)}`);
}

/**
 * Format time components to HH:MM:SS string
 */
export function formatTime(hours: number, minutes: number, seconds: number = 0): string {
  const h = hours.toString().padStart(2, '0');
  const m = minutes.toString().padStart(2, '0');
  const s = seconds.toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/**
 * Format Date object to HH:MM:SS string
 */
export function formatTimeFromDate(date: Date): string {
  return formatTime(date.getHours(), date.getMinutes(), date.getSeconds());
}

/**
 * Calculate end time based on start time and duration
 * Default duration is 90 minutes
 */
export function calculateEndTime(startTime: Date, durationMinutes: number = 90): Date {
  const endTime = new Date(startTime);
  endTime.setMinutes(endTime.getMinutes() + durationMinutes);
  return endTime;
}

/**
 * Normalize date to midnight local time
 * Removes time component for date-only comparisons
 */
export function normalizeDateToMidnight(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

/**
 * Check if a date is in the past
 */
export function isPastDate(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);
  
  return checkDate < today;
}

/**
 * Check if two times overlap
 * Useful for conflict detection
 */
export function timesOverlap(
  start1: Date,
  end1: Date,
  start2: Date,
  end2: Date
): boolean {
  return start1 < end2 && end1 > start2;
}

/**
 * Parse time string (HH:MM or HH:MM:SS) to Date object
 */
export function parseTimeString(timeString: string): Date {
  const parts = timeString.split(':');
  const hours = parseInt(parts[0]!, 10);
  const minutes = parseInt(parts[1]!, 10);
  const seconds = parts[2] ? parseInt(parts[2], 10) : 0;
  
  return new Date(`1970-01-01T${formatTime(hours, minutes, seconds)}`);
}

/**
 * Combine date and time into single DateTime
 */
export function combineDateAndTime(date: Date, time: Date): Date {
  const combined = new Date(date);
  combined.setHours(time.getHours(), time.getMinutes(), time.getSeconds(), 0);
  return combined;
}

/**
 * Extract time portion from DateTime as normalized time
 */
export function extractNormalizedTime(dateTime: Date): Date {
  return normalizeTimeForStorage(dateTime);
}

/**
 * Get start and end of day for a given date
 */
export function getDayBoundaries(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  
  return { start, end };
}

/**
 * Check if time is within operating hours
 * Assumes operating hours are 6 AM to 11 PM
 */
export function isWithinOperatingHours(time: Date): boolean {
  const hours = time.getHours();
  return hours >= 6 && hours < 23;
}

/**
 * Add buffer time to a time slot
 * Default buffer is 15 minutes
 */
export function addBufferTime(time: Date, bufferMinutes: number = 15): Date {
  const buffered = new Date(time);
  buffered.setMinutes(buffered.getMinutes() + bufferMinutes);
  return buffered;
}

