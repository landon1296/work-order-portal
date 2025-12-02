const express = require('express');
const router = express.Router();
const pool = require('../../db');
const nodemailer = require('nodemailer');
const { requireSalesRole, auth } = require('../middleware/auth');

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Helper function to check if user is admin (owner, analytics, manager)
function isAdmin(user) {
  const userRoles = user.roles || [user.role];
  return userRoles.includes('owner') || userRoles.includes('analytics') || userRoles.includes('manager');
}

// Helper function to check if user should see all transactions (only owner/analytics, not manager)
function canSeeAllTransactions(user) {
  const userRoles = user.roles || [user.role];
  return userRoles.includes('owner') || userRoles.includes('analytics');
}

const DAY_MS = 1000 * 60 * 60 * 24;
const DAYS_PER_MONTH = 28;
const DAYS_PER_WEEK = 7;
const MONTH_THRESHOLD_DAYS = 21;
const WEEK_THRESHOLD_DAYS = 3;
const COMMISSION_PERCENT = 2;

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const clampNumber = (value, min, max) => Math.min(Math.max(value, min), max);
const positiveOrNull = (value) => {
  const num = toNumber(value);
  return num && num > 0 ? num : null;
};

const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);

const startOfDay = (date) => {
  if (!date) return null;
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);
  return result;
};

const formatDateOnly = (date) => (date ? date.toISOString().split('T')[0] : null);

const parseDateOnly = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : startOfDay(parsed);
};

const normalizeRates = (dailyRate, weeklyRate, monthlyRate) => {
  let normalizedDailyRate = positiveOrNull(dailyRate);
  let normalizedWeeklyRate = positiveOrNull(weeklyRate);
  let normalizedMonthlyRate = positiveOrNull(monthlyRate);

  if (!normalizedDailyRate && normalizedWeeklyRate) {
    normalizedDailyRate = normalizedWeeklyRate / DAYS_PER_WEEK;
  } else if (!normalizedDailyRate && normalizedMonthlyRate) {
    normalizedDailyRate = normalizedMonthlyRate / DAYS_PER_MONTH;
  }

  if (!normalizedWeeklyRate && normalizedDailyRate) {
    normalizedWeeklyRate = normalizedDailyRate * DAYS_PER_WEEK;
  } else if (!normalizedWeeklyRate && normalizedMonthlyRate) {
    normalizedWeeklyRate = normalizedMonthlyRate / Math.ceil(DAYS_PER_MONTH / DAYS_PER_WEEK);
  }

  if (!normalizedMonthlyRate && normalizedWeeklyRate) {
    normalizedMonthlyRate = normalizedWeeklyRate * Math.ceil(DAYS_PER_MONTH / DAYS_PER_WEEK);
  } else if (!normalizedMonthlyRate && normalizedDailyRate) {
    normalizedMonthlyRate = normalizedDailyRate * DAYS_PER_MONTH;
  }

  return {
    daily: normalizedDailyRate,
    weekly: normalizedWeeklyRate,
    monthly: normalizedMonthlyRate
  };
};

const calculateRentalDaysTotal = (startDate, endDate, fallback) => {
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end >= start) {
      const diffDays = Math.floor((end - start) / DAY_MS) + 1;
      return diffDays > 0 ? diffDays : 0;
    }
  }
  const fallbackDays = parseInt(fallback, 10);
  return Number.isFinite(fallbackDays) && fallbackDays >= 0 ? fallbackDays : null;
};

const determineRateType = (rentalDays) => {
  if (Number.isFinite(rentalDays)) {
    if (rentalDays >= MONTH_THRESHOLD_DAYS) {
      return 'monthly';
    }
    if (rentalDays >= WEEK_THRESHOLD_DAYS) {
      return 'weekly';
    }
  }
  return 'daily';
};

const calculateRentalTotal = (days, dailyRate, weeklyRate, monthlyRate, discountPercent = 0) => {
  const rentalDays = Number.isFinite(days) ? days : parseInt(days, 10);
  if (!rentalDays || rentalDays <= 0) return null;

  const normalizedRates = normalizeRates(dailyRate, weeklyRate, monthlyRate);

  if (!normalizedRates.daily && !normalizedRates.weekly && !normalizedRates.monthly) {
    return null;
  }

  let remainingDays = rentalDays;
  let total = 0;

  if (normalizedRates.monthly) {
    const fullMonths = Math.floor(remainingDays / DAYS_PER_MONTH);
    if (fullMonths > 0) {
      total += fullMonths * normalizedRates.monthly;
      remainingDays -= fullMonths * DAYS_PER_MONTH;
    }
  }

  if (normalizedRates.monthly && remainingDays >= MONTH_THRESHOLD_DAYS) {
    total += normalizedRates.monthly;
    remainingDays -= MONTH_THRESHOLD_DAYS;
  }

  if (normalizedRates.weekly) {
    const remainingWeeks = Math.floor(remainingDays / DAYS_PER_WEEK);
    if (remainingWeeks > 0) {
      total += remainingWeeks * normalizedRates.weekly;
      remainingDays -= remainingWeeks * DAYS_PER_WEEK;
    }
  } else if (normalizedRates.daily) {
    const remainingWeeks = Math.floor(remainingDays / DAYS_PER_WEEK);
    if (remainingWeeks > 0) {
      total += remainingWeeks * DAYS_PER_WEEK * normalizedRates.daily;
      remainingDays -= remainingWeeks * DAYS_PER_WEEK;
    }
  }

  if (remainingDays >= WEEK_THRESHOLD_DAYS) {
    if (normalizedRates.weekly) {
      total += normalizedRates.weekly;
      remainingDays = 0;
    } else if (normalizedRates.daily) {
      total += remainingDays * normalizedRates.daily;
      remainingDays = 0;
    }
  } else if (remainingDays > 0 && normalizedRates.daily) {
    total += remainingDays * normalizedRates.daily;
    remainingDays = 0;
  }

  if (discountPercent > 0) {
    total = total * (1 - discountPercent / 100);
  }

  return total;
};

