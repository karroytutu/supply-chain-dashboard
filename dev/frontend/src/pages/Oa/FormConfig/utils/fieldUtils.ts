/**
 * 表单字段公共工具函数
 * @module pages/Oa/FormConfig/utils/fieldUtils
 *
 * ViewPermissionMatrix 使用的共享工具函数。
 */
import type { FormField } from '@/types/oa';

/** 需要过滤的字段：_ 前缀内部字段和 hidden 字段 */
export function isUserField(field: FormField): boolean {
  return !field.key.startsWith('_') && !field.hidden;
}

/** 展开表格子字段：将 table 类型的子字段插入到父字段后面作为子行 */
export function flattenFieldsWithChildren(
  fields: FormField[]
): Array<{ field: FormField; isChild: boolean; parentKey?: string }> {
  const result: Array<{ field: FormField; isChild: boolean; parentKey?: string }> = [];
  for (const field of fields) {
    result.push({ field, isChild: false });
    if (field.type === 'table' && field.children) {
      for (const child of field.children) {
        if (!child.hidden) {
          result.push({
            field: { ...child, key: `${field.key}.${child.key}`, label: `  └ ${child.label}` },
            isChild: true,
            parentKey: field.key,
          });
        }
      }
    }
  }
  return result;
}

/** 条件运算符中文标签 */
const OPERATOR_LABELS: Record<string, string> = {
  '>': '大于', '<': '小于', '>=': '大于等于', '<=': '小于等于', '==': '等于',
};

/** 条件定义类型 */
interface ConditionDef {
  field: string;
  operator: string;
  value: unknown;
}

/**
 * 将条件定义转为业务可读文本
 * @param condition 条件（单个或数组）
 * @param fields 表单字段列表，用于将 field key 映射为中文标签
 */
export function formatCondition(
  condition: ConditionDef | ConditionDef[] | unknown,
  fields?: Array<{ key: string; label: string }>
): string {
  if (!condition) return '';
  const list = Array.isArray(condition) ? condition : [condition];
  return list.map((c: ConditionDef) => {
    const label = fields?.find(f => f.key === c.field)?.label || c.field;
    const op = OPERATOR_LABELS[c.operator] || c.operator;
    return `${label} ${op} ${c.value}`;
  }).join('，且 ');
}
