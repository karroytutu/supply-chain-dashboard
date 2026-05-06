/**
 * 客户授信营业执照后补上传 - 控制器
 * @module controllers/credit-license.controller
 */

import { Request, Response } from 'express';
import {
  supplementLicense,
  getMyDeferredUploads,
  getDeferredUploads,
  getDeferredByInstanceId,
} from '../services/credit-license';
import { resolveLicenseFilePath } from '../middleware/credit-upload';
import { buildSuccessResponse, buildErrorResponse, buildPagedResponse, handleMutationError } from '../utils/response';

/** 补交营业执照 */
export const supplementLicenseController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json(buildErrorResponse(401, '无法获取操作人信息'));
    }

    const oaInstanceId = parseInt(req.params.instanceId);
    if (isNaN(oaInstanceId)) {
      return res.status(400).json(buildErrorResponse(400, '无效的审批实例ID'));
    }

    const customerId = parseInt(req.body.customerId);
    if (isNaN(customerId)) {
      return res.status(400).json(buildErrorResponse(400, '无效的客户ID'));
    }

    // multer 上传的文件 → 构造 URL → 解析为文件系统路径
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json(buildErrorResponse(400, '请上传营业执照图片'));
    }

    const filePaths = files.map(f => {
      const url = `/uploads/credit-license/${f.filename}`;
      return resolveLicenseFilePath(url);
    });

    const result = await supplementLicense(oaInstanceId, filePaths, customerId);
    res.json(buildSuccessResponse(result, '营业执照补交成功'));
  } catch (error) {
    handleMutationError(res, error, '营业执照补交失败');
  }
};

/** 营销员查看自己的待补交列表 */
export const listMyDeferredUploadsController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json(buildErrorResponse(401, '无法获取操作人信息'));
    }

    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt((req.query.page_size as string) || (req.query.pageSize as string)) || 10;
    const status = req.query.status as string | undefined;

    const result = await getMyDeferredUploads(userId, {
      page,
      pageSize,
      status: status as any,
    });

    res.json(buildPagedResponse(result.list, result.total, result.page, result.pageSize));
  } catch (error) {
    console.error('[CreditLicenseController] 查询我的待补交列表失败:', error);
    res.status(500).json(buildErrorResponse(500, '查询失败'));
  }
};

/** 管理视图：查询所有延期补交记录 */
export const listDeferredUploadsController = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt((req.query.page_size as string) || (req.query.pageSize as string)) || 10;
    const status = req.query.status as string | undefined;
    const applicantId = req.query.applicantId ? parseInt(req.query.applicantId as string) : undefined;

    const result = await getDeferredUploads({
      page,
      pageSize,
      status: status as any,
      applicantId,
    });

    res.json(buildPagedResponse(result.list, result.total, result.page, result.pageSize));
  } catch (error) {
    console.error('[CreditLicenseController] 查询延期补交列表失败:', error);
    res.status(500).json(buildErrorResponse(500, '查询失败'));
  }
};

/** 根据审批实例ID查询延期补交记录 */
export const getDeferredByInstanceController = async (req: Request, res: Response) => {
  try {
    const oaInstanceId = parseInt(req.params.instanceId);
    if (isNaN(oaInstanceId)) {
      return res.status(400).json(buildErrorResponse(400, '无效的审批实例ID'));
    }

    const result = await getDeferredByInstanceId(oaInstanceId);
    if (!result) {
      return res.status(404).json(buildErrorResponse(404, '未找到延期补交记录'));
    }

    res.json(buildSuccessResponse(result));
  } catch (error) {
    console.error('[CreditLicenseController] 查询延期补交记录失败:', error);
    res.status(500).json(buildErrorResponse(500, '查询失败'));
  }
};
