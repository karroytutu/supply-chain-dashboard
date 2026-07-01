/**
 * 目标管理控制器
 */

import { Request, Response } from 'express';
import { createLogger } from '../utils/logger';
const log = createLogger('SalesTarget-Ctrl');

import {
  queryTargetList,
  queryTargetDetail,
  saveTarget,
  updateTarget,
  removeTarget,
  getMarketerErpStaffIds,
  getMarketerStaffId,
  getCustomerList,
  getProductCatalog,
  getHistoricalSales,
  buildInitialTargetData,
  getOverviewData,
} from '../services/sales-target';
import { toCamelKeys } from '../utils/keyConvert';
import { appQuery } from '../db/appPool';
import { ROLE_CODES } from '../utils/constants';
import type { SaveTargetParams, TargetListQuery } from '../services/sales-target/sales-target.types';

/**
 * GET /api/sales/targets
 * 查询目标列表
 */
export async function listHandler(req: Request, res: Response): Promise<void> {
  const query: TargetListQuery = {
    marketer_id: req.query.marketer_id ? parseInt(req.query.marketer_id as string, 10) : undefined,
    year: req.query.year ? parseInt(req.query.year as string, 10) : undefined,
    month: req.query.month ? parseInt(req.query.month as string, 10) : undefined,
  };

  const targets = await queryTargetList(query);
  res.json(toCamelKeys(targets));
}

/**
 * GET /api/sales/targets/:id
 * 查询目标详情
 */
export async function detailHandler(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ success: false, message: '无效的目标ID' });
    return;
  }

  const detail = await queryTargetDetail(id);
  if (!detail) {
    res.status(404).json({ success: false, message: '目标不存在' });
    return;
  }

  res.json(toCamelKeys(detail));
}

/**
 * POST /api/sales/targets
 * 创建目标
 */
export async function createHandler(req: Request, res: Response): Promise<void> {
  const params: SaveTargetParams = {
    marketer_id: req.body.marketer_id ?? req.body.marketerId,
    year: req.body.year,
    month: req.body.month,
    items: (req.body.items || []).map((item: Record<string, unknown>) => ({
      erp_consumer_id: item.erp_consumer_id ?? item.erpConsumerId ?? null,
      consumer_name: item.consumer_name ?? item.consumerName ?? '',
      is_planned_new: item.is_planned_new ?? item.isPlannedNew ?? false,
      erp_goods_id: item.erp_goods_id ?? item.erpGoodsId ?? null,
      goods_name: item.goods_name ?? item.goodsName ?? '',
      category_name: item.category_name ?? item.categoryName ?? null,
      unit: item.unit ?? null,
      unit_price: item.unit_price ?? item.unitPrice ?? null,
      target_amount: item.target_amount ?? item.targetAmount ?? 0,
      remark: item.remark ?? '',
    })),
  };

  if (!params.marketer_id || !params.year || !params.month) {
    res.status(400).json({ success: false, message: '缺少必填参数：marketer_id, year, month' });
    return;
  }

  const target = await saveTarget(params);
  res.status(201).json(toCamelKeys(target));
}

/**
 * PUT /api/sales/targets/:id
 * 更新目标明细
 */
export async function updateHandler(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ success: false, message: '无效的目标ID' });
    return;
  }

  const items = (req.body.items || []).map((item: Record<string, unknown>) => ({
    erp_consumer_id: item.erp_consumer_id ?? item.erpConsumerId ?? null,
    consumer_name: item.consumer_name ?? item.consumerName ?? '',
    is_planned_new: item.is_planned_new ?? item.isPlannedNew ?? false,
    erp_goods_id: item.erp_goods_id ?? item.erpGoodsId ?? null,
    goods_name: item.goods_name ?? item.goodsName ?? '',
    category_name: item.category_name ?? item.categoryName ?? null,
    unit: item.unit ?? null,
    unit_price: item.unit_price ?? item.unitPrice ?? null,
    target_amount: item.target_amount ?? item.targetAmount ?? 0,
    remark: item.remark ?? '',
  }));

  await updateTarget(id, items);
  res.json({ success: true, message: '更新成功' });
}

