# 统一考核管理架构设计方案

## Context

项目中存在两套独立考核系统——催收考核(ar-assessment)和退货考核(return-penalty)，它们本质上做的是同一件事：**某人因某规则在某时间产生考核记录**。但两套系统各自实现了独立的类型定义、数据库表、计算引擎、通知服务和前端页面，导致：
- 新增考核类型需从零搭建全套代码，无法复用
- 两套系统的状态机、统计逻辑、通知逻辑高度相似却各自维护
- 跨域查询考核数据需要 UNION 两张表
- 前端用户需在不同页面查看不同域的考核信息

目标：**全面重构为统一框架**，合并为一张数据库表、一套后端服务、一个前端考核中心页面。

---

## 一、统一类型系统

### 核心枚举

```
AssessmentCategory = 'ar_collection' | 'return_order'
AssessmentRuleType = string  // tier1/tier2/tier3 | procurement_confirm_timeout/...
AssessmentStatus   = 'pending' | 'confirmed' | 'cancelled' | 'appealed'
AssessmentRole     = 'marketer' | 'marketing_supervisor' | 'procurement_manager' | 'marketing_manager' | 'warehouse_manager' | 'warehouse_keeper' | 'logistics_manager'
```

### 状态映射

| 旧系统 | 旧状态 | → 新状态 |
|--------|--------|---------|
| 催收 | handled | confirmed |
| 催收 | skipped | cancelled |
| 退货 | confirmed | confirmed |
| 退货 | cancelled | cancelled |
| 退货 | appealed | appealed |

状态机通过规则注册表的 `allowedTransitions` 配置，**所有 category 统一支持申诉**：

```
pending → confirmed    （标记已处理/确认）
pending → cancelled    （标记无需考核/取消）
pending → appealed     （发起申诉 → 创建OA审批实例）
appealed → cancelled   （OA审批通过 → 自动标记为无需考核）
appealed → pending     （OA审批驳回 → 恢复待处理状态）
```

两种 category 的 `allowedTransitions` 完全一致：
- `ar_collection`: pending → [confirmed, cancelled, appealed]
- `return_order`: pending → [confirmed, cancelled, appealed]

### 关联业务实体

统一用 `source_type` + `source_id` 实现多态关联：
- `source_type = 'ar_collection_task'` → 关联 ar_collection_tasks
- `source_type = 'expiring_return_order'` → 关联 expiring_return_orders

---

## 二、数据库设计

### 新表 assessment_records

```sql
CREATE TABLE assessment_records (
  id                   SERIAL PRIMARY KEY,
  category             VARCHAR(30) NOT NULL,      -- ar_collection | return_order
  rule_type            VARCHAR(50) NOT NULL,      -- tier1 | procurement_confirm_timeout | ...
  source_type          VARCHAR(50) NOT NULL,      -- ar_collection_task | expiring_return_order
  source_id            INTEGER NOT NULL,
  source_no            VARCHAR(50),               -- 冗余: task_no / return_no
  source_name          VARCHAR(200),              -- 冗余: consumer_name / goods_name
  assessment_user_id   INTEGER NOT NULL REFERENCES users(id),
  assessment_user_name VARCHAR(100),
  assessment_role      VARCHAR(30) NOT NULL,
  base_amount          DECIMAL(15,2),
  penalty_rate         DECIMAL(10,2),             -- 每天考核金额(退货按天累计用)
  overdue_days         INTEGER DEFAULT 0,
  penalty_amount       DECIMAL(15,2) NOT NULL,
  status               VARCHAR(20) DEFAULT 'pending',
  handle_remark        TEXT,
  handled_by           INTEGER REFERENCES users(id),
  handled_at           TIMESTAMP,
  oa_instance_id       INTEGER REFERENCES oa_approval_instances(id), -- 关联的OA审批实例
  appeal_reason        TEXT,                      -- 申诉理由
  appeal_submitted_at  TIMESTAMP,                 -- 申诉提交时间
  rule_snapshot        JSONB,
  calculated_at        TIMESTAMP,
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_id, source_type, rule_type, assessment_user_id)
);
```

关键索引：category, rule_type, (source_type, source_id), assessment_user_id, status, created_at, (category, status), oa_instance_id

### 数据迁移

