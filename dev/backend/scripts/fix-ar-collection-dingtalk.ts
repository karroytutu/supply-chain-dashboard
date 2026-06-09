/**
 * 一次性修复脚本：为历史催收OA实例补创钉钉壳实例和待办
 *
 * 背景：ar-collection-creator.ts 定时任务曾用SQL直接创建OA实例，
 * 绕过了 submitApproval()，导致钉钉壳实例和待办未创建。
 *
 * 前置条件：
 * - 088_fix_ar_collection_instances.sql 已运行（修复发起人和营销师分配）
 * - 后端服务未运行（避免冲突）
 *
 * 幂等安全：已有 active 映射的实例会被跳过
 *
 * 用法：cd dev/backend && npx ts-node scripts/fix-ar-collection-dingtalk.ts
 */

import { appQuery } from '../src/db/appPool';
import { createProcessInstance } from '../src/services/oa/oa-process-centre';
import { notifyPendingApproval } from '../src/services/oa/oa-notify';
import { getFormTypeByCode } from '../src/services/oa/form-types';
import { initErpMeta } from '../src/services/fixed-asset/erp-meta-utils';

async function main() {
  console.log('=== 修复催收OA实例钉钉壳实例和待办 ===\n');

  // 1. 获取 ar_collection 表单类型
  const formType = getFormTypeByCode('ar_collection');
  if (!formType) {
    console.error('未找到 ar_collection 表单类型定义，退出');
    process.exit(1);
  }

  // 2. 查询所有 pending/processing 的 ar_collection 实例中，
  //    oa_process_instance_mapping 无记录或 status='failed' 的
  const instancesResult = await appQuery<{
    id: number;
    instance_no: string;
    title: string;
    applicant_id: number;
    applicant_name: string;
    form_data: Record<string, unknown>;
    mapping_status: string | null;
  }>(
    `SELECT oi.id, oi.instance_no, oi.title, oi.applicant_id, oi.applicant_name, oi.form_data,
            m.status as mapping_status
     FROM oa_approval_instances oi
     JOIN oa_form_types ft ON oi.form_type_id = ft.id
     LEFT JOIN oa_process_instance_mapping m ON m.instance_id = oi.id
     WHERE ft.code = 'ar_collection'
       AND oi.status IN ('pending', 'processing')
       AND (m.status IS NULL OR m.status = 'failed')
     ORDER BY oi.id`
  );

  const instances = instancesResult.rows;
  console.log(`找到 ${instances.length} 个需要修复的实例`);

  if (instances.length === 0) {
    console.log('无需修复，退出');
    process.exit(0);
  }

  let shellCreated = 0;
  let todoCreated = 0;
  let failed = 0;

  for (const instance of instances) {
    console.log(`\n--- 处理实例 #${instance.id}: ${instance.title} ---`);

    // 3. 初始化 erp_meta（与主流程 ar-collection-creator.ts step 11a 保持一致）
    try {
      await initErpMeta(instance.id, '');
      console.log(`  ✓ erp_meta 初始化成功`);
    } catch (err: any) {
      console.error(`  ✗ erp_meta 初始化失败:`, err?.message);
      // 不阻断后续壳实例创建
    }

    // 4. 创建壳实例
    try {
      await createProcessInstance(
        instance.id,
        'ar_collection',
        formType.name,
        instance.applicant_id,
        instance.title,
        formType.formSchema,
        instance.form_data
      );
      shellCreated++;
      console.log(`  ✓ 壳实例创建成功`);
    } catch (err: any) {
      failed++;
      console.error(`  ✗ 壳实例创建失败:`, err?.message);
      continue; // 壳实例失败则跳过待办
    }

    // 5. 查询营销师催收节点的 assigned_user_id
    const nodeResult = await appQuery<{
      assigned_user_id: number | null;
    }>(
      `SELECT assigned_user_id FROM oa_approval_nodes
       WHERE instance_id = $1 AND node_name = '营销师催收' AND node_order = 1
       LIMIT 1`,
      [instance.id]
    );

    const marketerUserId = nodeResult.rows[0]?.assigned_user_id ?? null;
    if (!marketerUserId) {
      console.log(`  - 营销师催收节点无 assigned_user_id，跳过待办创建`);
      continue;
    }

    // 6. 创建钉钉待办
    try {
      await notifyPendingApproval(
        {
          instanceId: instance.id,
          instanceNo: instance.instance_no,
          title: instance.title,
          formTypeName: formType.name,
          applicantName: instance.applicant_name,
          nodeName: '营销师催收',
          nodeOrder: 1,
          formSchema: formType.formSchema,
          formData: instance.form_data,
        },
        [marketerUserId]
      );
      todoCreated++;
      console.log(`  ✓ 钉钉待办创建成功 (userId=${marketerUserId})`);
    } catch (err: any) {
      failed++;
      console.error(`  ✗ 钉钉待办创建失败:`, err?.message);
    }

    // 避免钉钉 API 限流
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log(`\n=== 修复完成 ===`);
  console.log(`壳实例创建: ${shellCreated} 个`);
  console.log(`钉钉待办创建: ${todoCreated} 个`);
  console.log(`失败: ${failed} 个`);
  console.log(`总计处理: ${instances.length} 个`);

  process.exit(0);
}

main().catch(err => {
  console.error('脚本执行失败:', err);
  process.exit(1);
});