/**
 * DELETE /api/sales/targets/:id
 * 删除目标
 */
export async function deleteHandler(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ success: false, message: '无效的目标ID' });
    return;
  }

  await removeTarget(id);
  res.json({ success: true, message: '删除成功' });
}

/**
 * GET /api/sales/targets/init-data
 * 获取初始化数据（已有目标 或 从 ERP 上月销售构建）
 */
export async function initDataHandler(req: Request, res: Response): Promise<void> {
  const marketerId = req.query.marketer_id ? parseInt(req.query.marketer_id as string, 10) : null;
  const year = req.query.year ? parseInt(req.query.year as string, 10) : new Date().getFullYear();
  const month = req.query.month ? parseInt(req.query.month as string, 10) : new Date().getMonth() + 1;

  if (!marketerId) {
    res.status(400).json({ success: false, message: '缺少 marketer_id 参数' });
    return;
  }

  // 先检查是否已有保存的目标
  const list = await queryTargetList({ marketer_id: marketerId, year, month });
  if (list.length > 0) {
    const detail = await queryTargetDetail(list[0].id);
    if (detail) {
      res.json(toCamelKeys({
        is_saved: true,
        target_id: detail.id,
        marketer_id: detail.marketer_id,
        marketer_name: detail.marketer_name,
        year: detail.year,
        month: detail.month,
        customers: detail.customers,
      }));
      return;
    }
  }

  // 无已保存目标，从 ERP 构建初始数据
  const initData = await buildInitialTargetData(marketerId, year, month);
  res.json(toCamelKeys(initData));
}

/**
 * GET /api/sales/targets/overview
 * 获取概览汇总数据（全部营销师的目标概览）
 */
export async function overviewHandler(req: Request, res: Response): Promise<void> {
  const year = req.query.year ? parseInt(req.query.year as string, 10) : new Date().getFullYear();
  const month = req.query.month ? parseInt(req.query.month as string, 10) : new Date().getMonth() + 1;

  const data = await getOverviewData(year, month);
  res.json(toCamelKeys(data));
}

/**
 * GET /api/sales/targets/marketers
 * 获取系统内营销师列表
 */
export async function marketersHandler(_req: Request, res: Response): Promise<void> {
  const result = await appQuery(
    `SELECT u.id, u.name
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE r.code = $1 AND u.status = 1
     ORDER BY u.name`,
    [ROLE_CODES.MARKETER]
  );
  res.json(toCamelKeys(result.rows));
}

/**
 * GET /api/sales/targets/customers
 * 获取客户列表（我的客户 + 公海客户标记）
 */
export async function customersHandler(_req: Request, res: Response): Promise<void> {
  const marketerErpStaffIds = await getMarketerErpStaffIds();
  // 暂不区分当前营销师，返回全量客户列表（含公海标记）
  const customers = await getCustomerList(null, marketerErpStaffIds);
  res.json(toCamelKeys(customers));
}

/**
 * GET /api/sales/targets/products
 * 获取 ERP 商品目录（按品类分组）
 */
export async function productsHandler(_req: Request, res: Response): Promise<void> {
  const catalog = await getProductCatalog();
  res.json(toCamelKeys(catalog));
}

/**
 * GET /api/sales/targets/historical-sales
 * 获取历史销售数据（上月 + 上上月）
 */
export async function historicalSalesHandler(req: Request, res: Response): Promise<void> {
  const year = req.query.year ? parseInt(req.query.year as string, 10) : new Date().getFullYear();
  const month = req.query.month ? parseInt(req.query.month as string, 10) : new Date().getMonth() + 1;

  const data = await getHistoricalSales(year, month);
  res.json(toCamelKeys(data));
}
