/**
 * 一次性修复脚本：更新钉钉壳模板URL + 重建催收OA壳实例和待办
 *
 * 背景：开发环境定时任务使用 APP_BASE_URL=http://localhost:3100 创建了钉钉壳实例和待办，
 * 导致催收OA在钉钉端跳转链接错误。
 *
 * 执行内容：
 * Part 1: 更新所有钉钉壳模板的 TASK_EXECUTE URL 为生产域名
 * Part 2: 重建 ar_collection 类型的壳实例和待办
 *
 * 幂等安全：模板更新幂等；已有 active 映射的实例会被跳过
 *
 * 限制说明：Part 2 重建壳实例时，不会取消旧的钉钉待办。
 * 执行后营销师可能在钉钉端同时看到新旧两个催收审批待办，
 * 需在钉钉端手动完成/取消旧待办。
 *
 * 用法：cd dev/backend && APP_BASE_URL=https://xly.gzzxd.com npx ts-node scripts/fix-oa-dingtalk-urls.ts
 */

import { appQuery as query } from '../src/db/appPool';
import {
  saveProcessTemplate,
  ProcessFormComponent,
} from '../src/services/dingtalk-process-centre.service';
import { createProcessInstance } from '../src/services/oa/oa-process-centre';
import { notifyPendingApproval } from '../src/services/oa/oa-notify';
import { getFormTypeByCode } from '../src/services/oa/form-types';

// 硬编码生产域名，不依赖 config（避免脚本在不同环境运行时使用错误值）
const PRODUCTION_BASE_URL = 'https://xly.gzzxd.com';
const DETAIL_URL = `${PRODUCTION_BASE_URL}/oa/detail`;

/** 壳模板固定组件（与 oa-process-centre.ts 中 createAndSaveTemplate 一致） */
const SHELL_FORM_COMPONENTS: ProcessFormComponent[] = [
  {
    componentType: 'TextField',
    props: { componentId: 'TextField-title', label: '标题', required: true, placeholder: '请输入' },
  },
  {
    componentType: 'TextareaField',
    props: { componentId: 'TextareaField-summary', label: '摘要', placeholder: '请输入' },
  },
];

/** 钉钉 API 限流间隔（毫秒） */
const RATE_LIMIT_MS = 200;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =====================================================
// Part 1: 更新所有钉钉壳模板的 TASK_EXECUTE URL
// =====================================================

async function updateAllTemplateUrls(): Promise<void> {
  console.log('\n=== Part 1: 更新钉钉壳模板 TASK_EXECUTE URL ===\n');
  console.log(`目标 detailUrl = ${DETAIL_URL}\n`);

  const { rows: mappings } = await query(
    'SELECT form_type_code, dingtalk_process_code, template_name FROM oa_process_template_mapping ORDER BY id'
  );

  if (mappings.length === 0) {
    console.log('未找到任何壳模板映射记录，跳过');
    return;
  }

  console.log(`找到 ${mappings.length} 条模板记录：`);
  let success = 0;
  let failed = 0;

  for (const row of mappings) {
    const { form_type_code, dingtalk_process_code, template_name } = row;
    console.log(`[UPDATE] ${form_type_code}: "${template_name}"`);

    try {
      await saveProcessTemplate(template_name, SHELL_FORM_COMPONENTS, DETAIL_URL, dingtalk_process_code);
      console.log(`  ✓ TASK_EXECUTE URL 已更新为 ${DETAIL_URL}`);
      success++;
    } catch (err) {
      console.error(`  ✗ 更新失败:`, (err as Error).message);
      failed++;
    }

    await sleep(RATE_LIMIT_MS);
  }

  console.log(`\nPart 1 完成: 成功 ${success}, 失败 ${failed}`);
}

// =====================================================
// Part 2: 重建催收OA的壳实例和待办
// =====================================================

