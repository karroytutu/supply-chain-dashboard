/**
 * 一次性标注脚本：为6月6日催收OA上线首批创建的历史催收实例添加评论标注
 *
 * 背景：催收OA流程于2026-06-06首次上线运行，批量创建了一批历史催收实例。
 * 这些实例与后续日常自动触发的催收在审批详情页上无法区分。
 * 本脚本为这些历史实例在"发起申请"节点下方添加评论标注。
 *
 * 评论关联到 node_order=NULL（即"发起申请"起始节点），
 * 前端 ApprovalFlowActual.tsx 已支持渲染 nodeOrder 为 null 的评论。
 *
 * 运行（默认 dry-run）:  cd dev/backend && npx ts-node scripts/tag-historical-collection.ts
 * 执行实际写入:          cd dev/backend && DRY_RUN=false npx ts-node scripts/tag-historical-collection.ts
 */

import { appQuery, getAppClient, closeAppPool } from '../src/db/appPool';

// =====================================================
// 配置常量
// =====================================================

/** 历史催收实例的创建日期范围（北京时间） */
const TARGET_DATE_START = '2026-06-06 00:00:00';
const TARGET_DATE_END = '2026-06-07 00:00:00';

/** 要插入的评论内容 */
const COMMENT_TEXT =
  '【历史催收】此实例为催收OA流程首次上线（6月6日）时批量创建的历史催收，非当日新触发。';

/** dry-run 模式：默认 true，设为 false 才实际写入 */
const DRY_RUN = process.env.DRY_RUN !== 'false';

// =====================================================
// 辅助函数
// =====================================================

/**
 * 获取系统用户（与 ar-collection-creator.ts 中 getSystemUser 逻辑一致）
 */
async function getSystemUser(): Promise<{ id: number; name: string } | null> {
  const result = await appQuery<{ id: number; name: string }>(
    `SELECT u.id, u.name
     FROM users u
     WHERE u.status = 1
     ORDER BY CASE WHEN u.name = '系统' THEN 0 ELSE 1 END, u.id
     LIMIT 1`
  );
  if (result.rows.length === 0) return null;
  return { id: result.rows[0].id, name: result.rows[0].name };
}

/**
 * 查询6月6日创建的催收OA实例
 */
async function queryHistoricalInstances() {
  const result = await appQuery<{
    id: number;
    title: string;
    created_at: Date;
  }>(
    `SELECT i.id, i.title, i.created_at
     FROM oa_approval_instances i
     JOIN oa_form_types ft ON i.form_type_id = ft.id
     WHERE ft.code = 'ar_collection'
       AND i.created_at >= $1
       AND i.created_at < $2
     ORDER BY i.id`,
    [TARGET_DATE_START, TARGET_DATE_END]
  );
  return result.rows;
}

/**
 * 批量插入评论（事务包裹，幂等设计）
 */
async function insertComments(
  instanceIds: number[],
  systemUser: { id: number; name: string }
): Promise<number> {
  if (instanceIds.length === 0) return 0;

  const client = await getAppClient();
  let insertedCount = 0;

  try {
    await client.query('BEGIN');

    for (const instanceId of instanceIds) {
      // 幂等：同一 instance 已有【历史催收】评论则跳过
      const existing = await client.query(
        `SELECT 1 FROM oa_approval_actions
         WHERE instance_id = $1
           AND action_type = 'comment'
           AND comment LIKE $2
         LIMIT 1`,
        [instanceId, '【历史催收】%']
      );
      if (existing.rows.length > 0) continue;

      // 插入评论，action_at 取实例创建时间 + 1秒（排在 submit 动作之后）
      await client.query(
        `INSERT INTO oa_approval_actions
          (instance_id, action_type, operator_id, operator_name, node_order, comment, action_at)
         SELECT $1, 'comment', $2, $3, NULL, $4,
                i.created_at + interval '1 second'
         FROM oa_approval_instances i
         WHERE i.id = $1`,
        [instanceId, systemUser.id, systemUser.name, COMMENT_TEXT]
      );
      insertedCount++;
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return insertedCount;
}

// =====================================================
// 主流程
// =====================================================

async function main() {
  const startTime = new Date();
  console.log('========== 历史催收实例评论标注脚本 ==========');
  console.log(`时间: ${startTime.toISOString()}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV || '(未设置)'}`);
  console.log(`模式: ${DRY_RUN ? 'DRY-RUN（不实际写入）' : 'EXECUTE（实际写入）'}`);
  console.log('');

  try {
    // 1. 获取系统用户
    const systemUser = await getSystemUser();
    if (!systemUser) {
      console.error('错误：未找到系统用户，请确认 users 表中存在 status=1 的用户');
      process.exit(1);
    }
    console.log(`系统用户: id=${systemUser.id}, name=${systemUser.name}`);

    // 2. 查询目标实例
    const instances = await queryHistoricalInstances();
    console.log(
      `\n查询到 ${instances.length} 个催收OA实例（创建于 ${TARGET_DATE_START.slice(0, 10)}）`
    );

    if (instances.length === 0) {
      console.log('无目标实例，脚本结束');
      return;
    }

    // 打印实例列表
    instances.forEach((inst) => {
      console.log(`  [${inst.id}] ${inst.title}  (${inst.created_at})`);
    });

    // 3. dry-run 模式：仅统计不写入
    if (DRY_RUN) {
      console.log(
        `\n[DRY-RUN] 将为以上 ${instances.length} 个实例插入评论（实际未写入）`
      );
      console.log('如需实际执行，请设置环境变量 DRY_RUN=false 重新运行');
      return;
    }

    // 4. 执行写入
    console.log(`\n开始插入评论...`);
    const instanceIds = instances.map((i) => i.id);
    const insertedCount = await insertComments(instanceIds, systemUser);
    console.log(`\n完成！成功标注 ${insertedCount} 个实例`);
    console.log(`跳过（已有标注）: ${instances.length - insertedCount} 个`);
  } catch (error) {
    console.error('脚本执行失败:', error);
    process.exit(1);
  } finally {
    await closeAppPool();
  }

  process.exit(0);
}

main();
