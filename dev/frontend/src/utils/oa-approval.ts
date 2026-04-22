/**
 * OA审批模块工具函数
 * @module utils/oa-approval
 */

import type { ConditionDef } from '@/types/oa-approval';

/** 角色 roleCode → 中文显示名映射 */
const ROLE_DISPLAY_NAMES: Record<string, string> = {
  admin: '系统管理员',
  manager: '供应链经理',
  operator: '运营人员',
  viewer: '只读用户',
  procurement_manager: '采购主管',
  warehouse_manager: '仓储主管',
  finance_staff: '财务人员',
  cashier: '结算会计',
  marketing_supervisor: '营销主管',
  warehouse_keeper: '库管员',
  logistics_manager: '物流主管',
  operations_manager: '运营支持中心经理',
  current_accountant: '往来会计',
  marketing_manager: '营销主管',
  marketer: '营销师',
  admin_staff: '行政专员',
};

/** 获取角色显示名称 */
export function getRoleDisplayName(roleCode: string): string {
  return ROLE_DISPLAY_NAMES[roleCode] || roleCode;
}

/** 操作符 → 中文映射 */
const OPERATOR_LABELS: Record<ConditionDef['operator'], string> = {
  '>': '超过',
  '>=': '不低于',
  '<': '低于',
  '<=': '不超过',
  '==': '为',
};

/**
 * 将条件定义转为可读中文文本
 * @example humanizeCondition({ field: 'amount', operator: '>', value: 50000 }, { amount: '金额' })
 * // => '金额超过50,000元时'
 */
export function humanizeCondition(
  condition: ConditionDef,
  fieldLabels: Record<string, string>,
): string {
  const label = fieldLabels[condition.field] || condition.field;
  const opLabel = OPERATOR_LABELS[condition.operator] || condition.operator;
  const value = typeof condition.value === 'number'
    ? condition.value.toLocaleString('zh-CN')
    : String(condition.value);
  return `${label}${opLabel}${value}时`;
}