const calculateMonthlyDueDate = (startDate, endDate, today = new Date()) => {
  if (!startDate) {
    return endDate ? formatDateOnly(endDate) : null;
  }

  const todayStart = startOfDay(today);
  let cycleStart = startOfDay(startDate);
  let dueDate = addDays(cycleStart, DAYS_PER_MONTH);

  while (dueDate && dueDate <= todayStart) {
    if (endDate && cycleStart >= endDate) {
      return formatDateOnly(endDate);
    }
    cycleStart = dueDate;
    dueDate = addDays(cycleStart, DAYS_PER_MONTH);
  }

  if (endDate && dueDate && dueDate > endDate) {
    return formatDateOnly(endDate);
  }

  return dueDate ? formatDateOnly(dueDate) : null;
};

const getCommissionDueDate = (startDate, endDate, rateType, today = new Date()) => {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);

  if (rateType === 'monthly') {
    return calculateMonthlyDueDate(start, end, today);
  }
  if (rateType === 'weekly') {
    if (end) return formatDateOnly(end);
    if (start) return formatDateOnly(addDays(start, DAYS_PER_WEEK));
    return null;
  }
  return end ? formatDateOnly(end) : (start ? formatDateOnly(start) : null);
};

const calculateCommissionDetails = (transaction, rentalDays, quantity, discountPercent, today = new Date()) => {
  const rates = normalizeRates(
    transaction.rental_daily_rate,
    transaction.rental_weekly_rate,
    transaction.rental_monthly_rate
  );

  let rateType = determineRateType(rentalDays);
  let rateValue = rates[rateType];

  if (!rateValue) {
    if (rates.monthly) {
      rateType = 'monthly';
      rateValue = rates.monthly;
    } else if (rates.weekly) {
      rateType = 'weekly';
      rateValue = rates.weekly;
    } else if (rates.daily) {
      rateType = 'daily';
      rateValue = rates.daily;
    }
  }

  if (!rateValue) {
    return {
      rateType,
      commissionBase: null,
      commissionDueDate: getCommissionDueDate(transaction.rental_start_date, transaction.rental_end_date, rateType, today)
    };
  }

  const discountMultiplier = 1 - (discountPercent / 100);
  const commissionBase = rateValue * quantity * discountMultiplier;

  return {
    rateType,
    commissionBase,
    commissionDueDate: getCommissionDueDate(transaction.rental_start_date, transaction.rental_end_date, rateType, today)
  };
};

const getDefaultMonthRange = (referenceDate = new Date()) => {
  const start = startOfDay(new Date(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1));
  const end = startOfDay(new Date(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 0));
  return {
    start,
    end,
    startFormatted: formatDateOnly(start),
    endFormatted: formatDateOnly(end)
  };
};

const getMonthRangeFromFilter = (monthParam) => {
  if (!monthParam) return null;
  const today = new Date();
  let targetDate = today;

  if (monthParam === 'previous') {
    targetDate = new Date(today.getUTCFullYear(), today.getUTCMonth() - 1, 1);
  } else if (monthParam === 'next') {
    targetDate = new Date(today.getUTCFullYear(), today.getUTCMonth() + 1, 1);
  } else if (monthParam !== 'current') {
    const match = /^(\d{4})-(\d{2})$/.exec(monthParam);
    if (match) {
      const [_, yearStr, monthStr] = match;
      targetDate = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
    }
  }

  const start = startOfDay(new Date(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), 1));
  const end = startOfDay(new Date(targetDate.getUTCFullYear(), targetDate.getUTCMonth() + 1, 0));

  return {
    start,
    end,
    startFormatted: formatDateOnly(start),
    endFormatted: formatDateOnly(end)
  };
};

const resolveDateFilters = ({ startDate, endDate, month, today = new Date() }) => {
  const defaultMonthRange = getDefaultMonthRange(today);
  const monthRangeFilter = getMonthRangeFromFilter(month);
  const resolvedStartDate = startDate || monthRangeFilter?.startFormatted || null;
  const resolvedEndDate = endDate || monthRangeFilter?.endFormatted || null;

  let monthRangeForFlags = monthRangeFilter || null;
  if (!monthRangeForFlags && (startDate || endDate)) {
    const customStart = parseDateOnly(startDate) || parseDateOnly(endDate);
    const customEnd = parseDateOnly(endDate) || parseDateOnly(startDate);
    if (customStart || customEnd) {
      monthRangeForFlags = {
        start: customStart || customEnd || defaultMonthRange.start,
        end: customEnd || customStart || defaultMonthRange.end
      };
    }
  }

  if (!monthRangeForFlags) {
    monthRangeForFlags = defaultMonthRange;
  }

  return {
    resolvedStartDate,
    resolvedEndDate,
    monthRangeForFlags,
    monthRangeFilter
  };
};

const rangesOverlap = (rangeStart, rangeEnd, windowStart, windowEnd) => {
  if (!windowStart || !windowEnd) return false;
  const start = rangeStart || windowStart;
  const end = rangeEnd || windowEnd;
  if (!start) return false;
  const endTime = end ? end.getTime() : Number.MAX_SAFE_INTEGER;
  return start.getTime() <= windowEnd.getTime() && endTime >= windowStart.getTime();
};

const isSameMonth = (dateA, referenceDate) => {
  if (!dateA || !referenceDate) return false;
  return (
    dateA.getUTCFullYear() === referenceDate.getUTCFullYear() &&
    dateA.getUTCMonth() === referenceDate.getUTCMonth()
  );
};

