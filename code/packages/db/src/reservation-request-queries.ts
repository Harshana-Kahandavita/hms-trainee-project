import { PrismaClient, Prisma } from '../prisma/generated/prisma'
import { subDays, format } from 'date-fns'

export interface DailyRequestCount {
  date: Date
  count: number
}

export async function getLastSevenDaysPendingRequests(
  prisma: PrismaClient,
  createdBy: string
): Promise<DailyRequestCount[]> {
  const sevenDaysAgo = subDays(new Date(), 7)
  console.log(`Query start date: ${format(sevenDaysAgo, 'yyyy-MM-dd HH:mm:ss')}`)

  const dailyBreakdown = await prisma.$queryRaw<DailyRequestCount[]>`
    WITH RECURSIVE dates AS (
      SELECT DATE_TRUNC('day', ${sevenDaysAgo}::timestamp) as date
      UNION ALL
      SELECT date + INTERVAL '1 day'
      FROM dates
      WHERE date < DATE_TRUNC('day', NOW())
    )
    SELECT 
      d.date,
      CAST(COUNT(r.created_at) AS INTEGER) as count
    FROM dates d
    LEFT JOIN reservation_requests r ON 
      DATE_TRUNC('day', r.created_at) = d.date 
      AND r.status = 'PENDING'
      AND r.created_by = ${createdBy}
    GROUP BY d.date
    ORDER BY d.date DESC
  `

  return dailyBreakdown
}
