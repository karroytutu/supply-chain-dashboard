import dayjs from 'dayjs';

/** 格式化创建时间 */
export function formatCreatedDate(dateStr: string): string {
  if (!dateStr) return '-';
  const date = dayjs(dateStr);
  return `${date.format('YYYY-MM-DD')} 创建`;
}

/** 计算剩余处理时限 */
export function calcAssessmentTime(startTime: string | undefined): {
  text: string;
  color: string;
} {
  if (!startTime) {
    return { text: '-', color: '#8c8c8c' };
  }
  const elapsedDays = dayjs().diff(dayjs(startTime), 'day');
  if (elapsedDays < 3) {
    return { text: `剩余 ${3 - elapsedDays} 天`, color: '#52c41a' };
  }
  if (elapsedDays < 5) {
    return { text: `剩余 ${5 - elapsedDays} 天`, color: '#faad14' };
  }
  if (elapsedDays < 7) {
    return { text: `剩余 ${7 - elapsedDays} 天`, color: '#faad14' };
  }
  return { text: `超期 ${elapsedDays - 7} 天`, color: '#ff4d4f' };
}

/** 考核层级名称映射 */
export const TIER_LABELS = {
  tier1: '一级考核',
  tier2: '二级考核',
  tier3: '三级考核',
} as const;

/** 考核层级颜色映射 */
export const TIER_COLORS = {
  tier1: 'processing',
  tier2: 'warning',
  tier3: 'error',
} as const;
