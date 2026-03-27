const { Pool } = require('pg');
const p = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'xinshutong',
  user: 'postgres',
  password: 'postgres'
});

async function main() {
  try {
    const res = await p.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = '云仓退货验收明细' 
      ORDER BY ordinal_position
    `);
    console.log('=== 云仓退货验收明细 columns ===');
    console.log('Total:', res.rowCount);
    res.rows.forEach(r => console.log(r.column_name));

    const res2 = await p.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = '商品档案' 
      ORDER BY ordinal_position
    `);
    console.log('\n=== 商品档案 columns ===');
    console.log('Total:', res2.rowCount);
    res2.rows.forEach(r => console.log(r.column_name));

    const res3 = await p.query(`SELECT * FROM "云仓退货验收明细" LIMIT 1`);
    console.log('\n=== Sample row keys ===');
    if (res3.rows.length > 0) {
      console.log(Object.keys(res3.rows[0]));
    }
  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await p.end();
  }
}
main();
