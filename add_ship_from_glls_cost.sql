-- Add ship_from_glls_cost column to workorders table
-- This field stores the shipping cost from GLLS

ALTER TABLE workorders 
ADD COLUMN IF NOT EXISTS ship_from_glls_cost NUMERIC(10, 2);

-- Add comment to document the field
COMMENT ON COLUMN workorders.ship_from_glls_cost IS 'Shipping cost from GLLS (outbound shipping)';

