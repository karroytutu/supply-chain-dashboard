/**
 * 一次性修复脚本：为已修复处理人的活跃环节补创钉钉待办
 *
 * 背景：insertCollectionNode 创建环节时遗漏了指定处理人，
 * 096 迁移修复了数据库，但钉钉端没有对应的待办。
 *
 * 用法：cd dev/backend && npx ts-node scripts/fix-unassigned-nodes-dingtalk.ts
 */

import { appQuery } from '../src/db/appPool';
import { notifyPendingApproval } from '../src/services/oa/oa-notify';
import { getFormTypeByCode } from '../src/services/oa/form-types';

async function main() {
  console.log('=== 补发钉钉待办：已修复处理人的活跃环节 ===\n');

  // 1. 查询需要补发通知的环节
  const result = await appQuery(
    `SELECT n.id AS node_id, i.id AS instance_id, i.instance_no, i.title,
            i.applicant_name, i.form_data, i.form_type_id,
            n.node_name, n.node_order, n.assigned_user_id, n.assigned_user_name,
            ft.code AS form_code, ft.name AS form_type_name
     FROM oa_approval_nodes n
     JOIN oa_approval_instances i ON i.id = n.instance_id
     JOIN oa_form_types ft ON ft.id = i.form_type_id
     WHERE n.node_type = 'role'
       AND n.status = 'pending'
       AND n.assigned_user_id IS NOT NULL
       AND n.node_order = i.current_node_order
       AND i.status IN ('pending', 'processing')
       AND n.role_code IN ('marketing_manager', 'current_accountant', 'finance_staff')
     ORDER BY i.instance_no`
  );

  console.log(`找到 ${result.rows.length} 个需要补发钉钉待办的环节\n`);

  if (result.rows.length === 0) {
    console.log('无需补发，退出');
    process.exit(0);
  }

  // 2. 逐个补发
  let success = 0;
  let failed = 0;

  for (const row of result.rows) {
    const formSchema = getFormTypeByCode(row.form_code)?.formSchema ?? { fields: [] };

    try {
      await notifyPendingApproval(
        {
          instanceId: row.instance_id,
          instanceNo: row.instance_no,
          title: row.title,
          formTypeName: row.form_type_name,
          applicantName: row.applicant_name,
          nodeName: row.node_name,
          nodeOrder: row.node_order,
          formSchema: formSchema as any,
          formData: row.form_data as Record<string, unknown>,
        },
        [row.assigned_user_id]
      );
      console.log(`✅ ${row.instance_no} | ${row.title} | ${row.node_name} → ${row.assigned_user_name}`);
      success++;
    } catch (error: any) {
      console.error(`❌ ${row.instance_no} | ${row.title} | ${row.node_name} → 失败: ${error.message}`);
      failed++;
    }

    // 限流：避免触发钉钉 API 限流
    if (result.rows.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log(`\n=== 完成：成功 ${success} 个，失败 ${failed} 个 ===`);
  process.exit(0);
}

main().catch(err => {
  console.error('脚本执行失败:', err);
  process.exit(1);
});
