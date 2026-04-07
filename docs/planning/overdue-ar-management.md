# 逾期应收账款管理功能设计方案

## 一、背景与目标

### 问题现状
- 当前有1543笔逾期应收账款，总金额约237万元
- 其中重度逾期(60天以上)1459笔，约207万元
- 缺乏统一的逾期账款全流程管理
- 不清楚逾期总量、催收进度、节点执行时效

### 目标
建立逾期应收账款全流程管理系统，解决"总量不清、进度不明、节点超时、缺乏预警"四大痛点。

---

## 二、核心设计理念：客户维度

### 为什么是客户维度？
催收是针对客户的，一个客户的所有逾期单据应该作为一个整体来催收，而不是分开处理。

**示例**：客户"基长艾三批发"有39笔逾期单据，总金额208,143元
- 正确做法：创建一个客户催收任务，催收人联系客户后，可以一次性处理所有单据
- 错误做法：创建39个单据催收任务，催收人需要处理39次

### 现有系统已支持
`ar_customer_collection_tasks` 表已实现客户维度催收：
- `ar_ids` 数组：存储该客户所有关联单据ID
- `bill_count`：单据数量
- `total_amount`：客户欠款总额

### 核心流程（客户维度）

```
客户逾期任务创建（按客户聚合单据）
         ↓
   财务预处理（核实客户信息、整理单据）
         ↓
   营销主管分配（分配给营销师）
         ↓
   营销师催收执行（联系客户，处理该客户所有单据）
         ↓
   财务审核
         ↓
   流程完成
```

**每个节点的时限按客户的逾期等级确定**

---

## 三、流程节点与时限设计

```
财务预处理 → 营销主管分配 → 营销师催收执行 → 财务审核
    ↓              ↓              ↓              ↓
 8-24h时限      2-8h时限       24-72h时限     24h时限
 (按时限分级)   (按时限分级)   (按时限分级)
```

### 逾期分级标准
| 等级 | 逾期时长 | 金额（现有）|
|------|---------|------------|
| 轻度 | 30天内 | 61笔，约21万 |
| 中度 | 31-60天 | 23笔，约8.9万 |
| 重度 | 60天以上 | 1459笔，约207万 |

### 节点时限配置（可配置）
| 节点 | 轻度 | 中度 | 重度 | 执行角色 |
|------|-----|-----|-----|---------|
| 财务预处理 | 24h | 16h | 8h | finance_staff |
| 营销主管分配 | 8h | 4h | 2h | marketing_supervisor |
| 营销师催收 | 72h | 48h | 24h | marketing |
| 财务审核 | 24h | 24h | 24h | finance_staff |

---

## 四、数据模型设计

### 4.1 核心实体关系（客户维度）

```
┌─────────────────────────────────────────────────────────────────┐
│                    ar_customer_collection_tasks                 │
│                      （客户催收任务 - 核心）                      │
│                                                                 │
│  id, task_no, consumer_name, consumer_code                      │
│  ar_ids[数组] → 关联多个 ar_receivables                          │
│  bill_count, total_amount                                       │
│  overdue_level → 逾期等级（核心字段）                            │
│  flow_status → 流程状态（核心字段）                              │
│  collector_id, deadline_at, status                              │
│  node_deadlines, node_statuses → 各节点状态                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ ar_ids 数组关联
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                       ar_receivables                            │
│                    （应收账款单据 - 明细）                        │
│                                                                 │
│  id, erp_bill_id, consumer_name                                 │
│  left_amount, due_date, overdue_days                            │
│  overdue_level → 继承自客户任务                                  │
│  customer_task_id → 关联客户任务                                 │
└─────────────────────────────────────────────────────────────────┘
```

**设计原则**：
- 流程状态、时限控制都在**客户任务级别**管理
- 单据表只保留基本信息和关联关系
- 一个客户的所有单据共享同一个逾期等级（取最严重的）

### 4.2 ar_customer_collection_tasks 扩展字段

