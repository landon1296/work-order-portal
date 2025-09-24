-- Add lead potential (0-3 stars) to call_logs
ALTER TABLE call_logs
ADD COLUMN IF NOT EXISTS lead_potential INTEGER DEFAULT 0 CHECK (lead_potential BETWEEN 0 AND 3);

CREATE INDEX IF NOT EXISTS idx_call_logs_lead_potential ON call_logs(lead_potential);


