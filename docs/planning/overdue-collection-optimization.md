# 逾期催收交互优化：按客户维度聚合催收

## Context

当前逾期催收系统按**单据维度**生成催收任务，每张逾期单据对应一个 `ar_collection_tasks` 记录。当一个客户有多张逾期单据时，营销师需要逐条操作，但实际业务中催收是以**客户为单位**进行的 -- 营销师联系客户一次，催收结果应覆盖该客户的全部逾期单据。

本次改造目标：将催收任务粒度从"按单据"改为"按客户"，前端采用"客户卡片+展开明细"的展示方式，同时支持混合操作（不同单据可设不同催收结果）。

---

## 一、数据库改造

### 1.1 新建迁移脚本

文件：`dev/backend/src/db/migrations/011_ar_customer_collection_tasks.sql`

**新建表 `ar_customer_collection_tasks`**（客户催收任务表）：

```sql
CREATE TABLE IF NOT EXISTS ar_customer_collection_tasks (
  id SERIAL PRIMARY KEY,
  task_no VARCHAR(50) UNIQUE NOT NULL,           -- 编号: AR-CUST-YYYYMMDD-XXXX
  consumer_name VARCHAR(200) NOT NULL,
  consumer_code VARCHAR(100),
  manager_users VARCHAR(200),                    -- 所属营销师
  ar_ids INTEGER[] NOT NULL,                     -- 关联的 ar_receivables.id 数组
  total_amount DECIMAL(15,2) DEFAULT 0,          -- 涉及总金额
  bill_count INTEGER DEFAULT 1,                  -- 涉及单据数量
  collector_id INTEGER NOT NULL REFERENCES users(id),
  collector_role VARCHAR(20) NOT NULL,           -- marketing/supervisor/finance
  assigned_at TIMESTAMP DEFAULT NOW(),
  deadline_at TIMESTAMP NOT NULL,                -- 截止时间（3天）
  status VARCHAR(20) DEFAULT 'pending',          -- pending/in_progress/completed/escalated/timeout
  result_type VARCHAR(30),                       -- 统一结果: customer_delay/guarantee_delay/paid_off/escalate/mixed
  latest_pay_date TIMESTAMP,
  evidence_url TEXT,
  signature_data TEXT,
  escalate_reason TEXT,
  remark TEXT,
  reviewed_by INTEGER REFERENCES users(id),
  review_status VARCHAR(20),
  review_comment TEXT,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**新建表 `ar_bill_results`**（单据级别催收结果，支持混合操作）：

```sql
CREATE TABLE IF NOT EXISTS ar_bill_results (
  id SERIAL PRIMARY KEY,
  customer_task_id INTEGER NOT NULL REFERENCES ar_customer_collection_tasks(id),
  ar_id INTEGER NOT NULL REFERENCES ar_receivables(id),
  result_type VARCHAR(30) NOT NULL,
  latest_pay_date TIMESTAMP,
  evidence_url TEXT,
  remark TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(customer_task_id, ar_id)
);
```

**修改现有表**：

```sql
-- ar_receivables 新增客户任务关联
ALTER TABLE ar_receivables
  ADD COLUMN IF NOT EXISTS customer_task_id INTEGER REFERENCES ar_customer_collection_tasks(id);

-- ar_penalty_records 新增客户任务关联
ALTER TABLE ar_penalty_records
  ADD COLUMN IF NOT EXISTS customer_task_id INTEGER REFERENCES ar_customer_collection_tasks(id);

-- ar_action_logs 新增客户任务关联
ALTER TABLE ar_action_logs
  ADD COLUMN IF NOT EXISTS customer_task_id INTEGER REFERENCES ar_customer_collection_tasks(id);