```sql
-- 新增字段
overdue_level VARCHAR(20)         -- 逾期等级: light/medium/severe（取该客户最严重的单据等级）
flow_status VARCHAR(30)           -- 流程状态: initial/preprocessing/assigned/collecting/completed
preprocessing_at TIMESTAMP        -- 财务预处理时间
preprocessed_by INTEGER           -- 预处理人
preprocessing_status VARCHAR(20)  -- 预处理状态: pending/in_progress/completed/skipped
assignment_at TIMESTAMP           -- 任务分配时间
assigned_by INTEGER               -- 任务分配人
node_deadlines JSONB              -- 各节点截止时间 {"preprocessing": "2026-04-10T10:00:00", ...}
node_statuses JSONB               -- 各节点状态 {"preprocessing": "completed", "assignment": "pending", ...}
timeout_warnings JSONB            -- 超时预警记录
performance_metrics JSONB         -- 绩效指标
```

### 4.3 ar_receivables 扩展字段

```sql
-- 仅需新增关联字段
customer_task_id INTEGER          -- 关联客户催收任务ID
overdue_level VARCHAR(20)         -- 逾期等级（冗余存储，便于查询）
```

### 4.4 新增数据表

#### 时限配置表 ar_deadline_configs
```sql
CREATE TABLE ar_deadline_configs (
  id SERIAL PRIMARY KEY,
  node_type VARCHAR(30) NOT NULL,      -- preprocessing/assignment/collection
  overdue_level VARCHAR(20) NOT NULL,  -- light/medium/severe
  deadline_hours INTEGER NOT NULL,     -- 时限（小时）
  warning_hours INTEGER DEFAULT 4,     -- 预警提前时间
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE(node_type, overdue_level)
);
```

#### 流程节点记录表 ar_flow_nodes（客户任务级别）
```sql
CREATE TABLE ar_flow_nodes (
  id SERIAL PRIMARY KEY,
  customer_task_id INTEGER REFERENCES ar_customer_collection_tasks(id),
  node_type VARCHAR(30) NOT NULL,      -- preprocessing/assignment/collection/review
  node_status VARCHAR(20) DEFAULT 'pending',
  operator_id INTEGER REFERENCES users(id),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  deadline_at TIMESTAMP,
  actual_hours DECIMAL(10,2),
  is_timeout BOOLEAN DEFAULT FALSE,
  node_data JSONB
);
```

#### 逾期统计快照表 ar_overdue_stats
```sql
CREATE TABLE ar_overdue_stats (
  id SERIAL PRIMARY KEY,
  stat_date DATE NOT NULL UNIQUE,
  -- 客户维度统计
  total_customer_count INTEGER DEFAULT 0,    -- 逾期客户数
  total_overdue_amount DECIMAL(15,2) DEFAULT 0,
  total_bill_count INTEGER DEFAULT 0,        -- 逾期单据数
  -- 按等级统计
  light_customer_count INTEGER DEFAULT 0,
  light_amount DECIMAL(15,2) DEFAULT 0,
  medium_customer_count INTEGER DEFAULT 0,
  medium_amount DECIMAL(15,2) DEFAULT 0,
  severe_customer_count INTEGER DEFAULT 0,
  severe_amount DECIMAL(15,2) DEFAULT 0,
  -- 流程节点统计
  preprocessing_pending_count INTEGER DEFAULT 0,
  assignment_pending_count INTEGER DEFAULT 0,
  collection_pending_count INTEGER DEFAULT 0
);
```

#### 时效分析表 ar_time_efficiency
```sql
CREATE TABLE ar_time_efficiency (
  id SERIAL PRIMARY KEY,
  customer_task_id INTEGER REFERENCES ar_customer_collection_tasks(id),
  preprocessing_hours DECIMAL(10,2),
  assignment_hours DECIMAL(10,2),
  collection_hours DECIMAL(10,2),
  total_hours DECIMAL(10,2),
  preprocessing_on_time BOOLEAN,
  assignment_on_time BOOLEAN,
  collection_on_time BOOLEAN,
  stat_date DATE
);
```

