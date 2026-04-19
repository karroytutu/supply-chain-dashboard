/**
 * 固定资产查询控制器
 * @module controllers/fixed-asset-query.controller
 */

import { Request, Response } from 'express';
import {
  searchErpAssets,
  getErpAssetDetail,
  getErpAssetCategories,
  getErpStaff,
  getErpDepartments,
  getErpPaymentAccounts,
  getApplications,
  getApplicationById,
} from '../services/fixed-asset';
import type { ApplicationListParams } from '../services/fixed-asset';

/** 搜索舟谱资产 */
export async function searchAssets(req: Request, res: Response): Promise<void> {
  try {
    const keyword = req.query.keyword as string || '';
    const usageStatus = req.query.usageStatus as string || '';
    const assets = await searchErpAssets(keyword, usageStatus);
    res.json({ success: true, data: assets });
  } catch (error) {
    console.error('搜索舟谱资产失败:', error);
    const message = error instanceof Error ? error.message : '搜索资产失败';
    res.status(500).json({ success: false, message });
  }
}

/** 获取舟谱资产详情 */
export async function getAssetDetail(req: Request, res: Response): Promise<void> {
  try {
    const erpAssetId = parseInt(req.params.erpAssetId);
    if (isNaN(erpAssetId)) {
      res.status(400).json({ success: false, message: '无效的资产ID' });
      return;
    }
    const asset = await getErpAssetDetail(erpAssetId);
    if (!asset) {
      res.status(404).json({ success: false, message: '资产不存在' });
      return;
    }
    res.json({ success: true, data: asset });
  } catch (error) {
    console.error('获取资产详情失败:', error);
    const message = error instanceof Error ? error.message : '获取资产详情失败';
    res.status(500).json({ success: false, message });
  }
}

/** 获取舟谱资产分类 */
export async function getCategories(req: Request, res: Response): Promise<void> {
  try {
    const categories = await getErpAssetCategories();
    res.json({ success: true, data: categories });
  } catch (error) {
    console.error('获取资产分类失败:', error);
    const message = error instanceof Error ? error.message : '获取资产分类失败';
    res.status(500).json({ success: false, message });
  }
}

/** 获取舟谱员工列表 */
export async function getStaff(req: Request, res: Response): Promise<void> {
  try {
    const staff = await getErpStaff();
    res.json({ success: true, data: staff });
  } catch (error) {
    console.error('获取舟谱员工失败:', error);
    const message = error instanceof Error ? error.message : '获取员工列表失败';
    res.status(500).json({ success: false, message });
  }
}

/** 获取舟谱部门列表 */
export async function getDepartments(req: Request, res: Response): Promise<void> {
  try {
    const departments = await getErpDepartments();
    res.json({ success: true, data: departments });
  } catch (error) {
    console.error('获取舟谱部门失败:', error);
    const message = error instanceof Error ? error.message : '获取部门列表失败';
    res.status(500).json({ success: false, message });
  }
}

/** 获取舟谱付款账户 */
export async function getPaymentAccounts(req: Request, res: Response): Promise<void> {
  try {
    const accounts = await getErpPaymentAccounts();
    res.json({ success: true, data: accounts });
  } catch (error) {
    console.error('获取付款账户失败:', error);
    const message = error instanceof Error ? error.message : '获取付款账户失败';
    res.status(500).json({ success: false, message });
  }
}

/** 获取申请列表 */
export async function listApplications(req: Request, res: Response): Promise<void> {
  try {
    const params: ApplicationListParams = {
      type: req.query.type as ApplicationListParams['type'],
      status: req.query.status as ApplicationListParams['status'],
      page: parseInt(req.query.page as string) || 1,
      pageSize: parseInt(req.query.pageSize as string) || 20,
    };

    const result = await getApplications(params);
    res.json({
      success: true,
      data: result.list,
      total: result.total,
      page: params.page,
      pageSize: params.pageSize,
    });
  } catch (error) {
    console.error('获取申请列表失败:', error);
    const message = error instanceof Error ? error.message : '获取申请列表失败';
    res.status(500).json({ success: false, message });
  }
}

/** 获取申请详情 */
export async function getApplicationDetail(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: '无效的申请ID' });
      return;
    }
    const application = await getApplicationById(id);
    if (!application) {
      res.status(404).json({ success: false, message: '申请不存在' });
      return;
    }
    res.json({ success: true, data: application });
  } catch (error) {
    console.error('获取申请详情失败:', error);
    const message = error instanceof Error ? error.message : '获取申请详情失败';
    res.status(500).json({ success: false, message });
  }
}
