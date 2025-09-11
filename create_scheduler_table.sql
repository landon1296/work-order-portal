-- Create scheduler table for pickup scheduling
CREATE TABLE IF NOT EXISTS scheduler (
    id SERIAL PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    address VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(50) NOT NULL,
    zipcode VARCHAR(20) NOT NULL,
    contact_name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL,
    make VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    serial_number VARCHAR(255) NOT NULL,
    shop VARCHAR(100) NOT NULL,
    pickup_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'Scheduled',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on shop for faster filtering
CREATE INDEX IF NOT EXISTS idx_scheduler_shop ON scheduler(shop);

-- Create index on status for faster filtering
CREATE INDEX IF NOT EXISTS idx_scheduler_status ON scheduler(status);

-- Create index on created_at for faster sorting
CREATE INDEX IF NOT EXISTS idx_scheduler_created_at ON scheduler(created_at);

-- Create index on pickup_date for faster filtering and sorting
CREATE INDEX IF NOT EXISTS idx_scheduler_pickup_date ON scheduler(pickup_date);
