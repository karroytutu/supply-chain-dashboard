/**
 * OA表单类型查询服务
 * @module services/oa/oa-form-type.query
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('OA');

import { appQuery as query } from '../../db/appPool';
import { cache, CACHE_TTL } from '../../utils/cache';
import { CACHE_KEY } from '../../utils/cache-keys';
import { FormTypeDefinition, FormCategory, OaFormTypeRow } from './oa.types';
import { mapFormTypeRow } from './oa-utils';
import { ALL_FORM_TYPES, getFormTypeByCode } from './form-types';
import { ROLE_CODES } from '../../utils/constants';

/** 所有已知岗位编码集合（启动时填充） */
let _validRoleCodes: Set<string> | null = null;

/**
 * 校验所有表单类型中 workflowDef 引用的岗位编码是否合法
 * 仅输出警告日志，不阻断业务。建议在应用启动后调用一次。
 */
export async function validateFormTypeRoleCodes(): Promise<void> {
  try {
    const result = await query<{ code: string }>('SELECT code FROM roles WHERE status = 1');
    _validRoleCodes = new Set([...result.rows.map(r => r.code), ...Object.values(ROLE_CODES)]);
  } catch {
    return; // DB 不可用时跳过校验
  }

  const allTypes = await getActiveFormTypes();
  for (const ft of allTypes) {
    if (!ft.workflowDef?.nodes) continue;
    for (const node of ft.workflowDef.nodes) {
      const roleCode = (node as any).handler?.roleCode;
      if (roleCode && !_validRoleCodes.has(roleCode)) {
        log.warn(`[岗位校验] 表单 '${ft.code}' 节点 ${node.order}('${node.name}') 引用了无效岗位: '${roleCode}'`);
      }
    }
  }
}

/**
 * 获取所有可用的表单类型
 * formSchema 和 workflowDef 均由代码提供，DB 仅存储元数据和角色/用户配置
 * @param userRoles 当前用户的角色编码列表，传入时按 allowed_roles 过滤
 * @param userId 当前用户的 ID，传入时同时按 allowed_users 过滤（与角色过滤为 OR 关系）
 */
export async function getActiveFormTypes(userRoles?: string[], userId?: number): Promise<FormTypeDefinition[]> {
  // 先查缓存（全量数据，内存过滤角色/用户）
  const cached = cache.get<FormTypeDefinition[]>(CACHE_KEY.OA_FORM_TYPES_ACTIVE);
  if (cached) {
    if ((!userRoles || userRoles.length === 0) && !userId) return cached;
    return cached.filter(ft => {
      // 无限制 → 通过
      if (!ft.allowedRoles && !ft.allowedUsers) return true;
      // 角色匹配
      if (userRoles && ft.allowedRoles && ft.allowedRoles.some(role => userRoles.includes(role))) return true;
      // 用户ID匹配
      if (userId && ft.allowedUsers && ft.allowedUsers.includes(userId)) return true;
      // 有限制但不匹配
      return false;
    });
  }

  try {
    const result = await query<OaFormTypeRow>(
      `SELECT id, code, name, icon, category, sort_order, description,
              is_active, version, allowed_roles, data_read_roles, data_export_roles,
              allowed_users, data_read_users, data_export_users,
              field_permissions, view_permissions,
              created_at, updated_at
       FROM oa_form_types WHERE is_active = true ORDER BY category, sort_order`
    );

    if (result.rows.length > 0) {
      let dbFormTypes = result.rows.map(mapFormTypeRow);

      // 收集数据库中已有的 code
      const dbCodes = new Set(dbFormTypes.map(ft => ft.code));
      // 补充代码定义中存在但数据库中尚未入库的表单类型
      const codeOnlyTypes = ALL_FORM_TYPES.filter(ft => !dbCodes.has(ft.code));
      const allFormTypes = [...dbFormTypes, ...codeOnlyTypes];

      // 写入缓存（全量数据）
      cache.set(CACHE_KEY.OA_FORM_TYPES_ACTIVE, allFormTypes, CACHE_TTL.LOW_FREQUENCY);

      // 按角色/用户过滤：仅当传入 userRoles 或 userId 时执行
      if ((userRoles && userRoles.length > 0) || userId) {
        return allFormTypes.filter(ft => {
          if (!ft.allowedRoles && !ft.allowedUsers) return true;
          if (userRoles && ft.allowedRoles && ft.allowedRoles.some(role => userRoles.includes(role))) return true;
          if (userId && ft.allowedUsers && ft.allowedUsers.includes(userId)) return true;
          return false;
        });
      }

      return allFormTypes;
    }

    // 数据库无数据时使用代码定义
    return ALL_FORM_TYPES;
  } catch (_error) {
    // 表不存在时使用代码定义
    log.warn('oa_form_types table not found, using code definitions');
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
  } catch (_error) {
    log.warn('oa_form_types table not found, using code definitions');
    return getFormTypeByCode(code) || null;
  }
}

/**
 * 按分类分组获取表单类型
 * @param userRoles 当前用户的角色编码列表，传入时按 allowed_roles 过滤
 * @param userId 当前用户的 ID，传入时同时按 allowed_users 过滤
 */
export async function getFormTypesGroupedByCategory(userRoles?: string[], userId?: number): Promise<
  Record<FormCategory, FormTypeDefinition[]>
> {
  const formTypes = await getActiveFormTypes(userRoles, userId);

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