---

## 五、前端页面设计

### 5.1 页面结构总览

| 路由 | 页面 | 功能 |
|------|------|------|
| `/finance/ar/overdue` | 逾期管理总览 | 统计卡片、等级分布、流程状态、超时预警 |
| `/finance/ar/time-efficiency` | 时效分析报表 | 时效趋势、节点时效明细、超时统计 |
| `/finance/ar/customer-analysis` | 客户逾期分析 | 客户逾期明细、趋势图、风险排名 |
| `/finance/ar/performance` | 催收绩效报表 | 绩效指标、人员排名、成功率趋势 |

---

### 5.2 逾期管理总览页面设计

**页面路径**: `dev/frontend/src/pages/AccountsReceivable/Overdue/`

**布局结构**:
```
OverdueManagement
├── PageHeader (标题 + 时限配置按钮)
├── OverdueStatsCards (4张统计卡片)
│   ├── 逾期客户数 (SummaryCard)
│   ├── 逾期总额 (SummaryCard)
│   ├── 平均逾期天数 (SummaryCard)
│   └── 超时预警数 (SummaryCard, 可点击)
├── FlowStatusPanel (流程状态面板)
│   ├── 财务预处理进度
│   ├── 待分配任务数
│   ├── 催收中任务数
│   └── 待审核任务数
├── Tabs (Tab切换)
│   ├── 待预处理 (PreprocessingList)
│   ├── 待分配 (AssignmentList)
│   ├── 催收中 (CollectingList)
│   └── 超时预警 (TimeoutWarningList)
└── PreprocessingModal (预处理操作弹窗)
```

**组件文件结构**:
```
Overdue/
├── index.tsx                    # 主页面 (约150行)
├── index.less                   # 样式文件
├── components/
│   ├── OverdueStatsCards.tsx    # 统计卡片组
│   ├── FlowStatusPanel.tsx      # 流程状态面板
│   ├── PreprocessingList.tsx    # 待预处理列表
│   ├── AssignmentList.tsx       # 待分配列表
│   ├── CollectingList.tsx       # 催收中列表
│   ├── TimeoutWarningList.tsx   # 超时预警列表
│   ├── PreprocessingModal.tsx   # 预处理弹窗
│   ├── AssignmentModal.tsx      # 分配弹窗
│   └── DeadlineConfigModal.tsx  # 时限配置弹窗
└── hooks/
    ├── useOverdueStats.ts       # 统计数据Hook
    └── useTimeoutWarning.ts     # 超时预警Hook
```

**核心交互**:
1. 统计卡片可点击跳转到对应Tab
2. 流程状态面板显示各节点待办数量，点击可筛选
3. 列表支持按逾期等级、客户名称筛选
4. 预处理弹窗支持批量操作（批量标记已核实/跳过）
5. 分配弹窗支持选择营销师

---

### 5.3 时效分析报表页面设计

**页面路径**: `dev/frontend/src/pages/AccountsReceivable/TimeEfficiency/`

**布局结构**:
```
TimeEfficiency
├── PageHeader
├── EfficiencyStatsCards (3张卡片)
│   ├── 平均总耗时
│   ├── 节点按时完成率
│   └── 超时任务数
├── FilterCard (筛选条件)
│   ├── 日期范围选择
│   ├── 逾期等级选择
│   └── 节点类型选择
├── ChartsRow (两列图表)
│   ├── EfficiencyTrendChart (时效趋势折线图)
│   └── NodeEfficiencyChart (各节点效率对比)
└── EfficiencyTable (节点时效明细表)
    ├── 客户任务编号
    ├── 客户名称
    ├── 预处理耗时 (红/黄/绿标识)
    ├── 分配耗时
    ├── 催收耗时
    ├── 总耗时
    └── 是否超时
```

---

