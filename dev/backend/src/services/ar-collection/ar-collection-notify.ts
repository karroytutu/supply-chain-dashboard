/**
 * 催收管理 - 钉钉通知服务
 * 封装催收相关的通知发送逻辑，复用钉钉工作通知服务
 */

import { appQuery } from '../../db/appPool';
import { sendWorkNotification } from '../dingtalk.service';
import type { CollectionTask, EscalationLevel } from './ar-collection.types';

/** 通知发送参数 */
interface NotifyParams {
  /** 接收者用户ID（系统用户ID） */
  userIds: number[];
  /** 消息标题 */
  title: string;
  /** 消息内容（Markdown格式） */
  content: string;
}

/** 消息模板返回结构 */
interface MessageTemplate {
  title: string;
  content: string;
}

/** 升级层级中文映射 */
const ESCALATION_LEVEL_NAMES: Record<EscalationLevel, string> = {
  0: '营销师',
  1: '营销主管',
  2: '财务',
};

const ACTION_URL = '/collection';

/**
 * 格式化时间戳
 */
function formatTimestamp(): string {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

/**
 * 格式化金额
 */
function formatAmount(amount: number | null): string {
  if (amount === null || amount === undefined) return '¥0.00';
  return `¥${Number(amount).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * 根据用户ID列表查询对应的钉钉用户ID
 */
async function getDingtalkUserIds(userIds: number[]): Promise<string[]> {
  if (!userIds || userIds.length === 0) return [];

  try {
    const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
    const result = await appQuery<{ dingtalk_user_id: string }>(
      `SELECT dingtalk_user_id FROM users
       WHERE id IN (${placeholders}) AND status = 1 AND dingtalk_user_id IS NOT NULL`,
      userIds
    );
    return result.rows
      .map(row => row.dingtalk_user_id)
      .filter(id => id && id !== 'dev_admin');
  } catch (error) {
    console.error('[CollectionNotify] 查询钉钉用户ID失败:', error);
    return [];
  }
}

/**
 * 根据角色编码查询钉钉用户ID列表
 */
async function getDingtalkUserIdsByRole(roleCode: string): Promise<string[]> {
  try {
    const result = await appQuery<{ dingtalk_user_id: string }>(
      `SELECT u.dingtalk_user_id
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE r.code = $1 AND u.status = 1 AND r.status = 1
         AND u.dingtalk_user_id IS NOT NULL`,
      [roleCode]
    );
    return result.rows
      .map(row => row.dingtalk_user_id)
      .filter(id => id && id !== 'dev_admin');
  } catch (error) {
    console.error('[CollectionNotify] 获取角色用户失败:', roleCode, error);
    return [];
  }
}

/**
 * 统一通知发送入口
 * 通知失败仅记录日志，不中断业务流程
 */
export async function sendCollectionNotification(params: NotifyParams): Promise<void> {
  try {
    const { userIds, title, content } = params;

    const dingtalkIds = await getDingtalkUserIds(userIds);
    if (dingtalkIds.length === 0) {
      console.log('[CollectionNotify] 无有效接收者，跳过通知:', title);
      return;
    }

    const result = await sendWorkNotification(dingtalkIds, title, content);
    console.log('[CollectionNotify] 通知发送结果:', title, result);
  } catch (error) {
    console.error('[CollectionNotify] 通知发送失败:', params.title, error);
    // 不抛出异常，避免中断业务
  }
}

/**
 * 发送通知给指定角色的所有用户
 */
export async function sendCollectionNotificationByRole(
  roleCode: string,
  title: string,
  content: string
): Promise<void> {
  try {
    const dingtalkIds = await getDingtalkUserIdsByRole(roleCode);
    if (dingtalkIds.length === 0) {
      console.log('[CollectionNotify] 角色无有效用户，跳过通知:', roleCode, title);
      return;
    }

    const result = await sendWorkNotification(dingtalkIds, title, content);
    console.log('[CollectionNotify] 角色通知发送结果:', roleCode, result);
  } catch (error) {
    console.error('[CollectionNotify] 角色通知发送失败:', roleCode, title, error);
  }
}

// ============================================
// 消息模板函数
// ============================================

/**
 * 构建延期到期提醒消息模板
 */
export function buildExtensionExpiryMessage(
  task: CollectionTask,
  daysLeft: number
): MessageTemplate {
  const urgency = daysLeft <= 1 ? '【紧急】' : '';

  const title = `${urgency}【延期到期】${task.consumer_name || task.consumer_code} 的延期将在 ${daysLeft} 天后到期`;

  const content = `### 延期到期提醒

${urgency}您负责的催收任务延期即将到期：

| 项目 | 详情 |
|------|------|
| 任务编号 | ${task.task_no} |
| 客户名称 | ${task.consumer_name || task.consumer_code} |
| 逾期总额 | ${formatAmount(task.total_amount)} |
| 延期到期日 | ${task.extension_until || '未知'} |
| 剩余天数 | ${daysLeft} 天 |

延期到期后任务将恢复为催收中状态，请及时跟进处理！

---
点击查看详情: ${ACTION_URL}

推送时间：${formatTimestamp()}`;

  return { title, content };
}

/**
 * 构建升级通知消息模板
 */
export function buildEscalationMessage(
  task: CollectionTask,
  fromLevel: EscalationLevel,
  toLevel: EscalationLevel
): MessageTemplate {
  const fromName = ESCALATION_LEVEL_NAMES[fromLevel];
  const toName = ESCALATION_LEVEL_NAMES[toLevel];

  const title = `【催收升级】${task.consumer_name || task.consumer_code} 催收任务已升级至${toName}`;

  const content = `### 催收升级通知

有催收任务升级需要您处理：

| 项目 | 详情 |
|------|------|
| 任务编号 | ${task.task_no} |
| 客户名称 | ${task.consumer_name || task.consumer_code} |
| 逾期总额 | ${formatAmount(task.total_amount)} |
| 逾期笔数 | ${task.bill_count} 笔 |
| 最大逾期天数 | ${task.max_overdue_days} 天 |
| 升级路径 | ${fromName} → ${toName} |
| 升级原因 | ${task.escalation_reason || '催收超时自动升级'} |

请及时处理该催收任务！

---
点击查看详情: ${ACTION_URL}

推送时间：${formatTimestamp()}`;

  return { title, content };
}

/**
 * 构建核销结果通知消息模板
 */
export function buildVerifyResultMessage(
  task: CollectionTask,
  verified: boolean
): MessageTemplate {
  const statusText = verified ? '已通过' : '未通过';
  const icon = verified ? '✅' : '❌';

  const title = `${icon}【核销结果】${task.consumer_name || task.consumer_code} 核销${statusText}`;

  const content = `### 核销结果通知

您提交的催收核销申请处理结果如下：

| 项目 | 详情 |
|------|------|
| 任务编号 | ${task.task_no} |
| 客户名称 | ${task.consumer_name || task.consumer_code} |
| 应收总额 | ${formatAmount(task.total_amount)} |
| 核销结果 | ${icon} ${statusText} |

${verified ? '核销已确认，任务将更新为已核销状态。' : '核销未通过，请检查后重新提交或联系出纳确认。'}

---
点击查看详情: ${ACTION_URL}

推送时间：${formatTimestamp()}`;

  return { title, content };
}

/**
 * 构建逾期预警消息模板（逾期前提醒）- 单条消息版本
 * 用于提醒即将到期的应收账款
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

  // 紧急程度
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

  // 构建明细表格（最多显示5条）
  const detailRows = details.slice(0, 5).map(d =>
    `| ${d.erpBillId} | ${formatAmount(d.leftAmount)} | ${d.expireDate} |`
  ).join('\n');

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

/**
 * 结算方式映射
 */
const SETTLE_METHOD_NAMES: Record<number, string> = {
  1: '现结',
  2: '挂账',
};

/**
 * 预警级别配置（简化为2级）
 */
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
  consumerName: string;
  leftAmount: number;
  expireDate: string;
  daysToExpire: number;
  settleMethod: number;
}

/**
 * 构建逾期预警汇总消息模板（按营销师合并推送）
 * 每个营销师只收到一条汇总消息
 */
export function buildMergedWarningMessage(params: {
  managerName: string;
  debts: WarningDebtItem[];
}): MessageTemplate {
  const { managerName, debts } = params;

  // 按预警级别分组（简化为2级：warning=1-2天, notice=3-5天）
  const groupedByLevel: Record<string, WarningDebtItem[]> = {
    warning: [],  // 1-2天
    notice: [],   // 3-5天
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

  // 按紧急程度排序：warning > notice
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
          `  - ${debt.erpBillId} | ${formatAmount(debt.leftAmount)} | 到期 ${debt.expireDate}`
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