```

**历史数据迁移**：将现有进行中的单据级任务聚合为客户任务（按 consumer_name + collector_id 分组），保留原 `ar_collection_tasks` 表数据不动。

### 1.2 索引

```sql
CREATE INDEX idx_cust_tasks_collector ON ar_customer_collection_tasks(collector_id);
CREATE INDEX idx_cust_tasks_status ON ar_customer_collection_tasks(status);
CREATE INDEX idx_cust_tasks_consumer ON ar_customer_collection_tasks(consumer_name);
CREATE INDEX idx_cust_tasks_ar_ids ON ar_customer_collection_tasks USING GIN(ar_ids);
CREATE INDEX idx_bill_results_task ON ar_bill_results(customer_task_id);
CREATE INDEX idx_bill_results_ar ON ar_bill_results(ar_id);
```

---

## 二、后端改造

### 2.1 新建客户催收任务服务

文件：`dev/backend/src/services/accounts-receivable/ar-customer-task.service.ts`

核心函数：

| 函数 | 功能 |
|------|------|
| `generateCustomerTaskNo()` | 生成编号 AR-CUST-YYYYMMDD-XXXX |
| `createCustomerTask(params)` | 创建客户催收任务，接收 arIds 数组 |
| `getCustomerTasks(params)` | 获取客户任务列表（按 collector_id/status 筛选） |
| `getCustomerTaskDetail(taskId)` | 获取任务详情，含关联的 AR 记录列表 |
| `submitUnifiedResult(params)` | 统一提交：所有单据同一结果 |
| `submitMixedResults(params)` | 混合提交：每张单据可设不同结果 |
| `escalateCustomerTask(params)` | 客户任务整体升级 |

**`createCustomerTask` 参数**：

```typescript
interface CreateCustomerTaskParams {
  consumerName: string;
  consumerCode?: string;
  managerUsers?: string;
  arIds: number[];
  collectorId: number;
  collectorRole: CollectorLevel;
}
```

**`submitUnifiedResult` 参数**（统一操作）：

```typescript
interface SubmitUnifiedResultParams {
  customerTaskId: number;
  collectorId: number;
  resultType: CollectionResultType; // customer_delay/guarantee_delay/paid_off/escalate
  latestPayDate?: Date;
  evidenceUrl?: string;
  signatureData?: string;
  escalateReason?: string;
  remark?: string;
}
```

处理逻辑：
1. 更新 `ar_customer_collection_tasks` 状态
2. 为每个 ar_id 插入 `ar_bill_results` 记录（统一结果）
3. 批量更新 `ar_receivables` 状态
4. 记录操作日志（每个 ar_id 一条 + 客户任务一条）

**`submitMixedResults` 参数**（混合操作）：

```typescript
interface SubmitMixedResultsParams {
  customerTaskId: number;
  collectorId: number;
  bills: Array<{
    arId: number;
    resultType: CollectionResultType;
    latestPayDate?: string;
    remark?: string;
  }>;
  evidenceUrl?: string;      // 公共凭证
  signatureData?: string;    // 公共签名（担保延期用）
}
```

处理逻辑：
1. 更新 `ar_customer_collection_tasks.result_type = 'mixed'`
2. 为每个 bill 插入对应的 `ar_bill_results` 记录
3. 按各自 resultType 更新对应的 `ar_receivables` 状态
4. 如有 customer_delay/paid_off 需审核的，统一触发审核通知

**`escalateCustomerTask` 逻辑**：
1. 标记原客户任务为 `escalated`
2. 创建新的客户任务（同 arIds），分配给下一级催收人
3. 批量更新所有关联 `ar_receivables` 的 collector_level 和 current_collector_id

### 2.2 改造通知服务

文件：`dev/backend/src/services/accounts-receivable/ar-notification.service.ts`

**改造 `sendOverdueCollectNotifications()`**（约300-376行）：

```
原逻辑：
  for (const bill of bills) {
    await createCollectionTask(bill.id, ...);  // 每张单据创建任务
  }

新逻辑：
  await createCustomerTask({
    consumerName,
    consumerCode: bills[0].consumer_code,
    managerUsers,
    arIds: bills.map(b => b.id),               // 一次性创建客户任务
    collectorId: marketingUser.userId,
    collectorRole: 'marketing',
  });
