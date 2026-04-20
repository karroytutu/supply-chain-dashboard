/**
 * 条件字段包装器
 * 处理 visibleWhen（条件显示）和 requiredWhen（条件必填）
 */
import React from 'react';
import type { FormField, ConditionDef } from '@/types/oa-approval';

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
    default:
      return false;
  }
}

/** 判断条件（支持单个或AND数组）是否满足 */
function checkCondition(
  condition: ConditionDef | ConditionDef[],
  formData: Record<string, unknown>
): boolean {
  if (Array.isArray(condition)) {
    return condition.every((c) => checkSingleCondition(c, formData));
  }
  return checkSingleCondition(condition, formData);
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
