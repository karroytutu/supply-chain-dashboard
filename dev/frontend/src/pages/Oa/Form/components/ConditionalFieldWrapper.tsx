/**
 * 条件字段包装器
 * 处理 visibleWhen（条件显示）和 requiredWhen（条件必填）
 */
import React from 'react';
import type { FormField, ConditionDef, ConditionGroup } from '@/types/oa';

interface ConditionalFieldWrapperProps {
  field: FormField;
  formData: Record<string, unknown>;
  children: React.ReactNode;
}

/** 判断单个条件是否满足 */
function checkSingleCondition(condition: ConditionDef, formData: Record<string, unknown>): boolean {
  const fieldValue = formData[condition.field];
  switch (condition.operator) {
    case '==':
      return String(fieldValue) === String(condition.value);
    case '>=':
      return Number(fieldValue) >= Number(condition.value);
    case '<=':
      return Number(fieldValue) <= Number(condition.value);
    case '>':
      return Number(fieldValue) > Number(condition.value);
    case '<':
      return Number(fieldValue) < Number(condition.value);
    case 'not_empty':
      return fieldValue != null && fieldValue !== '' && !(Array.isArray(fieldValue) && fieldValue.length === 0);
    case 'is_empty':
      return fieldValue == null || fieldValue === '' || (Array.isArray(fieldValue) && fieldValue.length === 0);
    default:
      return false;
  }
}

/** 判断条件（支持单个、AND数组、或ConditionGroup）是否满足 */
function checkCondition(
  condition: ConditionDef | ConditionDef[] | ConditionGroup,
  formData: Record<string, unknown>
): boolean {
  // 单条件：通过 field 属性识别
  if ('field' in condition) {
    return checkSingleCondition(condition, formData);
  }
  // AND 数组：全部子条件满足才触发
  if (Array.isArray(condition)) {
    return condition.every((c) => checkSingleCondition(c, formData));
  }
  // OR 条件组：任一子条件满足即触发
  if (condition.match === 'any') {
    return condition.conditions.some((c) => checkSingleCondition(c, formData));
  }
  // AND 条件组：全部子条件满足才触发
  if (condition.match === 'all') {
    return condition.conditions.every((c) => checkSingleCondition(c, formData));
  }
  return false;
}

const ConditionalFieldWrapper: React.FC<ConditionalFieldWrapperProps> = ({
  field,
  formData,
  children,
}) => {
  // visibleWhen: 条件不满足时隐藏
  if (field.visibleWhen && !checkCondition(field.visibleWhen, formData)) {
    return null;
  }

  return <>{children}</>;
};

/** 导出条件检查函数，供外部使用 */
export { checkCondition, checkSingleCondition };
export default ConditionalFieldWrapper;
