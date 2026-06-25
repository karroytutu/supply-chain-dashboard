/**
 * OA 表单类型管理控制器（管理员专用）
 * @module controllers/oa-form-type-admin.controller
 *
 * 提供表单类型的 CRUD 操作，包括基本信息更新、可发起岗位配置、审批流程配置。
 * 所有接口需要 oa:form:manage 权限。
 */
import { createLogger } from '../utils/logger';
const log = createLogger('OaFormAdmin');

import { Request, Response } from 'express';
import { appQuery as query } from '../db/appPool';
import { cache } from '../utils/cache';
import { CACHE_KEY } from '../utils/cache-keys';
import { buildSuccessResponse, buildErrorResponse } from '../utils/response';
import type { OaFormTypeRow, FieldPermissionsOverride, ViewPermissionsOverride } from '../services/oa/oa.types';
import { mapFormTypeRow } from '../services/oa/oa-utils';
import { getFormTypeByCode } from '../services/oa/form-types';
import { validateCompleteness, validateViewCompleteness } from '../services/oa/field-permission-validator';

/** 清除表单类型缓存 */
function invalidateFormTypesCache(): void {
  cache.invalidate(CACHE_KEY.OA_FORM_TYPES_PREFIX);
}

/**
 * 获取所有表单类型（含完整的 workflow_def 和 allowed_roles）
 * GET /api/oa/admin/form-types
 */
export async function listFormTypesForAdmin(req: Request, res: Response): Promise<void> {
  try {
    const result = await query<OaFormTypeRow>(
      `SELECT * FROM oa_form_types ORDER BY category, sort_order`
    );

    const formTypes = result.rows.map(mapFormTypeRow);
    res.json(buildSuccessResponse(formTypes));
  } catch (error) {
    log.error('管理接口-获取表单类型失败:', error);
    res.status(500).json(buildErrorResponse(500, '获取表单类型失败'));
  }
}

/**
 * 更新表单基本信息（名称、描述、图标、可发起岗位、可发起人员）
 * PATCH /api/oa/admin/form-types/:code
 *
 * 请求体可选字段：name, description, icon, category, allowedRoles, dataReadRoles, dataExportRoles,
 *                  allowedUsers, dataReadUsers, dataExportUsers, version
 */
