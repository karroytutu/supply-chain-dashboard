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
import type { OaFormTypeRow } from '../services/oa/oa.types';
import { mapFormTypeRow } from '../services/oa/oa-utils';

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
 * 更新表单基本信息（名称、描述、图标、可发起岗位）
 * PATCH /api/oa/admin/form-types/:code
 *
 * 请求体可选字段：name, description, icon, allowedRoles
 */
export async function updateFormTypeBasic(req: Request, res: Response): Promise<void> {
  try {
    const { code } = req.params;
    const { name, description, icon, allowedRoles, dataReadRoles, dataExportRoles } = req.body;

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

    if (setClauses.length === 0) {
      res.status(400).json(buildErrorResponse(400, '未提供任何更新字段'));
      return;
    }

    params.push(code);
    const result = await query(
      `UPDATE oa_form_types SET ${setClauses.join(', ')} WHERE code = $${paramIndex}`,
      params
    );

    if (result.rowCount === 0) {
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
 * 更新表单审批流程配置（含乐观锁并发保护）
 * PUT /api/oa/admin/form-types/:code/workflow
 *
 * 请求体必须包含：workflowDef（完整流程定义）和 version（当前版本号）
 * 使用 version 作为乐观锁：UPDATE ... WHERE code = $1 AND version = $2
 * 若 affected rows = 0，返回 409 Conflict
 */
export async function updateFormTypeWorkflow(req: Request, res: Response): Promise<void> {
  try {
    const { code } = req.params;
    const { workflowDef, version } = req.body;

    if (!workflowDef || version === undefined) {
      res.status(400).json(buildErrorResponse(400, '缺少 workflowDef 或 version 参数'));
      return;
    }

    // 乐观锁：仅当版本号匹配时才更新
    const result = await query(
      `UPDATE oa_form_types
       SET workflow_def = $1::jsonb, version = version + 1
       WHERE code = $2 AND version = $3`,
      [JSON.stringify(workflowDef), code, version]
    );

    if (result.rowCount === 0) {
      // 检查表单是否存在
      const checkResult = await query(
        `SELECT version FROM oa_form_types WHERE code = $1`,
        [code]
      );

      if (checkResult.rowCount === 0) {
        res.status(404).json(buildErrorResponse(404, '表单类型不存在'));
        return;
      }

      // 版本号不匹配，并发冲突
      const currentVersion = checkResult.rows[0].version;
      res.status(409).json({
        code: 409,
        message: '数据已被其他用户修改，请刷新后重试',
        data: { currentVersion },
      });
      return;
    }

    invalidateFormTypesCache();
    res.json(buildSuccessResponse(null, '流程配置更新成功'));
  } catch (error) {
    log.error('管理接口-更新流程配置失败:', error);
    res.status(500).json(buildErrorResponse(500, '更新流程配置失败'));
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
