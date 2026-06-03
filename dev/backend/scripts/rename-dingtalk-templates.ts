/**
 * 一次性脚本：重命名钉钉流程中心壳模板前缀
 * 将 "供应链OA-{表单类型名}" 改为 "鑫链云-{表单类型名}"
 *
 * 使用方式：cd dev/backend && npx ts-node scripts/rename-dingtalk-templates.ts
 *
 * 执行内容：
 * 1. 查询 oa_process_template_mapping 所有记录
 * 2. 调用钉钉 saveProcessTemplate（传入已有 processCode）更新模板名称
 * 3. 更新数据库 template_name 字段
 */
import { appQuery as query } from '../src/db/appPool';
import { config } from '../src/config';
import {
  saveProcessTemplate,
  ProcessFormComponent,
} from '../src/services/dingtalk-process-centre.service';
import { DINGTALK_PROCESS_TEMPLATE_PREFIX } from '../src/utils/constants';

const OLD_PREFIX = '供应链OA';

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

async function main() {
  console.log('=== 钉钉壳模板重命名脚本 ===');
  console.log(`旧前缀: "${OLD_PREFIX}"  →  新前缀: "${DINGTALK_PROCESS_TEMPLATE_PREFIX}"`);
  console.log('');

  // 1. 查询所有映射记录
  const { rows: mappings } = await query(
    'SELECT form_type_code, dingtalk_process_code, template_name FROM oa_process_template_mapping ORDER BY id'
  );

  if (mappings.length === 0) {
    console.log('未找到任何壳模板映射记录，无需操作');
    process.exit(0);
  }

  console.log(`找到 ${mappings.length} 条映射记录：`);
  console.log('');

  const detailUrl = `${config.app.baseUrl}/oa/detail`;
  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const row of mappings) {
    const { form_type_code, dingtalk_process_code, template_name } = row;

    // 提取表单类型名（去掉旧前缀）
    let formTypeName: string;
    if (template_name.startsWith(`${OLD_PREFIX}-`)) {
      formTypeName = template_name.slice(`${OLD_PREFIX}-`.length);
    } else {
      // 已经是新前缀或其他格式，跳过
      console.log(`[SKIP] ${form_type_code}: "${template_name}" (非旧前缀，跳过)`);
      skipCount++;
      continue;
    }

    const newName = `${DINGTALK_PROCESS_TEMPLATE_PREFIX}-${formTypeName}`;
    console.log(`[RENAME] ${form_type_code}: "${template_name}" → "${newName}"`);

    try {
      // 2. 调用钉钉API更新模板名称
      await saveProcessTemplate(newName, SHELL_FORM_COMPONENTS, detailUrl, dingtalk_process_code);

      // 3. 更新数据库
      await query(
        'UPDATE oa_process_template_mapping SET template_name = $1 WHERE form_type_code = $2',
        [newName, form_type_code]
      );

      console.log(`  ✓ 重命名成功`);
      successCount++;
    } catch (err) {
      console.error(`  ✗ 重命名失败:`, (err as Error).message);
      failCount++;
    }
  }

  console.log('');
  console.log('=== 执行结果 ===');
  console.log(`成功: ${successCount}  跳过: ${skipCount}  失败: ${failCount}`);

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('脚本执行失败:', err);
  process.exit(1);
});
