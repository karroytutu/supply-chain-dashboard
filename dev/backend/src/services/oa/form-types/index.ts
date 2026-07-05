/**
 * 表单类型注册表
 * @module services/oa/form-types/index
 *
 * 新增表单类型时，请在此文件中导入并添加到 ALL_FORM_TYPES 数组。
 */

import { FormTypeDefinition } from '../oa.types';
import { otherPaymentFormType } from './other-payment';
import { assetPurchaseFormType } from './asset-purchase';
import { assetTransferFormType } from './asset-transfer';
import { assetMaintenanceFormType } from './asset-maintenance';
import { assetDisposalFormType } from './asset-disposal';
import { customerCreditFormType } from './customer-credit';
import { assessmentAppealFormType } from './assessment-appeal';
import { customerModifyFormType } from './customer-modify';
import { arCollectionFormType } from './ar-collection';
import { procurementOrderFormType } from './procurement-order';
import { logisticsFeeFormType } from './logistics-fee';
import { purchasePaymentFormType } from './purchase-payment';
import { customerReconciliationFormType } from './customer-reconciliation';
import { promotionCombinedOfflineFormType } from './promotion-combined-offline';
import { promotionSpecialOfflineFormType } from './promotion-special-offline';
import { promotionFullGiftOfflineFormType } from './promotion-fullgift-offline';
import { marketExpenseFormType } from './market-expense';
import { badDebtWriteOffFormType } from './bad-debt-write-off';
import { salesTargetApprovalFormType } from './sales-target-approval';

/**
 * 所有已注册的表单类型
 *
 * 新增表单类型时，在此数组中添加导入的表单类型定义。
 */
export const ALL_FORM_TYPES: FormTypeDefinition[] = [
  otherPaymentFormType,
  assetPurchaseFormType,
  assetTransferFormType,
  assetMaintenanceFormType,
  assetDisposalFormType,
  customerCreditFormType,
  assessmentAppealFormType,
  customerModifyFormType,
  arCollectionFormType,
  procurementOrderFormType,
  logisticsFeeFormType,
  purchasePaymentFormType,
  customerReconciliationFormType,
  promotionCombinedOfflineFormType,
  promotionSpecialOfflineFormType,
  promotionFullGiftOfflineFormType,
  marketExpenseFormType,
  badDebtWriteOffFormType,
  salesTargetApprovalFormType,
];

/**
 * 表单类型索引（按 code 快速查找）
 * 在模块加载时构建一次，O(1) 查找替代 Array.find() 的 O(n)
 */
const FORM_TYPE_MAP = new Map<string, FormTypeDefinition>(
  ALL_FORM_TYPES.map(ft => [ft.code, ft])
);

/**
 * 根据编码获取表单类型定义（O(1) 查找）
 */
export function getFormTypeByCode(code: string): FormTypeDefinition | undefined {
  return FORM_TYPE_MAP.get(code);
}

/**
 * 按分类分组获取表单类型
 */
export function getFormTypesByCategory(): Record<string, FormTypeDefinition[]> {
  const result: Record<string, FormTypeDefinition[]> = {};

  for (const formType of ALL_FORM_TYPES) {
    if (!result[formType.category]) {
      result[formType.category] = [];
    }
    result[formType.category].push(formType);
  }

  // 每个分类内按 sortOrder 排序
  for (const category of Object.keys(result)) {
    result[category].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  return result;
}

// 导出所有表单类型
export { otherPaymentFormType } from './other-payment';
export { assetPurchaseFormType } from './asset-purchase';
export { assetTransferFormType } from './asset-transfer';
export { assetMaintenanceFormType } from './asset-maintenance';
export { assetDisposalFormType } from './asset-disposal';
export { customerCreditFormType } from './customer-credit';
export { assessmentAppealFormType } from './assessment-appeal';
export { customerModifyFormType } from './customer-modify';
export { arCollectionFormType } from './ar-collection';
export { procurementOrderFormType } from './procurement-order';
export { logisticsFeeFormType } from './logistics-fee';
export { purchasePaymentFormType } from './purchase-payment';
export { customerReconciliationFormType } from './customer-reconciliation';
export { promotionCombinedOfflineFormType } from './promotion-combined-offline';
export { promotionSpecialOfflineFormType } from './promotion-special-offline';
export { promotionFullGiftOfflineFormType } from './promotion-fullgift-offline';
export { marketExpenseFormType } from './market-expense';
export { salesTargetApprovalFormType } from './sales-target-approval';
