/**
 * 战略商品导出工具函数单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock xlsx
vi.mock('xlsx', () => ({
  utils: {
    json_to_sheet: vi.fn().mockReturnValue({}),
    book_new: vi.fn().mockReturnValue({}),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn(),
}));

vi.mock('../../../utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { exportStrategicProducts } from './export';
import * as XLSX from 'xlsx';

beforeEach(() => {
  vi.clearAllMocks();
});

const mockProduct: any = {
  id: 1,
  goodsId: 'G001',
  goodsName: '商品A',
  categoryPath: '食品/饮料',
  status: 'confirmed',
  procurementConfirmed: true,
  procurementConfirmerName: '张三',
  procurementConfirmedAt: '2026-06-01T10:00:00Z',
  marketingConfirmed: false,
  marketingConfirmerName: null,
  marketingConfirmedAt: null,
  createdAt: '2026-05-01T08:00:00Z',
  confirmedAt: '2026-06-01T12:00:00Z',
};

describe('exportStrategicProducts', () => {
  it('空数据时不导出', () => {
    exportStrategicProducts([]);
    expect(XLSX.writeFile).not.toHaveBeenCalled();
  });

  it('null 数据时不导出', () => {
    exportStrategicProducts(null as any);
    expect(XLSX.writeFile).not.toHaveBeenCalled();
  });

  it('有数据时调用 XLSX.writeFile', () => {
    exportStrategicProducts([mockProduct]);

    expect(XLSX.utils.json_to_sheet).toHaveBeenCalled();
    expect(XLSX.utils.book_new).toHaveBeenCalled();
    expect(XLSX.utils.book_append_sheet).toHaveBeenCalled();
    expect(XLSX.writeFile).toHaveBeenCalled();
  });

  it('使用自定义文件名', () => {
    exportStrategicProducts([mockProduct], 'custom.xlsx');

    expect(XLSX.writeFile).toHaveBeenCalledWith(expect.anything(), 'custom.xlsx');
  });

  it('使用默认文件名包含日期', () => {
    exportStrategicProducts([mockProduct]);

    const call = (XLSX.writeFile as any).mock.calls[0];
    expect(call[1]).toMatch(/战略商品列表_\d{4}-\d{2}-\d{2}\.xlsx/);
  });

  it('工作表名称为"战略商品列表"', () => {
    exportStrategicProducts([mockProduct]);

    expect(XLSX.utils.book_append_sheet).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      '战略商品列表'
    );
  });
});
