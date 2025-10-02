-- SAFE CLEANUP SCRIPT - Run step by step to verify before final cleanup
-- This script will show you what will be cleaned up before actually doing it

-- STEP 1: See which work orders have duplicates
SELECT 
    'Work orders with duplicate line items:' as info,
    work_order_no,
    COUNT(*) as total_line_items,
    COUNT(DISTINCT CONCAT(part_number, '|', description)) as unique_parts,
    COUNT(*) - COUNT(DISTINCT CONCAT(part_number, '|', description)) as duplicates_to_remove
FROM line_items 
WHERE part_number IS NOT NULL 
  AND part_number != '' 
  AND (description IS NOT NULL OR description != '')
GROUP BY work_order_no 
HAVING COUNT(*) > COUNT(DISTINCT CONCAT(part_number, '|', description))
ORDER BY duplicates_to_remove DESC;

-- STEP 2: Show specific duplicates for work order 636 (replace with your work order number)
SELECT 
    'Duplicates in work order 636:' as info,
    id,
    work_order_no,
    part_number,
    description,
    quantity,
    waiting,
    ordered_date
FROM line_items 
WHERE work_order_no = '636'  -- Change this to your work order number
  AND part_number IS NOT NULL 
  AND part_number != ''
ORDER BY part_number, description, id;

-- STEP 3: Show what the unique line items would look like after cleanup
SELECT 
    'Unique line items that would remain for work order 636:' as info,
    work_order_no,
    part_number,
    description,
    quantity,
    waiting,
    ordered_date
FROM (
    SELECT DISTINCT ON (work_order_no, part_number, description)
        work_order_no,
        part_number,
        description,
        quantity,
        waiting,
        ordered_date,
        id
    FROM line_items
    WHERE work_order_no = '636'  -- Change this to your work order number
      AND part_number IS NOT NULL 
      AND part_number != ''
    ORDER BY work_order_no, part_number, description, id
) unique_parts
ORDER BY part_number, description;

-- STEP 4: Count total duplicates across all work orders
SELECT 
    'Summary of duplicates to be removed:' as info,
    COUNT(*) as total_line_items,
    COUNT(DISTINCT CONCAT(work_order_no, '|', part_number, '|', description)) as unique_parts,
    COUNT(*) - COUNT(DISTINCT CONCAT(work_order_no, '|', part_number, '|', description)) as total_duplicates
FROM line_items
WHERE part_number IS NOT NULL 
  AND part_number != '' 
  AND (description IS NOT NULL OR description != '');

-- STEP 5: If you're satisfied with the above results, run the actual cleanup:
-- (Uncomment the lines below after reviewing the results above)

/*
-- Create backup table first (optional but recommended)
CREATE TABLE line_items_backup AS SELECT * FROM line_items;

-- Delete duplicates, keeping only the first occurrence of each unique part per work order
DELETE FROM line_items 
WHERE id NOT IN (
    SELECT DISTINCT ON (work_order_no, part_number, description) id
    FROM line_items
    WHERE part_number IS NOT NULL 
      AND part_number != ''
    ORDER BY work_order_no, part_number, description, id
);

-- Verify the cleanup worked
SELECT 
    'After cleanup - remaining line items:' as info,
    work_order_no,
    COUNT(*) as line_items,
    STRING_AGG(DISTINCT part_number, ', ') as part_numbers
FROM line_items 
GROUP BY work_order_no
ORDER BY work_order_no;
*/
