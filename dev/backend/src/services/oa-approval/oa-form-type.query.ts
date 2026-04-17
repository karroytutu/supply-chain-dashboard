/**
 * OA审批表单类型查询服务
 * @module services/oa-approval/oa-form-type.query
 */

import { appQuery as query } from '../../db/appPool';
import {
  FormTypeDefinition,
  FormCategory,
  OaFormTypeRow,
} from './oa-approval.types';
import { mapFormTypeRow } from './oa-approval-utils';
import { ALL_FORM_TYPES, getFormTypeByCode, getFormTypesByCategory } from './form-types';

/**
 * 获取所有可用的表单类型
 * 优先从数据库获取，数据库不存在则使用代码定义
 */
export async function getActiveFormTypes(): Promise<FormTypeDefinition[]> {
  try {
    const result = await query<OaFormTypeRow>(
      `SELECT * FROM oa_form_types WHERE is_active = true ORDER BY category, sort_order`
    );

    if (result.rows.length > 0) {
      return result.rows.map(mapFormTypeRow);
    }

    // 数据库无数据时使用代码定义
    return ALL_FORM_TYPES;
  } catch (error) {
    // 表不存在时使用代码定义
    console.warn('oa_form_types table not found, using code definitions');
    return ALL_FORM_TYPES;
  }
}

/**
 * 根据编码获取表单类型
 */
export async function getFormTypeByCodeQuery(code: string): Promise<FormTypeDefinition | null> {
  try {
    const result = await query<OaFormTypeRow>(
      `SELECT * FROM oa_form_types WHERE code = $1 AND is_active = true`,
      [code]
    );

    if (result.rows.length > 0) {
      return mapFormTypeRow(result.rows[0]);
    }

    // 数据库无数据时使用代码定义
    return getFormTypeByCode(code) || null;
  } catch (error) {
    console.warn('oa_form_types table not found, using code definitions');
    return getFormTypeByCode(code) || null;
  }
}

/**
 * 按分类分组获取表单类型
 */
export async function getFormTypesGroupedByCategory(): Promise<Record<FormCategory, FormTypeDefinition[]>> {
  const formTypes = await getActiveFormTypes();
  
  const grouped: Record<FormCategory, FormTypeDefinition[]> = {
    finance: [],
    supply_chain: [],
    marketing: [],
    hr: [],
    admin: [],
  };

  for (const ft of formTypes) {
    if (grouped[ft.category]) {
      grouped[ft.category].push(ft);
    }
  }

  // 每个分类内排序
  for (const category of Object.keys(grouped) as FormCategory[]) {
    grouped[category].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  return grouped;
}
