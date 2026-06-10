/**
 * 催收管理 - ActionCard 与预警消息构建器
 * @module services/ar-collection/ar-collection-notify-cards
 */

import { getCollectionActionUrl } from './ar-collection-notify';

function formatTimestamp(): string {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

function formatAmount(amount: number | null): string {
  if (amount === null || amount === undefined) return '¥0.00';
  return `¥${Number(amount).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ============================================
// 预警消息模板
// ============================================

interface MessageTemplate {
  title: string;
  content: string;
}

/** 结算方式映射 */
const SETTLE_METHOD_NAMES: Record<number, string> = {
  1: '现结',
  2: '挂账',
};

/** 预警级别配置 */
interface WarningLevel {
  icon: string;
  title: string;
  daysRange: number[];
}

const WARNING_LEVELS: Record<string, WarningLevel> = {
  warning: { icon: '⚠️', title: '逾期前2天预警', daysRange: [1, 2] },
  notice: { icon: '📅', title: '逾期前5天预警', daysRange: [3, 4, 5] },
};

/** 单条欠款记录 */
export interface WarningDebtItem {
  erpBillId: string;
  billNo: string;
  consumerName: string;
  leftAmount: number;
  expireDate: string;
  daysToExpire: number;
  settleMethod: number;
}

/**
 * 构建逾期预警汇总消息模板（按营销师合并推送）
 */
export function buildMergedWarningMessage(params: {
  managerName: string;
  debts: WarningDebtItem[];
}): MessageTemplate {
  const { managerName, debts } = params;

  const groupedByLevel: Record<string, WarningDebtItem[]> = {
    warning: [],
    notice: [],
  };

  for (const debt of debts) {
    if (debt.daysToExpire <= 2) {
      groupedByLevel.warning.push(debt);
    } else {
      groupedByLevel.notice.push(debt);
    }
  }

  const totalBillCount = debts.length;
  const totalAmount = debts.reduce((sum, d) => sum + d.leftAmount, 0);
  const consumerCount = new Set(debts.map(d => d.consumerName)).size;

  const title = `【逾期预警】您有 ${totalBillCount} 张应收即将到期`;

  const sections: string[] = [];
  const levelOrder = ['warning', 'notice'] as const;

  for (const level of levelOrder) {
    const levelDebts = groupedByLevel[level];
    if (levelDebts.length === 0) continue;

    const levelConfig = WARNING_LEVELS[level];
    const levelAmount = levelDebts.reduce((sum, d) => sum + d.leftAmount, 0);

    const groupedByConsumer = new Map<string, WarningDebtItem[]>();
    for (const debt of levelDebts) {
      const existing = groupedByConsumer.get(debt.consumerName) || [];
      existing.push(debt);
      groupedByConsumer.set(debt.consumerName, existing);
    }

    const consumerLines: string[] = [];
    for (const [consumerName, consumerDebts] of groupedByConsumer.entries()) {
      const settleName = SETTLE_METHOD_NAMES[consumerDebts[0].settleMethod] || '';
      consumerLines.push(`- 商户：${consumerName}（${settleName}）`);
      for (const debt of consumerDebts) {
        consumerLines.push(
          `  - ${debt.billNo} | ${formatAmount(debt.leftAmount)} | 到期 ${debt.expireDate}`
        );
      }
    }

    sections.push(
      `${levelConfig.icon} **${levelConfig.title}**（${levelDebts.length}张单据，合计 ${formatAmount(levelAmount)}）\n\n` +
        consumerLines.join('\n')
    );
  }

  const content = `### 逾期预警汇总

${sections.join('\n\n')}

---
**合计**：${consumerCount}个商户，${totalBillCount}张单据，${formatAmount(totalAmount)}

请及时跟进客户付款进度，避免逾期。

---
点击查看详情: ${getCollectionActionUrl()}

推送时间：${formatTimestamp()}`;

  return { title, content };
}
