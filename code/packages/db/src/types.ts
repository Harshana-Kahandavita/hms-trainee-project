export interface QueryError {
  code: string
  message: string
}

export interface QueryResult<T> {
  success: boolean
  data?: T
  error?: QueryError
} 