### 5.4 客户逾期分析页面设计

**页面路径**: `dev/frontend/src/pages/AccountsReceivable/CustomerAnalysis/`

**布局结构**:
```
CustomerAnalysis
├── PageHeader
├── CustomerStatsCards (3张卡片)
│   ├── 逾期客户数
│   ├── 最大单客户欠款
│   └── 新增逾期客户(本周)
├── ChartsRow
│   ├── CustomerDistributionChart (客户逾期金额分布)
│   └── CustomerRiskChart (风险等级分布)
└── CustomerOverdueTable (客户逾期明细表)
    ├── 客户名称
    ├── 逾期单据数
    ├── 逾期总额
    ├── 最高逾期等级
    ├── 最长逾期天数
    ├── 催收人
    └── 操作 (查看详情)
```

---

### 5.5 催收绩效报表页面设计

**页面路径**: `dev/frontend/src/pages/AccountsReceivable/Performance/`

**布局结构**:
```
Performance
├── PageHeader
├── PerformanceCards (4张卡片)
│   ├── 总催收任务数
│   ├── 已完成任务数
│   ├── 平均催收时长
│   └── 催收成功率
├── CollectorRanking (催收人员排名)
│   ├── 排名表
│   ├── 任务数
│   ├── 完成数
│   ├── 成功率
│   └── 平均耗时
└── PerformanceTrendChart (绩效趋势图)
```

---

### 5.6 组件复用设计

**复用现有组件**:
- `SummaryCard` - 统计卡片
- `Authorized` - 权限控制
- `CustomerTaskList` - 客户任务列表（扩展现有组件）
- `TaskDetail` - 任务详情抽屉

**新增通用组件**:
```
components/
├── FlowStatusPanel/           # 流程状态面板
│   ├── index.tsx
│   └── index.less
├── TimeoutBadge/              # 超时标记组件
│   ├── index.tsx
│   └── index.less
└── EfficiencyIndicator/       # 时效指标组件
    ├── index.tsx
    └── index.less
```

---

### 5.7 响应式设计

**断点设计**:
- **桌面端 (≥992px)**: 4列统计卡片、表格展示
- **平板 (768px-991px)**: 2列卡片、表格展示
- **移动端 (<768px)**: 1列卡片、卡片列表替代表格

**样式规范**:
```less
@import '~@/styles/variables.less';

.page {
  padding: @spacing-lg;  // 桌面: 24px
  background-color: @bg-color-base;
}

@media (max-width: @screen-md) {
  .page { padding: @spacing-md; }  // 平板: 16px
}

@media (max-width: @screen-sm) {
  .page { padding: @spacing-sm; }  // 移动: 8px
}
```

---

### 5.8 API 设计

#### 逾期管理
```
GET  /api/ar/overdue/stats              # 逾期统计
GET  /api/ar/overdue/preprocessing      # 待预处理列表
POST /api/ar/overdue/preprocessing/start    # 开始预处理
POST /api/ar/overdue/preprocessing/complete # 完成预处理
GET  /api/ar/overdue/assignment         # 待分配列表
POST /api/ar/overdue/assignment/assign  # 分配任务
GET  /api/ar/overdue/deadline-configs   # 时限配置
PUT  /api/ar/overdue/deadline-configs/:id # 更新配置
GET  /api/ar/overdue/timeout-warnings   # 超时预警列表
```

#### 报表分析
```
GET  /api/ar/overdue/time-efficiency    # 时效分析
GET  /api/ar/overdue/customers          # 客户逾期列表
GET  /api/ar/overdue/performance        # 绩效统计
```

### 5.9 权限配置

