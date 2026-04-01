import { getAppClient, closeAppPool } from '../src/db/appPool';

async function seedTestData() {
  const client = await getAppClient();

  try {
    await client.query('BEGIN');

    // =====================
    // 第一部分：临过期退货订单测试数据
    // =====================

    // 检查是否已有临过期退货测试数据
    const existingReturnOrders = await client.query(
      "SELECT id FROM expiring_return_orders WHERE return_no LIKE 'RET20260328%'"
    );

    if (existingReturnOrders.rows.length === 0) {
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
        ...pendingConfirmResult.rows.map((r: { id: number }) => r.id),
        ...pendingErpFillResult.rows.map((r: { id: number }) => r.id),
        ...pendingWarehouseResult.rows.map((r: { id: number }) => r.id),
      ];

      for (const orderId of allIds) {
        await client.query(
          `INSERT INTO expiring_return_actions (order_id, action_type, operator_name, comment, action_at)
           VALUES ($1, 'created', '系统同步', '从ERP同步创建', NOW())`,
          [orderId]
        );
      }

      console.log('临过期退货测试数据插入成功！');
    } else {
      console.log('临过期退货测试数据已存在，跳过插入');
    }

    // =====================
    // 第二部分：催收任务测试数据
    // =====================

    // 检查是否已有催收任务测试数据
    const existingCollectionTasks = await client.query(
      "SELECT id FROM ar_collection_tasks WHERE task_no LIKE 'TEST-%'"
    );

    if (existingCollectionTasks.rows.length > 0) {
      console.log('催收任务测试数据已存在，跳过插入');
    } else {
      // 1. 查询逾期状态的应收账款记录，取前3条
      const overdueResult = await client.query(`
        SELECT id, consumer_name, left_amount
        FROM ar_receivables
        WHERE ar_status = 'overdue'
        ORDER BY left_amount DESC
        LIMIT 3
      `);

      if (overdueResult.rows.length === 0) {
        console.log('未找到逾期状态的应收账款记录，跳过催收任务创建');
      } else {
        // 2. 查询 admin 用户ID
        const adminResult = await client.query(`
          SELECT u.id, u.name
          FROM users u
          JOIN user_roles ur ON u.id = ur.user_id
          JOIN roles r ON ur.role_id = r.id
          WHERE r.code = 'admin' AND u.status = 1
          LIMIT 1
        `);

        if (adminResult.rows.length === 0) {
          console.log('未找到 admin 用户，尝试使用第一个活跃用户');
          const fallbackUserResult = await client.query(
            "SELECT id, name FROM users WHERE status = 1 LIMIT 1"
          );
          if (fallbackUserResult.rows.length === 0) {
            throw new Error('未找到任何活跃用户，无法创建催收任务');
          }
          adminResult.rows = fallbackUserResult.rows;
        }

        const collectorId = adminResult.rows[0].id;
        const collectorName = adminResult.rows[0].name;

        // 3. 为逾期记录创建催收任务
        const createdTasks: Array<{ id: number; task_no: string; consumer_name: string }> = [];

        for (const ar of overdueResult.rows) {
          const timestamp = Date.now();
          const taskNo = `TEST-${timestamp}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

          // 计算截止时间：当前时间 + 3天
          const deadlineAt = new Date();
          deadlineAt.setDate(deadlineAt.getDate() + 3);

          const taskResult = await client.query(
            `INSERT INTO ar_collection_tasks
             (ar_id, task_no, collector_id, collector_role, assigned_at, deadline_at, status, created_at, updated_at)
             VALUES ($1, $2, $3, 'marketing', NOW(), $4, 'pending', NOW(), NOW())
             RETURNING id, task_no`,
            [ar.id, taskNo, collectorId, deadlineAt]
          );

          createdTasks.push({
            id: taskResult.rows[0].id,
            task_no: taskResult.rows[0].task_no,
            consumer_name: ar.consumer_name,
          });
        }

        console.log('催收任务测试数据插入成功！');
        console.log(`催收人: ${collectorName} (ID: ${collectorId})`);
        console.log('创建的催收任务:');
        for (const task of createdTasks) {
          console.log(`  - 任务ID: ${task.id}, 任务编号: ${task.task_no}, 客户: ${task.consumer_name}`);
        }
      }
    }

    await client.query('COMMIT');
    console.log('\n所有测试数据处理完成！');
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
