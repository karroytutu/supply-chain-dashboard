/**
 * 采购绩效存档控制器
 */

import { Request, Response } from 'express';
import { getMonthlyArchiveList } from '../services/procurement-archive';

/**
 * 获取月度存档列表
 * GET /api/procurement/archive
 */
export async function getArchiveList(req: Request, res: Response): Promise<void> {
  try {
    const { page, pageSize, startMonth, endMonth } = req.query;

    const result = await getMonthlyArchiveList({
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 12,
      startMonth: startMonth as string | undefined,
      endMonth: endMonth as string | undefined,
    });

    res.json({
      success: true,
      data: result.records,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    });
  } catch (error) {
    console.error('[ProcurementArchiveController] 获取存档列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取存档列表失败',
    });
  }
}
