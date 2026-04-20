/**
 * ERP参考数据控制器
 * 为OA审批表单提供ERP数据查询接口
 * @module controllers/erp-reference.controller
 */

import { Request, Response, NextFunction } from 'express';
import {
  searchErpAssets,
  getErpDepartments,
  getErpStaff,
  getErpPaymentAccounts,
  getErpAssetCategories,
} from '../services/fixed-asset/fixed-asset.query';
import { retryErpOperation as retryErpOp } from '../services/fixed-asset/erp-meta-utils';

/**
 * 获取ERP参考数据
 * GET /oa-approval/erp-reference/:type
 */
export async function getErpReference(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { type } = req.params;
    const keyword = req.query.keyword as string | undefined;

    let data: unknown;

    switch (type) {
      case 'assets':
        data = await searchErpAssets(keyword || '', '');
        break;

      case 'departments':
        data = await getErpDepartments();
        break;

      case 'staff':
        data = await getErpStaff();
        break;

      case 'payment-accounts':
        data = await getErpPaymentAccounts();
        break;

      case 'asset-categories':
        data = await getErpAssetCategories();
        break;

      default:
        res.status(400).json({ code: 400, message: `不支持的参考数据类型: ${type}` });
        return;
    }

    res.json({ code: 200, data });
  } catch (error) {
    next(error);
  }
}

/**
 * 重试失败的ERP操作
 * POST /oa-approval/instances/:id/retry-erp
 */
export async function retryErpOperation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const instanceId = Number(req.params.id);
    if (isNaN(instanceId)) {
      res.status(400).json({ code: 400, message: '无效的实例ID' });
      return;
    }
    await retryErpOp(instanceId);
    res.json({ code: 200, message: 'ERP重试已触发' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ERP重试失败';
    res.status(500).json({ code: 500, message });
  }
}
