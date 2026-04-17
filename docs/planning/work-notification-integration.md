# 钉钉工作通知功能全面优化实施方案

## Context

供应链仪表盘项目已实现基础的钉钉工作通知功能，但存在以下问题：
- 仅支持 Markdown 消息格式，无法交互
- 未保存 task_id，无法查询进度/结果或撤回
- 缺少重试机制，推送失败后无感知
- 消息模板内嵌在业务代码中，维护困难

本次优化将实现：
1. 消息模板升级（支持 ActionCard/OA 格式）
2. 新增 API 能力（查询进度/结果、撤回、状态栏更新）
3. 可靠性增强（task_id 保存、重试机制、推送记录表）
4. 代码结构优化（模板分离、构建器模式）

---

## 实施步骤

### 阶段一：基础设施

#### 1.1 创建数据库迁移脚本

**文件**: `dev/backend/src/db/migrations/029_dingtalk_notification_logs.sql`

```sql
CREATE TABLE dingtalk_notification_logs (
  id SERIAL PRIMARY KEY,
  business_type VARCHAR(50) NOT NULL,
  business_id INTEGER,
  business_no VARCHAR(64),
  msg_type VARCHAR(20) NOT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT,
  task_id BIGINT,
  receiver_ids TEXT[],
  status VARCHAR(20) DEFAULT 'pending',
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retry INTEGER DEFAULT 3,
  next_retry_at TIMESTAMP,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notification_logs_business ON dingtalk_notification_logs(business_type, business_id);
CREATE INDEX idx_notification_logs_task ON dingtalk_notification_logs(task_id);
CREATE INDEX idx_notification_logs_status ON dingtalk_notification_logs(status);
CREATE INDEX idx_notification_logs_retry ON dingtalk_notification_logs(status, next_retry_at);
```

#### 1.2 创建 dingtalk 服务目录结构

**新目录**: `dev/backend/src/services/dingtalk/`

```
services/dingtalk/
├── index.ts                    # 模块入口
├── dingtalk.service.ts         # 核心SDK调用（从原位置迁移）
├── dingtalk.types.ts           # 类型定义
├── notification-log.service.ts # 推送记录服务
├── retry.handler.ts            # 重试处理
└── templates/                  # 消息模板
    ├── index.ts
    ├── collection/             # 催收模板
    ├── return-order/           # 退货单模板
    └── return-penalty/         # 考核模板
```

---

### 阶段二：核心能力增强

#### 2.1 扩展 sendWorkNotification 函数

**文件**: `dev/backend/src/services/dingtalk/dingtalk.service.ts`

**修改内容**:
1. 支持多种消息类型（markdown / actionCard / oa）
2. 返回值增加 taskId
3. 发送成功后保存到推送记录表

```typescript
// 新增类型
interface SendMessageOptions {
  msgType: 'markdown' | 'actionCard' | 'oa';
  actionCard?: ActionCardContent;
  oa?: OaContent;
}

interface SendResult {
  success: boolean;
  message: string;
  taskId?: number;  // 新增
}

// 扩展函数签名
export async function sendWorkNotification(
  userIdList: string[],
  title: string,
  content: string,
  options?: SendMessageOptions
): Promise<SendResult>;
```

#### 2.2 实现查询进度函数

```typescript
export async function getSendProgress(taskId: number): Promise<{
  success: boolean;
  progress: number;
  totalCount: number;
  successCount: number;
  failedCount: number;
}>;
```

#### 2.3 实现查询结果函数

```typescript
export async function getSendResult(taskId: number): Promise<{
  success: boolean;
  results: Array<{
    userId: string;
    status: 'success' | 'failed';
    errorMsg?: string;
  }>;
}>;
```

#### 2.4 实现撤回消息函数

```typescript
export async function recallMessage(
  taskId: number
): Promise<{ success: boolean; message: string }>;
```

---

### 阶段三：消息模板升级

#### 3.1 消息类型选择（根据业务场景优化）

