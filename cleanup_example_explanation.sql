-- EXAMPLE: How the cleanup works with different work orders
-- This shows that the same parts on different work orders are NOT affected

-- Let's say you have this data:
/*
WORK ORDER 636:
- Part A123, "Oil Filter", Qty 2
- Part A123, "Oil Filter", Qty 2  (DUPLICATE - will be removed)
- Part A123, "Oil Filter", Qty 2  (DUPLICATE - will be removed)
- Part B456, "Air Filter", Qty 1

WORK ORDER 637:
- Part A123, "Oil Filter", Qty 1  (DIFFERENT WORK ORDER - will be kept)
- Part B456, "Air Filter", Qty 2  (DIFFERENT WORK ORDER - will be kept)
- Part C789, "Spark Plug", Qty 4

WORK ORDER 638:
- Part A123, "Oil Filter", Qty 3  (DIFFERENT WORK ORDER - will be kept)
- Part B456, "Air Filter", Qty 1  (DIFFERENT WORK ORDER - will be kept)
*/

-- The cleanup logic:
SELECT DISTINCT ON (work_order_no, part_number, description)
    work_order_no,
    part_number,
    description,
    quantity,
    id
FROM line_items
ORDER BY work_order_no, part_number, description, id;

-- RESULT AFTER CLEANUP:
/*
WORK ORDER 636: (removed 2 duplicates)
- Part A123, "Oil Filter", Qty 2  (kept - first occurrence)
- Part B456, "Air Filter", Qty 1  (kept)

WORK ORDER 637: (no duplicates, all kept)
- Part A123, "Oil Filter", Qty 1  (kept - different work order)
- Part B456, "Air Filter", Qty 2  (kept - different work order)
- Part C789, "Spark Plug", Qty 4  (kept)

WORK ORDER 638: (no duplicates, all kept)
- Part A123, "Oil Filter", Qty 3  (kept - different work order)
- Part B456, "Air Filter", Qty 1  (kept - different work order)
*/
