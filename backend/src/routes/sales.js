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

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const clampNumber = (value, min, max) => Math.min(Math.max(value, min), max);

const calculateRentalDaysTotal = (startDate, endDate, fallback) => {
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end >= start) {
      const diffDays = Math.ceil((end - start) / DAY_MS);
      return diffDays > 0 ? diffDays : 0;
    }
  }
  const fallbackDays = parseInt(fallback, 10);
  return Number.isFinite(fallbackDays) && fallbackDays >= 0 ? fallbackDays : null;
};

const calculateRentalTotal = (days, dailyRate, weeklyRate, monthlyRate, discountPercent = 0) => {
  const rentalDays = Number.isFinite(days) ? days : parseInt(days, 10);
  if (!rentalDays || rentalDays <= 0) return null;

  const positiveOrNull = (value) => {
    const num = toNumber(value);
    return num && num > 0 ? num : null;
  };

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

  if (!normalizedDailyRate && !normalizedWeeklyRate && !normalizedMonthlyRate) {
    return null;
  }

  let remainingDays = rentalDays;
  let total = 0;

  if (normalizedMonthlyRate) {
    const fullMonths = Math.floor(remainingDays / DAYS_PER_MONTH);
    if (fullMonths > 0) {
      total += fullMonths * normalizedMonthlyRate;
      remainingDays -= fullMonths * DAYS_PER_MONTH;
    }
  }

  if (normalizedMonthlyRate && remainingDays >= MONTH_THRESHOLD_DAYS) {
    total += normalizedMonthlyRate;
    remainingDays -= MONTH_THRESHOLD_DAYS;
  }

  if (normalizedWeeklyRate) {
    const remainingWeeks = Math.floor(remainingDays / DAYS_PER_WEEK);
    if (remainingWeeks > 0) {
      total += remainingWeeks * normalizedWeeklyRate;
      remainingDays -= remainingWeeks * DAYS_PER_WEEK;
    }
  } else if (normalizedDailyRate) {
    const remainingWeeks = Math.floor(remainingDays / DAYS_PER_WEEK);
    if (remainingWeeks > 0) {
      total += remainingWeeks * DAYS_PER_WEEK * normalizedDailyRate;
      remainingDays -= remainingWeeks * DAYS_PER_WEEK;
    }
  }

  if (remainingDays >= WEEK_THRESHOLD_DAYS) {
    if (normalizedWeeklyRate) {
      total += normalizedWeeklyRate;
      remainingDays = 0;
    } else if (normalizedDailyRate) {
      total += remainingDays * normalizedDailyRate;
      remainingDays = 0;
    }
  } else if (remainingDays > 0 && normalizedDailyRate) {
    total += remainingDays * normalizedDailyRate;
    remainingDays = 0;
  }

  if (discountPercent > 0) {
    total = total * (1 - discountPercent / 100);
  }

  return total;
};

