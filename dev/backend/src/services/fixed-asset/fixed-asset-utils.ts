/**
 * 固定资产审批模块 - 工具函数
 * @module services/fixed-asset/fixed-asset-utils
 */

import { appQuery } from '../../db/appPool';
import type { ApplicationType, ApplicationStatus, PurchaseLine } from './fixed-asset.types';

/**
 * 生成申请编号
 * 格式：APA + YYYYMMDD + 4位序号
 */
export async function generateApplicationNo(): Promise<string> {
  const result = await appQuery('SELECT generate_asset_application_no() as no');
  return result.rows[0].no;
}

/**
 * 计算月折旧额
 * (原值 - 残值) / 预计使用月数
 */
export function calcMonthlyDepreciation(
  originalValue: number,
  residualValueRate: number,
  serviceMonths: number
): string {
  const residualValue = originalValue * residualValueRate / 100;
  const netValue = originalValue - residualValue;
  const monthly = netValue / serviceMonths;
  return monthly.toFixed(2);
}

/**
 * 计算残值
 */
export function calcResidualValue(originalValue: number, residualValueRate: number): string {
  return (originalValue * residualValueRate / 100).toFixed(2);
}

/**
 * 计算原值净额
 */
export function calcNetValue(originalValue: number, residualValueRate: number): string {
  return (originalValue - originalValue * residualValueRate / 100).toFixed(2);
}

/**
 * 验证维修申请预估费用门槛
 * < 100元：不允许提交
 */
export function validateMaintenanceCost(estimatedCost: number): string | null {
  if (estimatedCost < 100) {
    return '维修费用100元以下建议使用报销流程处理，不允许提交维修申请';
  }
  return null;
}

/**
 * 验证维修询价数量
 * >= 500元时至少需要2家供应商询价
 */
export function validateQuotationCount(estimatedCost: number, quotationCount: number): string | null {
  if (estimatedCost >= 500 && quotationCount < 2) {
    return '预估费用500元以上需至少录入2家供应商询价';
  }
  return null;
}

/**
 * 获取申请状态显示名
 */
export function getApplicationStatusLabel(status: ApplicationStatus): string {
  const labels: Record<ApplicationStatus, string> = {
    pending: '待审批',
    quoting: '询价中',
    paying: '支付中',
    purchasing: '采购中',
    storing: '入库中',
    approved: '审批通过',
    rejected: '已驳回',
    cancelled: '已取消',
    completed: '已完成',
    erp_failed: 'ERP操作失败',
  };
  return labels[status];
}

/**
 * 获取申请类型显示名
 */
export function getApplicationTypeLabel(type: ApplicationType): string {
  const labels: Record<ApplicationType, string> = {
    purchase: '采购申请',
    transfer: '领用调拨',
    maintenance: '维修申请',
    disposal: '清理申请',
  };
  return labels[type];
}

/**
 * 根据申请类型和当前审批节点计算申请状态
 */
export function getStatusForNode(type: ApplicationType, nodeOrder: number): ApplicationStatus {
  if (type === 'purchase') {
    switch (nodeOrder) {
      case 3: return 'quoting';
      case 5: return 'paying';
      case 6: return 'purchasing';
      case 7: return 'storing';
      default: return 'pending';
    }
  }
  if (type === 'maintenance') {
    switch (nodeOrder) {
      case 2: return 'quoting';
      case 4: return 'paying';
      default: return 'pending';
    }
  }
  return 'pending';
}

/**
 * 构造采购明细行的舟谱 /asset/create 请求体
 */
export function buildAssetCreatePayload(
  line: PurchaseLine,
  lineIndex: number,
  unitAllocation?: { deptId: number; userId: number; depositAddress: string }
): Record<string, any> {
  const originalValue = parseFloat(line.actualPrice || line.quotationPrice || line.estimatedBudget || '0');
  const residualRate = line.estimatedResidualValueRate || 5;
  const serviceMonths = line.estimatedServiceMonths || 48;

  return {
    assertCreatedType: 'UN_BEGINNING',
    name: line.assetName,
    assetTypeId: line.assetTypeId,
    entryDate: line.arrivalDate,
    incrdecrId: 1,
    specification: line.specification,
    quantity: 1,
    deptId: unitAllocation?.deptId || line.deptId,
    userId: unitAllocation?.userId || line.userId,
    depositAddress: unitAllocation?.depositAddress || line.depositAddress,
    originalValue: String(originalValue),
    estimatedResidualValueRate: residualRate,
    estimatedResidualValueRatePure: calcResidualValue(originalValue, residualRate),
    depreciationMethod: line.depreciationMethod || 'YEARS_AVERAGE_METHOD',
    estimatedServiceMonths: serviceMonths,
    estimatedServiceMonthsPure: calcMonthlyDepreciation(originalValue, residualRate, serviceMonths),
    initialAccruedMonth: '1',
    initialAccumulatedDepreciation: calcMonthlyDepreciation(originalValue, residualRate, serviceMonths),
    originalValuePure: calcNetValue(originalValue, residualRate),
    note: line.note || '',
    cid: '10008421',
    uid: '1',
  };
}