async function rebuildArCollectionInstances(): Promise<void> {
  console.log('\n=== Part 2: 重建催收OA壳实例和待办 ===\n');

  const formType = getFormTypeByCode('ar_collection');
  if (!formType) {
    console.error('未找到 ar_collection 表单类型定义，跳过');
    return;
  }

  // 查询所有 pending/processing 的 ar_collection 实例
  // 包含已有 active 映射的（需要重建）和 failed/无映射的（需要创建）
  const instancesResult = await query<{
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
     ORDER BY oi.id`
  );

  const instances = instancesResult.rows;
  console.log(`找到 ${instances.length} 个需要处理的实例`);

  if (instances.length === 0) {
    console.log('无需处理，跳过');
    return;
  }

  // 先标记所有已有 active 映射为 failed（触发重建）
  const activeIds = instances
    .filter(i => i.mapping_status === 'active')
    .map(i => i.id);

  if (activeIds.length > 0) {
    await query(
      `UPDATE oa_process_instance_mapping SET status = 'failed', updated_at = NOW()
       WHERE instance_id = ANY($1::int[]) AND status = 'active'`,
      [activeIds]
    );
    console.log(`已标记 ${activeIds.length} 个 active 映射为 failed（准备重建）\n`);
  }

  let shellCreated = 0;
  let todoCreated = 0;
  let failed = 0;

  for (const instance of instances) {
    console.log(`\n--- 处理实例 #${instance.id}: ${instance.title} ---`);

    // 创建壳实例
    try {
      await createProcessInstance(
        instance.id,
        'ar_collection',
        formType.name,
        instance.applicant_id,
        instance.title,
        formType.formSchema,
        instance.form_data,
        PRODUCTION_BASE_URL  // 覆盖 config.app.baseUrl，确保使用生产域名
      );
      shellCreated++;
      console.log(`  ✓ 壳实例创建成功`);
    } catch (err: any) {
      failed++;
      console.error(`  ✗ 壳实例创建失败:`, err?.message);
      continue;
    }

    await sleep(RATE_LIMIT_MS);

    // 查询营销师催收节点的 assigned_user_id
    const nodeResult = await query<{
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

    // 创建钉钉待办
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
          baseUrlOverride: PRODUCTION_BASE_URL,  // 覆盖 config.app.baseUrl
        },
        [marketerUserId]
      );
      todoCreated++;
      console.log(`  ✓ 钉钉待办创建成功 (userId=${marketerUserId})`);
    } catch (err: any) {
      failed++;
      console.error(`  ✗ 钉钉待办创建失败:`, err?.message);
    }

    await sleep(RATE_LIMIT_MS);
  }

  console.log(`\nPart 2 完成:`);
  console.log(`  壳实例创建: ${shellCreated} 个`);
  console.log(`  钉钉待办创建: ${todoCreated} 个`);
  console.log(`  失败: ${failed} 个`);
  console.log(`  总计处理: ${instances.length} 个`);
}

// =====================================================
// 入口
// =====================================================

async function main(): Promise<void> {
  console.log('=== 修复催收OA钉钉跳转链接 ===');
  console.log(`生产域名: ${PRODUCTION_BASE_URL}`);
  console.log(`当前 APP_BASE_URL env: ${process.env.APP_BASE_URL || '(未设置)'}`);

  if (process.env.APP_BASE_URL && process.env.APP_BASE_URL !== PRODUCTION_BASE_URL) {
    console.warn(`\n⚠️  警告: APP_BASE_URL (${process.env.APP_BASE_URL}) 与脚本硬编码的生产域名不一致`);
    console.warn('脚本将使用硬编码的生产域名，忽略 APP_BASE_URL 环境变量\n');
  }

  await updateAllTemplateUrls();
  await rebuildArCollectionInstances();

  console.log('\n=== 全部完成 ===');
  process.exit(0);
}

main().catch(err => {
  console.error('脚本执行失败:', err);
  process.exit(1);
});