| 业务场景 | 消息类型 | 按钮/状态 | 选择理由 |
|---------|---------|----------|---------|
| 延期到期提醒 | ActionCard | 查看任务 | 需要跳转，但无直接操作按钮 |
| 催收升级通知 | ActionCard | 查看任务 | 需要跳转，但无直接操作按钮 |
| 逾期预警汇总 | ActionCard | 查看详情 | 信息量大，添加跳转按钮 |
| 核销结果通知 | ActionCard | 查看详情 | 结果已确定，表单展示+跳转 |
| 每日退货提醒 | ActionCard | 查看列表 | 需要跳转到列表页 |
| 退货考核通知 | Markdown | 无（纯通知） | 单向通知，无交互需求 |

**设计原则**：
- ActionCard 仅在需要跳转时使用单个按钮，避免功能重复
- OA消息 + 状态栏仅用于审批类通知（状态可动态更新）
- Markdown 用于纯通知场景，保持简洁

#### 3.2 创建消息构建器

**文件**: `dev/backend/src/services/dingtalk/builders/action-card.builder.ts`

```typescript
export class ActionCardBuilder {
  private title: string = '';
  private markdown: string = '';
  private buttons: Array<{ title: string; actionUrl: string }> = [];
  private singleUrl?: string;
  private btnOrientation?: string;

  setTitle(title: string): this;
  setMarkdown(markdown: string): this;
  addButton(title: string, url: string): this;
  setSingleUrl(url: string): this;
  setBtnOrientation(orientation: '0' | '1'): this;
  build(): OapiMessageCorpconversationAsyncsend_v2ParamsMsgActionCard;
}
```

**文件**: `dev/backend/src/services/dingtalk/builders/oa.builder.ts`

```typescript
export class OaBuilder {
  private headBgColor: string = 'FFCCCCCC';
  private headText: string = '';
  private forms: Array<{ key: string; value: string }> = [];
  private messageUrl: string = '';
  private statusBar: { value: string; bg: string } | null = null;

  setHead(text: string, bgColor?: string): this;
  addForm(key: string, value: string): this;
  setMessageUrl(url: string): this;
  setStatusBar(value: string, bg: string): this;
  build(): OapiMessageCorpconversationAsyncsend_v2ParamsMsgOa;
}
```

#### 3.3 迁移催收通知模板

**文件**: `dev/backend/src/services/dingtalk/templates/collection/extension-expiry.ts`

- 使用 ActionCard 格式
- 单个「查看任务」按钮，跳转到任务详情页

**文件**: `dev/backend/src/services/dingtalk/templates/collection/escalation.ts`

- 使用 ActionCard 格式
- 单个「查看任务」按钮

**文件**: `dev/backend/src/services/dingtalk/templates/collection/warning.ts`

- 使用 ActionCard 格式
- 单个「查看详情」按钮，跳转到催收总览页
- 保持按营销师合并推送逻辑

#### 3.4 迁移核销结果模板

**文件**: `dev/backend/src/services/dingtalk/templates/collection/verify-result.ts`

- 使用 ActionCard 格式
- 单个「查看详情」按钮
- 根据核销结果显示不同提示：
  - 已通过：绿色提示框
  - 未通过：橙色提示框

#### 3.5 迁移退货单通知模板

**文件**: `dev/backend/src/services/dingtalk/templates/return-order/daily-reminder.ts`

- 使用 ActionCard 格式
- 单个「查看列表」按钮

#### 3.6 迁移退货考核通知模板

**文件**: `dev/backend/src/services/dingtalk/templates/return-penalty/penalty-notice.ts`

- 使用 Markdown 格式
- 无按钮，保持简洁通知风格

---

### 阶段四：业务集成

#### 4.1 更新催收业务调用

**文件**: `dev/backend/src/services/ar-collection/ar-collection-notify.ts`

修改内容：
1. 导入新模板函数
2. 调用扩展后的 sendWorkNotification
3. 保存 task_id 到推送记录表

#### 4.2 更新退货单业务调用

**文件**: `dev/backend/src/services/return-order/return-order-notify.ts`

#### 4.3 更新考核业务调用

**文件**: `dev/backend/src/services/return-penalty/return-penalty-notify.ts`

---

### 阶段五：重试机制

#### 5.1 创建重试处理服务

**文件**: `dev/backend/src/services/dingtalk/retry.handler.ts`

