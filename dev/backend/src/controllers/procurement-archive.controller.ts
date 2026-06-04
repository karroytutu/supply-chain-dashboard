/**
 * 采购绩效存档控制器
 */
import { createLogger } from '../utils/logger';
const log = createLogger('ProcurementArchive');
import { Request, Response } from 'express';
import { getMonthlyArchiveList, saveMonthlyArchive } from '../services/procurement-archive';
import { buildPagedResponse, buildSuccessResponse, buildErrorResponse } from '../utils/response';

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

    res.json(buildPagedResponse(result.records, result.total, result.page, result.pageSize));
  } catch (error) {
    log.error('获取存档列表失败:', error);
    res.status(500).json(buildErrorResponse(500, '获取存档列表失败'));
  }
}

/**
 * 手动触发月度存档
 * POST /api/procurement/archive/generate
 * body: { year, month } — 不传则默认对上月进行存档
 */
export async function generateArchive(req: Request, res: Response): Promise<void> {
  try {
    const { year, month } = req.body;

    let archiveDate: Date;
    if (year && month) {
      // 对指定月份存档
      archiveDate = new Date(Number(year), Number(month) - 1, 1);
    } else {
      // 默认对上月存档
      const now = new Date();
      archiveDate = new Date(now.getFullYear(), now.getMonth(), 1);
      // 上月 = 当月1号 - 1天
      archiveDate = new Date(archiveDate.getTime() - 24 * 60 * 60 * 1000);
    }

    await saveMonthlyArchive(archiveDate, 'manual');

    res.json(
      buildSuccessResponse(
        null,
        `${archiveDate.getFullYear()}年${archiveDate.getMonth() + 1}月存档完成`
      )
    );
  } catch (error) {
    log.error('手动存档失败:', error);
    res.status(500).json(buildErrorResponse(500, '手动存档失败'));
  }
}