迁移脚本 `050_unified_assessment.sql`：
1. 创建新表（含 oa_instance_id, appeal_reason, appeal_submitted_at 字段）
2. INSERT FROM ar_assessment_records（状态映射：handled→confirmed, skipped→cancelled，JOIN ar_collection_tasks 获取 source_no/source_name）
3. INSERT FROM return_penalty_records（状态不变， appealed 状态的记录将 oa_instance_id 置 NULL（旧申诉无OA关联），JOIN expiring_return_orders 获取 source_no/source_name）
4. 旧表 RENAME TO `_deprecated`（保留回退能力）
5. 新增权限种子数据
6. 为旧权限角色分配新权限

额外迁移 `051_assessment_appeal_form_type.sql`：
1. INSERT `oa_form_types` 种子数据（code='assessment_appeal', 含 formSchema 和 workflowDef 的 JSONB）

---

## 三、后端架构

### 目录结构

```
dev/backend/src/services/assessment/
├── index.ts                        # 模块导出
├── assessment.types.ts             # 统一类型定义
├── assessment.rules.ts             # 规则注册表 + AssessmentRuleDefinition 接口
├── assessment.repository.ts        # Repository 层(SQL + 缓存)
├── assessment.mapper.ts            # DTO 映射(toCamelKeys/数值精度/JSON解析)
├── assessment.service.ts           # 业务逻辑(查询/统计/状态操作)
├── assessment-calculate.ts         # 计算引擎入口(runCalculation)
├── assessment-notify.ts            # 统一钉钉通知
├── rules/
│   ├── ar-collection-rules.ts      # 催收3条规则注册+实现
│   └── return-order-rules.ts       # 退货5条规则注册+实现
└── utils.ts                        # 共用: getUsersByRole, findUserByName, getPurchasePrice
```

### 申诉OA审批集成

新增OA表单类型 `assessment_appeal`（考核申诉），注册到现有OA审批系统。

**文件**: `dev/backend/src/services/oa-approval/form-types/assessment-appeal.ts`

```typescript
export const assessmentAppealFormType: FormTypeDefinition = {
  code: 'assessment_appeal',
  name: '考核申诉',
  icon: 'AuditOutlined',
  category: 'supply_chain',
  sortOrder: 50,
  description: '员工对考核结果提出申诉',
  version: 1,

  formSchema: {
    fields: [
      {
        key: 'assessmentId',
        label: '考核记录ID',
        type: 'number',
        required: true,
        disabled: true,  // 前端提交时自动注入，不可修改
      },
      {
        key: 'assessmentCategory',
        label: '考核类别',
        type: 'select',
        required: true,
        disabled: true,
        options: [
          { value: 'ar_collection', label: '催收考核' },
          { value: 'return_order', label: '退货考核' },
        ],
      },
      {
        key: 'assessmentRuleType',
        label: '考核规则',
        type: 'text',
        required: true,
        disabled: true,
      },
      {
        key: 'assessmentUserName',
        label: '被考核人',
        type: 'text',
        required: true,
        disabled: true,
      },
      {
        key: 'penaltyAmount',
        label: '考核金额(元)',
        type: 'money',
        required: true,
        disabled: true,
      },
      {
        key: 'appealReason',
        label: '申诉理由',
        type: 'textarea',
        required: true,
        maxLength: 500,
        placeholder: '请详细说明申诉原因',
      },
      {
        key: 'supportingDocuments',
        label: '支持性材料',
        type: 'upload',
        required: false,
        maxCount: 5,
      },
    ],
  },

  workflowDef: {
    nodes: [
      {
        order: 1,
        name: '直属主管初审',
        type: 'dynamic_supervisor',
      },
      {
        order: 2,
        name: '部门负责人审核',
        type: 'role',
        roleCode: 'operations_manager',  // 运营经理
      },
      {
        order: 3,
        name: '更新考核状态',
        type: 'auto',
      },
    ],
  },

  // 申诉通过回调：自动将考核记录标记为"无需考核"
  onApproved: onApprovedAssessmentAppeal,

  // 申诉驳回回调：恢复考核记录为"待处理"
  onRejected: onRejectedAssessmentAppeal,
};
```

**回调实现**: `dev/backend/src/services/oa-approval/assessment-appeal-callback.ts`

