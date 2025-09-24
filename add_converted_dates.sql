-- Track per-date conversions for call logs
ALTER TABLE call_logs
ADD COLUMN IF NOT EXISTS converted_dates TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_call_logs_converted_dates ON call_logs USING GIN(converted_dates);