```typescript
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffFactor: 2,
};

const RETRYABLE_ERRORS = [60011, 60028, 50001];

export async function handleRetry(): Promise<void>;
export function calculateNextRetry(retryCount: number): Date;
```

#### 5.2 添加定时任务

**文件**: `dev/backend/src/services/scheduler/index.ts`

```typescript
// 每5分钟执行一次重试
schedule.scheduleJob('*/5 * * * *', async () => {
  await handleRetry();
});
```

---

## 关键文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `dev/backend/src/db/migrations/029_dingtalk_notification_logs.sql` | 新建 | 数据库迁移 |
| `dev/backend/src/services/dingtalk/index.ts` | 新建 | 模块入口 |
| `dev/backend/src/services/dingtalk/dingtalk.types.ts` | 新建 | 类型定义 |
| `dev/backend/src/services/dingtalk/dingtalk.service.ts` | 迁移+修改 | 核心SDK服务 |
| `dev/backend/src/services/dingtalk/notification-log.service.ts` | 新建 | 推送记录服务 |
| `dev/backend/src/services/dingtalk/retry.handler.ts` | 新建 | 重试处理 |
| `dev/backend/src/services/dingtalk/builders/action-card.builder.ts` | 新建 | ActionCard构建器 |
| `dev/backend/src/services/dingtalk/builders/oa.builder.ts` | 新建 | OA构建器 |
| `dev/backend/src/services/dingtalk/templates/collection/*.ts` | 新建 | 催收模板 |
| `dev/backend/src/services/dingtalk/templates/return-order/*.ts` | 新建 | 退货单模板 |
| `dev/backend/src/services/ar-collection/ar-collection-notify.ts` | 修改 | 更新调用方式 |
| `dev/backend/src/services/return-order/return-order-notify.ts` | 修改 | 更新调用方式 |
| `dev/backend/src/services/scheduler/index.ts` | 修改 | 添加重试任务 |

---

## 验证方案

### 1. 单元测试

```bash
cd dev/backend
npm test -- --grep "dingtalk"
```

测试内容：
- 消息构建器生成正确的消息结构
- 重试时间计算正确
- 类型定义完整性

### 2. 集成测试

创建测试脚本 `dev/backend/scripts/test-dingtalk-notification.ts`：

```typescript
// 测试发送 ActionCard 消息
const result = await sendWorkNotification(
  ['user123'],
  '测试标题',
  '',
  {
    msgType: 'actionCard',
    actionCard: {
      title: '测试通知',
      markdown: '### 测试内容\n- 项目1\n- 项目2',
      btnJsonList: [
        { title: '查看详情', actionUrl: 'https://xly.gzzxd.com' }
      ]
    }
  }
);

console.log('发送结果:', result);
console.log('taskId:', result.taskId);

// 测试查询进度
const progress = await getSendProgress(result.taskId!);
console.log('发送进度:', progress);

// 测试更新状态栏
await updateStatusBar(result.taskId!, '已处理', STATUS_BAR_COLORS.SUCCESS);
```

### 3. 端到端测试

1. 触发催收延期到期提醒，验证钉钉收到 ActionCard 消息
2. 点击按钮验证跳转正确
3. 处理后验证状态栏更新
4. 模拟发送失败，验证重试机制

### 4. 钉钉客户端验证

- 检查消息展示格式是否正确
- 检查按钮是否可点击
- 检查状态栏颜色是否正确

---

## 风险与注意事项

1. **向后兼容**: 保留原有 `sendWorkNotification(userIdList, title, content)` 签名，新增可选参数
2. **渐进迁移**: 新模板先在新场景使用，稳定后再迁移旧场景
3. **降级策略**: ActionCard/OA 发送失败时自动降级为 Markdown
4. **性能考虑**: 推送记录表添加索引，避免影响查询性能

---

## 预计工作量

| 阶段 | 工作量 |
|------|--------|
| 阶段一：基础设施 | 1天 |
| 阶段二：核心能力 | 1天 |
| 阶段三：消息模板 | 1天 |
| 阶段四：业务集成 | 0.5天 |
| 阶段五：重试机制 | 0.5天 |
| 测试与调试 | 1天 |
| **总计** | **5天** |
