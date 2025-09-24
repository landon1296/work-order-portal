-- Add call_completed field to call_logs table
ALTER TABLE call_logs 
ADD COLUMN IF NOT EXISTS call_completed BOOLEAN DEFAULT FALSE;

-- Add index for better performance when filtering completed calls
CREATE INDEX IF NOT EXISTS idx_call_logs_completed ON call_logs(call_completed);
