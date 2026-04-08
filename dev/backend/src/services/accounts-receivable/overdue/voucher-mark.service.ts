/**
 * 单据凭证标记服务
 * 用于预处理阶段标记和查询单据的签收单凭证状态
 */
import { appQuery } from '../../../db/appPool';
import type {
  ArBillVoucherMark,
  MarkVoucherStatusParams,
  BatchMarkVoucherStatusParams,
  VoucherStats,
  VoucherStatus,
} from '../ar.types';

/**
 * 标记单个单据的凭证状态
 * 使用 UPSERT 语义，如果已存在则更新
 */
export async function markVoucherStatus(params: MarkVoucherStatusParams): Promise<ArBillVoucherMark> {
  const { customerTaskId, arId, voucherStatus, operatorId, remark } = params;

  // 验证任务存在且 ar_id 属于该任务
  const taskCheck = await appQuery(
    'SELECT ar_ids FROM ar_customer_collection_tasks WHERE id = $1',
    [customerTaskId]
  );

  if (taskCheck.rows.length === 0) {
    throw new Error('任务不存在');
  }

  const arIds: number[] = taskCheck.rows[0].ar_ids;
  if (!arIds.includes(arId)) {
    throw new Error('单据不属于该任务');
  }

  // UPSERT: 插入或更新凭证标记
  const result = await appQuery(
    `INSERT INTO ar_bill_voucher_marks 
     (customer_task_id, ar_id, voucher_status, voucher_marked_by, voucher_remark, voucher_marked_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (customer_task_id, ar_id)
     DO UPDATE SET
       voucher_status = EXCLUDED.voucher_status,
       voucher_marked_by = EXCLUDED.voucher_marked_by,
       voucher_remark = EXCLUDED.voucher_remark,
       voucher_marked_at = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [customerTaskId, arId, voucherStatus, operatorId, remark || null]
  );

  return result.rows[0];
}

/**
 * 批量标记多个单据的凭证状态
 * 在事务中执行，保证原子性
 */
export async function batchMarkVoucherStatus(
  params: BatchMarkVoucherStatusParams
): Promise<{ success: number; failed: number }> {
  const { customerTaskId, marks, operatorId } = params;

  // 验证任务存在
  const taskCheck = await appQuery(
    'SELECT ar_ids FROM ar_customer_collection_tasks WHERE id = $1',
    [customerTaskId]
  );

  if (taskCheck.rows.length === 0) {
    throw new Error('任务不存在');
  }

  const arIds: number[] = taskCheck.rows[0].ar_ids;
  let success = 0;
  let failed = 0;

  // 在事务中批量更新
  await appQuery('BEGIN');
  try {
    for (const mark of marks) {
      if (!arIds.includes(mark.arId)) {
        failed++;
        continue;
      }

      await appQuery(
        `INSERT INTO ar_bill_voucher_marks 
         (customer_task_id, ar_id, voucher_status, voucher_marked_by, voucher_remark, voucher_marked_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (customer_task_id, ar_id)
         DO UPDATE SET
           voucher_status = EXCLUDED.voucher_status,
           voucher_marked_by = EXCLUDED.voucher_marked_by,
           voucher_remark = EXCLUDED.voucher_remark,
           voucher_marked_at = NOW(),
           updated_at = NOW()`,
        [customerTaskId, mark.arId, mark.voucherStatus, operatorId, mark.remark || null]
      );
      success++;
    }

    await appQuery('COMMIT');
  } catch (error) {
    await appQuery('ROLLBACK');
    throw error;
  }

  return { success, failed };
}

/**
 * 获取任务的凭证统计数据
 */
export async function getVoucherStats(
  customerTaskId: number,
  totalBills: number
): Promise<VoucherStats> {
  const result = await appQuery(
    `SELECT voucher_status, COUNT(*) as count
     FROM ar_bill_voucher_marks
     WHERE customer_task_id = $1
     GROUP BY voucher_status`,
    [customerTaskId]
  );

  const stats: VoucherStats = {
    hasVoucher: 0,
    noVoucher: 0,
    voucherUnqualified: 0,
    unmarked: totalBills,
    total: totalBills,
  };

  for (const row of result.rows) {
    switch (row.voucher_status) {
      case 'has_voucher':
        stats.hasVoucher = parseInt(row.count);
        break;
      case 'no_voucher':
        stats.noVoucher = parseInt(row.count);
        break;
      case 'voucher_unqualified':
        stats.voucherUnqualified = parseInt(row.count);
        break;
    }
  }

  stats.unmarked = totalBills - stats.hasVoucher - stats.noVoucher - stats.voucherUnqualified;

  return stats;
}

/**
 * 批量获取任务中所有单据的凭证标记
 * 返回 Map<ar_id, ArBillVoucherMark> 便于快速查找
 */
export async function getBillVoucherMarks(
  customerTaskId: number,
  arIds: number[]
): Promise<Map<number, ArBillVoucherMark>> {
  if (arIds.length === 0) {
    return new Map();
  }

  const result = await appQuery(
    `SELECT * FROM ar_bill_voucher_marks
     WHERE customer_task_id = $1 AND ar_id = ANY($2::int[])`,
    [customerTaskId, arIds]
  );

  const marksMap = new Map<number, ArBillVoucherMark>();
  for (const row of result.rows) {
    marksMap.set(row.ar_id, row);
  }

  return marksMap;
}