const applyRentalDerivedFields = (transaction, options = {}) => {
  if (!transaction || transaction.transaction_type !== 'rental') {
    return transaction;
  }

  const updated = { ...transaction };
  const quantity = parseInt(transaction.quantity, 10) || 1;
  const discountPercentRaw = toNumber(transaction.discount_percent);
  const discountPercent = discountPercentRaw !== null ? clampNumber(discountPercentRaw, 0, 100) : 0;

  const rentalDays = calculateRentalDaysTotal(
    transaction.rental_start_date,
    transaction.rental_end_date,
    transaction.rental_days_total
  );
  if (rentalDays !== null) {
    updated.rental_days_total = rentalDays;
  }

  const rentalTotal = calculateRentalTotal(
    rentalDays,
    transaction.rental_daily_rate,
    transaction.rental_weekly_rate,
    transaction.rental_monthly_rate,
    discountPercent
  );
  if (rentalTotal !== null) {
    updated.rental_total = Number(rentalTotal.toFixed(2));
  }

  updated.commission_percent = COMMISSION_PERCENT;

  const commissionDetails = calculateCommissionDetails(
    updated,
    rentalDays,
    quantity,
    discountPercent,
    options.today || new Date()
  );

  if (commissionDetails.commissionBase && commissionDetails.commissionBase > 0) {
    const commissionTotal = (commissionDetails.commissionBase * COMMISSION_PERCENT) / 100;
    updated.next_commission_base_amount = Number(commissionDetails.commissionBase.toFixed(2));
    updated.commission_total = Number(commissionTotal.toFixed(2));
  }

  updated.next_commission_rate_type = commissionDetails.rateType;
  if (commissionDetails.commissionDueDate) {
    updated.next_commission_due_date = commissionDetails.commissionDueDate;
  }

  const today = options.today ? startOfDay(options.today) : startOfDay(new Date());
  const monthRange = options.monthRange || getDefaultMonthRange(today);
  const startDateObj = parseDateOnly(transaction.rental_start_date);
  const endDateObj = parseDateOnly(transaction.rental_end_date);

  updated.is_rental_active = !endDateObj || (today && endDateObj >= today);
  updated.is_active_this_month = rangesOverlap(startDateObj, endDateObj, monthRange.start, monthRange.end);
  updated.ended_this_month = endDateObj ? isSameMonth(endDateObj, monthRange.start) : false;

  return updated;
};

const applyDerivedFields = (rows = [], options = {}) => rows.map(row => applyRentalDerivedFields(row, options));

