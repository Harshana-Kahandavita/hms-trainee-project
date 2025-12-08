import { PrismaClient, ReservationType, RequestCreatorType, Prisma } from '../../prisma/generated/prisma';

/**
 * GrowthHackQueries
 * =================
 * This class contains queries used for dashboard, restaurant analytics, and reservation reports.
 * It supports both BUFFET_ONLY and TABLE_ONLY reservation types.
 */
export class GrowthHackQueries {
  constructor(private prisma: PrismaClient) {}

  // ----------------------------
  // Configuration: Week Definition
  // ----------------------------
  /**
   * Define which day the week starts on
   * 0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday, 6 = Saturday
   * 
   * Current: 5 (Friday) - Week runs Friday to Thursday
   * To change: Modify this constant and the PostgreSQL INTERVAL in DATE_TRUNC queries
   */
  private readonly WEEK_START_DAY: number = 5; // Friday

  // ----------------------------
  // Helper: Date formatting
  // ----------------------------
  /**
   * Format Date object as YYYY-MM-DD string using local timezone
   * Avoids timezone conversion issues with toISOString()
   */
  private formatDateLocal(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // ----------------------------
  // Helper: Period date calculation
  // ----------------------------
  /**
   * Calculate date range based on period.
   * Weekly: Friday to Thursday (current week, configurable via WEEK_START_DAY)
   * Monthly: Start of current month to today
   * Quarterly: Start of current quarter to today
   * 
   * IMPORTANT: Returns dates in local timezone to avoid timezone conversion issues
   */
  private calculatePeriodDates(period: 'weekly' | 'monthly' | 'quarterly'): { startDate: Date; endDate: Date } {
    const now = new Date();
    // Use local date components to avoid timezone issues
    const year = now.getFullYear();
    const month = now.getMonth();
    const date = now.getDate();
    
    const today = new Date(year, month, date); // Midnight today in local timezone
    let startDate: Date;

    if (period === 'weekly') {
      // Calculate days elapsed since the week start day
      // getDay() returns: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
      const currentDayOfWeek = now.getDay();
      
      // Calculate offset from week start using modulo arithmetic
      // Formula: (currentDay - weekStartDay + 7) % 7
      // This gives us how many days have passed since the week start
      // Example with WEEK_START_DAY=5 (Friday):
      //   Friday (5):    (5 - 5 + 7) % 7 = 0 days (start of week)
      //   Saturday (6):  (6 - 5 + 7) % 7 = 1 day
      //   Sunday (0):    (0 - 5 + 7) % 7 = 2 days
      //   Thursday (4):  (4 - 5 + 7) % 7 = 6 days (end of week)
      const daysFromWeekStart = (currentDayOfWeek - this.WEEK_START_DAY + 7) % 7;
      
      startDate = new Date(year, month, date - daysFromWeekStart); // Keep in local timezone
    } else if (period === 'monthly') {
      // Start of current month
      startDate = new Date(year, month, 1);
    } else { // quarterly
      // Start of current quarter (Jan/Apr/Jul/Oct)
      const currentQuarter = Math.floor(month / 3);
      startDate = new Date(year, currentQuarter * 3, 1);
    }

    return { startDate, endDate: today };
  }

  /**
   * Calculate FULL period dates including future days in current period
   * Used for charts/heatmaps to show complete week/month/quarter data including future reservations
   */
  private calculateFullPeriodDates(period: 'weekly' | 'monthly' | 'quarterly'): { startDate: Date; endDate: Date } {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const date = now.getDate();
    
    let startDate: Date;
    let endDate: Date;

    if (period === 'weekly') {
      const currentDayOfWeek = now.getDay();
      const daysFromWeekStart = (currentDayOfWeek - this.WEEK_START_DAY + 7) % 7;
      
      startDate = new Date(year, month, date - daysFromWeekStart);
      // End of week is Thursday (6 days after Friday start)
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
    } else if (period === 'monthly') {
      startDate = new Date(year, month, 1);
      // Last day of current month
      endDate = new Date(year, month + 1, 0);
    } else { // quarterly
      const currentQuarter = Math.floor(month / 3);
      startDate = new Date(year, currentQuarter * 3, 1);
      // Last day of current quarter
      endDate = new Date(year, (currentQuarter + 1) * 3, 0);
    }

    return { startDate, endDate };
  }

  // ----------------------------
  // Helper: Base WHERE clause generator
  // ----------------------------
  private getBaseWhere({
    startDate,
    endDate,
    reservationType,
    restaurantId,
    period,
  }: {
    startDate?: Date;
    endDate?: Date;
    reservationType?: ReservationType;
    restaurantId?: number;
    period?: 'weekly' | 'monthly' | 'quarterly';
  }) {
    const where: any = {
      status: { in: ['ACCEPTED', 'COMPLETED', 'SEATED'] },
      createdBy: { in: [RequestCreatorType.CUSTOMER, RequestCreatorType.MERCHANT, RequestCreatorType.MERCHANT_WALK_IN] },
    };
    if (reservationType) where.reservationType = reservationType;
    if (restaurantId) where.restaurantId = restaurantId;
    
    // Date filtering priority: explicit dates > period > nothing
    // If user provides both startDate/endDate, use those (date picker has priority)
    // Otherwise if period provided, calculate from period
    // IMPORTANT: Convert to date-only strings to avoid timezone conversion issues
    if (startDate && endDate) {
      where.reservationDate = { 
        gte: new Date(this.formatDateLocal(startDate)),
        lte: new Date(this.formatDateLocal(endDate))
      };
    } else if (period) {
      const periodDates = this.calculatePeriodDates(period);
      where.reservationDate = { 
        gte: new Date(this.formatDateLocal(periodDates.startDate)),
        lte: new Date(this.formatDateLocal(periodDates.endDate))
      };
    }
    
    return where;
  }

  // ----------------------------
  // Atomic Queries
  // ----------------------------

  /**
   * Get count of reservations by a specific creator.
   * Can filter by restaurantId, reservationType, date range, or period.
   */
  async getReservationCountByCreator({
    creator,
    reservationType,
    restaurantId,
    startDate,
    endDate,
    period,
  }: {
    creator?: RequestCreatorType;
    reservationType?: ReservationType;
    restaurantId?: number;
    startDate?: Date;
    endDate?: Date;
    period?: 'weekly' | 'monthly' | 'quarterly';
  }) {
    const where = this.getBaseWhere({ reservationType, restaurantId, startDate, endDate, period });
    if (creator) where.createdBy = creator;
    return this.prisma.reservation.count({ where });
  }

  /**
   * Get total pax (adults + children) for a reservation type / restaurant / date range / period.
   */
  async getTotalPax({
    reservationType,
    restaurantId,
    startDate,
    endDate,
    period,
  }: {
    reservationType?: ReservationType;
    restaurantId?: number;
    startDate?: Date;
    endDate?: Date;
    period?: 'weekly' | 'monthly' | 'quarterly';
  }) {
    const where = this.getBaseWhere({ reservationType, restaurantId, startDate, endDate, period });
    const result = await this.prisma.reservation.aggregate({
      _sum: { adultCount: true, childCount: true },
      where,
    });
    return (result._sum.adultCount ?? 0) + (result._sum.childCount ?? 0);
  }

  /**
   * Get aggregated reservation stats per restaurant.
   * Returns formatted data sorted by total reservations (descending).
   * Grouped by restaurantId + reservationType (restaurants with both types show separately).
   */
  async getRestaurantAggregates({
    reservationType,
    startDate,
    endDate,
    period,
  }: {
    reservationType?: ReservationType;
    startDate?: Date;
    endDate?: Date;
    period?: 'weekly' | 'monthly' | 'quarterly';
  }) {
    // Get aggregates from database
    const where = this.getBaseWhere({ reservationType, startDate, endDate, period });
    const results = await this.prisma.reservation.groupBy({
      by: ['restaurantId', 'reservationType'],
      _count: { _all: true },
      _sum: { adultCount: true, childCount: true },
      where,
    });
    
    // Sort by total reservations descending
    const sorted = results.sort((a, b) => b._count._all - a._count._all);

    // Fetch restaurant names
    const restaurantIds = Array.from(new Set(sorted.map(a => a.restaurantId)));
    const restaurants = await this.prisma.restaurant.findMany({
      where: { id: { in: restaurantIds } },
      select: { id: true, name: true },
    });
    const nameMap = Object.fromEntries(restaurants.map(r => [r.id, r.name]));

    // Get new users count for each restaurant
    const formattedResults = await Promise.all(
      sorted.map(async a => ({
        restaurantId: a.restaurantId,
        restaurantName: nameMap[a.restaurantId] || 'Unknown',
        reservationType: a.reservationType,
        totalReservations: a._count._all,
        totalPax: (a._sum.adultCount ?? 0) + (a._sum.childCount ?? 0),
        newUsers: await this.getNewUsersCount({
          restaurantId: a.restaurantId,
          reservationType: a.reservationType,
          startDate,
          endDate,
          period,
        }),
      }))
    );

    return formattedResults;
  }

  /**
   * Get all restaurant IDs with activity in a given period.
   * Useful for iterating through daily data queries.
   */
  async getActiveRestaurantIdsDetailed({
    reservationType,
    startDate,
    endDate,
    period,
  }: {
    reservationType?: ReservationType;
    startDate?: Date;
    endDate?: Date;
    period?: 'weekly' | 'monthly' | 'quarterly';
  }) {
    const where = this.getBaseWhere({ reservationType, startDate, endDate, period });
    const ids = await this.prisma.reservation.findMany({
      where,
      distinct: ['restaurantId'],
      select: { restaurantId: true },
    });
    return ids.map(i => i.restaurantId);
  }

  // ----------------------------
  // Dashboard / Compound Queries
  // ----------------------------

  /**
   * Dashboard Summary Card
   * Returns counts per creator and total pax.
   * Can be filtered by reservationType, date range, or period.
   */
  async getDashboardSummaryCard({
    reservationType,
    restaurantId,
    startDate,
    endDate,
    period,
  }: {
    reservationType?: ReservationType;
    restaurantId?: number;
    startDate?: Date;
    endDate?: Date;
    period?: 'weekly' | 'monthly' | 'quarterly';
  }) {
    const creators: RequestCreatorType[] = [
      RequestCreatorType.CUSTOMER,
      RequestCreatorType.MERCHANT,
      RequestCreatorType.MERCHANT_WALK_IN,
    ];
    const summary: Record<string, number> = {};
    let totalReservations = 0;

    for (const creator of creators) {
      const count = await this.getReservationCountByCreator({
        creator,
        reservationType,
        restaurantId,
        startDate,
        endDate,
        period,
      });
      summary[creator] = count;
      totalReservations += count;
    }

    summary['Total Reservations'] = totalReservations;
    summary['Total Pax'] = await this.getTotalPax({ reservationType, restaurantId, startDate, endDate, period });
    summary['New Users Through Online'] = await this.getNewUsersCount({ reservationType, restaurantId, startDate, endDate, period });

    return summary;
  }

  /**
   * Returns top or bottom N restaurants by total reservations.
   * Ranks restaurants and returns limited results for graphs/leaderboards.
   */
  async getTopBottomRestaurantsGraph({
    reservationType,
    startDate,
    endDate,
    period,
    top = true,
    limit = 10,
  }: {
    reservationType?: ReservationType;
    startDate?: Date;
    endDate?: Date;
    period?: 'weekly' | 'monthly' | 'quarterly';
    top?: boolean;
    limit?: number;
  }) {
    // Get all restaurant aggregates (already sorted descending)
    const aggregates = await this.getRestaurantAggregates({ reservationType, startDate, endDate, period });

    // For bottom restaurants, reverse the order
    const sorted = top ? aggregates : [...aggregates].reverse();

    // Return top/bottom N
    return sorted.slice(0, limit);
  }

  /**
   * Get restaurant data aggregated by period (weekly/monthly/quarterly).
   * Returns one row per period with aggregated totals and highlights the current period.
   * Used for the inner expandable table showing period breakdown.
   */
  async getRestaurantPeriodData({
    restaurantId,
    reservationType,
    startDate,
    endDate,
    period,
  }: {
    restaurantId: number;
    reservationType?: ReservationType;
    startDate?: Date;
    endDate?: Date;
    period: 'weekly' | 'monthly' | 'quarterly'; // REQUIRED - always aggregate by period
  }) {
    // Use PostgreSQL DATE_TRUNC for efficient database-level aggregation
    // NOTE: This query should use the SAME date range as the outer table
    // to ensure the current period totals match
    
    // Build period truncation expression
    let periodTrunc: string;
    if (period === 'weekly') {
      // Custom week start: Shift to align with WEEK_START_DAY
      // PostgreSQL DATE_TRUNC('week') returns Monday (ISO week)
      // We shift by the calculated interval to reach our desired week start
      const shiftDays = this.getWeekStartInterval();
      periodTrunc = `DATE_TRUNC('week', reservation_date + INTERVAL '${shiftDays} days') - INTERVAL '${shiftDays} days'`;
    } else if (period === 'monthly') {
      periodTrunc = "DATE_TRUNC('month', reservation_date)";
    } else { // quarterly
      periodTrunc = "DATE_TRUNC('quarter', reservation_date)";
    }
    
    // Build WHERE clause conditions
    // IMPORTANT: Use the same date filtering logic as outer table
    const conditions: string[] = [
      "status IN ('ACCEPTED', 'COMPLETED', 'SEATED')",
      `restaurant_id = ${restaurantId}`
    ];
    
    if (reservationType) {
      conditions.push(`reservation_type = '${reservationType}'`);
    }
    
    // Apply date filtering strategy:
    // 1. If explicit date range provided (from date picker), use it
    // 2. Otherwise, get ALL historical data for full trend comparison
    //    BUT always limit to today to prevent counting future reservations
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    if (startDate && endDate) {
      // User selected explicit date range - use exact range
      conditions.push(`reservation_date >= '${this.formatDateLocal(startDate)}'`);
      conditions.push(`reservation_date <= '${this.formatDateLocal(endDate)}'`);
    } else {
      // No explicit range - get ALL historical data
      // Always limit to today to ensure current period matches outer table
      conditions.push(`reservation_date <= '${this.formatDateLocal(today)}'`);
    }
    
    const whereClause = conditions.join(' AND ');
    
    // Build complete SQL query as raw string
    const sqlQuery = `
      SELECT 
        (${periodTrunc})::date as period_start,
        COUNT(*) FILTER (WHERE created_by = 'CUSTOMER') as customer,
        COUNT(*) FILTER (WHERE created_by = 'MERCHANT') as merchant,
        COUNT(*) FILTER (WHERE created_by = 'MERCHANT_WALK_IN') as merchant_walk_in,
        COUNT(*) as total_reservations,
        COALESCE(SUM(adult_count), 0) + COALESCE(SUM(child_count), 0) as total_pax
      FROM reservations
      WHERE ${whereClause}
      GROUP BY period_start
      ORDER BY period_start ASC
    `;
    
    // Execute raw SQL query with DATE_TRUNC
    const results = await this.prisma.$queryRaw<any[]>(Prisma.raw(sqlQuery));
    
    if (results.length === 0) {
      return [];
    }
    
    // Get restaurant name
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { name: true },
    });
    
