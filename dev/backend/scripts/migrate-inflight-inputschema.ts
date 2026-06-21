/**
 * 在途审批单 inputSchema 迁移脚本
 *
 * 背景：系统从"主表单+环节录入"双体系迁移为统一主表单体系后，
 * 旧的环节录入配置（input_schema）仍残留在在途审批单的节点记录中。
 * 本脚本执行两项清理：
 *
 * 1. 清除在途审批单 handle 节点上的 input_schema（新代码已不再使用，但残留可能引发混淆）
 * 2. 将固定资产采购的 form_data.lines 重命名为 purchaseLines（适配字段名变更）
 *
 * 执行方式：
 *   cd dev/backend && npx ts-node scripts/migrate-inflight-inputschema.ts
 */
import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'xly_dashboard',
  user: 'postgres',
  password: 'postgres',
});

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ═══ 步骤1：清除在途审批单 handle 节点的 input_schema ═══
    const clearResult = await client.query(`
      UPDATE oa_approval_nodes
      SET input_schema = NULL
      WHERE id IN (
        SELECT n.id
        FROM oa_approval_nodes n
        JOIN oa_approval_instances i ON n.instance_id = i.id
        JOIN oa_form_types ft ON i.form_type_id = ft.id
        WHERE i.status = 'pending'
          AND n.input_schema IS NOT NULL
          AND ft.code IN ('procurement_order', 'asset_purchase', 'asset_maintenance')
      )
    `);
    console.log(`✅ 步骤1：清除了 ${clearResult.rowCount} 个节点的 input_schema`);

    // ═══ 步骤2：将固定资产采购在途单据的 form_data.lines 重命名为 purchaseLines ═══
    // 原因：asset-purchase 的 formSchema 中 lines 已重命名为 purchaseLines
    const instancesResult = await client.query(`
      SELECT i.id, i.instance_no, i.form_data
      FROM oa_approval_instances i
      JOIN oa_form_types ft ON i.form_type_id = ft.id
      WHERE i.status = 'pending'
        AND ft.code = 'asset_purchase'
    `);

    let renamedCount = 0;
    for (const row of instancesResult.rows) {
      const formData = row.form_data as Record<string, unknown>;
      if (formData.lines && !formData.purchaseLines) {
        formData.purchaseLines = formData.lines;
        delete formData.lines;
        await client.query(
          `UPDATE oa_approval_instances SET form_data = $1 WHERE id = $2`,
          [JSON.stringify(formData), row.id]
        );
        renamedCount++;
        console.log(`  📝 实例 ${row.instance_no} (ID=${row.id}): lines → purchaseLines`);
      }
    }
    console.log(`✅ 步骤2：重命名了 ${renamedCount} 个实例的 lines → purchaseLines`);

    await client.query('COMMIT');
    console.log('\n🎉 迁移完成，所有在途单据已适配新架构');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ 迁移失败，已回滚:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
