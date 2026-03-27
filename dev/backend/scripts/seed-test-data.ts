import { getAppClient, closeAppPool } from '../src/db/appPool';

async function seedTestData() {
  const client = await getAppClient();
  
  try {
    await client.query('BEGIN');

    // 2条 pending_confirm 状态（用于测试批量确认）
    const pendingConfirmResult = await client.query(`
      INSERT INTO expiring_return_orders 
      (return_no, goods_id, goods_name, quantity, unit, batch_date, return_date, expire_date, shelf_life, days_to_expire, source_bill_no, consumer_name, marketing_manager, status, created_at, updated_at)
      VALUES 
      ('RET20260328101', 'GOODS_A01', '蒙牛纯牛奶250ml', 200, '箱', '2026-02-15', '2026-03-28', '2026-04-15', 60, 18, 'YCTH20260328001', '永辉超市', '张营销', 'pending_confirm', NOW(), NOW()),
      ('RET20260328102', 'GOODS_A02', '伊利酸奶杯装', 150, '箱', '2026-02-20', '2026-03-28', '2026-04-10', 50, 13, 'YCTH20260328002', '华润万家', '李营销', 'pending_confirm', NOW(), NOW())
      RETURNING id
    `);

    // 2条 pending_erp_fill 状态（用于测试ERP填写→仓储执行）
    const pendingErpFillResult = await client.query(`
      INSERT INTO expiring_return_orders 
      (return_no, goods_id, goods_name, quantity, unit, batch_date, return_date, expire_date, shelf_life, days_to_expire, source_bill_no, consumer_name, marketing_manager, status, created_at, updated_at)
      VALUES 
      ('RET20260328103', 'GOODS_B01', '农夫山泉550ml', 500, '箱', '2026-01-10', '2026-03-28', '2026-04-05', 90, 8, 'YCTH20260328003', '大润发', '王营销', 'pending_erp_fill', NOW(), NOW()),
      ('RET20260328104', 'GOODS_B02', '康师傅矿泉水', 300, '箱', '2026-01-15', '2026-03-28', '2026-04-08', 85, 11, 'YCTH20260328004', '沃尔玛', '赵营销', 'pending_erp_fill', NOW(), NOW())
      RETURNING id
    `);

    // 1条 pending_warehouse_execute 状态（用于测试仓储执行）
    const pendingWarehouseResult = await client.query(`
      INSERT INTO expiring_return_orders 
      (return_no, goods_id, goods_name, quantity, unit, batch_date, return_date, expire_date, shelf_life, days_to_expire, source_bill_no, consumer_name, marketing_manager, status, erp_return_no, created_at, updated_at)
      VALUES 
      ('RET20260328105', 'GOODS_C01', '三只松鼠坚果', 100, '袋', '2025-12-01', '2026-03-28', '2026-04-01', 120, 4, 'YCTH20260328005', '天猫超市', '刘营销', 'pending_warehouse_execute', 'CGTH20260328005', NOW(), NOW())
      RETURNING id
    `);

    // 插入初始操作记录到 expiring_return_actions 表
    const allIds = [
      ...pendingConfirmResult.rows.map(r => r.id),
      ...pendingErpFillResult.rows.map(r => r.id),
      ...pendingWarehouseResult.rows.map(r => r.id)
    ];

    for (const orderId of allIds) {
      await client.query(`
        INSERT INTO expiring_return_actions (order_id, action, operator_name, comment, created_at)
        VALUES ($1, 'created', '系统同步', '从ERP同步创建', NOW())
      `, [orderId]);
    }

    await client.query('COMMIT');

    console.log('测试数据插入成功！');
    console.log('pending_confirm 订单:', pendingConfirmResult.rows.map((r: {id: number}) => r.id));
    console.log('pending_erp_fill 订单:', pendingErpFillResult.rows.map((r: {id: number}) => r.id));
    console.log('pending_warehouse_execute 订单:', pendingWarehouseResult.rows.map((r: {id: number}) => r.id));

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('插入测试数据失败:', error);
    throw error;
  } finally {
    client.release();
    await closeAppPool();
  }
}

seedTestData();