```typescript
import { updateAssessmentStatusByAppeal } from '../assessment/assessment.service';

export async function onApprovedAssessmentAppeal(
  instance: OaApprovalInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  const assessmentId = Number(formData.assessmentId);
  // 申诉通过 → 考核记录标记为"无需考核"(cancelled)
  await updateAssessmentStatusByAppeal(assessmentId, {
    status: 'cancelled',
    oaInstanceId: instance.id,
    handleRemark: `申诉审批通过(审批单号: ${instance.instance_no})，自动标记为无需考核`,
  });
}

export async function onRejectedAssessmentAppeal(
  instance: OaApprovalInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  const assessmentId = Number(formData.assessmentId);
  // 申诉驳回 → 恢复为"待处理"(pending)，员工可重新标记或申诉
  await updateAssessmentStatusByAppeal(assessmentId, {
    status: 'pending',
    oaInstanceId: instance.id,
    handleRemark: `申诉审批驳回(审批单号: ${instance.instance_no})`,
  });
}
```

**注册**: 在 `form-types/index.ts` 的 `ALL_FORM_TYPES` 数组中添加 `assessmentAppealFormType`

**申诉提交流程**:

```
1. 前端点击[申诉]按钮 → 打开申诉弹窗，填写申诉理由
2. 前端调用 POST /api/assessment/:id/appeal
3. 后端 assessment.service.ts:
   a. 校验记录状态为 pending
   b. 更新 assessment_records:
      - status = 'appealed'
      - appeal_reason = 用户填写的理由
      - appeal_submitted_at = now()
   c. 调用 OA 审批提交接口: submitApproval({
        formTypeCode: 'assessment_appeal',
        title: `考核申诉 - ${record.source_no} - ${record.assessment_user_name}`,
        formData: {
          assessmentId: record.id,
          assessmentCategory: record.category,
          assessmentRuleType: ruleDef.name,
          assessmentUserName: record.assessment_user_name,
          penaltyAmount: record.penalty_amount,
          appealReason: reason,
        }
      })
   d. 回写 oa_instance_id 到 assessment_records
   e. 发送钉钉通知
4. OA审批流转:
   - 直属主管 → 部门负责人 → auto节点
   - auto节点触发 onApproved 回调 → 更新考核状态为 cancelled
   - 若驳回 → 触发 onRejected 回调 → 恢复考核状态为 pending
```

### 规则注册机制

```typescript
interface AssessmentRuleDefinition {
  category: AssessmentCategory;
  ruleType: string;
  name: string;
  description: string;
  triggerMode: 'scheduled' | 'realtime' | 'both';
  calculationModel: 'fixed_amount' | 'per_day' | 'ratio' | 'full_amount';
  allowedTransitions: Record<string, string[]>;
  statusLabels: Record<string, string>;
  sourceType: string;
  sourceLabel: string;
  calculate: (ctx: CalculationContext) => Promise<CalculationResult[]>;
  buildNotification: (records: AssessmentRecord[], role: string) => NotificationContent;
}
```

全局注册表 `ASSESSMENT_RULE_REGISTRY`，key = `${category}:${ruleType}`。

### 计算引擎

```typescript
async function runCalculation(ctx: CalculationContext): Promise<CalculationResult[]> {
  // ctx.triggeredBy: 'scheduled' | 'manual' | 'realtime'
  // ctx.category?: 过滤特定域
  // 遍历注册表，跳过 triggerMode 不匹配的规则
  // 逐规则执行 calculate()
}
```

### Repository 层

- 缓存前缀 `assessment:`，key 格式 `assessment:{category}:records:{hash}`
- 写入后自动失效 `assessment:{category}:`
- upsertRecord: INSERT ON CONFLICT DO UPDATE WHERE status='pending'
- 支持 category 过滤的查询和统计

### API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/assessment` | 考核列表(支持 category 筛选) |
| GET | `/api/assessment/stats` | 统计(支持 category 筛选) |
| GET | `/api/assessment/my` | 我的考核 |
| GET | `/api/assessment/:id` | 单条详情 |
| POST | `/api/assessment/:id/action` | 统一状态操作 `{action, remark?}` |
| POST | `/api/assessment/:id/appeal` | 发起申诉 `{reason, documents?}` → 创建OA审批实例 |
| POST | `/api/assessment/calculate` | 手动触发计算 `{category?, ruleType?}` |
| GET | `/api/assessment/categories` | 获取分类配置(规则注册表摘要) |

权限编码：`assessment:read` / `assessment:write`

### 定时任务调整

修改 `scheduler/index.ts`，改为调用 `runCalculation`：
- 08:45 → `runCalculation({ triggeredBy: 'scheduled', category: 'return_order' })`
- 20:30 → `runCalculation({ triggeredBy: 'scheduled', category: 'ar_collection' })`

