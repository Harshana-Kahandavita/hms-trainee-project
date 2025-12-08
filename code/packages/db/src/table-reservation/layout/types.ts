import type { RestaurantSection, RestaurantTable } from '../../../prisma/generated/prisma'

// Input types for queries
export interface GetLayoutDataInput {
  restaurantId: number
}

// Database result types
export interface LayoutSectionResult {
  id: number
  restaurantId: number
  sectionName: string
  description: string | null
  isActive: boolean
  displayOrder: number | null
  capacity: number | null
  createdAt: Date
  updatedAt: Date
}

export interface LayoutTableResult {
  id: number
  restaurantId: number
  sectionId: number
  tableName: string
  seatingCapacity: number
  tableType: string | null
  isActive: boolean
  position: any | null // JSON field for position data
  amenities: any | null // JSON field for amenities
  createdAt: Date
  updatedAt: Date
}

export interface LayoutDataResult {
  sections: LayoutSectionResult[]
  tables: LayoutTableResult[]
}

// Business logic types
export interface LayoutSectionDisplay {
  id: number
  sectionName: string
  description: string
  displayOrder: number
  capacity: number
  isActive: boolean
  canvasWidth: number
  canvasHeight: number
  floorPlanImage: string
  isCanvasEnabled: boolean
  canvasData: any
  color: string
  opacity: number
  visible: boolean
  createdAt: string
  updatedAt: string
}

export interface LayoutTableDisplay {
  id: number
  restaurantId: number
  sectionId: number
  tableName: string
  seatingCapacity: number
  tableType: string
  isActive: boolean
  fabricObjectId: string
  position: any
  canvasProperties: any
  amenities: any
  isDraggable: boolean
  isResizable: boolean
  isSelected: boolean
  isHovered: boolean
  isReserved: boolean
  createdAt: string
  updatedAt: string
}

export interface LayoutDataDisplay {
  metadata: {
    version: string
    restaurantId: number
    restaurantName: string
    lastModified: string
    createdBy: string
    totalSections: number
    totalTables: number
  }
  canvas: {
    width: number
    height: number
    backgroundColor: string
    gridSize: number
    snapToGrid: boolean
  }
  sections: LayoutSectionDisplay[]
  tables: LayoutTableDisplay[]
  settings: {
    allowDrag: boolean
    allowResize: boolean
    showGrid: boolean
    showLabels: boolean
    autoSave: boolean
    snapToGrid: boolean
  }
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
export interface GetLayoutDataActionResponse {
  success: boolean
  data?: LayoutDataDisplay
  error?: string
}
