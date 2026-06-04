/**
 * 催收管理 - ActionCard 与预警消息构建器
 * @module services/ar-collection/ar-collection-notify-cards
 */

import type { ActionCardContent } from '../dingtalk.service';
import type { CollectionTask, EscalationLevel } from './ar-collection.types';
import { ESCALATION_LEVEL_NAMES } from './ar-collection-notify';

const ACTION_URL = 'https://xly.gzzxd.com/collection/overview';

function formatTimestamp(): string {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

function formatAmount(amount: number | null): string {
  if (amount === null || amount === undefined) return '¥0.00';
  return `¥${Number(amount).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ============================================
// ActionCard 消息模板
// ============================================

/** 构建升级通知 ActionCard */
export function buildEscalationActionCard(
  task: CollectionTask,
  fromLevel: EscalationLevel,
  toLevel: EscalationLevel,
  escalatedByName?: string
): ActionCardContent {
  const fromName = ESCALATION_LEVEL_NAMES[fromLevel];
  const toName = ESCALATION_LEVEL_NAMES[toLevel];
  const consumerName = task.consumer_name || task.consumer_code;

  const markdown = `有催收任务升级需要您处理：

- **任务编号**: ${task.task_no}
- **客户名称**: ${consumerName}
- **逾期总额**: ${formatAmount(task.total_amount)}
- **逾期笔数**: ${task.bill_count} 笔
- **最大逾期**: ${task.max_overdue_days} 天
- **升级路径**: ${fromName} → ${toName}
- **升级原因**: ${task.escalation_reason || '催收超时自动升级'}${escalatedByName ? `\n- **升级操作人**: ${escalatedByName}` : ''}

请及时处理该催收任务！`;

  return {
    title: `【催收升级】${consumerName} 已升级至${toName}`,
    markdown,
    singleTitle: '查看详情',
    singleUrl: ACTION_URL,
  };
}

/** 构建核销结果通知 ActionCard */
export function buildVerifyResultActionCard(
  task: CollectionTask,
  verified: boolean,
  verifierName?: string,
  remark?: string
): ActionCardContent {
  const statusText = verified ? '已通过' : '未通过';
  const icon = verified ? '✅' : '❌';
  const consumerName = task.consumer_name || task.consumer_code;

  const markdown = `您提交的催收核销申请处理结果：

- **任务编号**: ${task.task_no}
- **客户名称**: ${consumerName}
- **应收总额**: ${formatAmount(task.total_amount)}
- **核销结果**: ${icon} ${statusText}${verifierName ? `\n- **确认人**: ${verifierName}` : ''}${remark ? `\n- **备注**: ${remark}` : ''}

${verified ? '核销已确认，任务将更新为已核销状态。' : '核销未通过，请检查后重新提交或联系结算会计确认。'}`;

  return {
    title: `${icon}【核销结果】${consumerName} 核销${statusText}`,
    markdown,
    singleTitle: '查看详情',
    singleUrl: ACTION_URL,
  };
}

/** 构建退回通知 ActionCard */
export function buildRollbackActionCard(
  task: CollectionTask,
  fromLevel: EscalationLevel,
  toLevel: EscalationLevel,
  rollbackByName?: string,
  restoredStatus?: string
): ActionCardContent {
  const fromName = ESCALATION_LEVEL_NAMES[fromLevel];
  const toName = ESCALATION_LEVEL_NAMES[toLevel];
  const consumerName = task.consumer_name || task.consumer_code;
  const STATUS_LABELS: Record<string, string> = {
    collecting: '催收中',
    extension: '延期中',
    difference_processing: '差异处理',
  };

  const markdown = `催收任务已退回，需要您继续处理：

- **任务编号**: ${task.task_no}
- **客户名称**: ${consumerName}
- **逾期总额**: ${formatAmount(task.total_amount)}
- **退回路径**: ${fromName} → ${toName}
- **恢复状态**: ${STATUS_LABELS[restoredStatus || 'collecting'] || restoredStatus}${rollbackByName ? `\n- **退回操作人**: ${rollbackByName}` : ''}

请及时继续跟进该催收任务！`;

  return {
    title: `【催收退回】${consumerName} 已退回至${toName}`,
    markdown,
    singleTitle: '查看详情',
    singleUrl: ACTION_URL,
  };
}

// ============================================
// 预警消息模板
// ============================================

interface MessageTemplate {
  title: string;
  content: string;
}

/**
 * 构建逾期预警消息模板（逾期前提醒）- 单条消息版本
 * @deprecated 请使用 buildMergedWarningMessage 按营销师合并推送
 */
export function buildUpcomingWarningMessage(params: {
  consumerName: string;
  billCount: number;
  totalAmount: number;
  daysToExpire: number;
  details: Array<{
    erpBillId: string;
    leftAmount: number;
    expireDate: string;
  }>;
}): MessageTemplate {
  const { consumerName, billCount, totalAmount, daysToExpire, details } = params;

  let urgency = '';
  let urgencyTitle = '';
  if (daysToExpire === 1) {
    urgency = '【紧急】';
    urgencyTitle = '明日到期';
  } else if (daysToExpire <= 3) {
    urgency = '【关注】';
    urgencyTitle = '即将到期';
  } else {
    urgencyTitle = '即将到期';
  }

  const title = `${urgency}【逾期预警】${consumerName} 有 ${billCount} 笔应收 ${daysToExpire} 天后到期`;

  const detailRows = details
    .slice(0, 5)
    .map(d => `| ${d.erpBillId} | ${formatAmount(d.leftAmount)} | ${d.expireDate} |`)
    .join('\n');

  const moreText = details.length > 5 ? `\n*...还有 ${details.length - 5} 笔*` : '';

  const content = `### 逾期预警提醒

${urgency}以下应收款即将到期，请提前跟进催收：

| 项目 | 详情 |
|------|------|
| 客户名称 | ${consumerName} |
| 涉及笔数 | ${billCount} 笔 |
| 应收总额 | ${formatAmount(totalAmount)} |
| 最近到期 | ${daysToExpire} 天后 |

**欠款明细：**

| 单据编号 | 金额 | 到期日期 |
|----------|------|----------|
${detailRows}${moreText}

请提前与客户沟通，确保按时回款！

---
点击查看详情: ${ACTION_URL}

推送时间：${formatTimestamp()}`;

  return { title, content };
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
点击查看详情: ${ACTION_URL}

推送时间：${formatTimestamp()}`;

  return { title, content };
}