const calculateNextBillingAmount = (record = {}) => {
  const today = new Date();
  const quantity = parseInt(record.quantity, 10) || 1;

  const monthlyRate = toNumber(record.rental_monthly_rate) || 0;
  const weeklyRateRaw = toNumber(record.rental_weekly_rate) || 0;
  const dailyRateRaw = toNumber(record.rental_daily_rate) || 0;

  const derivedWeeklyRate = weeklyRateRaw > 0
    ? weeklyRateRaw
    : dailyRateRaw > 0
      ? dailyRateRaw * DAYS_PER_WEEK
      : monthlyRate > 0
        ? monthlyRate / 4
        : 0;

  const derivedDailyRate = dailyRateRaw > 0
    ? dailyRateRaw
    : weeklyRateRaw > 0
      ? weeklyRateRaw / DAYS_PER_WEEK
      : monthlyRate > 0
        ? monthlyRate / DAYS_PER_MONTH
        : 0;

  let remainingDays = toNumber(record.rental_days_total);
  const rentalEndDate = record.rental_end_date ? new Date(record.rental_end_date) : null;
  if (rentalEndDate && !isNaN(rentalEndDate.getTime())) {
    remainingDays = Math.ceil((rentalEndDate - today) / DAY_MS);
  }

  if (!Number.isFinite(remainingDays)) {
    remainingDays = 0;
  }
  if (remainingDays < 0) {
    remainingDays = 0;
  }

  const discountPercentRaw = toNumber(record.discount_percent);
  const discountPercent = discountPercentRaw !== null ? clampNumber(discountPercentRaw, 0, 100) : 0;
  const applyDiscount = (amount) => {
    if (!amount || amount <= 0) return amount;
    return amount * (1 - discountPercent / 100);
  };

  if (remainingDays >= MONTH_THRESHOLD_DAYS && monthlyRate > 0) {
    return applyDiscount(monthlyRate * quantity);
  }
  if (remainingDays >= WEEK_THRESHOLD_DAYS && derivedWeeklyRate > 0) {
    return applyDiscount(derivedWeeklyRate * quantity);
  }
  if (remainingDays > 0 && derivedDailyRate > 0) {
    return applyDiscount(derivedDailyRate * remainingDays * quantity);
  }

  if (monthlyRate > 0) {
    return applyDiscount(monthlyRate * quantity);
  }
  if (derivedWeeklyRate > 0) {
    return applyDiscount(derivedWeeklyRate * quantity);
  }
  if (derivedDailyRate > 0) {
    return applyDiscount(derivedDailyRate * quantity);
  }

  return null;
};

const applyRentalDerivedFields = (transaction) => {
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

  const commissionPercent = 2;
  updated.commission_percent = commissionPercent;

  let commissionBase = calculateNextBillingAmount({
    rental_end_date: transaction.rental_end_date,
    rental_days_total: rentalDays !== null ? rentalDays : transaction.rental_days_total,
    rental_monthly_rate: transaction.rental_monthly_rate,
    rental_weekly_rate: transaction.rental_weekly_rate,
    rental_daily_rate: transaction.rental_daily_rate,
    quantity,
    discount_percent: discountPercent
  });

  if (!commissionBase && rentalTotal !== null) {
    commissionBase = rentalTotal;
  }
  if (!commissionBase) {
    const storedTotal = toNumber(transaction.rental_total);
    if (storedTotal) {
      commissionBase = storedTotal;
    }
  }

  if (commissionBase && commissionBase > 0) {
    updated.commission_total = Number(((commissionBase * commissionPercent) / 100).toFixed(2));
  }

  return updated;
};

const applyDerivedFields = (rows = []) => rows.map(row => applyRentalDerivedFields(row));

