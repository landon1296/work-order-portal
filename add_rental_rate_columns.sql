-- Add rental rate columns to persist daily/weekly/monthly rate snapshots
ALTER TABLE sales_transactions
  ADD COLUMN IF NOT EXISTS rental_daily_rate DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS rental_weekly_rate DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS rental_monthly_rate DECIMAL(10,2);


