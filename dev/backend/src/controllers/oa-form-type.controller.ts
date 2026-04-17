/**
 * OA表单类型控制器
 * @module controllers/oa-form-type.controller
 */

import { Request, Response } from 'express';
import {
  getActiveFormTypes,
  getFormTypeByCodeQuery,
  getFormTypesGroupedByCategory,
} from '../services/oa-approval/oa-form-type.query';

/**
 * 获取所有表单类型
 * GET /api/oa-approval/form-types
 */
export async function listFormTypes(req: Request, res: Response): Promise<void> {
  try {
    const formTypes = await getActiveFormTypes();
    res.json({
      success: true,
      data: formTypes,
    });
  } catch (error) {
    console.error('获取表单类型失败:', error);
    res.status(500).json({
      success: false,
      message: '获取表单类型失败',
    });
  }
}

/**
 * 获取按分类分组的表单类型
 * GET /api/oa-approval/form-types/grouped
 */
export async function listFormTypesGrouped(req: Request, res: Response): Promise<void> {
  try {
    const grouped = await getFormTypesGroupedByCategory();
    res.json({
      success: true,
      data: grouped,
    });
  } catch (error) {
    console.error('获取表单类型分组失败:', error);
    res.status(500).json({
      success: false,
      message: '获取表单类型分组失败',
    });
  }
}

/**
 * 获取单个表单类型
 * GET /api/oa-approval/form-types/:code
 */
export async function getFormType(req: Request, res: Response): Promise<void> {
  try {
    const { code } = req.params;
    const formType = await getFormTypeByCodeQuery(code);

    if (!formType) {
      res.status(404).json({
        success: false,
        message: '表单类型不存在',
      });
      return;
    }

    res.json({
      success: true,
      data: formType,
    });
  } catch (error) {
    console.error('获取表单类型失败:', error);
    res.status(500).json({
      success: false,
      message: '获取表单类型失败',
    });
  }
}
