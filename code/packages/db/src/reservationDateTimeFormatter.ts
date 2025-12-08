/**
 * Combines date and time fields into a single Date object and formats it properly
 * @param dateField The reservation date field
 * @param timeField The reservation time field
 * @param format Whether to return 'date' or 'time' format
 */
export function formatReservationDateTime(dateField: Date, timeField: Date, format: 'date' | 'time'): string {
    // Extract hours, minutes, seconds from the time field
    const hours = timeField.getUTCHours();
    const minutes = timeField.getUTCMinutes();
    const seconds = timeField.getUTCSeconds();
    
    // Create a new Date object with the date from dateField and time from timeField
    const combinedDateTime = new Date(dateField);
    combinedDateTime.setUTCHours(hours, minutes, seconds);
   
    return format === 'date' 
      ? combinedDateTime.toLocaleDateString() 
      : combinedDateTime.toLocaleTimeString();
  }
  