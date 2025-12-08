export interface MealServiceAvailabilityData {
  mealService: {
    id: number
    mealType: string
    isAvailable: boolean
    schedule: {
      availableDays: string[]
    } | null
  }
  operatingHours: {
    dayOfWeek: string
    isOpen: boolean
  }[]
  specialClosures: {
    closureStart: Date
    closureEnd: Date
  }[]
  capacityData: {
    date: Date
    totalSeats: number
    bookedSeats: number
  }[]
} 