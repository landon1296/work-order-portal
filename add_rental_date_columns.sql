-- Add rental_start_date, rental_end_date, and description columns to sales_transactions table
-- Run this migration if the columns don't exist yet

ALTER TABLE sales_transactions 
ADD COLUMN IF NOT EXISTS rental_start_date DATE,
ADD COLUMN IF NOT EXISTS rental_end_date DATE,
ADD COLUMN IF NOT EXISTS description TEXT;

-- Add index for rental date queries
CREATE INDEX IF NOT EXISTS idx_sales_transactions_rental_dates ON sales_transactions(rental_start_date, rental_end_date);

