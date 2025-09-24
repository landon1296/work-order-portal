-- Update call_logs table to track completed dates instead of just a boolean
-- First, add the new completed_dates column
ALTER TABLE call_logs 
ADD COLUMN IF NOT EXISTS completed_dates TEXT[] DEFAULT '{}';

-- Add original_date_key to help identify the original call date
ALTER TABLE call_logs 
ADD COLUMN IF NOT EXISTS original_date_key VARCHAR(10);

-- Update existing records to set original_date_key
UPDATE call_logs 
SET original_date_key = TO_CHAR(date, 'YYYY-MM-DD')
WHERE original_date_key IS NULL;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_call_logs_completed_dates ON call_logs USING GIN(completed_dates);
CREATE INDEX IF NOT EXISTS idx_call_logs_original_date ON call_logs(original_date_key);

-- Note: We'll keep the call_completed column for backward compatibility
-- but the new system will use completed_dates array
