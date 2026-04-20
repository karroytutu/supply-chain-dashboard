/**
 * ERP 清理 API — 费用单/收入单反审与取消
 * 用于测试数据清理：先反审再取消，顺序不可颠倒
 * @module services/erp-client/erp-cleanup
 */

import { erpPost } from './erp-client';
import { getErpConfig, getErpDefaults } from './erp-config';

/**
 * 费用单清理：先反审再取消
 * @param billId ERP 返回的费用单 ID
 */
export async function cleanupExpenditureBill(billId: number): Promise<void> {
  const config = getErpConfig();
  const { cid, uid } = getErpDefaults();
  const time = Date.now();

  // 步骤1：反审
  await erpPost(config.expenditureBillReApprovePath, { id: billId, cid, uid, time }, {
    pathPrefix: '/saas/pro/',
    businessType: 'cleanup_expenditure_reapprove',
  });

  // 步骤2：取消
  await erpPost(config.expenditureBillCancelPath, { id: billId, cid, uid }, {
    pathPrefix: '/saas/pro/',
    businessType: 'cleanup_expenditure_cancel',
  });
}

/**
 * 收入单清理：先反审再取消
 * @param billId ERP 返回的收入单 ID
 */
export async function cleanupIncomeBill(billId: number): Promise<void> {
  const config = getErpConfig();
  const { cid, uid } = getErpDefaults();
  const time = Date.now();

  // 步骤1：反审
  await erpPost(config.incomeReApprovePath, { id: billId, cid, uid, time }, {
    pathPrefix: '/saas/pro/',
    businessType: 'cleanup_income_reapprove',
  });

  // 步骤2：取消
  await erpPost(config.incomeCancelPath, { id: billId, cid, uid }, {
    pathPrefix: '/saas/pro/',
    businessType: 'cleanup_income_cancel',
  });
}
