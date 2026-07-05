/**
 * 目标管理 - 辅助查询控制器
 * 负责概览、营销师列表、客户列表、商品目录、历史销售等只读查询
 */

import { Request, Response } from 'express';
import {
  getMarketerErpStaffIds,
  getMarketerStaffId,
  getMarketerUsers,
  getCustomerList,
  getProductCatalog,
  getHistoricalSales,
  getOverviewData,
} from '../services/sales-target';
import { toCamelKeys } from '../utils/keyConvert';

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
  const marketers = await getMarketerUsers();
  res.json(toCamelKeys(marketers));
}

/**
 * GET /api/sales/targets/customers
 * 获取客户列表（含公海标记 + 归属标记）
 */
export async function customersHandler(req: Request, res: Response): Promise<void> {
  const marketerErpStaffIds = await getMarketerErpStaffIds();
  const marketerId = req.query.marketer_id ? parseInt(req.query.marketer_id as string, 10) : null;
  const targetStaffId = marketerId ? await getMarketerStaffId(marketerId) : null;
  const customers = await getCustomerList(targetStaffId, marketerErpStaffIds);
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
