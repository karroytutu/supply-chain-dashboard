/**
 * 一次性修复脚本：为 14 个待办缺失/错误的实例创建正确的钉钉待办
 *
 * 背景：
 *   fix-oa-dingtalk-urls.ts 只给"营销师催收"(node 1) 创建待办，
 *   但 14 个实例的当前 pending 节点不是 node 1。
 *   此外 5 个或签节点因旧模型遗留问题只给第一个用户创建了待办。
 *
 * 执行内容：
 *   1. 查询 14 个实例的当前 pending 节点信息
 *   2. 取消每个实例现有的 pending 待办（如果有）
 *   3. 为实际 pending 节点的所有 assigned_user_ids 创建新待办
 *
 * 幂等安全：取消旧待办幂等；创建新待办前先检查是否已有 pending 待办
 *
 * 用法：cd dev/backend && npx ts-node scripts/fix-oa-pending-todos.ts
 */

import { appQuery as query } from '../src/db/appPool';
import { cancelPcTasks } from '../src/services/dingtalk-process-centre.service';
import { notifyPendingApproval } from '../src/services/oa/oa-notify';
import { getFormTypeByCode } from '../src/services/oa/form-types';

const PRODUCTION_BASE_URL = 'https://xly.gzzxd.com';
const RATE_LIMIT_MS = 200;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface InstanceInfo {
  id: number;
  instance_no: string;
  title: string;
  applicant_id: number;
  applicant_name: string;
  form_data: Record<string, unknown>;
  node_order: number;
  node_name: string;
  assigned_user_ids: number[];
  process_instance_id: string;
}

async function getInstancesToFix(): Promise<InstanceInfo[]> {
  // 查询当前 pending 节点不是"营销师催收"(node 1) 的 ar_collection 实例
  const result = await query<InstanceInfo>(
    `SELECT i.id, i.instance_no, i.title, i.applicant_id, i.applicant_name, i.form_data,
            n.node_order, n.node_name, n.assigned_user_ids,
            m.dingtalk_process_instance_id as process_instance_id
     FROM oa_approval_instances i
     JOIN oa_form_types ft ON i.form_type_id = ft.id
     JOIN oa_approval_nodes n ON n.instance_id = i.id
     LEFT JOIN oa_process_instance_mapping m ON m.instance_id = i.id AND m.status = 'active'
     WHERE ft.code = 'ar_collection'
       AND i.status IN ('pending', 'processing')
       AND n.status = 'pending'
       AND n.node_type IN ('approval', 'handle')
       AND NOT (n.node_name = '营销师催收' AND n.node_order = 1)
     ORDER BY i.id`
  );
  return result.rows;
}

async function cancelExistingTodos(instance: InstanceInfo): Promise<void> {
  const taskResult = await query<{ activity_id: string }>(
    `SELECT DISTINCT activity_id FROM oa_process_task_mapping
     WHERE instance_id = $1 AND status = 'pending' AND activity_id != ''`,
    [instance.id]
  );

  for (const { activity_id } of taskResult.rows) {
    try {
      await cancelPcTasks(instance.process_instance_id, activity_id);
      console.log(`  ✓ 旧待办已取消 (activityId=${activity_id})`);
    } catch (err: any) {
      console.warn(`  ⚠ 旧待办取消失败 (activityId=${activity_id}): ${err?.message}`);
    }
    await sleep(RATE_LIMIT_MS);
  }

  if (taskResult.rows.length > 0) {
    await query(
      `UPDATE oa_process_task_mapping SET status = 'cancelled', completed_at = NOW()
       WHERE instance_id = $1 AND status = 'pending'`,
      [instance.id]
    );
  }
}

async function createCorrectTodos(instance: InstanceInfo): Promise<void> {
  const formType = getFormTypeByCode('ar_collection');
  if (!formType) {
    console.error('  ✗ 未找到 ar_collection 表单类型定义');
    return;
  }

  const approverIds = instance.assigned_user_ids;
  if (!approverIds || approverIds.length === 0) {
    console.log(`  - 无 assigned_user_ids，跳过待办创建`);
    return;
  }

  console.log(`  为 ${approverIds.length} 个审批人创建待办: [${approverIds.join(', ')}]`);

  await notifyPendingApproval(
    {
      instanceId: instance.id,
      instanceNo: instance.instance_no,
      title: instance.title,
      formTypeName: formType.name,
      applicantName: instance.applicant_name,
      nodeName: instance.node_name,
      nodeOrder: instance.node_order,
      formSchema: formType.formSchema,
      formData: instance.form_data,
      baseUrlOverride: PRODUCTION_BASE_URL,
    },
    approverIds
  );
}

async function main(): Promise<void> {
  console.log('=== 修复待办缺失/错误的实例 ===\n');

  const instances = await getInstancesToFix();
  console.log(`找到 ${instances.length} 个需要修复的实例\n`);

  if (instances.length === 0) {
    console.log('无需处理');
    process.exit(0);
  }

  let success = 0;
  let failed = 0;

  for (const instance of instances) {
    console.log(`\n--- 实例 #${instance.id}: ${instance.title} ---`);
    console.log(`  pending 节点: ${instance.node_name} (node ${instance.node_order}), 审批人: [${instance.assigned_user_ids.join(', ')}]`);

    if (!instance.process_instance_id) {
      console.log(`  ⚠ 无活跃壳实例，跳过`);
      failed++;
      continue;
    }

    try {
      // 步骤 1: 取消旧待办
      await cancelExistingTodos(instance);

      // 步骤 2: 创建正确的新待办
      await createCorrectTodos(instance);
      console.log(`  ✓ 新待办创建成功`);
      success++;
    } catch (err: any) {
      console.error(`  ✗ 修复失败:`, err?.message);
      failed++;
    }

    await sleep(RATE_LIMIT_MS);
  }

  console.log(`\n=== 完成 ===`);
  console.log(`  成功: ${success}`);
  console.log(`  失败: ${failed}`);
  console.log(`  总计: ${instances.length}`);
  process.exit(0);
}

main().catch(err => {
  console.error('脚本执行失败:', err);
  process.exit(1);
});