// GET /api/sales/transactions - Fetch transactions (filtered by salesman if not admin)
router.get('/transactions', requireSalesRole, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      salesman,
      transactionType,
      startDate,
      endDate,
      status,
      month
    } = req.query;

    const parsedPage = parseInt(page, 10) > 0 ? parseInt(page, 10) : 1;
    const parsedLimit = parseInt(limit, 10) > 0 ? Math.min(parseInt(limit, 10), 200) : 50;
    const offset = (parsedPage - 1) * parsedLimit;

    const today = new Date();
    const {
      resolvedStartDate,
      resolvedEndDate,
      monthRangeForFlags
    } = resolveDateFilters({ startDate, endDate, month, today });

    let query = 'SELECT * FROM sales_transactions WHERE 1=1';
    const params = [];
    let paramCount = 0;

    // Filter by salesman - only owner/analytics can see all transactions
    if (!canSeeAllTransactions(req.user)) {
      paramCount++;
      // Use case-insensitive comparison to handle any case differences
      query += ` AND LOWER(salesman_username) = LOWER($${paramCount})`;
      params.push(req.user.username);
      console.log(`[Sales API] Filtering transactions for salesman: ${req.user.username}, roles: ${JSON.stringify(req.user.roles || req.user.role)}`);
    } else if (salesman) {
      paramCount++;
      query += ` AND LOWER(salesman_username) = LOWER($${paramCount})`;
      params.push(salesman);
    }

    // Filter by transaction type
    if (transactionType) {
      paramCount++;
      query += ` AND transaction_type = $${paramCount}`;
      params.push(transactionType);
    }

    if (status === 'active') {
      query += ` AND (transaction_type != 'rental' OR rental_end_date IS NULL OR rental_end_date >= CURRENT_DATE)`;
    } else if (status === 'inactive') {
      query += ` AND transaction_type = 'rental' AND rental_end_date IS NOT NULL AND rental_end_date < CURRENT_DATE`;
    }

    // Filter by date range (explicit or derived month)
    if (resolvedStartDate && resolvedEndDate) {
      paramCount++;
      const startDateParam = `$${paramCount}`;
      params.push(resolvedStartDate);
      
      paramCount++;
      const endDateParam = `$${paramCount}`;
      params.push(resolvedEndDate);
      
      // For rentals: show if rental period overlaps with date range
      // For sales/service: show if transaction date is in date range
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_end_date IS NOT NULL 
         AND rental_start_date <= ${endDateParam} AND rental_end_date >= ${startDateParam})
        OR
        (transaction_type != 'rental' AND date >= ${startDateParam} AND date <= ${endDateParam})
      )`;
    } else if (resolvedStartDate) {
      paramCount++;
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_end_date IS NOT NULL 
         AND rental_end_date >= $${paramCount})
        OR
        (transaction_type != 'rental' AND date >= $${paramCount})
      )`;
      params.push(resolvedStartDate);
    } else if (resolvedEndDate) {
      paramCount++;
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_start_date <= $${paramCount})
        OR
        (transaction_type != 'rental' AND date <= $${paramCount})
      )`;
      params.push(resolvedEndDate);
    }

    query += ` ORDER BY date DESC, created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(parsedLimit, offset);

    const result = await pool.query(query, params);
    const transactions = applyDerivedFields(result.rows, {
      today,
      monthRange: monthRangeForFlags
    });
    
    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) FROM sales_transactions WHERE 1=1';
    const countParams = [];
    let countParamCount = 0;

    if (!canSeeAllTransactions(req.user)) {
      countParamCount++;
      countQuery += ` AND LOWER(salesman_username) = LOWER($${countParamCount})`;
      countParams.push(req.user.username);
    } else if (salesman) {
      countParamCount++;
      countQuery += ` AND LOWER(salesman_username) = LOWER($${countParamCount})`;
      countParams.push(salesman);
    }

    if (transactionType) {
      countParamCount++;
      countQuery += ` AND transaction_type = $${countParamCount}`;
      countParams.push(transactionType);
    }

    if (status === 'active') {
      countQuery += ` AND (transaction_type != 'rental' OR rental_end_date IS NULL OR rental_end_date >= CURRENT_DATE)`;
    } else if (status === 'inactive') {
      countQuery += ` AND transaction_type = 'rental' AND rental_end_date IS NOT NULL AND rental_end_date < CURRENT_DATE`;
    }

    // Apply same date filtering logic for count query
    if (resolvedStartDate && resolvedEndDate) {
      countParamCount++;
      const startDateParam = `$${countParamCount}`;
      countParams.push(resolvedStartDate);
      
      countParamCount++;
      const endDateParam = `$${countParamCount}`;
      countParams.push(resolvedEndDate);
      
      countQuery += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_end_date IS NOT NULL 
         AND rental_start_date <= ${endDateParam} AND rental_end_date >= ${startDateParam})
        OR
        (transaction_type != 'rental' AND date >= ${startDateParam} AND date <= ${endDateParam})
      )`;
    } else if (resolvedStartDate) {
      countParamCount++;
      countQuery += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_end_date IS NOT NULL 
         AND rental_end_date >= $${countParamCount})
        OR
        (transaction_type != 'rental' AND date >= $${countParamCount})
      )`;
      countParams.push(resolvedStartDate);
    } else if (resolvedEndDate) {
      countParamCount++;
      countQuery += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_start_date <= $${countParamCount})
        OR
        (transaction_type != 'rental' AND date <= $${countParamCount})
      )`;
      countParams.push(resolvedEndDate);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      transactions,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages: Math.ceil(total / parsedLimit)
      }
    });
  } catch (error) {
    console.error('Error fetching sales transactions:', error);
    res.status(500).json({ error: 'Failed to fetch sales transactions' });
  }
});

// GET /api/sales/transactions/:id - Get single transaction
router.get('/transactions/:id', requireSalesRole, async (req, res) => {
  try {
    const { id } = req.params;
    
    let query = 'SELECT * FROM sales_transactions WHERE id = $1';
    const params = [id];

    // Only owner/analytics can see all transactions, others see only their own
    if (!canSeeAllTransactions(req.user)) {
      query += ' AND LOWER(salesman_username) = LOWER($2)';
      params.push(req.user.username);
      console.log(`[Sales API GET by ID] Filtering for salesman: ${req.user.username}`);
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json(applyRentalDerivedFields(result.rows[0]));
  } catch (error) {
    console.error('Error fetching sales transaction:', error);
    res.status(500).json({ error: 'Failed to fetch sales transaction' });
  }
});

// POST /api/sales/transactions/bulk - Create multiple transactions (for multi-item orders)
router.post('/transactions/bulk', requireSalesRole, async (req, res) => {
  try {
    const {
      transaction_type,
      date,
      renterra_order_number,
      work_order_no,
      customer,
      items
    } = req.body;

    if (!transaction_type || !date || !customer) {
      return res.status(400).json({ error: 'Transaction type, date, and customer are required' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }

    const salesman_username = req.user.username;
    const createdTransactions = [];

    // Create a transaction record for each item
    for (const item of items) {
      const result = await pool.query(
        `INSERT INTO sales_transactions (
          transaction_type, date, renterra_order_number, work_order_no, customer,
          salesman_username, machine_make, machine_model, machine_serial, quantity,
          sale_price, discount_percent, commission_percent, commission_total,
          rental_days_total, rental_total, rental_start_date, rental_end_date,
          rental_daily_rate, rental_weekly_rate, rental_monthly_rate, description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
        RETURNING *`,
        [
          transaction_type,
          date,
          renterra_order_number || null,
          work_order_no || null,
          customer,
          salesman_username,
          item.machine_make || null,
          item.machine_model || null,
          item.machine_serial || null,
          item.quantity || 1,
          item.sale_price || null,
          item.discount_percent || null,
          item.commission_percent || null,
          item.commission_total || null,
          item.rental_days_total || null,
          item.rental_total || null,
          item.rental_start_date || null,
          item.rental_end_date || null,
          item.rental_daily_rate || null,
          item.rental_weekly_rate || null,
          item.rental_monthly_rate || null,
          item.description || null
        ]
      );
      createdTransactions.push(applyRentalDerivedFields(result.rows[0]));
    }

    res.status(201).json({ transactions: createdTransactions, count: createdTransactions.length });
  } catch (error) {
    console.error('Error creating bulk sales transactions:', error);
    res.status(500).json({ error: 'Failed to create sales transactions' });
  }
});

// POST /api/sales/transactions - Create new transaction (single item, backward compatibility)
router.post('/transactions', requireSalesRole, async (req, res) => {
  try {
    const {
      transaction_type,
      date,
      renterra_order_number,
      work_order_no,
      customer,
      machine_make,
      machine_model,
      machine_serial,
      quantity,
      sale_price,
      discount_percent,
      commission_percent,
      commission_total,
      rental_days_total,
      rental_total,
      rental_start_date,
      rental_end_date,
      rental_daily_rate,
      rental_weekly_rate,
      rental_monthly_rate,
      description
    } = req.body;

    if (!transaction_type || !date || !customer) {
      return res.status(400).json({ error: 'Transaction type, date, and customer are required' });
    }

    const salesman_username = req.user.username;

    const result = await pool.query(
      `INSERT INTO sales_transactions (
        transaction_type, date, renterra_order_number, work_order_no, customer,
        salesman_username, machine_make, machine_model, machine_serial, quantity,
        sale_price, discount_percent, commission_percent, commission_total,
        rental_days_total, rental_total, rental_start_date, rental_end_date,
        rental_daily_rate, rental_weekly_rate, rental_monthly_rate, description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      RETURNING *`,
      [
        transaction_type,
        date,
        renterra_order_number || null,
        work_order_no || null,
        customer,
        salesman_username,
        machine_make || null,
        machine_model || null,
        machine_serial || null,
        quantity || 1,
        sale_price || null,
        discount_percent || null,
        commission_percent || null,
        commission_total || null,
        rental_days_total || null,
        rental_total || null,
        rental_start_date || null,
        rental_end_date || null,
        rental_daily_rate || null,
        rental_weekly_rate || null,
        rental_monthly_rate || null,
        description || null
      ]
    );

    res.status(201).json(applyRentalDerivedFields(result.rows[0]));
  } catch (error) {
    console.error('Error creating sales transaction:', error);
    res.status(500).json({ error: 'Failed to create sales transaction' });
  }
});

// PUT /api/sales/transactions/:id - Update transaction
router.put('/transactions/:id', requireSalesRole, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      transaction_type,
      date,
      renterra_order_number,
      work_order_no,
      customer,
      machine_make,
      machine_model,
      machine_serial,
      quantity,
      sale_price,
      discount_percent,
      commission_percent,
      commission_total,
      rental_days_total,
      rental_total,
      rental_start_date,
      rental_end_date,
      rental_daily_rate,
      rental_weekly_rate,
      rental_monthly_rate,
      description
    } = req.body;

    // Check if transaction exists and user has permission
    let checkQuery = 'SELECT * FROM sales_transactions WHERE id = $1';
    const checkParams = [id];

    if (!canSeeAllTransactions(req.user)) {
      checkQuery += ' AND LOWER(salesman_username) = LOWER($2)';
      checkParams.push(req.user.username);
      console.log(`[Sales API PUT] Checking permission for salesman: ${req.user.username}`);
    }

    const checkResult = await pool.query(checkQuery, checkParams);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found or access denied' });
    }

    const result = await pool.query(
      `UPDATE sales_transactions 
       SET transaction_type = $1, date = $2, renterra_order_number = $3, work_order_no = $4,
           customer = $5, machine_make = $6, machine_model = $7, machine_serial = $8,
           quantity = $9, sale_price = $10, discount_percent = $11, commission_percent = $12,
           commission_total = $13, rental_days_total = $14, rental_total = $15,
           rental_start_date = $16, rental_end_date = $17, rental_daily_rate = $18,
           rental_weekly_rate = $19, rental_monthly_rate = $20, description = $21,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $22
       RETURNING *`,
      [
        transaction_type,
        date,
        renterra_order_number || null,
        work_order_no || null,
        customer,
        machine_make || null,
        machine_model || null,
        machine_serial || null,
        quantity || 1,
        sale_price || null,
        discount_percent || null,
        commission_percent || null,
        commission_total || null,
        rental_days_total || null,
        rental_total || null,
        rental_start_date || null,
        rental_end_date || null,
        rental_daily_rate || null,
        rental_weekly_rate || null,
        rental_monthly_rate || null,
        description || null,
        id
      ]
    );

    res.json(applyRentalDerivedFields(result.rows[0]));
  } catch (error) {
    console.error('Error updating sales transaction:', error);
    res.status(500).json({ error: 'Failed to update sales transaction' });
  }
});

// PATCH /api/sales/transactions/:id/call-off - Call off a rental (set end date to today)
router.patch('/transactions/:id/call-off', requireSalesRole, async (req, res) => {
  try {
    const { id } = req.params;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    // Check if transaction exists, is a rental, and user has permission
    let checkQuery = 'SELECT * FROM sales_transactions WHERE id = $1 AND transaction_type = $2';
    const checkParams = [id, 'rental'];

    if (!canSeeAllTransactions(req.user)) {
      checkQuery += ' AND LOWER(salesman_username) = LOWER($3)';
      checkParams.push(req.user.username);
      console.log(`[Sales API Call-Off] Checking permission for salesman: ${req.user.username}`);
    }

    const checkResult = await pool.query(checkQuery, checkParams);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Rental transaction not found or access denied' });
    }

    const transaction = checkResult.rows[0];
    const rentalStartDate = transaction.rental_start_date;

    // Calculate rental days total
    let rentalDaysTotal = null;
    if (rentalStartDate) {
      const start = new Date(rentalStartDate);
      const end = new Date(today);
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      rentalDaysTotal = diffDays;
    }

    // Update rental end date and rental days total
    const result = await pool.query(
      `UPDATE sales_transactions 
       SET rental_end_date = $1, rental_days_total = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [today, rentalDaysTotal, id]
    );

    res.json(applyRentalDerivedFields(result.rows[0]));
  } catch (error) {
    console.error('Error calling off rental:', error);
    res.status(500).json({ error: 'Failed to call off rental' });
  }
});