// GET /api/sales/transactions - Fetch transactions (filtered by salesman if not admin)
router.get('/transactions', requireSalesRole, async (req, res) => {
  try {
    const { page = 1, limit = 50, salesman, transactionType, startDate, endDate } = req.query;
    const offset = (page - 1) * limit;
    
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

    // Filter by date range
    // For sales/service: filter by transaction date
    // For rentals: filter by rental period overlapping with date range
    if (startDate && endDate) {
      paramCount++;
      const startDateParam = `$${paramCount}`;
      params.push(startDate);
      
      paramCount++;
      const endDateParam = `$${paramCount}`;
      params.push(endDate);
      
      // For rentals: show if rental period overlaps with date range
      // For sales/service: show if transaction date is in date range
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_end_date IS NOT NULL 
         AND rental_start_date <= ${endDateParam} AND rental_end_date >= ${startDateParam})
        OR
        (transaction_type != 'rental' AND date >= ${startDateParam} AND date <= ${endDateParam})
      )`;
    } else if (startDate) {
      paramCount++;
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_end_date IS NOT NULL 
         AND rental_end_date >= $${paramCount})
        OR
        (transaction_type != 'rental' AND date >= $${paramCount})
      )`;
      params.push(startDate);
    } else if (endDate) {
      paramCount++;
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_start_date <= $${paramCount})
        OR
        (transaction_type != 'rental' AND date <= $${paramCount})
      )`;
      params.push(endDate);
    }

    query += ` ORDER BY date DESC, created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    const transactions = applyDerivedFields(result.rows);
    
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

    // Apply same date filtering logic for count query
    if (startDate && endDate) {
      countParamCount++;
      const startDateParam = `$${countParamCount}`;
      countParams.push(startDate);
      
      countParamCount++;
      const endDateParam = `$${countParamCount}`;
      countParams.push(endDate);
      
      countQuery += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_end_date IS NOT NULL 
         AND rental_start_date <= ${endDateParam} AND rental_end_date >= ${startDateParam})
        OR
        (transaction_type != 'rental' AND date >= ${startDateParam} AND date <= ${endDateParam})
      )`;
    } else if (startDate) {
      countParamCount++;
      countQuery += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_end_date IS NOT NULL 
         AND rental_end_date >= $${countParamCount})
        OR
        (transaction_type != 'rental' AND date >= $${countParamCount})
      )`;
      countParams.push(startDate);
    } else if (endDate) {
      countParamCount++;
      countQuery += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_start_date <= $${countParamCount})
        OR
        (transaction_type != 'rental' AND date <= $${countParamCount})
      )`;
      countParams.push(endDate);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
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
    const { salesman, startDate, endDate } = req.query;
    
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

    // Filter by date range
    // For sales/service: filter by transaction date
    // For rentals: filter by rental period overlapping with date range
    if (startDate && endDate) {
      paramCount++;
      const startDateParam = `$${paramCount}`;
      params.push(startDate);
      
      paramCount++;
      const endDateParam = `$${paramCount}`;
      params.push(endDate);
      
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_end_date IS NOT NULL 
         AND rental_start_date <= ${endDateParam} AND rental_end_date >= ${startDateParam})
        OR
        (transaction_type != 'rental' AND date >= ${startDateParam} AND date <= ${endDateParam})
      )`;
    } else if (startDate) {
      paramCount++;
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_end_date IS NOT NULL 
         AND rental_end_date >= $${paramCount})
        OR
        (transaction_type != 'rental' AND date >= $${paramCount})
      )`;
      params.push(startDate);
    } else if (endDate) {
      paramCount++;
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_start_date <= $${paramCount})
        OR
        (transaction_type != 'rental' AND date <= $${paramCount})
      )`;
      params.push(endDate);
    }

    const result = await pool.query(query, params);
    const transactions = applyDerivedFields(result.rows);

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
    const { salesman, transactionType, startDate, endDate } = req.query;
    
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

    // Apply same date filtering logic for CSV export
    if (startDate && endDate) {
      paramCount++;
      const startDateParam = `$${paramCount}`;
      params.push(startDate);
      
      paramCount++;
      const endDateParam = `$${paramCount}`;
      params.push(endDate);
      
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_end_date IS NOT NULL 
         AND rental_start_date <= ${endDateParam} AND rental_end_date >= ${startDateParam})
        OR
        (transaction_type != 'rental' AND date >= ${startDateParam} AND date <= ${endDateParam})
      )`;
    } else if (startDate) {
      paramCount++;
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_end_date IS NOT NULL 
         AND rental_end_date >= $${paramCount})
        OR
        (transaction_type != 'rental' AND date >= $${paramCount})
      )`;
      params.push(startDate);
    } else if (endDate) {
      paramCount++;
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_start_date <= $${paramCount})
        OR
        (transaction_type != 'rental' AND date <= $${paramCount})
      )`;
      params.push(endDate);
    }

    query += ' ORDER BY date DESC, created_at DESC';

    const result = await pool.query(query, params);
    const transactions = applyDerivedFields(result.rows);

    // Generate CSV
    const headers = [
      'ID', 'Transaction Type', 'Date', 'Renterra Order #', 'Work Order #',
      'Customer', 'Salesman', 'Machine Make', 'Machine Model', 'Machine Serial',
      'Quantity', 'Sale Price', 'Discount %', 'Commission %', 'Commission Total',
      'Rental Days', 'Rental Total', 'Created At'
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
    const { salesman, transactionType, startDate, endDate } = req.query;
    
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

    // Apply same date filtering logic for PDF export
    if (startDate && endDate) {
      paramCount++;
      const startDateParam = `$${paramCount}`;
      params.push(startDate);
      
      paramCount++;
      const endDateParam = `$${paramCount}`;
      params.push(endDate);
      
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_end_date IS NOT NULL 
         AND rental_start_date <= ${endDateParam} AND rental_end_date >= ${startDateParam})
        OR
        (transaction_type != 'rental' AND date >= ${startDateParam} AND date <= ${endDateParam})
      )`;
    } else if (startDate) {
      paramCount++;
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_end_date IS NOT NULL 
         AND rental_end_date >= $${paramCount})
        OR
        (transaction_type != 'rental' AND date >= $${paramCount})
      )`;
      params.push(startDate);
    } else if (endDate) {
      paramCount++;
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_start_date <= $${paramCount})
        OR
        (transaction_type != 'rental' AND date <= $${paramCount})
      )`;
      params.push(endDate);
    }

    query += ' ORDER BY date DESC, created_at DESC';

    const result = await pool.query(query, params);
    const transactions = applyDerivedFields(result.rows);
    
    res.json({ transactions });
  } catch (error) {
    console.error('Error fetching transactions for PDF:', error);
    res.status(500).json({ error: 'Failed to fetch transactions for PDF' });
  }
});

