/**
 * 战略商品导出工具函数
 */
import * as XLSX from 'xlsx';
import type { StrategicProduct, StrategicProductStatus } from '@/types/strategic-product';

/**
 * 状态格式化映射
 */
const STATUS_MAP: Record<StrategicProductStatus, string> = {
  pending: '待确认',
  confirmed: '已确认',
  rejected: '已驳回',
};

/**
 * 布尔值格式化
 */
function formatBoolean(value: boolean | null | undefined): string {
  if (value === true) return '已确认';
  if (value === false) return '待确认';
  return '-';
}

/**
 * 日期时间格式化
 */
function formatDateTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '-';
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (isNaN(date.getTime())) return '-';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 状态格式化
 */
function formatStatus(status: StrategicProductStatus): string {
  return STATUS_MAP[status] || status;
}

/**
 * Excel 列配置
 */
interface ExportColumn {
  field: keyof StrategicProduct | string;
  header: string;
  formatter?: (value: unknown, record: StrategicProduct) => string | number;
}

const EXPORT_COLUMNS: ExportColumn[] = [
  { field: 'goodsId', header: '商品编码' },
  { field: 'goodsName', header: '商品名称' },
  { field: 'categoryPath', header: '品类路径' },
  { field: 'status', header: '状态', formatter: (value) => formatStatus(value as StrategicProductStatus) },
  { field: 'procurementConfirmed', header: '采购确认', formatter: (value) => formatBoolean(value as boolean) },
  { field: 'procurementConfirmerName', header: '采购确认人' },
  { field: 'procurementConfirmedAt', header: '采购确认时间', formatter: (value) => formatDateTime(value as string) },
  { field: 'marketingConfirmed', header: '营销确认', formatter: (value) => formatBoolean(value as boolean) },
  { field: 'marketingConfirmerName', header: '营销确认人' },
  { field: 'marketingConfirmedAt', header: '营销确认时间', formatter: (value) => formatDateTime(value as string) },
  { field: 'createdAt', header: '提交时间', formatter: (value) => formatDateTime(value as string) },
  { field: 'confirmedAt', header: '最终确认时间', formatter: (value) => formatDateTime(value as string) },
];

/**
 * 导出战略商品数据到 Excel
 * @param data 战略商品数据列表
 * @param filename 文件名（可选，默认为"战略商品列表_时间.xlsx"）
 */
export function exportStrategicProducts(
  data: StrategicProduct[],
  filename?: string
): void {
  if (!data || data.length === 0) {
    console.warn('没有数据可导出');
    return;
  }

  // 转换数据为 Excel 格式
  const rows = data.map((record) => {
    const row: Record<string, string | number> = {};
    EXPORT_COLUMNS.forEach((col) => {
      const value = (record as unknown as Record<string, unknown>)[col.field];
      row[col.header] = col.formatter
        ? col.formatter(value, record)
        : (value as string | number) ?? '-';
    });
    return row;
  });

  // 创建工作表
  const worksheet = XLSX.utils.json_to_sheet(rows);

  // 设置列宽
  const colWidths = [
    { wch: 15 }, // 商品编码
    { wch: 30 }, // 商品名称
    { wch: 40 }, // 品类路径
    { wch: 10 }, // 状态
    { wch: 10 }, // 采购确认
    { wch: 12 }, // 采购确认人
    { wch: 20 }, // 采购确认时间
    { wch: 10 }, // 营销确认
    { wch: 12 }, // 营销确认人
    { wch: 20 }, // 营销确认时间
    { wch: 20 }, // 提交时间
    { wch: 20 }, // 最终确认时间
  ];
  worksheet['!cols'] = colWidths;

  // 创建工作簿
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '战略商品列表');

  // 生成文件名
  const defaultFilename = `战略商品列表_${new Date().toISOString().slice(0, 10)}.xlsx`;
  const finalFilename = filename || defaultFilename;

  // 导出文件
  XLSX.writeFile(workbook, finalFilename);
}