// DELETE /api/sales/transactions/:id - Delete transaction
router.delete('/transactions/:id', requireSalesRole, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if transaction exists and user has permission
    let checkQuery = 'SELECT * FROM sales_transactions WHERE id = $1';
    const checkParams = [id];

    if (!canSeeAllTransactions(req.user)) {
      checkQuery += ' AND LOWER(salesman_username) = LOWER($2)';
      checkParams.push(req.user.username);
      console.log(`[Sales API DELETE] Checking permission for salesman: ${req.user.username}`);
    }

    const checkResult = await pool.query(checkQuery, checkParams);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found or access denied' });
    }

    const result = await pool.query(
      'DELETE FROM sales_transactions WHERE id = $1 RETURNING id',
      [id]
    );

    res.json({ message: 'Transaction deleted successfully' });
  } catch (error) {
    console.error('Error deleting sales transaction:', error);
    res.status(500).json({ error: 'Failed to delete sales transaction' });
  }
});

// GET /api/sales/stats - Get aggregate statistics
router.get('/stats', requireSalesRole, async (req, res) => {
  try {
    const { salesman, startDate, endDate, status, month, transactionType } = req.query;
    const today = new Date();
    const {
      resolvedStartDate,
      resolvedEndDate,
      monthRangeForFlags
    } = resolveDateFilters({ startDate, endDate, month, today });
    
    let query = 'SELECT * FROM sales_transactions WHERE 1=1';
    const params = [];
    let paramCount = 0;

    // Filter by salesman - only owner/analytics can see all transactions
    if (!canSeeAllTransactions(req.user)) {
      paramCount++;
      query += ` AND salesman_username = $${paramCount}`;
      params.push(req.user.username);
    } else if (salesman) {
      paramCount++;
      query += ` AND salesman_username = $${paramCount}`;
      params.push(salesman);
    }

    if (transactionType) {
      paramCount++;
      query += ` AND transaction_type = $${paramCount}`;
      params.push(transactionType);
    }

    if (status === 'active') {
      query += ` AND (transaction_type != 'rental' OR rental_end_date IS NULL OR rental_end_date >= CURRENT_DATE)`;
    } else if (status === 'inactive') {
      query += ` AND transaction_type = 'rental' AND rental_end_date IS NOT NULL AND rental_end_date < CURRENT_DATE`;
    }

    // Filter by date range
    // For sales/service: filter by transaction date
    // For rentals: filter by rental period overlapping with date range
    if (resolvedStartDate && resolvedEndDate) {
      paramCount++;
      const startDateParam = `$${paramCount}`;
      params.push(resolvedStartDate);
      
      paramCount++;
      const endDateParam = `$${paramCount}`;
      params.push(resolvedEndDate);
      
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_end_date IS NOT NULL 
         AND rental_start_date <= ${endDateParam} AND rental_end_date >= ${startDateParam})
        OR
        (transaction_type != 'rental' AND date >= ${startDateParam} AND date <= ${endDateParam})
      )`;
    } else if (resolvedStartDate) {
      paramCount++;
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_end_date IS NOT NULL 
         AND rental_end_date >= $${paramCount})
        OR
        (transaction_type != 'rental' AND date >= $${paramCount})
      )`;
      params.push(resolvedStartDate);
    } else if (resolvedEndDate) {
      paramCount++;
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_start_date <= $${paramCount})
        OR
        (transaction_type != 'rental' AND date <= $${paramCount})
      )`;
      params.push(resolvedEndDate);
    }

    const result = await pool.query(query, params);
    const transactions = applyDerivedFields(result.rows, {
      today,
      monthRange: monthRangeForFlags
    });

    // Calculate statistics
    const stats = {
      totalTransactions: transactions.length,
      totalCommission: 0,
      totalSales: 0,
      totalRentals: 0,
      byType: {
        new_sale: { count: 0, totalCommission: 0, totalSales: 0 },
        used_sale: { count: 0, totalCommission: 0, totalSales: 0 },
        rental: { count: 0, totalRental: 0 },
        service: { count: 0, totalCommission: 0 }
      },
      bySalesman: {}
    };

    transactions.forEach(trans => {
      // Total commission
      if (trans.commission_total) {
        stats.totalCommission += parseFloat(trans.commission_total) || 0;
      }

      // By type
      if (trans.transaction_type === 'new_sale' || trans.transaction_type === 'used_sale') {
        if (trans.sale_price) {
          stats.totalSales += parseFloat(trans.sale_price) || 0;
        }
        if (stats.byType[trans.transaction_type]) {
          stats.byType[trans.transaction_type].count++;
          if (trans.commission_total) {
            stats.byType[trans.transaction_type].totalCommission += parseFloat(trans.commission_total) || 0;
          }
          if (trans.sale_price) {
            stats.byType[trans.transaction_type].totalSales += parseFloat(trans.sale_price) || 0;
          }
        }
      } else if (trans.transaction_type === 'rental') {
        if (trans.rental_total) {
          stats.totalRentals += parseFloat(trans.rental_total) || 0;
        }
        stats.byType.rental.count++;
        if (trans.rental_total) {
          stats.byType.rental.totalRental += parseFloat(trans.rental_total) || 0;
        }
      } else if (trans.transaction_type === 'service') {
        stats.byType.service.count++;
        if (trans.commission_total) {
          stats.byType.service.totalCommission += parseFloat(trans.commission_total) || 0;
        }
      }

      // By salesman
      if (!stats.bySalesman[trans.salesman_username]) {
        stats.bySalesman[trans.salesman_username] = {
          count: 0,
          totalCommission: 0,
          totalSales: 0,
          totalRentals: 0
        };
      }
      stats.bySalesman[trans.salesman_username].count++;
      if (trans.commission_total) {
        stats.bySalesman[trans.salesman_username].totalCommission += parseFloat(trans.commission_total) || 0;
      }
      if (trans.sale_price) {
        stats.bySalesman[trans.salesman_username].totalSales += parseFloat(trans.sale_price) || 0;
      }
      if (trans.rental_total) {
        stats.bySalesman[trans.salesman_username].totalRentals += parseFloat(trans.rental_total) || 0;
      }
    });

    res.json(stats);
  } catch (error) {
    console.error('Error fetching sales statistics:', error);
    res.status(500).json({ error: 'Failed to fetch sales statistics' });
  }
});

// GET /api/sales/export/csv - Generate CSV export
router.get('/export/csv', requireSalesRole, async (req, res) => {
  try {
    const { salesman, transactionType, startDate, endDate, status, month } = req.query;
    const today = new Date();
    const {
      resolvedStartDate,
      resolvedEndDate,
      monthRangeForFlags
    } = resolveDateFilters({ startDate, endDate, month, today });
    
    let query = 'SELECT * FROM sales_transactions WHERE 1=1';
    const params = [];
    let paramCount = 0;

    // Filter by salesman - only owner/analytics can see all transactions
    if (!canSeeAllTransactions(req.user)) {
      paramCount++;
      query += ` AND salesman_username = $${paramCount}`;
      params.push(req.user.username);
    } else if (salesman) {
      paramCount++;
      query += ` AND salesman_username = $${paramCount}`;
      params.push(salesman);
    }

    if (transactionType) {
      paramCount++;
      query += ` AND transaction_type = $${paramCount}`;
      params.push(transactionType);
    }

    if (status === 'active') {
      query += ` AND (transaction_type != 'rental' OR rental_end_date IS NULL OR rental_end_date >= CURRENT_DATE)`;
    } else if (status === 'inactive') {
      query += ` AND transaction_type = 'rental' AND rental_end_date IS NOT NULL AND rental_end_date < CURRENT_DATE`;
    }

    // Apply same date filtering logic for CSV export
    if (resolvedStartDate && resolvedEndDate) {
      paramCount++;
      const startDateParam = `$${paramCount}`;
      params.push(resolvedStartDate);
      
      paramCount++;
      const endDateParam = `$${paramCount}`;
      params.push(resolvedEndDate);
      
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_end_date IS NOT NULL 
         AND rental_start_date <= ${endDateParam} AND rental_end_date >= ${startDateParam})
        OR
        (transaction_type != 'rental' AND date >= ${startDateParam} AND date <= ${endDateParam})
      )`;
    } else if (resolvedStartDate) {
      paramCount++;
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_end_date IS NOT NULL 
         AND rental_end_date >= $${paramCount})
        OR
        (transaction_type != 'rental' AND date >= $${paramCount})
      )`;
      params.push(resolvedStartDate);
    } else if (resolvedEndDate) {
      paramCount++;
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_start_date <= $${paramCount})
        OR
        (transaction_type != 'rental' AND date <= $${paramCount})
      )`;
      params.push(resolvedEndDate);
    }

    query += ' ORDER BY date DESC, created_at DESC';

    const result = await pool.query(query, params);
    const transactions = applyDerivedFields(result.rows, {
      today,
      monthRange: monthRangeForFlags
    });

    // Generate CSV
    const headers = [
      'ID', 'Transaction Type', 'Date', 'Renterra Order #', 'Work Order #',
      'Customer', 'Salesman', 'Machine Make', 'Machine Model', 'Machine Serial',
      'Quantity', 'Sale Price', 'Discount %', 'Commission %', 'Commission Total',
      'Rental Days', 'Rental Total', 'Next Commission Tier', 'Next Commission Due', 'Created At'
    ];

    const csvRows = [headers.join(',')];

    transactions.forEach(trans => {
      const row = [
        trans.id,
        trans.transaction_type,
        trans.date,
        trans.renterra_order_number || '',
        trans.work_order_no || '',
        `"${(trans.customer || '').replace(/"/g, '""')}"`,
        trans.salesman_username,
        trans.machine_make || '',
        trans.machine_model || '',
        trans.machine_serial || '',
        trans.quantity || 1,
        trans.sale_price || '',
        trans.discount_percent || '',
        trans.commission_percent || '',
        trans.commission_total || '',
        trans.rental_days_total || '',
        trans.rental_total || '',
        trans.next_commission_rate_type || '',
        trans.next_commission_due_date || '',
        trans.created_at
      ];
      csvRows.push(row.join(','));
    });

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=sales-transactions-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Error generating CSV export:', error);
    res.status(500).json({ error: 'Failed to generate CSV export' });
  }
});

