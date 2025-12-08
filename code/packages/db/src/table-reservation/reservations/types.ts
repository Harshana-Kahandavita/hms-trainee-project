// Input types for queries
export interface GetReservationsByDateInput {
  restaurantId: number
  date: string // Format: YYYY-MM-DD
}

// Database result types
export interface ReservationTableAssignmentResult {
  reservationId: number
  assignedTableId: number | null
  assignedTableName: string | null
  assignedSectionId: number | null
  assignedSectionName: string | null
  tableStartTime: string | null // Time format
  tableEndTime: string | null // Time format
  // FIX: Add slot data for accurate table merge slot matching
  slotId: number | null // Database slot ID
  slotDate: Date | null // Slot date from database
  slotStartTime: Date | null // Slot start time from database
  slotEndTime: Date | null // Slot end time from database
}

export interface ReservationResult {
  id: number
  reservationNumber: string
  reservationName: string
  contactPhone: string
  reservationDate: Date
  reservationTime: Date
  adultCount: number
  childCount: number
  mealType: string
  totalAmount: number
  status: string
  specialRequests: string | null
  dietaryRequirements: string | null
  occasion: string | null
  createdAt: Date
  updatedAt: Date
  createdBy: string
  customer: {
    firstName: string
    lastName: string
    email: string | null
    phone: string
  }
  tableAssignment: ReservationTableAssignmentResult | null
}

export interface ReservationsByDateResult {
  reservations: ReservationResult[]
  totalCount: number
  upcomingCount: number
  seatedCount: number
  completedCount: number
}

// Business logic types
export interface ReservationDisplay {
  id: string
  reservationNumber: string
  name: string
  phone: string
  date: string
  time: string
  tableNumber: string | null
  area: string | null
  guests: number
  source: string
  status: 'upcoming' | 'seated' | 'completed'
  email: string | null
  specialRequests: string | null
  dietaryRequirements: string | null
  occasion: string | null
  totalAmount: number
  mealType: string
  tableId: number | null
  sectionId: number | null
  sectionName: string | null
  tableStartTime: string | null
  tableEndTime: string | null
  // Table merge information
  hasMergedTables?: boolean
  mergedTableCount?: number
  tableSetId?: number
  tableSetStatus?: 'PENDING_MERGE' | 'ACTIVE' | 'DISSOLVED' | 'EXPIRED'
  mergedTableNames?: string[] // Array of table names in the merged set
  primaryTableId?: number // Primary table ID for highlighting
  primaryTableName?: string // Primary table name for display
  // FIX: Add actual slot data from database to avoid time parsing issues
  slotId?: number | null // Database slot ID for accurate slot lookup
  slotDate?: string | null // ISO date format (YYYY-MM-DD) from database slot
  slotStartTime?: string | null // Time format (HH:MM:SS) from database slot
  slotEndTime?: string | null // Time format (HH:MM:SS) from database slot
}

export interface ReservationsByDateDisplay {
  reservations: ReservationDisplay[]
  totalCount: number
  upcomingCount: number
  seatedCount: number
  completedCount: number
  date: string
  restaurantId: number
}

// Query result types
export interface QueryError {
  code: string
  message: string
  details?: any
}

export interface QueryResult<T> {
  success: boolean
  data?: T
  error?: QueryError
}

// Action response types
export interface GetReservationsByDateActionResponse {
  success: boolean
  data?: ReservationsByDateDisplay
  error?: string
}