// POST /api/sales/export/email - Send email with export data
router.post('/export/email', requireSalesRole, async (req, res) => {
  try {
    const { to, subject, format, salesman, transactionType, startDate, endDate } = req.body;

    if (!to || !subject) {
      return res.status(400).json({ error: 'Recipient email and subject are required' });
    }

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

    // Apply same date filtering logic for email export
    if (startDate && endDate) {
      paramCount++;
      const startDateParam = `$${paramCount}`;
      params.push(startDate);
      
      paramCount++;
      const endDateParam = `$${paramCount}`;
      params.push(endDate);
      
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_end_date IS NOT NULL 
         AND rental_start_date <= ${endDateParam} AND rental_end_date >= ${startDateParam})
        OR
        (transaction_type != 'rental' AND date >= ${startDateParam} AND date <= ${endDateParam})
      )`;
    } else if (startDate) {
      paramCount++;
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_end_date IS NOT NULL 
         AND rental_end_date >= $${paramCount})
        OR
        (transaction_type != 'rental' AND date >= $${paramCount})
      )`;
      params.push(startDate);
    } else if (endDate) {
      paramCount++;
      query += ` AND (
        (transaction_type = 'rental' AND rental_start_date IS NOT NULL AND rental_start_date <= $${paramCount})
        OR
        (transaction_type != 'rental' AND date <= $${paramCount})
      )`;
      params.push(endDate);
    }

    query += ' ORDER BY date DESC, created_at DESC';

    const result = await pool.query(query, params);
    const transactions = applyDerivedFields(result.rows);

    let emailBody = '';
    let emailHtml = '';

    if (format === 'csv') {
      // Generate CSV
      const headers = [
        'ID', 'Transaction Type', 'Date', 'Renterra Order #', 'Work Order #',
        'Customer', 'Salesman', 'Machine Make', 'Machine Model', 'Machine Serial',
        'Quantity', 'Sale Price', 'Discount %', 'Commission %', 'Commission Total',
        'Rental Days', 'Rental Total', 'Created At'
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

