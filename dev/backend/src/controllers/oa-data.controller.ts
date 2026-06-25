/**
 * OA数据管理控制器
 * @module controllers/oa-data.controller
 */
import { createLogger } from '../utils/logger';
const log = createLogger('OaData');

import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { getDataListAll } from '../services/oa/oa.query';
import { appQuery } from '../db/appPool';
import {
  getDataListForExport,
  generateExportHtml,
  generateExportExcel,
} from '../services/oa/queries/data-query';
import { ApprovalListParams } from '../services/oa/oa.types';
import { buildSuccessResponse, buildErrorResponse } from '../utils/response';

/**
 * 根据用户岗位/用户ID查询其有权查看/导出的表单类型编码列表
 * @param userRoles 用户角色编码列表
 * @param column 'data_read_roles' | 'data_export_roles'
 * @param userColumn 'data_read_users' | 'data_export_users'
 * @param userId 当前用户 ID
 */
async function getAccessibleFormTypeCodes(
  userRoles: string[],
  column: 'data_read_roles' | 'data_export_roles',
  userColumn: 'data_read_users' | 'data_export_users',
  userId?: number
): Promise<string[]> {
  if ((!userRoles || userRoles.length === 0) && !userId) return [];

  // 三段式权限判断逻辑：
  // 1. 两维度都未配置（NULL）= 不受限，所有人可访问
  // 2. 岗位维度已配置且匹配当前用户角色
  // 3. 用户维度已配置且匹配当前用户 ID（$2 != 0 防止未登录 fallback）
  const result = await appQuery<{ code: string }>(
    `SELECT code FROM oa_form_types
     WHERE is_active = true
       AND (
         (${column} IS NULL AND ${userColumn} IS NULL)
         OR (${column} IS NOT NULL AND ${column} && $1::text[])
         OR (${userColumn} IS NOT NULL AND $2 != 0 AND $2 = ANY(${userColumn}))
       )
     ORDER BY code`,
    [userRoles || [], userId || 0]
  );

  return result.rows.map(r => r.code);
}

/**
 * 获取数据列表
 * GET /api/oa/data
 */
export async function getDataList(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json(buildErrorResponse(401, '未登录'));
      return;
    }

    // 根据用户岗位查询其有权查看的表单类型
    const userRoles = req.user?.roles || [];
    const accessibleCodes = await getAccessibleFormTypeCodes(userRoles, 'data_read_roles', 'data_read_users', userId);

    // 前端请求拦截器自动将 camelCase 参数转为 snake_case，后端统一按 snake_case 读取
    const params: ApprovalListParams = {
      viewMode: 'my', // 数据管理默认查看所有
      formTypeCode: req.query.form_type_code as string,
      allowedFormTypeCodes: accessibleCodes,
      status: req.query.status as ApprovalListParams['status'],
      startDate: req.query.start_date as string,
      endDate: req.query.end_date as string,
      keyword: req.query.keyword as string,
      applicantName: req.query.applicant_name as string,
      page: parseInt(req.query.page as string) || 1,
      pageSize: parseInt(req.query.page_size as string) || 20,
    };

    // 参数校验：确保 pageSize 为合法值
    if (!params.pageSize || params.pageSize < 1 || params.pageSize > 100) {
      params.pageSize = 20;
    }

    // 数据管理查看所有审批数据（不限视图模式）
    const result = await getDataListAll(params);

    res.json(buildSuccessResponse(result));
  } catch (error) {
    log.error('获取数据列表失败:', error);
    res.status(500).json(buildErrorResponse(500, '获取数据列表失败'));
  }
}

/**
 * 导出数据
 * GET /api/oa/data/export
 */
export async function exportData(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json(buildErrorResponse(401, '未登录'));
      return;
    }

    // 根据用户岗位查询其有权导出的表单类型
    const userRoles = req.user?.roles || [];
    const accessibleCodes = await getAccessibleFormTypeCodes(userRoles, 'data_export_roles', 'data_export_users', userId);

    const exportType = req.query.export_type as string;
    const params: ApprovalListParams = {
      viewMode: 'my',
      formTypeCode: req.query.form_type_code as string,
      allowedFormTypeCodes: accessibleCodes,
      status: req.query.status as ApprovalListParams['status'],
      startDate: req.query.start_date as string,
      endDate: req.query.end_date as string,
      keyword: req.query.keyword as string,
      applicantName: req.query.applicant_name as string,
      page: 1,
      pageSize: 10000,
    };

    const data = await getDataListForExport(params);

    if (exportType === 'print') {
      res.json(buildSuccessResponse({ html: generateExportHtml(data) }));
      return;
    }

    const exportsDir = path.join(__dirname, '../../uploads/oa-exports');
    await fs.promises.mkdir(exportsDir, { recursive: true });

    // 清理 24 小时前的临时导出文件（异步执行，不阻塞当前请求）
    cleanupOldExports(exportsDir).catch(() => {});

    const timestamp = Date.now();

    if (exportType === 'excel') {
      const fileName = `oa-export-${timestamp}.xlsx`;
      const filePath = path.join(exportsDir, fileName);
      await generateExportExcel(data, filePath);
      res.json(buildSuccessResponse({ url: `/api/oa/data/export/download/${fileName}` }));
      return;
    }

    if (exportType === 'pdf') {
      // PDF 先提供 HTML 模板预览输出，用户可在浏览器中打印为 PDF
      const fileName = `oa-export-${timestamp}.html`;
      const filePath = path.join(exportsDir, fileName);
      await fs.promises.writeFile(filePath, generateExportHtml(data), 'utf-8');
      res.json(buildSuccessResponse({ url: `/api/oa/data/export/download/${fileName}` }));
      return;
    }

    res.status(400).json(buildErrorResponse(400, '不支持的导出类型'));
  } catch (error) {
    log.error('导出数据失败:', error);
    res.status(500).json(buildErrorResponse(500, '导出数据失败'));
  }
}

/** 清理超过 24 小时的临时导出文件（单文件失败不影响其他文件清理） */
async function cleanupOldExports(exportsDir: string): Promise<void> {
  try {
    const entries = await fs.promises.readdir(exportsDir);
    const now = Date.now();
    const maxAgeMs = 24 * 60 * 60 * 1000;
    for (const entry of entries) {
      try {
        const filePath = path.join(exportsDir, entry);
        const stat = await fs.promises.stat(filePath);
        if (now - stat.mtimeMs > maxAgeMs) {
          await fs.promises.unlink(filePath);
        }
      } catch {
        // 单个文件清理失败不影响其他文件
      }
    }
  } catch (err) {
    log.error('清理临时导出文件失败:', err);
  }
}

/**
 * 带鉴权的导出文件下载
 * 通过 API 路由而非静态文件服务，确保只有登录用户可下载
 */
export async function downloadExport(req: Request, res: Response): Promise<void> {
  try {
    const fileName = req.params.fileName;

    // 文件名格式校验，防止路径穿越
    if (!/^oa-export-\d+\.(xlsx|html)$/.test(fileName)) {
      res.status(400).json(buildErrorResponse(400, '非法文件名'));
      return;
    }

    const exportsDir = path.join(__dirname, '../../uploads/oa-exports');
    const filePath = path.join(exportsDir, fileName);

    if (!fs.existsSync(filePath)) {
      res.status(404).json(buildErrorResponse(404, '文件不存在或已过期'));
      return;
    }

    res.download(filePath);
  } catch (error) {
    log.error('下载导出文件失败:', error);
    res.status(500).json(buildErrorResponse(500, '下载失败'));
  }
}