    // Mark current period and format result
    const currentPeriodKey = this.getCurrentPeriodKey(period);
    
    // Calculate new users for each period
    const formattedResults = await Promise.all(
      results.map(async row => {
        const periodDate = new Date(row.period_start);
        const periodKey = this.formatDateLocal(periodDate);
        
        // Calculate period end date for new users count
        let periodEndDate: Date;
        if (period === 'weekly') {
          periodEndDate = new Date(periodDate.getFullYear(), periodDate.getMonth(), periodDate.getDate() + 6);
        } else if (period === 'monthly') {
          const nextMonth = new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 1);
          periodEndDate = new Date(nextMonth.getTime() - 24 * 60 * 60 * 1000); // Last day of month
        } else { // quarterly
          const nextQuarter = new Date(periodDate.getFullYear(), periodDate.getMonth() + 3, 1);
          periodEndDate = new Date(nextQuarter.getTime() - 24 * 60 * 60 * 1000); // Last day of quarter
        }
        
        return {
          date: periodDate,
          restaurantId,
          restaurantName: restaurant?.name || 'Unknown',
          reservationType: reservationType || 'BUFFET_ONLY',
          CUSTOMER: Number(row.customer),
          MERCHANT: Number(row.merchant),
          MERCHANT_WALK_IN: Number(row.merchant_walk_in),
          TotalReservations: Number(row.total_reservations),
          TotalPax: Number(row.total_pax),
          NewUsers: await this.getNewUsersCount({
            restaurantId,
            reservationType,
            startDate: periodDate,
            endDate: periodEndDate,
          }),
          isCurrentPeriod: periodKey === currentPeriodKey,
          periodLabel: this.formatPeriodLabel(periodDate, period),
        };
      })
    );
    
    return formattedResults;
  }
  
  /**
   * Get the period key for the current period (PUBLIC)
   * Returns date string in YYYY-MM-DD format using local timezone
   */
  getCurrentPeriodKey(period: 'weekly' | 'monthly' | 'quarterly'): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const date = now.getDate();
    
    if (period === 'weekly') {
      const currentDayOfWeek = now.getDay();
      const daysFromWeekStart = (currentDayOfWeek - this.WEEK_START_DAY + 7) % 7;
      const periodStart = new Date(year, month, date - daysFromWeekStart);
      
      // Format as YYYY-MM-DD using local date components (no timezone conversion)
      const y = periodStart.getFullYear();
      const m = String(periodStart.getMonth() + 1).padStart(2, '0');
      const d = String(periodStart.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    } else if (period === 'monthly') {
      return `${year}-${String(month + 1).padStart(2, '0')}-01`;
    } else { // quarterly
      const quarter = Math.floor(month / 3);
      return `${year}-${String(quarter * 3 + 1).padStart(2, '0')}-01`;
    }
  }
  
  /**
   * Get PostgreSQL interval for week start adjustment
   * PostgreSQL DATE_TRUNC('week') returns Monday by default (ISO week, where Monday = day 1)
   * We shift dates to align with our custom week start day
   * 
   * Formula: (7 - (WEEK_START_DAY - 1)) % 7
   * 
   * @returns Number of days to shift (e.g., 3 for Friday start)
   * 
   * Examples:
   *   Monday (1):   (7 - (1 - 1)) % 7 = 0 (no shift, already Monday)
   *   Friday (5):   (7 - (5 - 1)) % 7 = 3 (shift by 3 to reach Friday)
   *   Sunday (0):   (7 - (0 - 1)) % 7 = (7 - (-1)) % 7 = 1 (shift by 1 to reach Sunday)
   */
  private getWeekStartInterval(): number {
    // JavaScript getDay(): 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
    // PostgreSQL week starts on Monday (equivalent to getDay() = 1)
    // We want to shift to WEEK_START_DAY
    
    const weekStartDay = this.WEEK_START_DAY;
    
    if (weekStartDay === 1) return 0; // Monday - no shift needed
    if (weekStartDay === 0) return 1; // Sunday - shift 1 day back
    
    // For other days: Calculate offset
    // Friday (5) needs 3 days shift: Mon -> Tue -> Wed -> Thu -> Fri goes back to previous Fri
    return (7 - (weekStartDay - 1)) % 7;
  }

  /**
   * Format period label for display
   */
  private formatPeriodLabel(periodStart: Date, period: 'weekly' | 'monthly' | 'quarterly'): string {
    if (period === 'weekly') {
      return `Week of ${periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    } else if (period === 'monthly') {
      return periodStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else {
      const quarter = Math.floor(periodStart.getMonth() / 3) + 1;
      return `Q${quarter} ${periodStart.getFullYear()}`;
    }
  }

  /**
   * Get time series data for top or bottom N restaurants.
   * Returns data points for each period showing trend over time.
   */
  async getTopBottomRestaurantsTimeSeries({
    period,
    reservationType,
    startDate,
    endDate,
    top = true,
    limit = 5,
    useFullPeriod = false,
  }: {
    period: 'weekly' | 'monthly' | 'quarterly';
    reservationType?: ReservationType;
    startDate?: Date;
    endDate?: Date;
    top?: boolean;
    limit?: number;
    useFullPeriod?: boolean;
  }) {
    // Calculate dates: use full period if requested (includes future reservations)
    let effectiveStartDate = startDate;
    let effectiveEndDate = endDate;
    
    if (useFullPeriod && !startDate && !endDate) {
      const fullPeriodDates = this.calculateFullPeriodDates(period);
      effectiveStartDate = fullPeriodDates.startDate;
      effectiveEndDate = fullPeriodDates.endDate;
    }
    
    // First, get top/bottom restaurants by total
    const topRestaurants = await this.getTopBottomRestaurantsGraph({
      reservationType,
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      period,
      top,
      limit,
    });
    
    const restaurantIds = topRestaurants.map(r => r.restaurantId);
    
    if (restaurantIds.length === 0) {
      return [];
    }
    
    // Use PostgreSQL DATE_TRUNC for efficient time series aggregation
    
    // Build period truncation expression
    let periodTrunc: string;
    if (period === 'weekly') {
      // Custom week start: Shift to align with WEEK_START_DAY
      // PostgreSQL DATE_TRUNC('week') returns Monday (ISO week)
      // We shift by the calculated interval to reach our desired week start
      const shiftDays = this.getWeekStartInterval();
      periodTrunc = `DATE_TRUNC('week', reservation_date + INTERVAL '${shiftDays} days') - INTERVAL '${shiftDays} days'`;
    } else if (period === 'monthly') {
      periodTrunc = "DATE_TRUNC('month', reservation_date)";
    } else { // quarterly
      periodTrunc = "DATE_TRUNC('quarter', reservation_date)";
    }
    
    // Build WHERE clause conditions
    const conditions: string[] = [
      "status IN ('ACCEPTED', 'COMPLETED', 'SEATED')",
      `restaurant_id IN (${restaurantIds.join(', ')})`
    ];
    
    if (reservationType) {
      conditions.push(`reservation_type = '${reservationType}'`);
    }
    
    const whereClause = conditions.join(' AND ');
    
    // Build complete SQL query as raw string
    const sqlQuery = `
      SELECT 
        restaurant_id,
        reservation_type,
        (${periodTrunc})::date as period_start,
        COUNT(*) as reservation_count,
        COALESCE(SUM(adult_count), 0) + COALESCE(SUM(child_count), 0) as total_pax
      FROM reservations
      WHERE ${whereClause}
      GROUP BY restaurant_id, reservation_type, period_start
      ORDER BY restaurant_id, reservation_type, period_start ASC
    `;
    
    // Execute raw SQL query with DATE_TRUNC
    const results = await this.prisma.$queryRaw<any[]>(Prisma.raw(sqlQuery));
    
    // Group results by restaurant + reservationType
    const dataMap = new Map<string, any[]>();
    
    results.forEach(row => {
      const restaurantKey = `${row.restaurant_id}-${row.reservation_type}`;
      
      if (!dataMap.has(restaurantKey)) {
        dataMap.set(restaurantKey, []);
      }
      
      const periodDate = new Date(row.period_start);
      dataMap.get(restaurantKey)!.push({
        periodKey: this.formatDateLocal(periodDate),
        periodLabel: this.formatPeriodLabel(periodDate, period),
        reservationCount: Number(row.reservation_count),
        totalPax: Number(row.total_pax),
      });
    });
    
    // Format result
    return topRestaurants.map(restaurant => {
      const restaurantKey = `${restaurant.restaurantId}-${restaurant.reservationType}`;
      return {
        restaurantId: restaurant.restaurantId,
        restaurantName: restaurant.restaurantName,
        reservationType: restaurant.reservationType,
        totalReservations: restaurant.totalReservations,
        totalPax: restaurant.totalPax,
        timeSeries: dataMap.get(restaurantKey) || [],
      };
    });
  }
  
  /**
   * Restaurant performance ranking with growth comparison.
   * Calculates current rank, previous rank, rank change, averages, and growth percentage.
   */
  async getRestaurantRankingAndGrowth({
    reservationType,
    period,
  }: {
    reservationType?: ReservationType;
    period: 'weekly' | 'monthly' | 'quarterly';
  }) {
    // Calculate current period dates
    const currentPeriodDates = this.calculatePeriodDates(period);
    
    // Calculate previous period dates
    let previousStart: Date;
    let previousEnd: Date;
    
    if (period === 'weekly') {
      // Previous week: 7 days before current start
      previousEnd = new Date(currentPeriodDates.startDate.getTime() - 24 * 60 * 60 * 1000);
      previousStart = new Date(previousEnd.getTime() - 6 * 24 * 60 * 60 * 1000);
    } else if (period === 'monthly') {
      // Previous month
      const year = currentPeriodDates.startDate.getFullYear();
      const month = currentPeriodDates.startDate.getMonth();
      previousStart = new Date(year, month - 1, 1);
      previousEnd = new Date(year, month, 0); // Last day of previous month
    } else { // quarterly
      // Previous quarter
      const year = currentPeriodDates.startDate.getFullYear();
      const month = currentPeriodDates.startDate.getMonth();
      const currentQuarter = Math.floor(month / 3);
      previousStart = new Date(year, (currentQuarter - 1) * 3, 1);
      previousEnd = new Date(year, currentQuarter * 3, 0); // Last day of previous quarter
    }

    // Get current period data
    const currentAggregates = await this.getRestaurantAggregates({
      reservationType,
      startDate: currentPeriodDates.startDate,
      endDate: currentPeriodDates.endDate,
    });
    
    // Get previous period data
    const previousAggregates = await this.getRestaurantAggregates({
      reservationType,
      startDate: previousStart,
      endDate: previousEnd,
    });

    // Calculate days in each period
    const currentDays = Math.ceil((currentPeriodDates.endDate.getTime() - currentPeriodDates.startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    const previousDays = Math.ceil((previousEnd.getTime() - previousStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;

    // Build ranking with comparisons
    const ranking = currentAggregates.map((curr, index) => {
      const currentRank = index + 1;
      
      const prev = previousAggregates.find(p => 
        p.restaurantId === curr.restaurantId && p.reservationType === curr.reservationType
      );
      
      const previousRank = prev 
        ? previousAggregates.findIndex(p => p.restaurantId === curr.restaurantId && p.reservationType === curr.reservationType) + 1
        : null;
      
      const rankChange = previousRank ? previousRank - currentRank : null; // Positive = improved

      const growthRate = prev && prev.totalReservations > 0 
        ? ((curr.totalReservations - prev.totalReservations) / prev.totalReservations) * 100 
        : (curr.totalReservations > 0 ? 100 : 0);

      return {
        rank: currentRank,
        restaurantId: curr.restaurantId,
        restaurantName: curr.restaurantName,
        reservationType: curr.reservationType,
        rankChange, // Positive = moved up, Negative = moved down, null = new
        avgReservationsPerDay: currentDays > 0 ? curr.totalReservations / currentDays : 0,
        avgPaxPerDay: currentDays > 0 ? curr.totalPax / currentDays : 0,
        currentReservations: curr.totalReservations,
        currentPax: curr.totalPax,
        previousReservations: prev?.totalReservations ?? 0,
        previousPax: prev?.totalPax ?? 0,
        growthPercentage: growthRate,
      };
    });

    return ranking;
  }

  /**
   * Detailed reservation summary including creator, status, reservationType, totals.
   * Useful for exports or detailed reports.
   */
  async getReservationDetailedSummary(params?: {
    reservationType?: ReservationType;
    startDate?: Date;
    endDate?: Date;
    period?: 'weekly' | 'monthly' | 'quarterly';
  }) {
    const { reservationType, startDate, endDate, period } = params || {};
    
    // Calculate dates from period if provided
    let effectiveStartDate = startDate;
    let effectiveEndDate = endDate;
    if (period) {
      const periodDates = this.calculatePeriodDates(period);
      effectiveStartDate = periodDates.startDate;
      effectiveEndDate = periodDates.endDate;
    }
  
    const results = await this.prisma.reservation.groupBy({
      by: ['reservationDate', 'restaurantId', 'status', 'reservationType', 'createdBy'],
      where: {
        status: { in: ['ACCEPTED', 'COMPLETED', 'SEATED'] },
        ...(reservationType ? { reservationType } : {}),
        ...(effectiveStartDate && effectiveEndDate ? { reservationDate: { gte: effectiveStartDate, lte: effectiveEndDate } } : {}),
        createdBy: {
          in: [
            RequestCreatorType.CUSTOMER,
            RequestCreatorType.MERCHANT,
            RequestCreatorType.MERCHANT_WALK_IN,
          ],
        },
      },
      _count: { id: true },
      _sum: { adultCount: true, childCount: true },
      orderBy: [{ reservationDate: 'asc' }, { restaurantId: 'asc' }],
    });
  
    const restaurantIds = Array.from(new Set(results.map(r => r.restaurantId)));
    const restaurants = await this.prisma.restaurant.findMany({
      where: { id: { in: restaurantIds } },
      select: { id: true, name: true },
    });
    const restaurantMap = Object.fromEntries(restaurants.map(r => [r.id, r.name]));
  
    return results.map(r => ({
      reservationDate: r.reservationDate,
      restaurantId: r.restaurantId,
      restaurantName: restaurantMap[r.restaurantId] || 'Unknown',
      status: r.status,
      reservationType: r.reservationType,
      createdBy: r.createdBy,
      totalReservations: r._count.id,
      totalAdults: r._sum.adultCount ?? 0,
      totalChildren: r._sum.childCount ?? 0,
    }));
  }

  async getReservationsByTimePeriod({
    period, // 'week' | 'month' | 'quarter'
    restaurantId,
    reservationType,
    startDate,
    endDate,
  }: {
    period: 'week' | 'month' | 'quarter';
    restaurantId?: number;
    reservationType?: ReservationType;
    startDate?: Date;
    endDate?: Date;
  }) {
    const results = await this.prisma.$queryRaw`
      SELECT 
        DATE_TRUNC(${period}, "reservationDate") as period_start,
        "reservationType",
        "createdBy",
        COUNT(*)::int as reservation_count,
        COALESCE(SUM("adultCount"), 0)::int as total_adults,
        COALESCE(SUM("childCount"), 0)::int as total_children,
        COALESCE(SUM("adultCount" + "childCount"), 0)::int as total_pax
      FROM "Reservation"
      WHERE 
        "status" IN ('ACCEPTED', 'COMPLETED', 'SEATED')
        AND "createdBy" IN ('CUSTOMER', 'MERCHANT', 'MERCHANT_WALK_IN')
        ${startDate ? Prisma.sql`AND "reservationDate" >= ${startDate}` : Prisma.empty}
        ${endDate ? Prisma.sql`AND "reservationDate" <= ${endDate}` : Prisma.empty}
        ${reservationType ? Prisma.sql`AND "reservationType" = ${reservationType}` : Prisma.empty}
        ${restaurantId ? Prisma.sql`AND "restaurantId" = ${restaurantId}` : Prisma.empty}
      GROUP BY 
        DATE_TRUNC(${period}, "reservationDate"),
        "reservationType",
        "createdBy"
      ORDER BY period_start ASC, "createdBy"
    `;
  
    return results;
  }

  /**
   * Get first-ever reservation for each customer.
   * Returns customers whose FIRST reservation (of all time) falls within the date range.
   * This identifies truly NEW users in the period.
   */
  async getFirstCustomerReservations(params?: {
    reservationType?: ReservationType;
    startDate?: Date;
    endDate?: Date;
  }) {
    const { reservationType, startDate, endDate } = params || {};
  
    const firstReservationsWithRestaurant: any = await this.prisma.$queryRaw`
    SELECT DISTINCT ON (r."customer_id")
      r."customer_id",
      r."restaurant_id",
      rest."name" AS restaurant_name,
      r."reservation_date"
    FROM "reservations" r
    JOIN "restaurants" rest ON rest."restaurant_id" = r."restaurant_id"
    WHERE 
      r."created_by" = 'CUSTOMER'
      AND r."status" IN ('ACCEPTED', 'COMPLETED', 'SEATED')
      ${reservationType ? Prisma.sql`AND r."reservation_type" = ${reservationType}::"ReservationType"` : Prisma.empty}
      ${startDate ? Prisma.sql`AND r."reservation_date" >= ${startDate}` : Prisma.empty}
      ${endDate ? Prisma.sql`AND r."reservation_date" <= ${endDate}` : Prisma.empty}
    ORDER BY r."customer_id", r."reservation_date" ASC;
  `;

  return firstReservationsWithRestaurant.map((r: any) => ({
    customerId: r.customer_id,
    restaurantId: r.restaurant_id,
    restaurantName: r.restaurant_name,
    firstReservationDate: r.reservation_date,
  }));
  }

  /**
   * Count NEW users (customers whose first-ever reservation is in the period).
   * This uses a subquery to find each customer's first reservation date globally,
   * then counts how many of those first dates fall within the target period.
   */
  async getNewUsersCount({
    reservationType,
    startDate,
    endDate,
    period,
    restaurantId,
  }: {
    reservationType?: ReservationType;
    restaurantId?: number;
    startDate?: Date;
    endDate?: Date;
    period?: 'weekly' | 'monthly' | 'quarterly';
  }): Promise<number> {
    // Calculate date range from period if provided
    let effectiveStartDate = startDate;
    let effectiveEndDate = endDate;
    if (period && !startDate && !endDate) {
      const periodDates = this.calculatePeriodDates(period);
      effectiveStartDate = periodDates.startDate;
      effectiveEndDate = periodDates.endDate;
    }

    if (!effectiveStartDate || !effectiveEndDate) {
      console.log('[getNewUsersCount] No date range provided, returning 0');
      return 0;
    }

    console.log('[getNewUsersCount] Querying with:', {
      restaurantId,
      reservationType,
      startDate: this.formatDateLocal(effectiveStartDate),
      endDate: this.formatDateLocal(effectiveEndDate),
    });

    // Build WHERE conditions for the final SELECT
    const conditions: string[] = [
      `f."reservation_date" >= '${this.formatDateLocal(effectiveStartDate)}'`,
      `f."reservation_date" <= '${this.formatDateLocal(effectiveEndDate)}'`
    ];

    if (reservationType) {
      conditions.push(`f."reservation_type" = '${reservationType}'`);
    }

    if (restaurantId) {
      conditions.push(`f."restaurant_id" = ${restaurantId}`);
    }

    const whereClause = conditions.join(' AND ');

    // Build complete SQL query as raw string
    const sqlQuery = `
      WITH first_reservations AS (
        SELECT DISTINCT ON (r."customer_id")
          r."customer_id",
          r."restaurant_id",
          r."reservation_date",
          r."reservation_type"
        FROM "reservations" r
        WHERE 
          r."created_by" = 'CUSTOMER'
          AND r."status" IN ('ACCEPTED', 'COMPLETED', 'SEATED')
        ORDER BY r."customer_id", r."reservation_date" ASC
      )
      SELECT COUNT(DISTINCT f."customer_id")::int as new_user_count
      FROM first_reservations f
      WHERE ${whereClause}
    `;

    // Execute raw SQL query
    const result: any = await this.prisma.$queryRaw(Prisma.raw(sqlQuery));

    const count = result[0]?.new_user_count || 0;
    console.log('[getNewUsersCount] Result:', count);

    return count;
  }
  
}
