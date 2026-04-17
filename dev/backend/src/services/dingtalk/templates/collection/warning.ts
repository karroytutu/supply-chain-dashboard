/**
 * 逾期预警汇总通知模板
 * 使用 ActionCard 格式，单个「查看详情」按钮
 * 按营销师合并推送
 */

import { ActionCardBuilder } from '../../builders/action-card.builder';
import type { ActionCardContent } from '../../dingtalk.types';

const ACTION_URL = 'https://xly.gzzxd.com/collection/overview';

/**
 * 结算方式映射
 */
const SETTLE_METHOD_NAMES: Record<number, string> = {
  1: '现结',
  2: '挂账',
};

/**
 * 预警级别配置
 */
const WARNING_LEVELS = {
  warning: { icon: '⚠️', title: '逾期前2天预警' },
  notice: { icon: '📅', title: '逾期前5天预警' },
} as const;

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
 * 格式化时间戳
 */
function formatTimestamp(): string {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

/**
 * 格式化金额
 */
function formatAmount(amount: number): string {
  return `¥${Number(amount).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * 构建逾期预警汇总消息（ActionCard 格式）
 */
export function buildMergedWarningMessage(params: {
  managerName: string;
  debts: WarningDebtItem[];
}): { title: string; actionCard: ActionCardContent } {
  const { managerName, debts } = params;

  // 按预警级别分组
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

  // 计算汇总数据
  const totalBillCount = debts.length;
  const totalAmount = debts.reduce((sum, d) => sum + d.leftAmount, 0);
  const consumerCount = new Set(debts.map(d => d.consumerName)).size;

  const title = `【逾期预警】您有 ${totalBillCount} 张应收即将到期`;

  // 构建各预警级别内容
  const sections: string[] = [];
  const levelOrder = ['warning', 'notice'] as const;

  for (const level of levelOrder) {
    const levelDebts = groupedByLevel[level];
    if (levelDebts.length === 0) continue;

    const levelConfig = WARNING_LEVELS[level];
    const levelAmount = levelDebts.reduce((sum, d) => sum + d.leftAmount, 0);

    // 按客户分组
    const groupedByConsumer = new Map<string, WarningDebtItem[]>();
    for (const debt of levelDebts) {
      const existing = groupedByConsumer.get(debt.consumerName) || [];
      existing.push(debt);
      groupedByConsumer.set(debt.consumerName, existing);
    }

    // 构建该级别的商户列表
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

  const markdown = `### 逾期预警汇总

${sections.join('\n\n')}

---
**合计**：${consumerCount}个商户，${totalBillCount}张单据，${formatAmount(totalAmount)}

请及时跟进客户付款进度，避免逾期。

---
推送时间：${formatTimestamp()}`;

  const actionCard = new ActionCardBuilder()
    .setTitle(title)
    .setMarkdown(markdown)
    .setSingleUrl(ACTION_URL, '查看详情')
    .build();

  return { title, actionCard };
}
