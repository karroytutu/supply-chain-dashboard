/**
 * 一次性修复脚本：钉钉流程中心与 OA 系统状态对齐
 *
 * 修复三类异常：
 * - B 类（6 个）：壳 completed 但 OA 仍 pending → 重建壳 + 补建 node 2 待办
 * - C 类（39 个）：OA 已 approved 但钉钉待办仍 pending → 完成待办 + 标记本地映射
 * - A 类补建（6 个）：无壳实例映射 → 创建壳 + 创建 node 1 待办
 *
 * 前置条件：
 * - 123_fix_orphaned_ar_instances.sql 已运行（A 类节点已创建）
 * - 后端服务未运行（避免对账任务冲突）
 *
 * 幂等安全：已有 active 壳映射的实例会被跳过
 *
 * 用法：cd dev/backend && npx ts-node scripts/fix-dingtalk-alignment.ts
 */

import { appQuery } from '../src/db/appPool';
import {
  createProcessInstance,
  createApprovalTodo,
} from '../src/services/oa/oa-process-centre';
import { getFormTypeByCode } from '../src/services/oa/form-types';

async function main() {
  console.log('=== 钉钉流程中心与 OA 系统状态对齐 ===\n');

  const formType = getFormTypeByCode('ar_collection');
  if (!formType) {
    console.error('未找到 ar_collection 表单类型定义，退出');
    process.exit(1);
  }

  // =====================================================
  // B 类：壳 completed/terminated + OA 仍在途 → 重建壳 + 补建待办
  // =====================================================
  console.log('--- B 类：壳过早关闭的在途实例 ---');

  const bInstances = await appQuery<{
    id: number;
    instance_no: string;
    title: string;
    applicant_id: number;
    applicant_name: string;
    current_node_order: number;
    form_data: Record<string, unknown>;
  }>(
    `SELECT i.id, i.instance_no, i.title, i.applicant_id, i.applicant_name,
            i.current_node_order, i.form_data
     FROM oa_process_instance_mapping m
     JOIN oa_approval_instances i ON i.id = m.instance_id
     JOIN oa_form_types ft ON ft.id = i.form_type_id
     WHERE ft.code = 'ar_collection'
       AND m.status IN ('completed', 'terminated')
       AND i.status IN ('pending', 'processing')`
  );

  console.log(`找到 ${bInstances.rows.length} 个 B 类实例`);

  for (const inst of bInstances.rows) {
    try {
      console.log(`  [B] 重建壳实例: ${inst.instance_no} (${inst.title})`);

      await createProcessInstance(
        inst.id,
        'ar_collection',
        '逾期催收',
        inst.applicant_id,
        inst.title,
        formType.formSchema,
        inst.form_data
      );

      // 获取当前 pending 的人工节点
      const pendingNode = await appQuery<{
        assigned_user_ids: number[] | null;
        node_order: number;
      }>(
        `SELECT DISTINCT ON (node_order) assigned_user_ids, node_order
         FROM oa_approval_nodes
         WHERE instance_id = $1
           AND status = 'pending'
           AND node_type IN ('approval', 'handle')
         ORDER BY node_order, round DESC
         LIMIT 1`,
        [inst.id]
      );

      if (pendingNode.rows.length > 0) {
        const node = pendingNode.rows[0];
        const approverIds = node.assigned_user_ids ?? [];
        for (const approverId of approverIds) {
          await createApprovalTodo(
            inst.id,
            inst.instance_no,
            inst.title,
            '逾期催收',
            inst.applicant_name,
            approverId,
            formType.formSchema,
            inst.form_data,
            node.node_order
          );
        }
        console.log(`    → 补建待办: node ${node.node_order}, 审批人 ${approverIds.join(',')}`);
      }
    } catch (err: any) {
      console.error(`    ✗ 失败: ${err?.message}`);
    }
  }

  // =====================================================
  // C 类：OA 已终态但钉钉待办仍 pending → 标记本地映射为 completed
  // =====================================================
  console.log('\n--- C 类：终态实例残留 pending 待办 ---');

  // 注意：壳实例已 completed，钉钉侧的待办可能已自动完成。
  // 这里只需将本地 process_task_mapping 状态对齐为 completed。
  const cResult = await appQuery<{ count: number }>(
    `UPDATE oa_process_task_mapping t
     SET status = 'completed', completed_at = NOW()
     FROM oa_approval_instances i
     JOIN oa_form_types ft ON ft.id = i.form_type_id
     WHERE t.instance_id = i.id
       AND ft.code = 'ar_collection'
       AND i.status NOT IN ('pending', 'processing')
       AND t.status = 'pending'
     RETURNING t.instance_id`
  );

  console.log(`C 类：标记 ${cResult.rowCount ?? 0} 条 pending 待办为 completed`);

  // =====================================================
  // A 类补建：无壳实例映射的在途实例 → 创建壳 + 待办
  // =====================================================
  console.log('\n--- A 类补建：无壳实例映射的在途实例 ---');

  const aInstances = await appQuery<{
    id: number;
    instance_no: string;
    title: string;
    applicant_id: number;
    applicant_name: string;
    form_data: Record<string, unknown>;
  }>(
    `SELECT i.id, i.instance_no, i.title, i.applicant_id, i.applicant_name, i.form_data
     FROM oa_approval_instances i
     JOIN oa_form_types ft ON ft.id = i.form_type_id
     WHERE ft.code = 'ar_collection'
       AND i.status IN ('pending', 'processing')
       AND NOT EXISTS (
         SELECT 1 FROM oa_process_instance_mapping m WHERE m.instance_id = i.id
       )`
  );

  console.log(`找到 ${aInstances.rows.length} 个 A 类无壳实例映射`);

  for (const inst of aInstances.rows) {
    try {
      console.log(`  [A] 创建壳实例: ${inst.instance_no} (${inst.title})`);

      await createProcessInstance(
        inst.id,
        'ar_collection',
        '逾期催收',
        inst.applicant_id,
        inst.title,
        formType.formSchema,
        inst.form_data
      );

      // 获取当前 pending 的人工节点
      const pendingNode = await appQuery<{
        assigned_user_ids: number[] | null;
        node_order: number;
      }>(
        `SELECT DISTINCT ON (node_order) assigned_user_ids, node_order
         FROM oa_approval_nodes
         WHERE instance_id = $1
           AND status = 'pending'
           AND node_type IN ('approval', 'handle')
         ORDER BY node_order, round DESC
         LIMIT 1`,
        [inst.id]
      );

      if (pendingNode.rows.length > 0) {
        const node = pendingNode.rows[0];
        const approverIds = node.assigned_user_ids ?? [];
        for (const approverId of approverIds) {
          await createApprovalTodo(
            inst.id,
            inst.instance_no,
            inst.title,
            '逾期催收',
            inst.applicant_name,
            approverId,
            formType.formSchema,
            inst.form_data,
            node.node_order
          );
        }
        console.log(`    → 创建待办: node ${node.node_order}, 审批人 ${approverIds.join(',')}`);
      }
    } catch (err: any) {
      console.error(`    ✗ 失败: ${err?.message}`);
    }
  }

  console.log('\n=== 完成 ===');
  process.exit(0);
}

main().catch(err => {
  console.error('脚本执行失败:', err);
  process.exit(1);
});