// GET /api/sales/export/pdf - Return data for PDF generation (frontend will generate PDF)
router.get('/export/pdf', requireSalesRole, async (req, res) => {
  try {
    const { salesman, transactionType, startDate, endDate, status, month } = req.query;
    const today = new Date();
    const {
      resolvedStartDate,
      resolvedEndDate,
      monthRangeForFlags
    } = resolveDateFilters({ startDate, endDate, month, today });
    
    let query = 'SELECT * FROM sales_transactions WHERE 1=1';
    const params = [];
    let paramCount = 0;

    // Filter by salesman - only owner/analytics can see all transactions
    if (!canSeeAllTransactions(req.user)) {
      paramCount++;
      query += ` AND salesman_username = $${paramCount}`;
      params.push(req.user.username);
    } else if (salesman) {
      paramCount++;
      query += ` AND salesman_username = $${paramCount}`;
      params.push(salesman);
    }

    if (transactionType) {
      paramCount++;
      query += ` AND transaction_type = $${paramCount}`;
      params.push(transactionType);
    }

    if (status === 'active') {
      query += ` AND (transaction_type != 'rental' OR rental_end_date IS NULL OR rental_end_date >= CURRENT_DATE)`;
    } else if (status === 'inactive') {
      query += ` AND transaction_type = 'rental' AND rental_end_date IS NOT NULL AND rental_end_date < CURRENT_DATE`;
    }

    // Apply same date filtering logic for PDF export
    if (resolvedStartDate && resolvedEndDate) {
      paramCount++;
      const startDateParam = `$${paramCount}`;
      params.push(resolvedStartDate);
      
      paramCount++;
      const endDateParam = `$${paramCount}`;
      params.push(resolvedEndDate);
      
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_end_date IS NOT NULL 
         AND rental_start_date <= ${endDateParam} AND rental_end_date >= ${startDateParam})
        OR
        (transaction_type != 'rental' AND date >= ${startDateParam} AND date <= ${endDateParam})
      )`;
    } else if (resolvedStartDate) {
      paramCount++;
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_end_date IS NOT NULL 
         AND rental_end_date >= $${paramCount})
        OR
        (transaction_type != 'rental' AND date >= $${paramCount})
      )`;
      params.push(resolvedStartDate);
    } else if (resolvedEndDate) {
      paramCount++;
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_start_date <= $${paramCount})
        OR
        (transaction_type != 'rental' AND date <= $${paramCount})
      )`;
      params.push(resolvedEndDate);
    }

    query += ' ORDER BY date DESC, created_at DESC';

    const result = await pool.query(query, params);
    const transactions = applyDerivedFields(result.rows, {
      today,
      monthRange: monthRangeForFlags
    });
    
    res.json({ transactions });
  } catch (error) {
    console.error('Error fetching transactions for PDF:', error);
    res.status(500).json({ error: 'Failed to fetch transactions for PDF' });
  }
});

// POST /api/sales/export/email - Send email with export data
router.post('/export/email', requireSalesRole, async (req, res) => {
  try {
    const { to, subject, format, salesman, transactionType, startDate, endDate, status, month } = req.body;

    if (!to || !subject) {
      return res.status(400).json({ error: 'Recipient email and subject are required' });
    }

    const today = new Date();
    const {
      resolvedStartDate,
      resolvedEndDate,
      monthRangeForFlags
    } = resolveDateFilters({ startDate, endDate, month, today });

    // Fetch transactions
    let query = 'SELECT * FROM sales_transactions WHERE 1=1';
    const params = [];
    let paramCount = 0;

    // Filter by salesman - only owner/analytics can see all transactions
    if (!canSeeAllTransactions(req.user)) {
      paramCount++;
      query += ` AND salesman_username = $${paramCount}`;
      params.push(req.user.username);
    } else if (salesman) {
      paramCount++;
      query += ` AND salesman_username = $${paramCount}`;
      params.push(salesman);
    }

    if (transactionType) {
      paramCount++;
      query += ` AND transaction_type = $${paramCount}`;
      params.push(transactionType);
    }

    if (status === 'active') {
      query += ` AND (transaction_type != 'rental' OR rental_end_date IS NULL OR rental_end_date >= CURRENT_DATE)`;
    } else if (status === 'inactive') {
      query += ` AND transaction_type = 'rental' AND rental_end_date IS NOT NULL AND rental_end_date < CURRENT_DATE`;
    }

    // Apply same date filtering logic for email export
    if (resolvedStartDate && resolvedEndDate) {
      paramCount++;
      const startDateParam = `$${paramCount}`;
      params.push(resolvedStartDate);
      
      paramCount++;
      const endDateParam = `$${paramCount}`;
      params.push(resolvedEndDate);
      
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_end_date IS NOT NULL 
         AND rental_start_date <= ${endDateParam} AND rental_end_date >= ${startDateParam})
        OR
        (transaction_type != 'rental' AND date >= ${startDateParam} AND date <= ${endDateParam})
      )`;
    } else if (resolvedStartDate) {
      paramCount++;
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_end_date IS NOT NULL 
         AND rental_end_date >= $${paramCount})
        OR
        (transaction_type != 'rental' AND date >= $${paramCount})
      )`;
      params.push(resolvedStartDate);
    } else if (resolvedEndDate) {
      paramCount++;
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_start_date <= $${paramCount})
        OR
        (transaction_type != 'rental' AND date <= $${paramCount})
      )`;
      params.push(resolvedEndDate);
    }

    query += ' ORDER BY date DESC, created_at DESC';

    const result = await pool.query(query, params);
    const transactions = applyDerivedFields(result.rows, {
      today,
      monthRange: monthRangeForFlags
    });

    let emailBody = '';
    let emailHtml = '';

    if (format === 'csv') {
      // Generate CSV
      const headers = [
        'ID', 'Transaction Type', 'Date', 'Renterra Order #', 'Work Order #',
        'Customer', 'Salesman', 'Machine Make', 'Machine Model', 'Machine Serial',
        'Quantity', 'Sale Price', 'Discount %', 'Commission %', 'Commission Total',
        'Rental Days', 'Rental Total', 'Next Commission Tier', 'Next Commission Due', 'Created At'
      ];

      const csvRows = [headers.join(',')];
      transactions.forEach(trans => {
        const row = [
          trans.id,
          trans.transaction_type,
          trans.date,
          trans.renterra_order_number || '',
          trans.work_order_no || '',
          `"${(trans.customer || '').replace(/"/g, '""')}"`,
          trans.salesman_username,
          trans.machine_make || '',
          trans.machine_model || '',
          trans.machine_serial || '',
          trans.quantity || 1,
          trans.sale_price || '',
          trans.discount_percent || '',
          trans.commission_percent || '',
          trans.commission_total || '',
          trans.rental_days_total || '',
          trans.rental_total || '',
          trans.next_commission_rate_type || '',
          trans.next_commission_due_date || '',
          trans.created_at
        ];
        csvRows.push(row.join(','));
      });

      emailBody = csvRows.join('\n');
      emailHtml = `<pre>${emailBody}</pre>`;
    } else {
      // Generate HTML table
      emailHtml = `
        <html>
          <head>
            <style>
              table { border-collapse: collapse; width: 100%; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #2563eb; color: white; }
              tr:nth-child(even) { background-color: #f2f2f2; }
            </style>
          </head>
          <body>
            <h2>Sales Transactions Report</h2>
            <p>Total Transactions: ${transactions.length}</p>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Salesman</th>
                  <th>Customer</th>
                  <th>Machine</th>
                  <th>Renterra Order #</th>
                  <th>Work Order #</th>
                  <th>Sale Price</th>
                  <th>Commission %</th>
                  <th>Commission Total</th>
                  <th>Rental Days</th>
                  <th>Rental Total</th>
                  <th>Next Payout Tier</th>
                  <th>Next Commission Due</th>
                  <th>Rental Status</th>
                </tr>
              </thead>
              <tbody>
                ${transactions.map(trans => `
                  <tr>
                    <td>${trans.date}</td>
                    <td>${trans.transaction_type}</td>
                    <td>${trans.salesman_username || ''}</td>
                    <td>${trans.customer || ''}</td>
                    <td>${trans.machine_make || ''} ${trans.machine_model || ''}</td>
                    <td>${trans.renterra_order_number || ''}</td>
                    <td>${trans.work_order_no || ''}</td>
                    <td>${trans.sale_price || ''}</td>
                    <td>${trans.commission_percent || ''}</td>
                    <td>${trans.commission_total || ''}</td>
                    <td>${trans.rental_days_total || ''}</td>
                    <td>${trans.rental_total || ''}</td>
                    <td>${trans.next_commission_rate_type || ''}</td>
                    <td>${trans.next_commission_due_date || ''}</td>
                    <td>${trans.transaction_type === 'rental'
                      ? (trans.is_rental_active ? 'Active' : (trans.ended_this_month ? 'Ended this month' : 'Ended'))
                      : ''}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </body>
        </html>
      `;
      emailBody = `Sales Transactions Report\n\nTotal Transactions: ${transactions.length}\n\n${transactions.map(trans => 
        `Date: ${trans.date}, Type: ${trans.transaction_type}, Customer: ${trans.customer || ''}, Commission: ${trans.commission_total || ''}`
      ).join('\n')}`;
    }

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      text: emailBody,
      html: emailHtml
    });

    res.json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending email export:', error);
    res.status(500).json({ error: 'Failed to send email export' });
  }
});

module.exports = router;

