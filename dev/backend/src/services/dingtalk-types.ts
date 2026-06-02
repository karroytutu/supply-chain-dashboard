/**
 * 钉钉服务 - 类型定义
 * @module services/dingtalk-types
 */

export interface DingtalkUserInfo {
  userid: string;
  unionid: string;
  name: string;
  avatar?: string;
  mobile?: string;
  email?: string;
  department_id?: string[];
  title?: string;
}

export interface DingtalkUserDetail {
  userid: string;
  unionid: string;
  name: string;
  avatar: string;
  mobile: string;
  email: string;
  dept_id_list: number[];
  title: string;
}

/** 消息类型 */
export type MessageType = 'markdown' | 'actionCard' | 'oa';

/** 业务类型 */
export type BusinessType = 'collection' | 'return_order' | 'return_penalty' | 'ar_assessment' | 'oa_approval';

/** 推送记录状态 */
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'recalled';

/** 按钮配置 */
export interface ActionCardButton {
  title: string;
  actionUrl: string;
}

/** ActionCard 消息内容 */
export interface ActionCardContent {
  title: string;
  markdown: string;
  /** 按钮列表（最多2个） */
  btnJsonList?: ActionCardButton[];
  /** 单按钮模式URL（与btnJsonList二选一） */
  singleUrl?: string;
  /** 单按钮标题 */
  singleTitle?: string;
  /** 按钮排列方向：0-竖直，1-横向 */
  btnOrientation?: '0' | '1';
}

/** OA消息表单行 */
export interface OaMessageFormRow {
  key: string;
  value: string;
}

/** OA 消息内容 */
export interface OaMessageContent {
  head: {
    text: string;
    bgColor?: string;
  };
  statusBar?: {
    statusValue: string;
    statusBg: string;
  };
  body: {
    title: string;
    form?: OaMessageFormRow[];
    content?: string;
    rich?: {
      num: string;
      unit: string;
    };
    image?: string;
    fileCount?: number;
    author?: string;
  };
  messageUrl?: string;
  pcMessageUrl?: string;
}

/** 发送消息选项 */
export interface SendMessageOptions {
  /** 消息类型 */
  msgType: MessageType;
  /** ActionCard 内容 */
  actionCard?: ActionCardContent;
  /** OA消息内容 */
  oaMessage?: OaMessageContent;
  /** 业务类型 */
  businessType?: BusinessType;
  /** 业务ID */
  businessId?: number;
  /** 业务编号 */
  businessNo?: string;
  /** 创建者ID */
  createdBy?: number;
}

/** 发送结果 */
export interface SendResult {
  success: boolean;
  message: string;
  taskId?: number;
  logId?: number;
}

/** 重试配置 */
export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
}

/** 可重试的错误码 */
export const RETRYABLE_ERROR_CODES = [60011, 60028, 50001, 50002, 50010];

/** 默认重试配置 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffFactor: 2,
};

/** 推送记录 */
export interface NotificationLog {
  id: number;
  businessType: BusinessType;
  businessId?: number;
  businessNo?: string;
  msgType: MessageType;
  title: string;
  content?: string;
  taskId?: number;
  receiverIds: string[];
  status: NotificationStatus;
  errorMessage?: string;
  retryCount: number;
  maxRetry: number;
  nextRetryAt?: Date;
  createdBy?: number;
  createdAt: Date;
  sentAt?: Date;
  updatedAt: Date;
}

/** 创建推送记录参数 */
export interface CreateNotificationLogParams {
  businessType: BusinessType;
  businessId?: number;
  businessNo?: string;
  msgType: MessageType;
  title: string;
  content?: string;
  taskId?: number;
  receiverIds: string[];
  createdBy?: number;
}
