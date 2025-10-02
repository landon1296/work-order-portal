// Load environment variables
require('dotenv').config();
const pool = require('./db');

async function cleanupDuplicateLineItems() {
  try {
    console.log('🔍 Starting duplicate line items cleanup...\n');

    // Step 1: Analyze the current state
    console.log('📊 Current state analysis:');
    const analysisQuery = `
      SELECT 
        work_order_no,
        COUNT(*) as total_line_items,
        COUNT(DISTINCT CONCAT(part_number, '|', description)) as unique_parts,
        COUNT(*) - COUNT(DISTINCT CONCAT(part_number, '|', description)) as duplicates
      FROM line_items 
      WHERE part_number IS NOT NULL 
        AND part_number != '' 
        AND (description IS NOT NULL OR description != '')
      GROUP BY work_order_no 
      HAVING COUNT(*) > COUNT(DISTINCT CONCAT(part_number, '|', description))
      ORDER BY duplicates DESC
    `;
    
    const analysisResult = await pool.query(analysisQuery);
    console.log('Work orders with duplicates:');
    analysisResult.rows.forEach(row => {
      console.log(`  Work Order ${row.work_order_no}: ${row.total_line_items} total, ${row.unique_parts} unique, ${row.duplicates} duplicates`);
    });

    // Step 2: Create backup
    console.log('\n💾 Creating backup table...');
    await pool.query('DROP TABLE IF EXISTS line_items_backup');
    await pool.query('CREATE TABLE line_items_backup AS SELECT * FROM line_items');
    console.log('✅ Backup created: line_items_backup');

    // Step 3: Show what will be removed for work order 636 specifically
    const specificQuery = `
      SELECT 
        work_order_no,
        part_number,
        description,
        COUNT(*) as count
      FROM line_items 
      WHERE work_order_no = '636'
        AND part_number IS NOT NULL 
        AND part_number != ''
      GROUP BY work_order_no, part_number, description
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `;
    
    const specificResult = await pool.query(specificQuery);
    if (specificResult.rows.length > 0) {
      console.log('\n🔍 Duplicates in work order 636:');
      specificResult.rows.forEach(row => {
        console.log(`  ${row.part_number} - ${row.description}: ${row.count} copies`);
      });
    }

    // Step 4: Remove duplicates
    console.log('\n🧹 Removing duplicates...');
    const cleanupQuery = `
      DELETE FROM line_items 
      WHERE id NOT IN (
        SELECT DISTINCT ON (work_order_no, part_number, description) id
        FROM line_items
        WHERE part_number IS NOT NULL 
          AND part_number != ''
          AND (description IS NOT NULL OR description != '')
        ORDER BY work_order_no, part_number, description, id
      )
    `;
    
    const deleteResult = await pool.query(cleanupQuery);
    console.log(`✅ Removed ${deleteResult.rowCount} duplicate line items`);

    // Step 5: Verify the cleanup
    console.log('\n📊 Verification after cleanup:');
    const verifyQuery = `
      SELECT 
        work_order_no,
        COUNT(*) as remaining_line_items,
        STRING_AGG(DISTINCT part_number, ', ') as part_numbers
      FROM line_items 
      WHERE work_order_no = '636'
      GROUP BY work_order_no
      ORDER BY work_order_no
    `;
    
    const verifyResult = await pool.query(verifyQuery);
    if (verifyResult.rows.length > 0) {
      console.log('Work order 636 after cleanup:');
      verifyResult.rows.forEach(row => {
        console.log(`  ${row.remaining_line_items} line items remaining:`);
        console.log(`    Parts: ${row.part_numbers}`);
      });
    }

    // Step 6: Final summary
    const finalQuery = `
      SELECT 
        COUNT(*) as total_line_items,
        COUNT(DISTINCT CONCAT(work_order_no, '|', part_number, '|', description)) as unique_parts
      FROM line_items
      WHERE part_number IS NOT NULL 
        AND part_number != ''
    `;
    
    const finalResult = await pool.query(finalQuery);
    console.log('\n🎉 Cleanup complete!');
    console.log(`Total line items remaining: ${finalResult.rows[0].total_line_items}`);
    console.log(`Unique parts: ${finalResult.rows[0].unique_parts}`);

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  }
}

// Run the cleanup
cleanupDuplicateLineItems()
  .then(() => {
    console.log('\n✅ Cleanup completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  });
