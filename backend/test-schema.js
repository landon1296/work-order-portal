const pool = require('./db');

async function testSchema() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'scheduler' 
      ORDER BY ordinal_position
    `);
    
    console.log('Table columns:');
    result.rows.forEach(row => {
      console.log(`${row.column_name}: ${row.data_type} (${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'})`);
    });
    
    process.exit(0);
  } catch (err) {
    console.log('Error:', err.message);
    process.exit(1);
  }
}

testSchema();
