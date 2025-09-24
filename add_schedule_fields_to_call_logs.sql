-- Add scheduling fields to call_logs table
ALTER TABLE call_logs 
ADD COLUMN IF NOT EXISTS schedule_frequency VARCHAR(20),
ADD COLUMN IF NOT EXISTS schedule_interval INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS schedule_end_date DATE,
ADD COLUMN IF NOT EXISTS schedule_custom_days INTEGER[];

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_call_logs_schedule ON call_logs(schedule_frequency, schedule_end_date);
