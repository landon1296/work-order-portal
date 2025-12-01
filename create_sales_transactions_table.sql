-- Create sales_transactions table for tracking sales commissions
CREATE TABLE IF NOT EXISTS sales_transactions (
  id SERIAL PRIMARY KEY,
  transaction_type VARCHAR(20) NOT NULL, -- 'new_sale', 'used_sale', 'rental', 'service'
  date DATE NOT NULL,
  renterra_order_number VARCHAR(100),
  work_order_no VARCHAR(50), -- Only for service transactions
  customer VARCHAR(255) NOT NULL,
  salesman_username VARCHAR(100) NOT NULL,
  machine_make VARCHAR(100),
  machine_model VARCHAR(100),
  machine_serial VARCHAR(255),
  quantity INTEGER DEFAULT 1,
  sale_price DECIMAL(10,2),
  discount_percent DECIMAL(5,2), -- Only for new sales
  commission_percent DECIMAL(5,2),
  commission_total DECIMAL(10,2),
  rental_days_total INTEGER, -- Only for rentals
  rental_total DECIMAL(10,2), -- Only for rentals
  rental_start_date DATE, -- Only for rentals
  rental_end_date DATE, -- Only for rentals
  rental_daily_rate DECIMAL(10,2), -- Store rental rate snapshot
  rental_weekly_rate DECIMAL(10,2),
  rental_monthly_rate DECIMAL(10,2),
  description TEXT, -- For "Other" machine descriptions
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sales_transactions_salesman ON sales_transactions(salesman_username);
CREATE INDEX IF NOT EXISTS idx_sales_transactions_date ON sales_transactions(date);
CREATE INDEX IF NOT EXISTS idx_sales_transactions_type ON sales_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_sales_transactions_customer ON sales_transactions(customer);
CREATE INDEX IF NOT EXISTS idx_sales_transactions_rental_dates ON sales_transactions(rental_start_date, rental_end_date);