export async function updateFormTypeBasic(req: Request, res: Response): Promise<void> {
  try {
    const { code } = req.params;
    const { name, description, icon, category, allowedRoles, dataReadRoles, dataExportRoles,
            allowedUsers, dataReadUsers, dataExportUsers, version } = req.body;

    // 输入类型校验
    if (name !== undefined && typeof name !== 'string') {
      res.status(400).json(buildErrorResponse(400, 'name 必须为字符串'));
      return;
    }
    if (description !== undefined && typeof description !== 'string') {
      res.status(400).json(buildErrorResponse(400, 'description 必须为字符串'));
      return;
    }
    if (icon !== undefined && typeof icon !== 'string') {
      res.status(400).json(buildErrorResponse(400, 'icon 必须为字符串'));
      return;
    }
    if (category !== undefined && typeof category !== 'string') {
      res.status(400).json(buildErrorResponse(400, 'category 必须为字符串'));
      return;
    }
    if (allowedRoles !== undefined && !Array.isArray(allowedRoles)) {
      res.status(400).json(buildErrorResponse(400, 'allowedRoles 必须为数组'));
      return;
    }
    if (dataReadRoles !== undefined && !Array.isArray(dataReadRoles)) {
      res.status(400).json(buildErrorResponse(400, 'dataReadRoles 必须为数组'));
      return;
    }
    if (dataExportRoles !== undefined && !Array.isArray(dataExportRoles)) {
      res.status(400).json(buildErrorResponse(400, 'dataExportRoles 必须为数组'));
      return;
    }
    if (allowedUsers !== undefined && (!Array.isArray(allowedUsers) || !allowedUsers.every((v: unknown) => typeof v === 'number'))) {
      res.status(400).json(buildErrorResponse(400, 'allowedUsers 必须为数字数组'));
      return;
    }
    if (dataReadUsers !== undefined && (!Array.isArray(dataReadUsers) || !dataReadUsers.every((v: unknown) => typeof v === 'number'))) {
      res.status(400).json(buildErrorResponse(400, 'dataReadUsers 必须为数字数组'));
      return;
    }
    if (dataExportUsers !== undefined && (!Array.isArray(dataExportUsers) || !dataExportUsers.every((v: unknown) => typeof v === 'number'))) {
      res.status(400).json(buildErrorResponse(400, 'dataExportUsers 必须为数字数组'));
      return;
    }
    if (version !== undefined && (typeof version !== 'number' || version < 1)) {
      res.status(400).json(buildErrorResponse(400, 'version 必须为正整数'));
      return;
    }

    // 构建动态 SET 子句
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      params.push(name);
    }
    if (description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      params.push(description);
    }
    if (icon !== undefined) {
      setClauses.push(`icon = $${paramIndex++}`);
      params.push(icon);
    }
    if (category !== undefined) {
      setClauses.push(`category = $${paramIndex++}`);
      params.push(category);
    }
    if (allowedRoles !== undefined) {
      setClauses.push(`allowed_roles = $${paramIndex++}`);
      params.push(allowedRoles.length > 0 ? allowedRoles : null);
    }
    if (dataReadRoles !== undefined) {
      setClauses.push(`data_read_roles = $${paramIndex++}`);
      params.push(dataReadRoles.length > 0 ? dataReadRoles : null);
    }
    if (dataExportRoles !== undefined) {
      setClauses.push(`data_export_roles = $${paramIndex++}`);
      params.push(dataExportRoles.length > 0 ? dataExportRoles : null);
    }
    if (allowedUsers !== undefined) {
      setClauses.push(`allowed_users = $${paramIndex++}`);
      params.push(allowedUsers.length > 0 ? allowedUsers : null);
    }
    if (dataReadUsers !== undefined) {
      setClauses.push(`data_read_users = $${paramIndex++}`);
      params.push(dataReadUsers.length > 0 ? dataReadUsers : null);
    }
    if (dataExportUsers !== undefined) {
      setClauses.push(`data_export_users = $${paramIndex++}`);
      params.push(dataExportUsers.length > 0 ? dataExportUsers : null);
    }
    // 基本信息更新不递增 version（仅流程配置保存时递增）
    setClauses.push(`updated_at = NOW()`);

    if (setClauses.length <= 1) {
      // 仅有 updated_at，没有业务字段更新
      res.status(400).json(buildErrorResponse(400, '未提供任何更新字段'));
      return;
    }

    params.push(code);

    // 乐观锁：如果传了 version，则校验版本一致性
    let whereClause = `code = $${paramIndex}`;
    if (version !== undefined) {
      paramIndex++;
      params.push(version);
      whereClause += ` AND version = $${paramIndex}`;
    }

    const result = await query(
      `UPDATE oa_form_types SET ${setClauses.join(', ')} WHERE ${whereClause}`,
      params
    );

    if (result.rowCount === 0) {
      if (version !== undefined) {
        // 检查是否是版本冲突还是不存在
        const check = await query(`SELECT version FROM oa_form_types WHERE code = $1`, [code]);
        if (check.rowCount === 0) {
          res.status(404).json(buildErrorResponse(404, '表单类型不存在'));
        } else {
          res.status(409).json(buildErrorResponse(409, '数据已被其他用户修改，请刷新后重试'));
        }
        return;
      }
      res.status(404).json(buildErrorResponse(404, '表单类型不存在'));
      return;
    }

    invalidateFormTypesCache();
    res.json(buildSuccessResponse(null, '更新成功'));
  } catch (error) {
    log.error('管理接口-更新表单基本信息失败:', error);
    res.status(500).json(buildErrorResponse(500, '更新失败'));
  }
}

/**
 * 更新表单审批流程配置（管理员调整处理人/条件/签署模式等可编辑配置）
 * PUT /api/oa/admin/form-types/:code/workflow
 *
 * 架构：代码骨架 + DB配置分层
 * - 代码（form-types/*.ts）定义流程骨架：节点顺序、类型、回调
 * - 本接口保存管理员通过 UI 调整的配置：处理人、签署模式、条件、抄送角色
 * - 运行时由 mergeWorkflowDef() 合并两层定义
 */
