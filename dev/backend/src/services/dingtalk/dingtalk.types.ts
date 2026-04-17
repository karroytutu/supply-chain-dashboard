/**
 * 钉钉工作通知服务类型定义
 */

// ============================================
// 消息类型定义
// ============================================

/** 消息类型 */
export type MessageType = 'markdown' | 'actionCard' | 'oa';

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

/** OA 消息表单项 */
export interface OaFormItem {
  key: string;
  value: string;
}

/** OA 消息富文本 */
export interface OaRich {
  num: string;
  unit: string;
}

/** OA 消息状态栏 */
export interface OaStatusBar {
  /** 状态值 */
  statusValue: string;
  /** 状态栏背景色 */
  statusBg: string;
}

/** OA 消息头部 */
export interface OaHead {
  /** 标题 */
  text: string;
  /** 背景色 */
  bgcolor?: string;
}

/** OA 消息主体 */
export interface OaBody {
  /** 内容标题 */
  title?: string;
  /** 内容 */
  content?: string;
  /** 表单 */
  form?: OaFormItem[];
  /** 富文本 */
  rich?: OaRich;
  /** 图片 */
  image?: string;
  /** 作者 */
  author?: string;
  /** 文件数量 */
  fileCount?: string;
}

/** OA 消息内容 */
export interface OaContent {
  head?: OaHead;
  body?: OaBody;
  /** 消息点击跳转URL */
  messageUrl: string;
  /** PC端跳转URL */
  pcMessageUrl?: string;
  /** 状态栏 */
  statusBar?: OaStatusBar;
}

// ============================================
// 发送参数和返回值
// ============================================

/** 发送消息选项 */
export interface SendMessageOptions {
  /** 消息类型 */
  msgType: MessageType;
  /** ActionCard 内容 */
  actionCard?: ActionCardContent;
  /** OA 内容 */
  oa?: OaContent;
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
  /** 是否成功 */
  success: boolean;
  /** 消息 */
  message: string;
  /** 任务ID（发送成功时返回） */
  taskId?: number;
  /** 推送记录ID */
  logId?: number;
}

/** 发送进度 */
export interface SendProgress {
  /** 是否成功 */
  success: boolean;
  /** 进度百分比 */
  progress: number;
  /** 总数 */
  totalCount: number;
  /** 成功数 */
  successCount: number;
  /** 失败数 */
  failedCount: number;
}

/** 发送结果明细 */
export interface SendResultDetail {
  /** 用户ID */
  userId: string;
  /** 状态 */
  status: 'success' | 'failed';
  /** 错误信息 */
  errorMsg?: string;
}

/** 发送结果 */
export interface SendResultResponse {
  /** 是否成功 */
  success: boolean;
  /** 发送结果列表 */
  results: SendResultDetail[];
}

// ============================================
// 推送记录
// ============================================

/** 业务类型 */
export type BusinessType = 'collection' | 'return_order' | 'return_penalty';

/** 推送记录状态 */
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'recalled';

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

// ============================================
// 重试机制
// ============================================

/** 重试配置 */
export interface RetryConfig {
  /** 最大重试次数 */
  maxRetries: number;
  /** 基础延迟（毫秒） */
  baseDelayMs: number;
  /** 最大延迟（毫秒） */
  maxDelayMs: number;
  /** 退避因子 */
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

// ============================================
// 状态栏颜色
// ============================================

/** 状态栏颜色常量 */
export const STATUS_BAR_COLORS = {
  SUCCESS: 'FF00FF00',     // 绿色
  WARNING: 'FFFF9800',     // 橙色
  ERROR: 'FFF44336',       // 红色
  INFO: 'FF2196F3',        // 蓝色
  GRAY: 'FF9E9E9E',        // 灰色
} as const;

// ============================================
// 用户信息
// ============================================

/** 钉钉用户基本信息 */
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

/** 钉钉用户详细信息 */
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