### 实时触发调整

`return-order.mutation.ts` 中的 `createReturnExpireInsufficientPenalty` 改为调用 `runCalculation({ triggeredBy: 'realtime', category: 'return_order', ruleType: 'return_expire_insufficient', sourceId })` 或直接调用规则注册表中对应规则的 calculate。

---

## 四、前端架构

### 页面路由

新增 `/assessment`，旧路由重定向：
- `/collection/assessment` → `/assessment?category=ar_collection`
- `/procurement/return/penalty` → `/assessment?category=return_order`

### 目录结构

```
dev/frontend/src/pages/Assessment/
├── index.tsx                           # 页面入口(≤150行)
├── index.less
├── hooks/
│   ├── useAssessmentData.ts            # 数据获取
│   ├── useAssessmentFilters.ts         # 筛选+URL状态(category放URL)
│   └── useAssessmentActions.ts         # 操作+弹窗控制(含申诉操作)
└── components/
    ├── CategoryTabs.tsx                # 催收/退货 Tab
    ├── AssessmentStats.tsx             # 统计卡片(按category切换指标名)
    ├── AssessmentFilter.tsx            # 统一筛选(按category动态字段)
    ├── AssessmentTable.tsx             # 统一表格(按category动态列)
    ├── HandleModal.tsx                 # 标记处理弹窗(已处理/无需考核)
    ├── AppealModal.tsx                 # 申诉弹窗(理由+材料上传)
    ├── AppealStatusTag.tsx             # 申诉中状态Tag(含OA审批链接)
    ├── RulesDescription.tsx            # 规则说明(按category展示)
    └── columns/
        ├── arCollectionColumns.tsx     # 催收考核列定义
        └── returnOrderColumns.tsx      # 退货考核列定义
```

### 页面整体布局（线框图）

