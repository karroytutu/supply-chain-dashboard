/**
 * OA系统模块工具函数
 * @module utils/oa
 */

import type { ConditionDef, FormField, ApprovalDetail, NodeInteractionType } from '@/types/oa';

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
  marketing_supervisor: '营销经理',
  warehouse_keeper: '库管员',
  logistics_manager: '物流主管',
  operations_manager: '运营支持中心经理',
  current_accountant: '往来会计',
  marketing_manager: '营销经理',
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

/**
 * 校验 URL 是否安全（防止 javascript: 等 XSS 向量）
 * 仅允许以 /、http://、https:// 开头的 URL
 */
export function isSafeUrl(url: string): boolean {
  return /^\/[^/]|^https?:\/\//.test(url);
}

/**
 * 获取表单字段的链接 URL
 * 当 field.type 为 text 且 formData 中存在 `_${field.key}Url` 时返回安全 URL，否则返回 null
 */
export function getFieldLinkUrl(
  field: FormField,
  formData?: Record<string, unknown>,
): string | null {
  if (field.type !== 'text' || !formData) return null;
  const url = formData[`_${field.key}Url`];
  if (typeof url === 'string' && url && isSafeUrl(url)) return url;
  return null;
}

/**
 * 获取当前审批节点的交互类型
 * 根据 workflowDef 中当前节点的 interactionType 配置，返回 'operation' 或 'approval'（默认）
 * 对于动态插入的节点（升级/差异解决），当 workflowDef 匹配不到时，
 * 根据节点 roleCode 推断交互类型（催收相关角色默认为 operation）
 */
export function getInteractionType(detail: ApprovalDetail): NodeInteractionType {
  const currentNode = detail.nodes.find(n => n.nodeOrder === detail.currentNodeOrder);
  if (!currentNode || !detail.workflowDef) return 'approval';
  // 先尝试 workflowDef 静态匹配
  const workflowNode = detail.workflowDef.nodes.find(n => n.order === currentNode.nodeOrder);
  if (workflowNode?.interactionType) return workflowNode.interactionType;
  // fallback：根据 roleCode 推断（催收相关节点默认 operation）
  const OPERATION_ROLES = ['marketer', 'marketing_manager', 'marketing_supervisor', 'current_accountant'];
  if (currentNode.roleCode && OPERATION_ROLES.includes(currentNode.roleCode)) return 'operation';
  return 'approval';
}
