/**
 * 表单类型注册表
 * @module services/oa-approval/form-types/index
 * 
 * 新增表单类型时，请在此文件中导入并添加到 ALL_FORM_TYPES 数组。
 */

import { FormTypeDefinition } from '../oa-approval.types';
import { otherPaymentFormType } from './other-payment';

/**
 * 所有已注册的表单类型
 * 
 * 新增表单类型时，在此数组中添加导入的表单类型定义。
 */
export const ALL_FORM_TYPES: FormTypeDefinition[] = [
  otherPaymentFormType,
  // 在此添加新的表单类型...
];

/**
 * 根据编码获取表单类型定义
 */
export function getFormTypeByCode(code: string): FormTypeDefinition | undefined {
  return ALL_FORM_TYPES.find((ft) => ft.code === code);
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
