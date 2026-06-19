/**
 * OA - 表单校验与数据转换工具
 * @module services/oa/oa-form-utils
 */

import type {
  FormField,
  FormSchema,
  NodeInputSchema,
  NodeInputField,
  ConditionDef,
} from './oa.types';
import { evaluateFormula } from './formula-evaluator';

// =====================================================
// 金额大写转换
// =====================================================

const DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
const UNITS = ['', '拾', '佰', '仟'];
const LARGE_UNITS = ['', '万', '亿', '兆'];

/**
 * 数字转中文大写金额
 */
export function numberToChineseUpper(n: number): string {
  if (n === 0) return '零元整';
  if (n < 0) return '负' + numberToChineseUpper(-n);

  const intPart = Math.floor(n);
  const decPart = Math.round((n - intPart) * 100);

  let result = '';

  if (intPart > 0) {
    const intStr = intPart.toString();
    const len = intStr.length;
    let zeroFlag = false;

    for (let i = 0; i < len; i++) {
      const digit = parseInt(intStr[i], 10);
      const pos = len - 1 - i;
      const unitPos = pos % 4;
      const largeUnitPos = Math.floor(pos / 4);

      if (digit === 0) {
        zeroFlag = true;
        if (unitPos === 0 && largeUnitPos > 0) {
          result += LARGE_UNITS[largeUnitPos];
        }
      } else {
        if (zeroFlag) {
          result += '零';
          zeroFlag = false;
        }
        result += DIGITS[digit] + UNITS[unitPos];
        if (unitPos === 0 && largeUnitPos > 0) {
          result += LARGE_UNITS[largeUnitPos];
        }
      }
    }

    result += '元';
  }

  if (decPart > 0) {
    const jiao = Math.floor(decPart / 10);
    const fen = decPart % 10;

    if (jiao > 0) {
      result += DIGITS[jiao] + '角';
    }
    if (fen > 0) {
      result += DIGITS[fen] + '分';
    }
  } else {
    result += '整';
  }

  return result;
}

// =====================================================
// 表单校验
// =====================================================

/**
 * 校验表单数据
 * 支持 visibleWhen（条件隐藏跳过校验）和 requiredWhen（条件必填）
 * @returns 错误消息数组，空数组表示校验通过
 */
export function validateFormData(
  formSchema: FormSchema,
  formData: Record<string, unknown>
): string[] {
  const errors: string[] = [];

  for (const field of formSchema.fields) {
    if (field.visibleWhen && !checkCondition(field.visibleWhen, formData)) {
      continue;
    }

    const value = formData[field.key];

    const isRequired =
      field.required || (field.requiredWhen ? checkCondition(field.requiredWhen, formData) : false);

    if (isRequired) {
      if (value === undefined || value === null || value === '') {
        errors.push(`${field.label}不能为空`);
        continue;
      }
      if (Array.isArray(value) && value.length === 0) {
        errors.push(`${field.label}不能为空`);
        continue;
      }
    }

    if (value === undefined || value === null || value === '') {
      continue;
    }

    switch (field.type) {
      case 'text':
      case 'textarea':
        if (field.maxLength && typeof value === 'string' && value.length > field.maxLength) {
          errors.push(`${field.label}不能超过${field.maxLength}个字符`);
        }
        break;

      case 'number':
      case 'money': {
        const numValue = Number(value);
        if (isNaN(numValue)) {
          errors.push(`${field.label}必须是数字`);
        } else {
          if (field.min !== undefined && numValue < field.min) {
            errors.push(`${field.label}不能小于${field.min}`);
          }
          if (field.max !== undefined && numValue > field.max) {
            errors.push(`${field.label}不能大于${field.max}`);
          }
        }
        break;
      }

      case 'select':
      case 'multi-select':
        if (field.options) {
          const validValues = field.options.map(o => o.value);
          if (Array.isArray(value)) {
            const invalid = value.filter(v => !validValues.includes(v));
            if (invalid.length > 0) {
              errors.push(`${field.label}包含无效选项`);
            }
          } else if (!validValues.includes(value as string)) {
            errors.push(`${field.label}选项无效`);
          }
        }
        break;

      case 'table':
        if (field.children && Array.isArray(value)) {
          for (let i = 0; i < value.length; i++) {
            const rowErrors = validateFormData(
              { fields: field.children },
              value[i] as Record<string, unknown>
            );
            errors.push(...rowErrors.map(e => `${field.label}[${i + 1}].${e}`));
          }
        }
        break;

      case 'formula': {
        if (!field.formula) break;
        try {
          // 服务端重算公式，与提交值做容差比较，防止客户端篡改
          const expected = evaluateFormula(field.formula, formData);
          const submitted = Number(value);
          const precision = field.formulaPrecision ?? 2;
          const tolerance = Math.pow(10, -precision);
          if (isNaN(submitted) || Math.abs(submitted - expected) > tolerance) {
            errors.push(`${field.label}的计算结果不正确`);
          }
        } catch {
          errors.push(`${field.label}公式计算失败`);
        }
        break;
      }
    }
  }

  return errors;
}

/**
 * 校验 inputData 是否符合 inputSchema
 */
export function validateInputData(
  inputSchema: NodeInputSchema,
  inputData: Record<string, unknown>
): string[] {
  const errors: string[] = [];

  for (const field of inputSchema.fields) {
    const value = inputData[field.name];

    if (field.required && (value === undefined || value === null || value === '')) {
      errors.push(`${field.label}不能为空`);
      continue;
    }

    if (value === undefined || value === null || value === '') {
      continue;
    }

    if (field.type === 'number') {
      const numValue = Number(value);
      if (isNaN(numValue)) {
        errors.push(`${field.label}必须是数字`);
      }
    }
  }

  return errors;
}

// =====================================================
// 条件检查（表单校验和流程节点共用）
// =====================================================

/**
 * 通用条件检查（支持单个条件或 AND 条件数组）
 */
export function checkCondition(
  condition: ConditionDef | ConditionDef[],
  data: Record<string, unknown>
): boolean {
  if (Array.isArray(condition)) {
    return condition.every(c => checkSingleCondition(data[c.field], c.operator, c.value));
  }
  return checkSingleCondition(data[condition.field], condition.operator, condition.value);
}

function checkSingleCondition(
  fieldValue: unknown,
  operator: string,
  compareValue: unknown
): boolean {
  switch (operator) {
    case '==':
      return fieldValue == compareValue;
    case '!=':
      return fieldValue != compareValue;
    case '>':
      return Number(fieldValue) > Number(compareValue);
    case '>=':
      return Number(fieldValue) >= Number(compareValue);
    case '<':
      return Number(fieldValue) < Number(compareValue);
    case '<=':
      return Number(fieldValue) <= Number(compareValue);
    case 'contains':
      if (Array.isArray(fieldValue)) {
        return fieldValue.includes(compareValue);
      }
      return String(fieldValue).includes(String(compareValue));
    case 'not_contains':
      if (Array.isArray(fieldValue)) {
        return !fieldValue.includes(compareValue);
      }
      return !String(fieldValue).includes(String(compareValue));
    default:
      return false;
  }
}
