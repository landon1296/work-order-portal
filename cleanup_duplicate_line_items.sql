-- Cleanup script to remove duplicate line items from the database
-- This will keep only one instance of each unique part per work order

-- First, let's see what we're working with
SELECT 
    work_order_no,
    COUNT(*) as total_line_items,
    COUNT(DISTINCT CONCAT(part_number, '|', description)) as unique_parts
FROM line_items 
GROUP BY work_order_no 
HAVING COUNT(*) > COUNT(DISTINCT CONCAT(part_number, '|', description))
ORDER BY total_line_items DESC;

-- Create a temporary table with the unique line items we want to keep
CREATE TEMP TABLE unique_line_items AS
SELECT DISTINCT ON (work_order_no, part_number, description)
    id,
    work_order_no,
    part_number,
    description,
    quantity,
    waiting,
    waiting_from,
    waiting_to,
    waiting_days,
    ordered_date,
    estimated_delivery_date
FROM line_items
WHERE part_number IS NOT NULL 
  AND part_number != '' 
  AND (description IS NOT NULL OR description != '')
ORDER BY work_order_no, part_number, description, id;

-- Show the cleanup results
SELECT 
    'BEFORE CLEANUP' as status,
    work_order_no,
    COUNT(*) as line_items
FROM line_items 
GROUP BY work_order_no
UNION ALL
SELECT 
    'AFTER CLEANUP' as status,
    work_order_no,
    COUNT(*) as line_items
FROM unique_line_items
GROUP BY work_order_no
ORDER BY work_order_no, status;

-- Delete all line items
DELETE FROM line_items;

-- Re-insert only the unique line items
INSERT INTO line_items (
    work_order_no,
    part_number,
    description,
    quantity,
    waiting,
    waiting_from,
    waiting_to,
    waiting_days,
    ordered_date,
    estimated_delivery_date
)
SELECT 
    work_order_no,
    part_number,
    description,
    quantity,
    waiting,
    waiting_from,
    waiting_to,
    waiting_days,
    ordered_date,
    estimated_delivery_date
FROM unique_line_items;

-- Verify the cleanup
SELECT 
    work_order_no,
    COUNT(*) as remaining_line_items,
    STRING_AGG(DISTINCT part_number, ', ') as part_numbers
FROM line_items 
GROUP BY work_order_no
ORDER BY work_order_no;

-- Drop the temporary table
DROP TABLE unique_line_items;
