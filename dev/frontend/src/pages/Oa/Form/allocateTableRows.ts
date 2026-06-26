/**
 * 表格一键分摊算法（纯函数，不涉及后端 API）
 *
 * 业务场景：物流/装卸费用申请中，用户已知一批货物的总费用（如物流发票 500 元），
 * 需要将这笔费用按比例分摊到每个商品行。
 *
 * 算法原理——比例分摊 + 倒挤法：
 * 1. 按选定方式（按金额 / 按数量）计算每行的权重占比
 * 2. 前 N-1 行：分摊金额 = round(总金额 × 该行权重 ÷ 总权重, 2)
 * 3. 最后一行（倒挤）：分摊金额 = 总金额 − 前 N-1 行之和
 *    → 保证分摊合计严格等于原始总金额，不会出现 99.99 或 100.01 的情况
 *
 * 内部运算使用「分」（cents）为单位的整数，与 computeFeeTotals.ts 保持一致，避免浮点精度偏差。
 */

import type { AllocateConfig } from '@/types/oa';

/** 分摊方式 */
export type AllocateMethod = 'by_amount' | 'by_quantity';

/** 分摊结果 */
export interface AllocateResult {
  /** 分摊后的行数据（已写入 targetField 和 derivedFields） */
  rows: Record<string, unknown>[];
  /** 错误信息（如总权重为 0 时返回），为 null 表示分摊成功 */
  error: string | null;
}

/**
 * 执行按比例分摊
 *
 * @param rows         当前表格行数据
 * @param totalAmount  待分摊总金额（元，必须 > 0）
 * @param method       分摊方式（by_amount=按金额占比，by_quantity=按数量占比）
 * @param config       分摊配置（来自 FormField.allocate）
 * @returns            分摊后的行数据 + 错误信息
 *
 * 举例（按金额分摊）：
 * - 总金额 100 元，3 行结算金额分别为 300、500、200（合计 1000）
 * - 分摊结果：第 1 行 30.00，第 2 行 50.00，第 3 行（倒挤）20.00
 * - 费用单价自动反算：feeUnitPrice = feeAmount ÷ quantity（保留 2 位小数）
 */
export function allocateTableRows(
  rows: Record<string, unknown>[],
  totalAmount: number,
  method: AllocateMethod,
  config: AllocateConfig,
): AllocateResult {
  if (!rows || rows.length === 0) {
    return { rows: [], error: '表格无数据，无法分摊' };
  }

  if (totalAmount <= 0 || isNaN(totalAmount)) {
    return { rows, error: '请输入有效的分摊总金额（大于 0）' };
  }

  // 确定权重字段：按金额 → settleAmount，按数量 → quantity
  const weightField =
    method === 'by_amount'
      ? config.amountWeightField
      : config.quantityWeightField;

  if (!weightField) {
    return { rows, error: `分摊方式「${method}」未配置权重字段` };
  }

  // 提取每行权重（保留原始索引，用于写入时对应）
  const weights = rows.map((row) => parseFloat(String(row[weightField] || 0)));
  const totalWeight = weights.reduce((sum, w) => sum + (w > 0 ? w : 0), 0);

  if (totalWeight <= 0) {
    return {
      rows,
      error: `权重字段（${weightField}）之和为 0，无法分摊`,
    };
  }

  // 以「分」为单位进行整数运算，避免浮点精度偏差
  const totalCents = Math.round(totalAmount * 100);
  const targetField = config.targetField;
  const derivedFields = config.derivedFields || [];

  // 构建新行数组，逐行分摊
  let allocatedCentsSoFar = 0;
  const newRows = rows.map((row, idx) => {
    const weight = weights[idx];
    const newRow = { ...row };

    if (weight <= 0) {
      // 权重为 0 的行不参与分摊，目标字段保持 null
      newRow[targetField] = null;
      for (const df of derivedFields) {
        newRow[df.target] = null;
      }
      return newRow;
    }

    const isLastParticipatingRow =
      idx === rows.length - 1 ||
      weights.slice(idx + 1).every((w) => w <= 0);

    let allocatedCents: number;
    if (isLastParticipatingRow) {
      // 最后一个有权重的行：倒挤吸收舍入误差
      allocatedCents = totalCents - allocatedCentsSoFar;
    } else {
      // 前 N-1 行：按比例四舍五入（以分为单位）
      const ratio = weight / totalWeight;
      allocatedCents = Math.round(totalCents * ratio);
      allocatedCentsSoFar += allocatedCents;
    }

    // 将分摊金额写入目标字段（转为元）
    const allocatedYuan = +(allocatedCents / 100).toFixed(2);
    newRow[targetField] = allocatedYuan;

    // 反算派生字段（如 feeUnitPrice = feeAmount ÷ quantity）
    for (const df of derivedFields) {
      const divisorValue = parseFloat(String(row[df.divisor] || 0));
      if (divisorValue > 0 && allocatedYuan > 0) {
        newRow[df.target] = +(allocatedYuan / divisorValue).toFixed(df.precision);
      } else {
        newRow[df.target] = null;
      }
    }

    // 标记为分摊产生的行，让 computeFeeTotals 保留精确的 feeAmount、反算 feeUnitPrice
    // 避免「单价 × 数量」重算时因单价四舍五入导致总额偏差（如 10000 → 10000.04）
    newRow._allocated = true;

    return newRow;
  });

  return { rows: newRows, error: null };
}
