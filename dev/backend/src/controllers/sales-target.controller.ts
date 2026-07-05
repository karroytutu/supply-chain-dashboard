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
  buildInitialTargetData,
} from '../services/sales-target';
import { enrichWithHistoricalSales } from '../services/sales-target/sales-target-historical.service';
import { fromSaveItemDTO, validateSaveItems } from '../services/sales-target/sales-target.mapper';
import { toCamelKeys } from '../utils/keyConvert';
import { canEditMarketer } from '../services/sales-target/sales-target-utils';
import { TARGET_YEAR_MIN, TARGET_YEAR_MAX } from '../utils/constants';
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
  const marketerId = req.body.marketer_id ?? req.body.marketerId;
  if (!marketerId || !req.body.year || !req.body.month) {
    res.status(400).json({ success: false, message: '缺少必填参数：marketer_id, year, month' });
    return;
  }

  // year/month 范围校验
  const year = req.body.year;
  const month = req.body.month;
  if (year < TARGET_YEAR_MIN || year > TARGET_YEAR_MAX) {
    res.status(400).json({ success: false, message: `year 必须在 ${TARGET_YEAR_MIN}-${TARGET_YEAR_MAX} 之间` });
    return;
  }
  if (month < 1 || month > 12) {
    res.status(400).json({ success: false, message: 'month 必须在 1-12 之间' });
    return;
  }

  // 请求体校验
  const validationError = validateSaveItems(req.body.items);
  if (validationError) {
    res.status(400).json({ success: false, message: validationError });
    return;
  }

  // 归属校验：非 admin/manager 角色只能编辑自己的目标
  const user = req.user;
  if (!user || !canEditMarketer(user.roles || [], user.userId, marketerId)) {
    res.status(403).json({ success: false, message: '无权编辑该营销师的目标' });
    return;
  }

  // 审批状态校验：检查该营销师当月是否已有 pending/approved 状态的目标
  const existingList = await queryTargetList({ marketer_id: marketerId, year, month });
  if (existingList.length > 0 && existingList[0].status === 'pending') {
    res.status(400).json({ success: false, message: '该营销师本月目标正在审批中，不允许修改' });
    return;
  }
  if (existingList.length > 0 && existingList[0].status === 'approved') {
    res.status(400).json({ success: false, message: '该营销师本月目标已审批通过，如需修改请先确认回退' });
    return;
  }

  const params: SaveTargetParams = {
    marketer_id: marketerId,
    year,
    month,
    items: (req.body.items || []).map(fromSaveItemDTO),
  };

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

  // 请求体校验
  const validationError = validateSaveItems(req.body.items);
  if (validationError) {
    res.status(400).json({ success: false, message: validationError });
    return;
  }

  // 归属校验：查目标记录确认归属
  const existing = await queryTargetDetail(id);
  if (!existing) {
    res.status(404).json({ success: false, message: '目标不存在' });
    return;
  }
  const editUser = req.user;
  if (!editUser || !canEditMarketer(editUser.roles || [], editUser.userId, existing.marketer_id)) {
    res.status(403).json({ success: false, message: '无权编辑该营销师的目标' });
    return;
  }

  // 审批状态校验：仅 pending 状态不允许修改（approved 允许修改，repository 会自动重置为 draft）
  if (existing.status === 'pending') {
    res.status(400).json({ success: false, message: '目标正在审批中，不允许修改' });
    return;
  }

  const items = (req.body.items || []).map(fromSaveItemDTO);

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

  // 归属校验
  const delExisting = await queryTargetDetail(id);
  if (!delExisting) {
    res.status(404).json({ success: false, message: '目标不存在' });
    return;
  }
  const delUser = req.user;
  if (!delUser || !canEditMarketer(delUser.roles || [], delUser.userId, delExisting.marketer_id)) {
    res.status(403).json({ success: false, message: '无权删除该营销师的目标' });
    return;
  }

  // 审批状态校验：pending/approved 状态不允许删除
  if (delExisting.status === 'pending') {
    res.status(400).json({ success: false, message: '目标正在审批中，不允许删除' });
    return;
  }
  if (delExisting.status === 'approved') {
    res.status(400).json({ success: false, message: '目标已审批通过，不允许删除' });
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
      await enrichWithHistoricalSales(detail.customers, year, month);
      res.json(toCamelKeys({
        is_saved: true,
        target_id: detail.id,
        status: detail.status,
        oa_instance_id: detail.oa_instance_id,
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
  // 补充上上月销售数据，使环比计算正确
  await enrichWithHistoricalSales(initData.customers, year, month);
  res.json(toCamelKeys(initData));
}
