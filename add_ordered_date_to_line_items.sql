-- Add ordered_date column to line_items table
ALTER TABLE line_items
ADD COLUMN IF NOT EXISTS ordered_date TIMESTAMP;

-- Add estimated_delivery_date column to line_items table
ALTER TABLE line_items
ADD COLUMN IF NOT EXISTS estimated_delivery_date DATE;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_line_items_ordered_date ON line_items(ordered_date);
CREATE INDEX IF NOT EXISTS idx_line_items_estimated_delivery_date ON line_items(estimated_delivery_date);