```

同时更新 `ar_receivables.customer_task_id` 字段。

**改造 `checkTimeoutAndPenalty()`**（约381-478行）：

改为查询 `ar_customer_collection_tasks` 表，按客户任务粒度计算考核。考核金额按客户任务的 `total_amount` 计算。

**改造 `processAutoEscalate()`**：

改为查询客户任务表中延期到期的任务，整体升级。

### 2.3 改造审核服务

文件：`dev/backend/src/services/accounts-receivable/ar-review.service.ts`

**改造 `getReviewTasks()`**：查询 `ar_customer_collection_tasks` + `ar_bill_results`，按客户维度返回待审核任务。

**改造 `approveReview()`**：审核通过后，批量更新该客户任务下所有对应 AR 记录的状态。

**改造 `rejectReview()`**：审核拒绝后，批量重置该客户任务下所有 AR 记录为逾期状态。

### 2.4 新增/修改控制器和路由

文件：`dev/backend/src/controllers/accounts-receivable.controller.ts`

新增控制器方法：

| 方法 | HTTP | 路径 | 功能 |
|------|------|------|------|
| `getCustomerTasks` | GET | `/api/ar/customer-tasks` | 获取客户催收任务列表 |
| `getCustomerTaskDetail` | GET | `/api/ar/customer-tasks/:id` | 获取客户任务详情（含单据列表） |
| `submitCustomerCollect` | POST | `/api/ar/customer-tasks/:id/collect` | 统一提交催收结果 |
| `submitCustomerCollectBatch` | POST | `/api/ar/customer-tasks/:id/collect-batch` | 混合提交（不同单据不同结果） |

文件：`dev/backend/src/routes/accounts-receivable.routes.ts`

为新 API 添加路由和权限中间件（使用 `finance:ar:collect` 权限）。

### 2.5 后端类型定义更新

文件：`dev/backend/src/services/accounts-receivable/ar.types.ts`

新增：
- `ArCustomerCollectionTask` interface
- `ArBillResult` interface
- `CollectionResultType` 增加 `'mixed'` 值
- `SubmitUnifiedResultParams` / `SubmitMixedResultsParams` 参数类型

---

## 三、前端改造

### 3.1 类型定义更新

文件：`dev/frontend/src/types/accounts-receivable.d.ts`

新增类型：

```typescript
/** 客户催收任务 */
export interface ArCustomerTask {
  id: number;
  task_no: string;
  consumer_name: string;
  consumer_code: string | null;
  manager_users: string | null;
  ar_ids: number[];
  total_amount: number;
  bill_count: number;
  collector_id: number;
  collector_role: CollectorLevel;
  collector_name?: string;
  assigned_at: string;
  deadline_at: string;
  status: CollectionTaskStatus;
  result_type: CollectionResultType | 'mixed' | null;
  latest_pay_date: string | null;
  evidence_url: string | null;
  signature_data: string | null;
  escalate_reason: string | null;
  remark: string | null;
  review_status: ReviewStatus | null;
  completed_at: string | null;
  remaining_hours?: number;
  timeout_days?: number;
  // 展开后加载的单据列表
  bills?: ArCustomerTaskBill[];
}

/** 客户任务关联的单据 */
export interface ArCustomerTaskBill {
  ar_id: number;
  erp_bill_id: string;
  order_no: string | null;
  left_amount: number;
  due_date: string;
  overdue_days: number;
  ar_status: ArStatus;
  // 混合操作时的单据级结果
  bill_result_type?: CollectionResultType;
  bill_latest_pay_date?: string;
}

/** 混合提交参数 */
export interface BatchCollectionSubmitParams {
  bills: Array<{
    arId: number;
    resultType: CollectionResultType;
    latestPayDate?: string;
    remark?: string;
  }>;
  evidenceUrl?: string;
  signatureData?: string;
}
```

### 3.2 API 服务层更新

文件：`dev/frontend/src/services/api/accounts-receivable.ts`

新增 API 函数：

```typescript
// 获取客户催收任务列表
export async function getCustomerTasks(params: CollectionTaskParams)

// 获取客户任务详情（含单据列表）
export async function getCustomerTaskDetail(taskId: number)

// 统一提交催收结果
export async function submitCustomerCollect(taskId: number, params: CollectionSubmitParams)

