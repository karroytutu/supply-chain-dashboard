/**
 * 应收账款全景看板 - 前端展示常量
 * 仅保留 UI 展示相关的映射表，数据由后端 API 提供
 */

// ============================================
// KPI 卡片颜色映射（后端不返回 UI 属性）
// ============================================

export const KPI_COLOR_MAP: Record<string, string> = {
  totalReceivable: '#1890ff',
  overdueAmount: '#f5222d',
  customerCount: '#fa8c16',
  dso: '#13c2c2',
  collectingTasks: '#1890ff',
  upcomingExpiry: '#faad14',
};

// ============================================
// 管道节点颜色映射
// ============================================

export const NODE_COLOR_MAP: Record<string, string> = {
  collecting: '#1890ff',
  extension: '#faad14',
  'escalated_L1': '#fa8c16',
  difference_processing: '#ff4d4f',
  'escalated_L2': '#ff4d4f',
};

// ============================================
// 催收状态标签映射
// 注: closed 为预留状态，后端当前不返回，待支持结案操作后启用
// ============================================

export const STATUS_LABEL_MAP: Record<CollectionTaskStatus, { label: string; color: string }> = {
  collecting: { label: '催收中', color: 'blue' },
  difference_processing: { label: '差异处理', color: 'orange' },
  extension: { label: '延期', color: 'gold' },
  escalated: { label: '已升级', color: 'red' },
  closed: { label: '已关闭', color: 'default' }, // 预留：后端当前不返回
};