export async function updateFormTypeWorkflow(req: Request, res: Response): Promise<void> {
  try {
    const { code } = req.params;
    const { workflowDef, version } = req.body;

    if (!workflowDef || typeof workflowDef !== 'object' || !Array.isArray(workflowDef.nodes)) {
      res.status(400).json(buildErrorResponse(400, 'workflowDef 必须包含 nodes 数组'));
      return;
    }

    // 乐观锁：校验 version 未过期
    if (version !== undefined) {
      const current = await query<{ version: number }>(
        `SELECT version FROM oa_form_types WHERE code = $1`, [code]
      );
      if (current.rows.length > 0 && current.rows[0].version !== version) {
        res.status(409).json(buildErrorResponse(409, '数据已被其他用户修改，请刷新后重试'));
        return;
      }
    }

    const result = await query(
      `UPDATE oa_form_types SET workflow_def = $1, version = version + 1 WHERE code = $2`,
      [JSON.stringify(workflowDef), code]
    );

    if (result.rowCount === 0) {
      res.status(404).json(buildErrorResponse(404, '表单类型不存在'));
      return;
    }

    invalidateFormTypesCache();
    res.json(buildSuccessResponse(null, '流程配置已保存'));
  } catch (error) {
    log.error('管理接口-更新流程配置失败:', error);
    res.status(500).json(buildErrorResponse(500, '更新流程配置失败'));
  }
}

/**
 * 更新表单字段权限配置（管理员配置每个环节的字段可见/可编辑/隐藏）
 * PATCH /api/oa/admin/form-types/:code/field-permissions
 *
 * 请求体：{ fieldPermissions: { initiation?: {...}, nodes?: {...} } }
 */
export async function updateFieldPermissions(req: Request, res: Response): Promise<void> {
  try {
    const { code } = req.params;
    const { fieldPermissions } = req.body;

    // 校验输入
    if (fieldPermissions !== null && typeof fieldPermissions !== 'object') {
      res.status(400).json(buildErrorResponse(400, 'fieldPermissions 必须为对象或 null'));
      return;
    }

    // 校验权限值合法性（只允许 nodes 键，不再允许 initiation）
    const validPerms = new Set(['editable', 'readonly', 'hidden']);
    if (fieldPermissions) {
      for (const [section, perms] of Object.entries(fieldPermissions)) {
        if (section !== 'nodes') {
          res.status(400).json(buildErrorResponse(400, `不支持的配置节: ${section}，仅允许 nodes（initiation 已废弃，请使用 nodes["0"] 代替）`));
          return;
        }
        for (const [nodeOrder, nodePerms] of Object.entries(perms as Record<string, Record<string, string>>)) {
          for (const [field, perm] of Object.entries(nodePerms)) {
            if (!validPerms.has(perm)) {
              res.status(400).json(buildErrorResponse(400, `节点${nodeOrder}字段 ${field} 的权限值 ${perm} 不合法，仅允许 editable/readonly/hidden`));
              return;
            }
          }
        }
      }
    }

    // 校验全量完整性：每个节点必须为所有业务字段声明权限
    const codeDef = getFormTypeByCode(code);
    if (codeDef && fieldPermissions) {
      const { valid, missing } = validateCompleteness(
        codeDef.formSchema,
        codeDef.workflowDef,
        fieldPermissions as FieldPermissionsOverride
      );
      if (!valid) {
        const missingDesc = missing.map(m => `节点${m.node}: ${m.fields.join(', ')}`).join('; ');
        res.status(400).json(buildErrorResponse(400, `字段权限配置不完整，缺失: ${missingDesc}`));
        return;
      }
    }

    const result = await query(
      `UPDATE oa_form_types SET field_permissions = $1 WHERE code = $2`,
      [fieldPermissions ? JSON.stringify(fieldPermissions) : null, code]
    );

    if (result.rowCount === 0) {
      res.status(404).json(buildErrorResponse(404, '表单类型不存在'));
      return;
    }

    invalidateFormTypesCache();
    res.json(buildSuccessResponse(null, '字段权限已保存'));
  } catch (error) {
    log.error('管理接口-更新字段权限失败:', error);
    res.status(500).json(buildErrorResponse(500, '更新字段权限失败'));
  }
}

/**
 * 获取系统所有岗位列表（供前端配置审批人时使用）
 * GET /api/oa/admin/roles
 */
export async function listRolesForAdmin(req: Request, res: Response): Promise<void> {
  try {
    const result = await query(
      `SELECT code, name, description FROM roles WHERE status = 1 ORDER BY code`
    );

    res.json(buildSuccessResponse(result.rows));
  } catch (error) {
    log.error('管理接口-获取岗位列表失败:', error);
    res.status(500).json(buildErrorResponse(500, '获取岗位列表失败'));
  }
}

/**
 * 更新表单查看权限配置（管理员配置非办理人查看详情的字段可见性）
 * PATCH /api/oa/admin/form-types/:code/view-permissions
 *
 * 请求体：{ viewPermissions: { nodes: { "0": {...}, "1": {...} } } | null }
 */
