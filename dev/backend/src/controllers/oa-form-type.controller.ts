/**
 * OA表单类型控制器
 * @module controllers/oa-form-type.controller
 */

import { Request, Response } from 'express';
import {
  getActiveFormTypes,
  getFormTypeByCodeQuery,
  getFormTypesGroupedByCategory,
} from '../services/oa/oa-form-type.query';
import { buildSuccessResponse, buildErrorResponse } from '../utils/response';

/**
 * 获取所有表单类型
 * GET /api/oa/form-types
 */
export async function listFormTypes(req: Request, res: Response): Promise<void> {
  try {
    const formTypes = await getActiveFormTypes();
    res.json(buildSuccessResponse(formTypes));
  } catch (error) {
    console.error('获取表单类型失败:', error);
    res.status(500).json(buildErrorResponse(500, '获取表单类型失败'));
  }
}

/**
 * 获取按分类分组的表单类型
 * GET /api/oa/form-types/grouped
 */
export async function listFormTypesGrouped(req: Request, res: Response): Promise<void> {
  try {
    const grouped = await getFormTypesGroupedByCategory();
    res.json(buildSuccessResponse(grouped));
  } catch (error) {
    console.error('获取表单类型分组失败:', error);
    res.status(500).json(buildErrorResponse(500, '获取表单类型分组失败'));
  }
}

/**
 * 获取单个表单类型
 * GET /api/oa/form-types/:code
 */
export async function getFormType(req: Request, res: Response): Promise<void> {
  try {
    const { code } = req.params;
    const formType = await getFormTypeByCodeQuery(code);

    if (!formType) {
      res.status(404).json(buildErrorResponse(404, '表单类型不存在'));
      return;
    }

    res.json(buildSuccessResponse(formType));
  } catch (error) {
    console.error('获取表单类型失败:', error);
    res.status(500).json(buildErrorResponse(500, '获取表单类型失败'));
  }
}
