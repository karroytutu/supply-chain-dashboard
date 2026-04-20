/**
 * 固定资产审批模块 - 工具函数
 * @module services/fixed-asset/fixed-asset-utils
 */

import type { ApplicationType, ApplicationStatus, PurchaseLine, ErpAsset } from './fixed-asset.types';
import { getErpDefaults } from '../erp-client';

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
const STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: '待审批', quoting: '询价中', paying: '支付中', purchasing: '采购中',
  storing: '入库中', approved: '审批通过', rejected: '已驳回',
  cancelled: '已取消', completed: '已完成', erp_failed: 'ERP操作失败',
};
export function getApplicationStatusLabel(status: ApplicationStatus): string {
  return STATUS_LABELS[status];
}

/**
 * 获取申请类型显示名
 */
const TYPE_LABELS: Record<ApplicationType, string> = {
  purchase: '采购申请', transfer: '领用调拨', maintenance: '维修申请', disposal: '清理申请',
};
export function getApplicationTypeLabel(type: ApplicationType): string {
  return TYPE_LABELS[type];
}

/** 采购流程节点→状态映射 */
const PURCHASE_NODE_STATUS: Record<number, ApplicationStatus> = {
  3: 'quoting', 5: 'paying', 6: 'purchasing', 7: 'storing',
};
/** 维修流程节点→状态映射 */
const MAINTENANCE_NODE_STATUS: Record<number, ApplicationStatus> = {
  2: 'quoting', 4: 'paying',
};

/**
 * 根据申请类型和当前审批节点计算申请状态
 */
export function getStatusForNode(type: ApplicationType, nodeOrder: number): ApplicationStatus {
  if (type === 'purchase') return PURCHASE_NODE_STATUS[nodeOrder] || 'pending';
  if (type === 'maintenance') return MAINTENANCE_NODE_STATUS[nodeOrder] || 'pending';
  return 'pending';
}

/**
 * 计算月折旧额
 * (原值 - 残值) / 预计使用月数
 */
function calcMonthlyDepreciation(
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
function calcResidualValue(originalValue: number, residualValueRate: number): string {
  return (originalValue * residualValueRate / 100).toFixed(2);
}

/**
 * 计算原值净额
 */
function calcNetValue(originalValue: number, residualValueRate: number): string {
  return (originalValue - originalValue * residualValueRate / 100).toFixed(2);
}

/**
 * 将日期字符串规范化为 ERP 要求的 datetime 格式
 * ERP 要求: "YYYY-MM-DD HH:mm:ss"
 * 前端 date 输入只提供 "YYYY-MM-DD"，需追加时间部分
 */
export function normalizeDateTime(dateStr: string | undefined | null): string {
  if (!dateStr) {
    return new Date().toISOString().slice(0, 10) + ' 12:00:00';
  }
  // 已包含时间部分
  if (dateStr.includes(' ')) return dateStr;
  // 只有日期，追加默认时间
  return `${dateStr} 12:00:00`;
}

/**
 * 根据现有 ERP 资产列表计算下一个可用的资产编码序号
 * 编码格式: GDZC-XXXX (前缀 + 4位补零数字)
 */
export function generateNextAssetCode(existingAssets: ErpAsset[]): number {
  let maxNum = 0;
  for (const asset of existingAssets) {
    if (asset.code && asset.code.startsWith('GDZC-')) {
      const numStr = asset.code.replace('GDZC-', '');
      const num = parseInt(numStr, 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }
  return maxNum + 1;
}

/**
 * 构造采购明细行的舟谱 /asset/create 请求体
 */
export function buildAssetCreatePayload(
  line: PurchaseLine,
  lineIndex: number,
  unitAllocation?: { deptId: number; userId: number; depositAddress: string },
  assetCode?: string
): Record<string, unknown> {
  const originalValue = parseFloat(line.actualPrice || line.quotationPrice || line.estimatedBudget || '0');
  const residualRate = line.estimatedResidualValueRate || 5;
  const serviceMonths = line.estimatedServiceMonths || 48;
  const { cid, uid } = getErpDefaults();

  return {
    assertCreatedType: 'UN_BEGINNING',
    name: line.assetName,
    code: assetCode || '',
    assetTypeId: line.assetTypeId,
    entryDate: line.arrivalDate || new Date().toISOString().slice(0, 10),
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
    cid,
    uid,
  };
}
