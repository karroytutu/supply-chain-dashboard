/**
 * ERP 清理 API — 费用单/收入单反审与取消
 * 用于测试数据清理：先反审再取消，顺序不可颠倒
 * @module services/erp-client/erp-cleanup
 */

import { erpPost } from './erp-client';
import { getErpConfig, getErpDefaults } from './erp-config';
import {
  deApproveCustomerReceipt,
  cancelCustomerReceipt,
} from './erp-customer-receipt.service';
import { createLogger } from '../../utils/logger';

const log = createLogger('ErpCleanup');

/**
 * 费用单清理：可选撤销交单 + 反审 + 取消
 * @param billId ERP 返回的费用单 ID
 * @param revokeFirst 是否在反审前先撤销交单（默认 false，当费用单已交单时传 true）
 */
export async function cleanupExpenditureBill(billId: number, revokeFirst = false): Promise<void> {
  const config = getErpConfig();
  const { cid, uid } = getErpDefaults();
  const time = Date.now();

  // 步骤0（可选）：撤销交单
  if (revokeFirst) {
    await revokeBillSubmission([{ billId, billType: 'CONSUMER_EXPENDITURE' }]);
  }

  // 步骤1：反审
  await erpPost(
    config.expenditureBillReApprovePath,
    { id: billId, cid, uid, time },
    {
      pathPrefix: '/saas/pro/',
      businessType: 'cleanup_expenditure_reapprove',
    }
  );

  // 步骤2：取消
  await erpPost(
    config.expenditureBillCancelPath,
    { id: billId, cid, uid },
    {
      pathPrefix: '/saas/pro/',
      businessType: 'cleanup_expenditure_cancel',
    }
  );
}

/**
 * 收入单清理：可选撤销交单 + 反审 + 取消
 * @param billId ERP 返回的收入单 ID
 * @param revokeFirst 是否在反审前先撤销交单（默认 false，当收入单已交单时传 true）
 */
export async function cleanupIncomeBill(billId: number, revokeFirst = false): Promise<void> {
  const config = getErpConfig();
  const { cid, uid } = getErpDefaults();
  const time = Date.now();

  // 步骤0（可选）：撤销交单
  if (revokeFirst) {
    await revokeBillSubmission([{ billId, billType: 'CASH_INCOME' }]);
  }

  // 步骤1：反审
  await erpPost(
    config.incomeReApprovePath,
    { id: billId, cid, uid, time },
    {
      pathPrefix: '/saas/pro/',
      businessType: 'cleanup_income_reapprove',
    }
  );

  // 步骤2：取消
  await erpPost(
    config.incomeCancelPath,
    { id: billId, cid, uid },
    {
      pathPrefix: '/saas/pro/',
      businessType: 'cleanup_income_cancel',
    }
  );
}

// =====================================================
// 撤销交单
// =====================================================

/**
 * 撤销交单（费用单反审核前的前置操作）
 * POST /messiah/worker-payment-web/revoke-detail
 *
 * 当费用单已被交单时，反审核前必须先撤销交单
 *
 * @usedBy bad-debt-callback.ts
 */
export async function revokeBillSubmission(
  billInfos: Array<{ billId: number; billType: string }>
): Promise<void> {
  const { cid, uid } = getErpDefaults();

  log.info(`撤销交单: ${billInfos.length}条, types=${billInfos.map(b => b.billType).join(',')}`);

  await erpPost(
    '/worker-payment-web/revoke-detail',
    { billInfos, paidInfos: [], cid, uid },
    { businessType: 'revoke_bill_submission' }
  );
}

// =====================================================
// 坏账清理组合
// =====================================================

/**
 * 坏账处理完整回滚：反审收款单 -> 撤销交单 -> 取消费用单
 *
 * 回滚顺序（反向）：
 * 1. 如果收款单已创建: 撤销交单 -> 反审核收款单 -> 取消收款单
 * 2. 费用单: 撤销交单 -> 反审核费用单 -> 取消费用单
 *
 * 每步独立 try-catch，部分失败不阻断后续回滚
 *
 * @usedBy bad-debt-callback.ts
 */
export async function cleanupBadDebtBills(
  expenditureBillId: number,
  receiptBillId?: number
): Promise<void> {
  const failures: string[] = [];

  // === 收款单回滚（如果已创建） ===
  if (receiptBillId) {
    // 1. 撤销收款单交单
    try {
      await revokeBillSubmission([{ billId: receiptBillId, billType: 'RECEIVE' }]);
    } catch (err) {
      failures.push(`撤销收款单交单失败: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 2. 反审核收款单
    try {
      await deApproveCustomerReceipt(receiptBillId);
    } catch (err) {
      failures.push(`反审核收款单失败: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 3. 取消收款单
    try {
      await cancelCustomerReceipt(receiptBillId);
    } catch (err) {
      failures.push(`取消收款单失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // === 费用单回滚 ===

  // 4. 撤销费用单交单
  try {
    await revokeBillSubmission([{ billId: expenditureBillId, billType: 'CONSUMER_EXPENDITURE' }]);
  } catch (err) {
    failures.push(`撤销费用单交单失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 5. 反审核 + 取消费用单
  try {
    await cleanupExpenditureBill(expenditureBillId);
  } catch (err) {
    failures.push(`清理费用单失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (failures.length > 0) {
    const msg = `坏账回滚部分失败:\n${failures.join('\n')}`;
    log.error(msg);
    throw new Error(msg);
  }

  log.info(`坏账回滚完成: expenditureBillId=${expenditureBillId}, receiptBillId=${receiptBillId || 'none'}`);
}
