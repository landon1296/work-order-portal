-- Add status column to troubleshoot table
ALTER TABLE troubleshoot ADD COLUMN status text DEFAULT 'Active';

-- Update existing records to have 'Active' status if they don't have one
UPDATE troubleshoot SET status = 'Active' WHERE status IS NULL;