// 混合提交（不同单据不同结果）
export async function submitCustomerCollectBatch(taskId: number, params: BatchCollectionSubmitParams)
```

### 3.3 新建客户任务列表组件

文件：`dev/frontend/src/pages/AccountsReceivable/Workspace/components/CustomerTaskList.tsx`

替换现有 `CollectionTaskList.tsx` 在工作台中的位置。

**展示结构**：
- 每个客户一张卡片，显示：客户名、总金额、单据数量、逾期天数范围、剩余催收时间
- 卡片级操作按钮：[延期] [已回款] [升级] [展开单据]
- 展开后显示该客户所有逾期单据列表（子表格/子卡片）
- 展开状态下每张单据有独立操作按钮（用于混合操作场景）
- 快速延期操作（1天/3天/7天）直接在卡片级执行，覆盖所有单据

**桌面端**：使用 Ant Design Table + expandable rows
**移动端**：卡片视图 + 折叠面板 + 无限滚动（沿用现有 `useMobileDetect` 和 `MobileCard` 模式）

### 3.4 新建客户催收弹窗

文件：`dev/frontend/src/pages/AccountsReceivable/Workspace/components/CustomerCollectionModal.tsx`

替换现有 `CollectionModal.tsx` 的使用场景。

**两种模式**：

**模式一：统一操作（默认）**
- 与现有弹窗类似：选择结果类型 + 填写表单
- 顶部显示客户名和涉及单据数量
- 提交后结果自动覆盖所有关联单据

**模式二：混合操作**
- 弹窗中显示所有单据列表
- 每张单据可独立选择结果类型和延期日期
- 底部显示汇总信息
- 提供"全部设为"快捷操作（设置默认值后，可单独调整个别单据）

**切换方式**：弹窗内提供"按单据设置"开关，默认关闭（统一模式），打开后进入混合模式。

### 3.5 改造工作台主页面

文件：`dev/frontend/src/pages/AccountsReceivable/Workspace/index.tsx`

- 将"我的催收"Tab 的组件从 `CollectionTaskList` 替换为 `CustomerTaskList`
- 更新统计卡片的数据来源（从客户任务表查询）
- 弹窗引用改为 `CustomerCollectionModal`

### 3.6 改造审核列表

文件：`dev/frontend/src/pages/AccountsReceivable/Workspace/components/ReviewTaskList.tsx`

- 审核卡片改为按客户维度展示（显示客户名 + 涉及单据数）
- 审核通过/拒绝操作覆盖客户任务下所有单据
- 展开可查看各单据的具体催收结果

### 3.7 改造历史记录

文件：`dev/frontend/src/pages/AccountsReceivable/Workspace/components/HistoryList.tsx`

- 历史记录改为按客户任务维度展示
- 展开可查看各单据的处理结果

### 3.8 改造管理员视图

文件：`dev/frontend/src/pages/AccountsReceivable/Workspace/components/AllCollectionTasks.tsx`

- 改为查询客户任务数据
- 展示改为客户维度

---

## 四、影响范围与兼容策略

### 4.1 需要改造的后端文件清单

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `db/migrations/011_ar_customer_collection_tasks.sql` | **新建** | 新表结构 + 数据迁移 |
| `services/accounts-receivable/ar-customer-task.service.ts` | **新建** | 客户任务核心服务 |
| `services/accounts-receivable/ar.types.ts` | 修改 | 新增类型定义 |
| `services/accounts-receivable/ar-notification.service.ts` | 修改 | 任务创建改为客户维度，超时考核和自动升级改为客户任务 |
| `services/accounts-receivable/ar-review.service.ts` | 修改 | 审核改为客户任务维度 |
| `controllers/accounts-receivable.controller.ts` | 修改 | 新增客户任务相关接口 |
| `routes/accounts-receivable.routes.ts` | 修改 | 新增路由 |

### 4.2 需要改造的前端文件清单

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `types/accounts-receivable.d.ts` | 修改 | 新增客户任务类型 |
| `services/api/accounts-receivable.ts` | 修改 | 新增 API 函数 |
| `Workspace/components/CustomerTaskList.tsx` | **新建** | 客户卡片列表组件 |
| `Workspace/components/CustomerCollectionModal.tsx` | **新建** | 客户催收弹窗（统一+混合模式） |
| `Workspace/index.tsx` | 修改 | 引用新组件 |
| `Workspace/components/ReviewTaskList.tsx` | 修改 | 审核改为客户维度 |
| `Workspace/components/HistoryList.tsx` | 修改 | 历史改为客户维度 |
| `Workspace/components/AllCollectionTasks.tsx` | 修改 | 管理员视图改为客户维度 |

### 4.3 兼容策略

- 保留原 `ar_collection_tasks` 表和数据，不删除不清空
- 新任务创建走 `ar_customer_collection_tasks` 表
- 原有 API（`/api/ar/:id/collect` 等）保留但不再被前端调用
- 前端旧组件（`CollectionTaskList.tsx`、`CollectionModal.tsx`）保留文件但不再被 import

---

## 五、实施步骤

### Step 1: 数据库迁移脚本
- 创建 `011_ar_customer_collection_tasks.sql`
- 在开发环境执行迁移
- 将现有进行中的单据任务聚合迁移为客户任务

### Step 2: 后端类型定义
- 更新 `ar.types.ts`，新增客户任务相关类型

### Step 3: 客户任务服务
- 新建 `ar-customer-task.service.ts`
- 实现 createCustomerTask、getCustomerTasks、getCustomerTaskDetail、submitUnifiedResult、submitMixedResults、escalateCustomerTask

### Step 4: 改造通知服务
- 修改 `ar-notification.service.ts` 中的 sendOverdueCollectNotifications
- 修改 checkTimeoutAndPenalty
- 修改 processAutoEscalate

### Step 5: 改造审核服务
- 修改 `ar-review.service.ts` 改为客户任务维度

### Step 6: 控制器和路由
- 新增控制器方法
- 新增路由配置

### Step 7: 前端类型和 API
- 更新 `accounts-receivable.d.ts`
- 更新 `accounts-receivable.ts` API 层

### Step 8: 前端客户任务列表
- 新建 `CustomerTaskList.tsx`

### Step 9: 前端客户催收弹窗
- 新建 `CustomerCollectionModal.tsx`

### Step 10: 改造工作台主页
- 修改 `Workspace/index.tsx` 引用新组件

### Step 11: 改造审核/历史/管理员视图
- 修改 ReviewTaskList、HistoryList、AllCollectionTasks

---

## 六、验证方案

### 6.1 后端验证

1. 执行数据库迁移脚本，确认表创建成功
2. 启动后端服务（端口 8100），验证无编译错误
3. 使用 curl 测试新增 API：
   - `GET /api/ar/customer-tasks` 返回客户维度任务列表
   - `GET /api/ar/customer-tasks/:id` 返回任务详情含单据列表
   - `POST /api/ar/customer-tasks/:id/collect` 统一提交
   - `POST /api/ar/customer-tasks/:id/collect-batch` 混合提交

### 6.2 前端验证

1. 启动前端服务（端口 3100），确认无编译错误
2. 登录营销师账号，进入催收工作台
3. 验证场景：
   - 客户卡片列表正确显示（按客户聚合，显示总金额和单据数）
   - 展开卡片可查看所有逾期单据
   - 快速延期操作覆盖所有单据
   - 打开催收弹窗，默认统一模式正常提交
   - 切换到混合模式，可为不同单据设置不同结果并提交
   - 升级催收整体升级到下一级
   - 审核列表按客户维度展示
   - 移动端卡片布局正常

### 6.3 业务流程验证

1. 模拟逾期推送（或手动触发），确认创建的是客户任务而非单据任务
2. 提交客户延期 -> 验证所有关联单据状态更新为 collecting
3. 审核通过 -> 验证所有单据状态正确
4. 审核拒绝 -> 验证所有单据重置为 overdue
5. 升级催收 -> 验证创建新客户任务分配给上级
6. 混合操作 -> 验证各单据按各自 resultType 正确处理