export async function updateViewPermissions(req: Request, res: Response): Promise<void> {
  try {
    const { code } = req.params;
    const { viewPermissions } = req.body;

    // 校验输入
    if (viewPermissions !== null && typeof viewPermissions !== 'object') {
      res.status(400).json(buildErrorResponse(400, 'viewPermissions 必须为对象或 null'));
      return;
    }

    // 校验权限值合法性（允许 nodes 和 dataRead 键，权限值仅允许 readonly/hidden）
    const validPerms = new Set(['readonly', 'hidden']);
    const validSections = new Set(['nodes', 'dataRead']);
    if (viewPermissions) {
      for (const [section, perms] of Object.entries(viewPermissions)) {
        if (!validSections.has(section)) {
          res.status(400).json(buildErrorResponse(400, `不支持的配置节: ${section}，仅允许 nodes 和 dataRead`));
          return;
        }
        if (section === 'nodes') {
          for (const [nodeOrder, nodePerms] of Object.entries(perms as Record<string, Record<string, string>>)) {
            for (const [field, perm] of Object.entries(nodePerms)) {
              if (!validPerms.has(perm)) {
                res.status(400).json(buildErrorResponse(400, `节点${nodeOrder}字段 ${field} 的查看权限值 ${perm} 不合法，仅允许 readonly/hidden`));
                return;
              }
            }
          }
        } else if (section === 'dataRead') {
          for (const [field, perm] of Object.entries(perms as Record<string, string>)) {
            if (!validPerms.has(perm)) {
              res.status(400).json(buildErrorResponse(400, `数据查看人字段 ${field} 的查看权限值 ${perm} 不合法，仅允许 readonly/hidden`));
              return;
            }
          }
        }
      }
    }

    // 校验全量完整性：每个节点必须为所有业务字段声明查看权限
    const codeDef = getFormTypeByCode(code);
    if (codeDef && viewPermissions) {
      // 查询表单的 dataReadRoles 和 dataReadUsers（从 DB 获取，代码定义中不包含这些字段）
      const ftRow = await query<{ data_read_roles: string[] | null; data_read_users: number[] | null }>(
        `SELECT data_read_roles, data_read_users FROM oa_form_types WHERE code = $1`, [code]
      );
      const dataReadRoles = ftRow.rows[0]?.data_read_roles || null;
      const dataReadUsers = ftRow.rows[0]?.data_read_users || null;

      const { valid, missing } = validateViewCompleteness(
        codeDef.formSchema,
        codeDef.workflowDef,
        viewPermissions as ViewPermissionsOverride,
        dataReadRoles,
        dataReadUsers
      );
      if (!valid) {
        const missingDesc = missing.map(m => {
          const label = m.node === 'dataRead' ? '数据查看人' : `节点${m.node}`;
          return `${label}: ${m.fields.join(', ')}`;
        }).join('; ');
        res.status(400).json(buildErrorResponse(400, `查看权限配置不完整，缺失: ${missingDesc}`));
        return;
      }
    }

    const result = await query(
      `UPDATE oa_form_types SET view_permissions = $1 WHERE code = $2`,
      [viewPermissions ? JSON.stringify(viewPermissions) : null, code]
    );

    if (result.rowCount === 0) {
      res.status(404).json(buildErrorResponse(404, '表单类型不存在'));
      return;
    }

    invalidateFormTypesCache();
    res.json(buildSuccessResponse(null, '查看权限已保存'));
  } catch (error) {
    log.error('管理接口-更新查看权限失败:', error);
    res.status(500).json(buildErrorResponse(500, '更新查看权限失败'));
  }
}

/**
 * 批量获取用户信息（根据 ID 列表）
 * GET /api/oa/admin/users/batch?ids=1,2,3
 */
export async function batchGetUsers(req: Request, res: Response): Promise<void> {
  try {
    const idsParam = (req.query.ids as string) || '';
    const ids = idsParam.split(',').map(Number).filter(n => n > 0);
    if (ids.length === 0) {
      res.json(buildSuccessResponse([]));
      return;
    }
    const result = await query(
      'SELECT id, username AS name FROM users WHERE id = ANY($1::int[])',
      [ids]
    );
    res.json(buildSuccessResponse(result.rows));
  } catch (error) {
    log.error('批量获取用户失败:', error);
    res.status(500).json(buildErrorResponse(500, '获取用户信息失败'));
  }
}