```typescript
FINANCE: {
  AR: {
    OVERDUE: {
      READ: 'finance:ar:overdue:read',        // 逾期管理查看
      PREPROCESS: 'finance:ar:overdue:preprocess', // 财务预处理
      ASSIGN: 'finance:ar:overdue:assign',    // 任务分配
      CONFIG: 'finance:ar:overdue:config',    // 时限配置
    },
    EFFICIENCY: {
      READ: 'finance:ar:efficiency:read',     // 时效分析
    },
    CUSTOMER: {
      READ: 'finance:ar:customer:read',       // 客户分析
    },
    PERFORMANCE: {
      READ: 'finance:ar:performance:read',    // 绩效查看
    },
  },
}
```

---

## 六、实现步骤

### 阶段一：数据模型和基础服务
1. 创建数据库迁移脚本 `012_ar_overdue_management.sql`
2. 扩展类型定义文件
3. 实现时限计算服务 `deadline.service.ts`
4. 修改数据同步服务添加逾期等级计算

### 阶段二：财务预处理功能
1. 实现预处理服务 `preprocessing.service.ts`
2. 新增预处理相关 API 路由
3. 前端预处理列表页面

### 阶段三：任务分配功能
1. 实现任务分配服务 `assignment.service.ts`
2. 新增分配相关 API
3. 前端分配功能页面

### 阶段四：超时预警机制
1. 实现超时预警服务 `timeout-warning.service.ts`
2. 定时任务配置（每10分钟检查）
3. 钉钉预警通知

### 阶段五：报表功能
1. 时效分析报表
2. 客户逾期分析
3. 催收绩效报表

### 阶段六：历史数据迁移
1. 执行历史数据逾期等级计算
2. 数据校验

---

## 七、关键文件清单

### 后端
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| `dev/backend/src/db/migrations/012_ar_overdue_management.sql` | 新建 | 数据库迁移 |
| `dev/backend/src/services/accounts-receivable/overdue/*.ts` | 新建 | 逾期管理服务 |
| `dev/backend/src/services/accounts-receivable/ar-sync.service.ts` | 修改 | 添加逾期等级计算 |
| `dev/backend/src/services/accounts-receivable/ar-customer-task.service.ts` | 修改 | 扩展流程节点 |
| `dev/backend/src/routes/accounts-receivable.routes.ts` | 修改 | 新增API路由 |
| `dev/backend/src/controllers/accounts-receivable.controller.ts` | 修改 | 新增控制器方法 |

### 前端
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| `dev/frontend/src/pages/AccountsReceivable/Overdue/` | 新建 | 逾期管理页面 |
| `dev/frontend/src/pages/AccountsReceivable/TimeEfficiency/` | 新建 | 时效分析页面 |
| `dev/frontend/src/pages/AccountsReceivable/CustomerAnalysis/` | 新建 | 客户分析页面 |
| `dev/frontend/src/pages/AccountsReceivable/Performance/` | 新建 | 绩效报表页面 |
| `dev/frontend/src/types/accounts-receivable.d.ts` | 修改 | 类型定义扩展 |
| `dev/frontend/src/services/api/accounts-receivable.ts` | 修改 | API服务扩展 |
| `dev/frontend/src/constants/permissions.ts` | 修改 | 权限常量新增 |
| `dev/frontend/.umirc.ts` | 修改 | 路由配置 |

---

## 八、验证方案

### 功能验证
1. 确保后端服务运行中（端口 8100）
2. 确保前端服务运行中（端口 3100）
3. 验证逾期管理页面能正确展示统计数据
4. 验证预处理流程能正常执行
5. 验证任务分配流程能正常执行
6. 验证超时预警能正常触发
7. 验证各报表能正确展示数据

### 数据验证
1. 确认历史数据逾期等级正确计算
2. 确认各节点时效正确记录
3. 确认统计数据准确

---

## 九、技术要点

### 复用现有功能
- 客户维度催收任务机制
- 催收层级 (marketing → supervisor → finance)
- 审核流程
- 操作日志
- 钉钉通知推送

### 性能考虑
- 使用索引优化大量逾期数据查询
- 统计报表使用定时预计算快照
- 超时检查采用批量增量处理

### 兼容性
- 新增字段设置默认值保证向后兼容
- 现有催收流程不受影响
