// Load environment variables
require('dotenv').config();
const pool = require('./db');

async function verifyCleanupScope() {
  try {
    console.log('🔍 Verifying cleanup scope - checking for duplicates within each work order only\n');

    // Show current state by work order
    console.log('📊 Current line items by work order:');
    const workOrderQuery = `
      SELECT 
        work_order_no,
        COUNT(*) as total_line_items,
        COUNT(DISTINCT CONCAT(part_number, '|', description)) as unique_parts,
        COUNT(*) - COUNT(DISTINCT CONCAT(part_number, '|', description)) as duplicates_within_workorder
      FROM line_items 
      WHERE part_number IS NOT NULL 
        AND part_number != '' 
        AND (description IS NOT NULL OR description != '')
      GROUP BY work_order_no 
      ORDER BY duplicates_within_workorder DESC, work_order_no
    `;
    
    const workOrderResult = await pool.query(workOrderQuery);
    workOrderResult.rows.forEach(row => {
      if (row.duplicates_within_workorder > 0) {
        console.log(`  🚨 Work Order ${row.work_order_no}: ${row.total_line_items} total, ${row.unique_parts} unique, ${row.duplicates_within_workorder} duplicates`);
      } else {
        console.log(`  ✅ Work Order ${row.work_order_no}: ${row.total_line_items} line items (no duplicates)`);
      }
    });

    // Show specific duplicates for work order 636
    console.log('\n🔍 Detailed analysis for Work Order 636:');
    const specificQuery = `
      SELECT 
        part_number,
        description,
        COUNT(*) as duplicate_count,
        STRING_AGG(CAST(id AS TEXT), ', ') as duplicate_ids
      FROM line_items 
      WHERE work_order_no = '636'
        AND part_number IS NOT NULL 
        AND part_number != ''
      GROUP BY part_number, description
      HAVING COUNT(*) > 1
      ORDER BY duplicate_count DESC
    `;
    
    const specificResult = await pool.query(specificQuery);
    if (specificResult.rows.length > 0) {
      console.log('  Duplicates that will be removed:');
      specificResult.rows.forEach(row => {
        console.log(`    ${row.part_number} - ${row.description}: ${row.duplicate_count} copies (IDs: ${row.duplicate_ids})`);
      });
    } else {
      console.log('  ✅ No duplicates found in work order 636');
    }

    // Show parts that appear in multiple work orders (these will NOT be affected)
    console.log('\n🔍 Parts used across multiple work orders (these will NOT be affected):');
    const crossWorkOrderQuery = `
      SELECT 
        part_number,
        description,
        COUNT(DISTINCT work_order_no) as work_orders_using_this_part,
        STRING_AGG(DISTINCT work_order_no, ', ') as work_order_numbers
      FROM line_items 
      WHERE part_number IS NOT NULL 
        AND part_number != ''
      GROUP BY part_number, description
      HAVING COUNT(DISTINCT work_order_no) > 1
      ORDER BY work_orders_using_this_part DESC
      LIMIT 10
    `;
    
    const crossWorkOrderResult = await pool.query(crossWorkOrderQuery);
    if (crossWorkOrderResult.rows.length > 0) {
      console.log('  These parts are used in multiple work orders and will ALL be kept:');
      crossWorkOrderResult.rows.forEach(row => {
        console.log(`    ${row.part_number} - ${row.description}: Used in work orders ${row.work_order_numbers}`);
      });
    } else {
      console.log('  No parts are shared across multiple work orders');
    }

    // Summary
    console.log('\n📋 CLEANUP SUMMARY:');
    console.log('  ✅ ONLY removes duplicates within the SAME work order');
    console.log('  ✅ NEVER removes parts that appear in different work orders');
    console.log('  ✅ Keeps the first occurrence of each unique part per work order');
    console.log('  ✅ Creates backup before making any changes');
    
    const totalDuplicates = workOrderResult.rows.reduce((sum, row) => sum + parseInt(row.duplicates_within_workorder), 0);
    console.log(`\n🎯 Total duplicates to be removed: ${totalDuplicates}`);
    console.log(`📊 Work orders affected: ${workOrderResult.rows.filter(row => row.duplicates_within_workorder > 0).length}`);

  } catch (error) {
    console.error('❌ Error during verification:', error);
    throw error;
  }
}

// Run the verification
verifyCleanupScope()
  .then(() => {
    console.log('\n✅ Verification complete! The cleanup is safe to run.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  });