```
┌─────────────────────────────────────────────────────────────────────┐
│  考核中心                                                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐                                  │
│  │ 催收考核  (3) │  │ 退货考核  (5) │   ← CategoryTabs (Ant Tabs)    │
│  └──────────────┘  └──────────────┘                                  │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │总考核金额│ │待确认(条)│ │待确认金额│ │已确认(条)│ │今日新增 │ │涉及人数 │  │
│  │ ¥1,230  │ │   12    │ │  ¥320   │ │   45    │ │   3     │ │   8     │  │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘  │
│                                                                      │
│  ↑ AssessmentStats: 6 个 Card + Statistic, Row(gutter=16), Col(span=4)│
│  ↑ 指标名称通过 statusLabels 动态切换：                                │
│     催收: 待处理/已处理/无需考核/申诉中                                 │
│     退货: 待处理/已处理/无需考核/申诉中                                 │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [🔍 搜索任务编号/客户/商品/人员]  [规则类型 ▼]  [角色 ▼]  [状态 ▼]  [日期范围]  [刷新] │
│                                                                      │
│  ↑ AssessmentFilter: Input + Select + RangePicker + Button          │
│  ↑ 规则类型下拉：催收=层级(tier1/2/3), 退货=5种类型                    │
│  ↑ 角色下拉：催收=营销师/营销主管, 退货=5种角色                         │
│  ↑ 状态下拉：待处理/已处理/无需考核/申诉中 (两种category统一)            │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ 业务编号 │来源│被考核人│角色│规则类型│超时天数│考核金额│状态  │操作         │  │
│  ├──────────┼───┼───────┼───┼───────┼───────┼───────┼──────┼─────────────┤  │
│  │ AR202601 │催收│张三  │营销│一级   │3天    │¥10.00 │待处理│标记│申诉    │  │
│  │ RT202602 │退货│李四  │采购│采购超 │5天    │¥50.00 │申诉中│查看申诉    │  │
│  │          │   │      │   │时     │       │       │(紫) │            │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ↑ AssessmentTable: Ant Table, scroll.x=1500, 分页, 固定操作列        │
│  ↑ 表格列根据 category 动态渲染(见下方列定义)                           │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ 考核规则说明                                                    │  │
│  ├─────────────────────────────────────────────────────────────────┤  │
│  │ (催收 Tab)                        │(退货 Tab)                   │  │
│  │ 1. 一级考核(3-5天)：营销师10元/   │1. 采购确认超时：10元/天/SKU│  │
│  │    任务，营销主管20元/任务        │2. 营销销售超时：按进价全额 │  │
│  │ 2. 二级考核(5-7天)：追加营销师    │3. 退货保质期不足：按进价全额│  │
│  │    20元/任务，营销主管40元/任务   │4. ERP录入超时：10元/天/SKU│  │
│  │ 3. 三级考核(7天以上)：按欠款金额  │5. 仓储执行超时：10元/天/SKU│  │
│  │    营销师70%、营销主管30%         │                             │  │
│  │ 说明：阶梯累进，延期重置计时器    │                             │  │
│  │ 生效日期：2026-04-23             │                             │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ↑ RulesDescription: Card, 内容根据 category 切换                     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 表格列定义（按 category 差异化）

**通用列**（两种 category 共享）：

| 列名 | 字段 | 宽度 | 渲染 |
|------|------|------|------|
| 业务编号 | sourceNo | 150 | Link 按钮，催收跳转 `/collection/task/{sourceId}`，退货跳转 `/procurement/return?tab=processing` |
| 被考核人 | assessmentUserName | 100 | 文本 |
| 角色 | assessmentRole | 90 | 中文映射(statusLabels) |
| 超时天数 | overdueDays | 90 | 居中，`{n}天` |
| 考核金额 | penaltyAmount | 110 | 右对齐，红色 `¥{n.toFixed(2)}` |
| 处理状态 | status | 100 | Tag 组件，颜色映射 |
| 计算时间 | calculatedAt | 160 | 日期格式化 |

**催收特有列**：

| 列名 | 字段 | 宽度 | 渲染 |
|------|------|------|------|
| 客户名称 | sourceName | 120 | 文本，ellipsis |
| 考核层级 | ruleType | 140 | Tag(blue)，映射 tier1→"一级考核(3-5天)" 等 |
| 处理备注 | handleRemark | 200 | 文本，ellipsis |
| 处理时间 | handledAt | 160 | 日期格式化 |

**退货特有列**：

| 列名 | 字段 | 宽度 | 渲染 |
|------|------|------|------|
| 商品名称 | sourceName | 150 | 文本，ellipsis |
| 考核类型 | ruleType | 140 | Tag(blue)，映射 5 种类型名称 |

**操作列**（固定右侧）：

根据 `allowedTransitions[record.status]` 动态渲染按钮（**两种 category 按钮完全一致**）：

| 状态 | 操作按钮 | 说明 |
|------|---------|------|
| pending | [标记已处理] [标记无需考核] [申诉] | 三选一操作 |
| confirmed | — | 终态，不可操作 |
| cancelled | — | 终态，不可操作 |
| appealed | [查看申诉] | 链接到OA审批详情页 |

- pending 按钮说明：
  - [标记已处理]：点击打开 ActionModal（选"已处理"+ 备注）→ `POST /api/assessment/:id/action {action:'confirm'}`
  - [标记无需考核]：点击打开 ActionModal（选"无需处理"+ 备注，备注必填）→ `POST /api/assessment/:id/action {action:'cancel'}`
  - [申诉]：点击打开 AppealModal（填写申诉理由+上传材料）→ `POST /api/assessment/:id/appeal {reason, documents?}`
- appealed 状态下 [查看申诉] 按钮：跳转到 `/oa-approval/center?instanceId={oaInstanceId}`
- 非 pending 状态操作列显示 `-`
- 操作按钮需要 `assessment:write` 权限（Authorized 组件包裹）

### ActionModal 弹窗设计

遵循 ActionFormModal 模式，三种弹窗：

**标记处理弹窗**（两种 category 共用）：
```
┌─────────────────────────────────────┐
│ 标记处理情况                     ✕  │
├─────────────────────────────────────┤
│                                      │
│  处理结果 *                          │
│  ○ 已处理   ○ 无需考核              │
│                                      │
│  处理备注                            │
│  ┌──────────────────────────────┐   │
│  │ (选"无需考核"时必填)         │   │
│  └──────────────────────────────┘   │
│                                      │
│                     [取消]  [确定]   │
└─────────────────────────────────────┘
```

**申诉弹窗**（两种 category 共用）：
```
┌─────────────────────────────────────┐
│ 考核申诉                         ✕  │
├─────────────────────────────────────┤
│                                      │
│  ┌──────────────────────────────┐   │
│  │ 📋 考核信息（只读摘要）       │   │
│  │ 被考核人：张三               │   │
│  │ 考核金额：¥10.00             │   │
│  │ 考核规则：一级考核(3-5天)    │   │
│  └──────────────────────────────┘   │
│                                      │
│  申诉理由 *                          │
│  ┌──────────────────────────────┐   │
│  │                              │   │
│  └──────────────────────────────┘   │
│                                      │
│  支持性材料                          │
│  ┌──────────────────────────────┐   │
│  │  点击或拖拽上传(最多5个)     │   │
│  └──────────────────────────────┘   │
│                                      │
│                     [取消]  [提交]   │
└─────────────────────────────────────┘
```

**已申诉状态 - 审批进度提示**（内嵌在表格行展开或Tooltip中）：
```
┌─────────────────────────────────────┐
│  📌 申诉审批中                       │
│  审批单号: OA20260430001            │
│  当前节点: 部门负责人审核            │
│  提交时间: 2026-04-30 10:30         │
│  [查看审批详情 →]                    │
└─────────────────────────────────────┘
```

### 状态 Tag 颜色映射

| 统一状态 | 显示文字 | Tag 颜色 | 说明 |
|---------|---------|---------|------|
| pending | 待处理 | orange | 催收/退货统一 |
| confirmed | 已处理 | green | 催收/退货统一 |
| cancelled | 无需考核 | default | 催收/退货统一 |
| appealed | 申诉中 | purple | 催收/退货统一，点击可查看OA审批进度 |

### 页面样式规范

基于现有页面风格（与项目其他页面一致）：

| 元素 | 值 |
|------|-----|
| 页面容器 | padding: 0 |
| Card 间距 | margin-bottom: 16px |
| Statistic 标题 | font-size: 13px, color: rgba(0,0,0,0.45) |
| Statistic 数值 | font-size: 20px |
| 考核金额 | color: #f5222d (红色) |
| Row gutter | 16 |
| Col span | 4 (6 列均分) |
| 规则说明段落 | line-height: 1.8, margin-bottom: 8px |
| Table | scroll.x=1500, showSizeChanger, showQuickJumper |

### URL 状态同步

category、page、keyword 等筛选条件放入 URL 参数，刷新后保留：

```
/assessment?category=ar_collection&page=1&keyword=张三&ruleType=tier1&status=pending
/assessment?category=return_order&page=2&ruleType=warehouse_execute_timeout
```

useAssessmentFilters Hook 使用 useSearchParams 管理 URL 状态。

### API 服务

新建 `services/api/assessment.ts`，统一所有调用。旧文件标记 deprecated。

---

## 五、分阶段实施

### 阶段1：后端基座 + 数据迁移

1. 创建 `services/assessment/` 模块
2. 实现 `assessment.types.ts` 统一类型（含 appealed 状态）
3. 实现 `assessment.rules.ts` 规则注册表（两种 category 的 allowedTransitions 统一包含 appealed）
4. 实现 `assessment.repository.ts` Repository 层
5. 实现 `assessment.mapper.ts` DTO 映射
6. 执行数据库迁移 `050_unified_assessment.sql`（含 oa_instance_id, appeal_reason, appeal_submitted_at 字段）
7. 实现 `assessment.service.ts` 业务逻辑层（含 `updateAssessmentStatusByAppeal` 方法供回调调用）

### 阶段2：规则迁移 + 计算引擎 + OA申诉集成

1. 迁移催收3条规则到 `rules/ar-collection-rules.ts`
2. 迁移退货5条规则到 `rules/return-order-rules.ts`
3. 提取共用工具到 `utils.ts`
4. 实现 `assessment-calculate.ts` 计算引擎
5. 实现 `assessment-notify.ts` 统一通知
6. 新增 `form-types/assessment-appeal.ts` OA表单类型定义
7. 新增 `assessment-appeal-callback.ts` 申诉审批回调（onApproved→cancelled, onRejected→pending）
8. 在 `form-types/index.ts` 注册 assessment_appeal 表单类型
9. 执行数据库迁移 `051_assessment_appeal_form_type.sql`（插入oa_form_types种子数据）

### 阶段3：新 API 上线（同步停用旧API）

1. 创建新控制器和路由 `assessment.routes.ts`
2. 实现 `POST /api/assessment/:id/appeal` 申诉接口（调用OA submitApproval + 更新assessment_records）
3. 注册到 `app.ts`，同时移除旧路由注册(ar-assessment.routes, return-penalty.routes)
4. 修改 `scheduler/index.ts` 使用新计算引擎
5. 修改 `return-order.mutation.ts` 实时触发改调新模块
6. 新增权限常量到 `constants.ts`
7. **前后端必须同步发布**：新API上线的同时，前端也要完成迁移（阶段3和4合并执行）

### 阶段4：前端迁移（与阶段3同步发布）

1. 创建 `types/assessment.d.ts` 统一类型
2. 创建 `services/api/assessment.ts` 统一 API（含 appealAssessment 方法）
3. 创建 `pages/Assessment/` 统一考核中心
4. 实现 `HandleModal.tsx` 标记处理弹窗（已处理/无需考核）
5. 实现 `AppealModal.tsx` 申诉弹窗（理由+材料上传）
6. 实现 `AppealStatusTag.tsx` 申诉中状态Tag（含OA审批链接）
7. 更新 `.umirc.ts` 路由配置：新增 `/assessment`，旧路由添加重定向
8. 更新权限常量 `constants/permissions.ts`
9. 更新催收任务详情中的考核链接指向新页面
10. 旧前端页面文件保留但不再被路由引用（阶段5清理）

### 阶段5：清理旧代码

1. 删除旧后端模块(ar-assessment/*, return-penalty/*)
2. 删除旧控制器、路由
3. 删除旧前端页面、API、类型
4. 确认新系统稳定后，数据库旧 _deprecated 表可择期删除

---

## 六、关键文件清单

### 后端新建

| 文件 | 说明 |
|------|------|
| `dev/backend/src/services/assessment/index.ts` | 模块导出 |
| `dev/backend/src/services/assessment/assessment.types.ts` | 统一类型 |
| `dev/backend/src/services/assessment/assessment.rules.ts` | 规则注册表 |
| `dev/backend/src/services/assessment/assessment.repository.ts` | Repository |
| `dev/backend/src/services/assessment/assessment.mapper.ts` | DTO映射 |
| `dev/backend/src/services/assessment/assessment.service.ts` | 业务逻辑 |
| `dev/backend/src/services/assessment/assessment-calculate.ts` | 计算引擎 |
| `dev/backend/src/services/assessment/assessment-notify.ts` | 统一通知 |
| `dev/backend/src/services/assessment/rules/ar-collection-rules.ts` | 催收规则 |
| `dev/backend/src/services/assessment/rules/return-order-rules.ts` | 退货规则 |
| `dev/backend/src/services/assessment/utils.ts` | 共用工具 |
| `dev/backend/src/services/oa-approval/form-types/assessment-appeal.ts` | 申诉OA表单类型定义 |
| `dev/backend/src/services/oa-approval/assessment-appeal-callback.ts` | 申诉OA审批回调(onApproved/onRejected) |
| `dev/backend/src/controllers/assessment-query.controller.ts` | 查询控制器 |
| `dev/backend/src/controllers/assessment-mutation.controller.ts` | 操作控制器 |
| `dev/backend/src/routes/assessment.routes.ts` | 路由 |
| `dev/backend/src/db/migrations/050_unified_assessment.sql` | 数据库迁移(含oa_instance_id等字段) |
| `dev/backend/src/db/migrations/051_assessment_appeal_form_type.sql` | OA申诉表单类型种子数据 |

### 后端修改

| 文件 | 修改内容 |
|------|---------|
| `dev/backend/src/app.ts` | 注册新路由 |
| `dev/backend/src/utils/constants.ts` | 新增考核相关常量 |
| `dev/backend/src/services/scheduler/index.ts` | 定时任务改调新引擎 |
| `dev/backend/src/services/return-order/return-order.mutation.ts` | 实时触发改调新模块 |
| `dev/backend/src/services/oa-approval/form-types/index.ts` | 注册 assessment_appeal 表单类型 |

### 前端新建

| 文件 | 说明 |
|------|------|
| `dev/frontend/src/types/assessment.d.ts` | 统一类型 |
| `dev/frontend/src/services/api/assessment.ts` | 统一API |
| `dev/frontend/src/pages/Assessment/index.tsx` | 页面入口 |
| `dev/frontend/src/pages/Assessment/index.less` | 样式 |
| `dev/frontend/src/pages/Assessment/hooks/useAssessmentData.ts` | 数据Hook |
| `dev/frontend/src/pages/Assessment/hooks/useAssessmentFilters.ts` | 筛选Hook |
| `dev/frontend/src/pages/Assessment/hooks/useAssessmentActions.ts` | 操作Hook |
| `dev/frontend/src/pages/Assessment/components/CategoryTabs.tsx` | 分类Tab |
| `dev/frontend/src/pages/Assessment/components/AssessmentStats.tsx` | 统计卡片 |
| `dev/frontend/src/pages/Assessment/components/AssessmentFilter.tsx` | 筛选 |
| `dev/frontend/src/pages/Assessment/components/AssessmentTable.tsx` | 表格 |
| `dev/frontend/src/pages/Assessment/components/HandleModal.tsx` | 标记处理弹窗 |
| `dev/frontend/src/pages/Assessment/components/AppealModal.tsx` | 申诉弹窗(理由+材料) |
| `dev/frontend/src/pages/Assessment/components/AppealStatusTag.tsx` | 申诉中状态Tag |
| `dev/frontend/src/pages/Assessment/components/RulesDescription.tsx` | 规则说明 |
| `dev/frontend/src/pages/Assessment/components/columns/arCollectionColumns.tsx` | 催收列 |
| `dev/frontend/src/pages/Assessment/components/columns/returnOrderColumns.tsx` | 退货列 |

### 前端修改

| 文件 | 修改内容 |
|------|---------|
| `.umirc.ts` | 新增 /assessment 路由 |
| `dev/frontend/src/constants/permissions.ts` | 新增 ASSESSMENT 权限常量 |

### 最终删除(阶段5)

- 后端: `services/ar-assessment/*`, `services/return-penalty/*`, 旧控制器和路由
- 前端: `pages/Collection/Assessment/*`, `pages/ProcurementReturn/Penalty/*`, 旧API和类型文件

---

## 七、验证方案

### 数据迁移验证

1. 执行迁移后，检查新表记录数 = 旧两表之和
2. 状态映射正确：无 handled/skipped 状态残留，全部为 confirmed/cancelled
3. source_no 和 source_name 冗余字段填充完整

### 后端 API 验证

1. `GET /api/assessment?category=ar_collection` 返回催收考核数据
2. `GET /api/assessment?category=return_order` 返回退货考核数据
3. `GET /api/assessment` 不带 category 返回所有域数据
4. `GET /api/assessment/stats` 统计数据正确
5. `POST /api/assessment/:id/action {action:'confirm'}` 考核记录状态变 confirmed
6. `POST /api/assessment/:id/action {action:'cancel'}` 考核记录状态变 cancelled
7. `POST /api/assessment/:id/appeal {reason:'xxx'}` 催收记录状态变 appealed + OA审批实例创建成功
8. `POST /api/assessment/:id/appeal {reason:'xxx'}` 退货记录状态变 appealed + OA审批实例创建成功
9. OA审批通过回调：考核记录自动变为 cancelled（无需考核）
10. OA审批驳回回调：考核记录恢复为 pending
11. `POST /api/assessment/:id/appeal` 对非 pending 状态记录返回 400
12. `POST /api/assessment/calculate {category:'ar_collection'}` 手动触发催收计算
13. 定时任务正常执行，通知正常推送
14. OA审批中心列表显示"考核申诉"类型

### 前端验证

1. `/assessment` 页面正常加载，显示 CategoryTabs
2. 切换"催收考核"Tab，统计数据和表格列正确
3. 切换"退货考核"Tab，统计数据和表格列正确
4. 筛选、分页、搜索功能正常
5. 两种 category 的 pending 行均显示[标记已处理][标记无需考核][申诉]三个按钮
6. HandleModal 标记处理弹窗正常：选"已处理"确认后状态变绿色，选"无需考核"确认后状态变灰色
7. AppealModal 申诉弹窗正常：填写理由+上传材料，提交后状态变紫色(申诉中)
8. appealed 状态行显示[查看申诉]按钮，点击跳转OA审批详情页
9. AppealStatusTag 组件正确显示审批进度（当前节点、审批单号）
10. 旧路由 `/collection/assessment` 重定向到新页面
11. 旧路由 `/procurement/return/penalty` 重定向到新页面
12. 权限控制正常：无 assessment:read 权限用户无法访问
13. OA审批中心发起页显示"考核申诉"表单类型卡片

### 回退方案

- 旧表已 RENAME TO `_deprecated`，未删除，可随时恢复
- 旧控制器和路由代码在阶段5之前不删除（仅移除注册），如需回退可重新注册
- 旧前端页面代码在阶段5之前不删除，如需回退可恢复路由配置
- **关键风险**：因旧API立即停用，前后端必须同步发布。建议在低峰时段执行阶段3+4的合并发布
