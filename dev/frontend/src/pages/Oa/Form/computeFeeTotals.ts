/**
 * 费用金额计算工具
 * feeUnitPrice × quantity = feeAmount，汇总 feeTotalAmount
 * 使用整数（分）累加避免浮点精度偏差
 */

export interface FeeLine {
  feeUnitPrice?: unknown;
  quantity?: unknown;
  feeAmount?: unknown;
  [key: string]: unknown;
}

export interface FeeTotalsResult {
  total: number;
  updatedLines: FeeLine[];
}

/**
 * 计算费用明细行的金额和合计
 * - 单价 × 数量 = 金额（使用整数分运算，避免浮点偏差）
 * - 单价为空/0 时，金额清零（不保留旧值）
 */
export function computeFeeTotals(feeLines: FeeLine[] | undefined): FeeTotalsResult {
  if (!feeLines || feeLines.length === 0) return { total: 0, updatedLines: [] };

  let totalCents = 0;
  const updatedLines = feeLines.map(line => {
    const unitPrice = parseFloat(String(line.feeUnitPrice || 0));
    const quantity = parseFloat(String(line.quantity || 0));
    let feeAmount: number | null = null;

    if (unitPrice > 0 && quantity > 0) {
      const cents = Math.round(unitPrice * 100) * quantity;
      feeAmount = +(cents / 100).toFixed(2);
      totalCents += cents;
    }
    // 单价清空或为0时 feeAmount = null，不保留旧值
    return { ...line, feeAmount };
  });

  return { total: +(totalCents / 100).toFixed(2), updatedLines };
}
