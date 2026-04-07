/**
 * 逾期等级计算服务
 * 负责逾期等级的计算和更新
 */

import { appQuery } from '../../../db/appPool';
import type { OverdueLevel } from '../ar.types';

/**
 * 计算逾期等级
 * 根据逾期天数返回对应的逾期等级
 * @param overdueDays 逾期天数
 * @returns 逾期等级: light(30天内) / medium(31-60天) / severe(60天以上)
 */
export function calculateOverdueLevel(overdueDays: number): OverdueLevel {
  if (overdueDays <= 30) {
    return 'light';
  } else if (overdueDays <= 60) {
    return 'medium';
  } else {
    return 'severe';
  }
}

/**
 * 批量更新逾期等级
 * 扫描 ar_receivables 表，计算每条记录的逾期等级并更新
 * 逾期天数 = CURRENT_DATE - due_date
 */
export async function updateOverdueLevels(): Promise<{ updated: number }> {
  try {
    const sql = `
      UPDATE ar_receivables
      SET overdue_level = CASE
        WHEN due_date IS NULL THEN NULL
        WHEN CURRENT_DATE - due_date::date <= 30 THEN 'light'
        WHEN CURRENT_DATE - due_date::date <= 60 THEN 'medium'
        ELSE 'severe'
      END
      WHERE due_date IS NOT NULL
      RETURNING id
    `;

    const result = await appQuery<{ id: number }>(sql);

    console.log(`[OverdueLevel] 已更新 ${result.rowCount} 条记录的逾期等级`);

    return { updated: result.rowCount || 0 };
  } catch (error) {
    console.error('[OverdueLevel] 更新逾期等级失败:', error);
    throw new Error('更新逾期等级失败');
  }
}

/**
 * 获取客户最严重逾期等级
 * 根据关联的单据ID列表，返回其中最严重的逾期等级
 * @param arIds 应收账款ID列表
 * @returns 最严重的逾期等级，若无逾期则返回 null
 */
export async function getCustomerOverdueLevel(arIds: number[]): Promise<OverdueLevel | null> {
  if (!arIds || arIds.length === 0) {
    return null;
  }

  try {
    const sql = `
      SELECT overdue_level
      FROM ar_receivables
      WHERE id = ANY($1)
        AND due_date IS NOT NULL
        AND due_date < CURRENT_DATE
      ORDER BY
        CASE overdue_level
          WHEN 'severe' THEN 3
          WHEN 'medium' THEN 2
          WHEN 'light' THEN 1
          ELSE 0
        END DESC
      LIMIT 1
    `;

    const result = await appQuery<{ overdue_level: OverdueLevel }>(sql, [arIds]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].overdue_level;
  } catch (error) {
    console.error('[OverdueLevel] 获取客户逾期等级失败:', error);
    throw new Error('获取客户逾期等级失败');
  }
}

/**
 * 批量获取多个客户的逾期等级
 * @param customerArIdsMap 客户名称到应收账款ID列表的映射
 * @returns 客户名称到逾期等级的映射
 */
export async function getBatchCustomerOverdueLevels(
  customerArIdsMap: Map<string, number[]>
): Promise<Map<string, OverdueLevel | null>> {
  const result = new Map<string, OverdueLevel | null>();

  if (customerArIdsMap.size === 0) {
    return result;
  }

  try {
    // 收集所有 ar_id
    const allArIds: number[] = [];
    customerArIdsMap.forEach((arIds) => {
      allArIds.push(...arIds);
    });

    if (allArIds.length === 0) {
      return result;
    }

    // 一次性查询所有逾期记录
    const sql = `
      SELECT id, overdue_level
      FROM ar_receivables
      WHERE id = ANY($1)
        AND due_date IS NOT NULL
        AND due_date < CURRENT_DATE
    `;

    const queryResult = await appQuery<{ id: number; overdue_level: OverdueLevel }>(sql, [allArIds]);

    // 构建 id -> level 映射
    const arLevelMap = new Map<number, OverdueLevel>();
    queryResult.rows.forEach((row) => {
      arLevelMap.set(row.id, row.overdue_level);
    });

    // 为每个客户计算最严重等级
    customerArIdsMap.forEach((arIds, customerName) => {
      let maxLevel: OverdueLevel | null = null;
      let maxWeight = 0;

      arIds.forEach((arId) => {
        const level = arLevelMap.get(arId);
        if (level) {
          const weight = level === 'severe' ? 3 : level === 'medium' ? 2 : 1;
          if (weight > maxWeight) {
            maxWeight = weight;
            maxLevel = level;
          }
        }
      });

      result.set(customerName, maxLevel);
    });

    return result;
  } catch (error) {
    console.error('[OverdueLevel] 批量获取客户逾期等级失败:', error);
    throw new Error('批量获取客户逾期等级失败');
  }
}
