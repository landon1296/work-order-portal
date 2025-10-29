-- Performance optimization: Database indexes for frequently queried columns
-- Run this script on your database to improve query performance

-- Index on work_order_no (primary lookup key)
CREATE INDEX IF NOT EXISTS idx_workorders_work_order_no ON workorders(work_order_no);

-- Index on status (very frequently filtered)
CREATE INDEX IF NOT EXISTS idx_workorders_status ON workorders(status);

-- Index on shop (used for filtering)
CREATE INDEX IF NOT EXISTS idx_workorders_shop ON workorders(shop);

-- Index on serial_number (used for searches)
CREATE INDEX IF NOT EXISTS idx_workorders_serial_number ON workorders(LOWER(serial_number));

-- Index on company_name (used for searches)
CREATE INDEX IF NOT EXISTS idx_workorders_company_name ON workorders(LOWER(company_name));

-- Index on created_at (for sorting and date filtering)
CREATE INDEX IF NOT EXISTS idx_workorders_created_at ON workorders(created_at DESC);

-- Index on date (for date-based queries)
CREATE INDEX IF NOT EXISTS idx_workorders_date ON workorders(date);

-- Composite index for common filtering combinations
CREATE INDEX IF NOT EXISTS idx_workorders_shop_status ON workorders(shop, status);

-- Index for line_items lookups by work_order_no
CREATE INDEX IF NOT EXISTS idx_line_items_work_order_no ON line_items(work_order_no);

-- Index for time_entries lookups by work_order_no
CREATE INDEX IF NOT EXISTS idx_time_entries_work_order_no ON time_entries(work_order_no);

-- Index for technician assignment filtering
CREATE INDEX IF NOT EXISTS idx_time_entries_technician ON time_entries(technician_assigned);

-- Composite index for technician + work_order queries
CREATE INDEX IF NOT EXISTS idx_time_entries_tech_wo ON time_entries(technician_assigned, work_order_no);

-- Index for assign_date sorting
CREATE INDEX IF NOT EXISTS idx_time_entries_assign_date ON time_entries(assign_date DESC);

-- Index for searches on make/model
CREATE INDEX IF NOT EXISTS idx_workorders_make_model ON workorders(LOWER(make), LOWER(model));

-- GIN index for full-text search on work_description and notes (if PostgreSQL 12+)
-- Uncomment if you want to enable full-text search
-- CREATE INDEX IF NOT EXISTS idx_workorders_description_gin ON workorders USING gin(to_tsvector('english', COALESCE(work_description, '') || ' ' || COALESCE(notes, '')));

