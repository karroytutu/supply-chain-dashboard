# OA审批表单开发规范

本文档定义了OA审批模块的开发规范，供开发者和 AI 助手参考。目标是建立一套可复用的开发框架，使得后续每新增一种审批表单，开发者都能按照规范快速、一致地完成开发。

---

## 一、新增审批表单的开发流程（Checklist）

当需要新增一种审批表单时，开发者必须按以下步骤操作：

```
步骤1: 定义表单类型 → 在 form-types/ 目录新增文件
步骤2: 定义审批流程 → 在表单类型文件中编写 workflowDef
步骤3: 数据库迁移 → 新增表单类型种子数据 + 权限（如需）
步骤4: 前端适配 → 仅当需要自定义表单组件时才修改前端
步骤5: 通知模板 → 配置钉钉通知模板（如需自定义）
步骤6: 测试验证 → 按验证清单逐项确认
```

---

## 二、表单类型定义规范

**目录**: `dev/backend/src/services/oa-approval/form-types/`

每个表单类型一个文件，文件名 = 表单编码（kebab-case），如 `other-payment.ts`。

### 2.1 必须导出的接口

```typescript
interface FormTypeDefinition {
  code: string;           // 唯一编码，kebab-case，如 'other_payment'
  name: string;           // 显示名称，如 '其他付款申请单'
  icon: string;           // 图标，Ant Design icon name 或 emoji
  category: FormCategory; // 分类（见下方分类定义）
  sortOrder: number;      // 同分类内排序
  description: string;    // 简要描述
  version: number;        // 版本号，修改表单结构时递增
  formSchema: FormSchema; // 表单字段定义
  workflowDef: WorkflowDef;// 审批流程定义
}

// 表单分类定义（参考钉钉OA审批分类）
type FormCategory = 'finance' | 'supply_chain' | 'marketing' | 'hr' | 'admin';

// 分类中文名称映射
const CATEGORY_LABELS: Record<FormCategory, string> = {
  finance: '财务',
  supply_chain: '供应链',
  marketing: '营销',
  hr: '人事',
  admin: '行政',
};
```

### 2.2 注册规范

新增文件后，必须在 `form-types/index.ts` 中导入并添加到 `ALL_FORM_TYPES` 数组。

---

## 三、FormSchema 字段定义规范

> **参考**: 控件类型定义参考 `docs/钉钉OA审批控件参考.md`，与钉钉OA审批控件保持一致。

```typescript
interface FormSchema {
  fields: FormField[];
}

interface FormField {
  key: string;          // 字段标识，camelCase
  label: string;        // 显示标签
  type: FormFieldType;  // 字段类型（见下方控件类型定义）
  required: boolean;    // 是否必填
  placeholder?: string; // 占位提示
  defaultValue?: any;   // 默认值
  disabled?: boolean;   // 是否禁用
  bizAlias?: string;    // 业务标识，表单内唯一
  print?: boolean;      // 是否参与打印，默认true
  // 类型特定属性
  options?: Array<{ value: string; label: string; key?: string }>;  // select 类型选项
  unit?: string;        // number 类型单位
  min?: number;         // number 类型最小值
  max?: number;         // number 类型最大值
  precision?: number;   // number 类型小数位数
  suffix?: string;      // number 类型后缀（如"元"）
  maxLength?: number;   // text/textarea 最大长度
  maxCount?: number;    // upload 类型最大文件数
  multiple?: boolean;   // user-select/department 是否多选
  format?: string;      // date 类型格式，如 'yyyy-MM-dd HH:mm'
  addressModel?: 'city' | 'district' | 'street'; // 省市区控件模式
  upper?: boolean;      // 金额控件是否显示大写
  limit?: 5 | 10;       // 评分控件分制
  tableViewMode?: 'list' | 'table'; // 明细控件填写方式
  children?: FormField[]; // 明细控件子字段
  statField?: Array<{ componentId: string; label: string }>; // 明细统计字段
  link?: string;        // 文字说明控件超链接
  content?: string;     // 文字说明控件内容
  // 条件显示
  visibleWhen?: { field: string; operator: '==' | '!=' | '>' | '<'; value: any };
}
```

### 3.1 支持的 FormFieldType（参考钉钉OA审批控件）与前端组件映射

| type | 钉钉控件名 | 前端组件 | 说明 |
|------|-----------|----------|------|
| `text` | TextField | Input | 单行文本 |
| `textarea` | TextareaField | Input.TextArea | 多行文本 |
| `number` | NumberField | InputNumber | 数字输入（支持单位） |
| `money` | MoneyField | InputNumber | 金额（支持大写显示） |
| `select` | DDSelectField | Select | 单选下拉 |
| `multi-select` | DDMultiSelectField | Select mode=multiple | 多选下拉 |
| `date` | DDDateField | DatePicker | 日期选择 |
| `date-range` | DDDateRangeField | RangePicker | 时间区间 |
| `upload` | DDAttachment | Upload | 附件上传 |
| `photo` | DDPhotoField | Upload | 图片上传 |
| `user-select` | InnerContactField | 自定义 | 联系人选择（系统用户） |
| `department` | DepartmentField | 自定义 | 部门选择 |
| `cascader` | Cascader | Cascader | 级联选择 |
| `address` | AddressField | Cascader | 省市区选择 |
| `table` | TableField | 可编辑表格 | 明细控件（支持子字段） |
| `rating` | StarRatingField | Rate | 评分控件 |
| `text-note` | TextNote | Typography.Text | 文字说明 |
| `relate-approval` | RelateField | 自定义 | 关联审批单 |
| `location` | TimeAndLocationField | 自定义 | 地点控件 |

### 3.2 钉钉控件特殊属性说明

| 控件类型 | 特殊属性 | 说明 |
|----------|----------|------|
| `number` | `unit`, `defaultValue` | 数字单位、默认值 |
| `money` | `upper` | 是否显示大写金额，默认需要大写 |
| `select`/`multi-select` | `options` | 选项列表，`key: "other"` 为"其它"选项 |
| `date` | `unit`, `format`, `defaultValue` | 单位(小时/天)、格式、默认值 |
| `date-range` | `unit`, `format`, `duration` | 是否自动计算时长 |
| `address` | `addressModel` | city=省市, district=省市区, street=省市区-街道 |
| `rating` | `limit` | 5分制或10分制 |
| `table` | `tableViewMode`, `verticalPrint`, `statField`, `children` | 列表/表格模式、打印方向、统计字段、子控件 |
| `user-select` | `choice` | 1=多选，0=单选 |
| `department` | `multiple` | 是否支持多选 |
| `relate-approval` | `availableTemplates` | 可关联的审批模板列表 |
| `text-note` | `content`, `link`, `notPrint` | 说明文字、超链接、是否打印 |

### 3.3 命名规范

- `key`: camelCase，如 `payeeName`、`paymentAmount`
- `label`: 简洁中文，如 "收款方"、"付款金额"
- `options.value`: 使用英文标识，如 `{ value: 'normal', label: '普通' }`

### 3.4 明细控件(table)使用示例

```typescript
{
  key: 'itemList',
  label: '费用明细',
  type: 'table',
  required: true,
  tableViewMode: 'table',
  statField: [
    { componentId: 'amount', label: '金额合计' }
  ],
  children: [
    { key: 'itemName', label: '项目名称', type: 'text', required: true },
    { key: 'amount', label: '金额(元)', type: 'money', required: true },
    { key: 'remark', label: '备注', type: 'text', required: false },
  ]
}
```

---

## 四、WorkflowDef 审批流程定义规范

```typescript
interface WorkflowDef {
  nodes: WorkflowNodeDef[];
  ccRoles?: string[];    // 抄送角色列表
}

interface WorkflowNodeDef {
  order: number;         // 节点顺序，从1开始
  name: string;          // 节点显示名称，如 "直属主管"
  type: NodeType;        // 节点类型
  roleCode?: string;     // type=role 时必填，对应系统角色编码
  userId?: number;       // type=specific_user 时必填
  condition?: {          // 条件节点：满足条件时才创建此节点
    field: string;       // formSchema 中的字段 key
    operator: '>' | '<' | '==' | '>=' | '<=';
    value: number | string;
  };
}

type NodeType = 'role' | 'dynamic_supervisor' | 'specific_user';
```

### 4.1 节点类型说明

| NodeType | 说明 | assigned_user_id 解析方式 |
|----------|------|--------------------------|
| `role` | 按角色审批 | 查找拥有该 roleCode 的用户 |
| `dynamic_supervisor` | 直属主管 | 查找申请人同部门的 manager 角色用户 |
| `specific_user` | 指定用户 | 直接使用 userId |

### 4.2 条件节点

`condition` 字段在提交时根据表单数据求值，只有条件为 true 时才创建该审批节点。例如金额>50000才需总经理审批。

### 4.3 流程设计原则

- 节点按 order 顺序依次审批，不支持并行（MVP）
- 至少包含1个审批节点
- `dynamic_supervisor` 通常作为第一个节点
- `ccRoles` 中的角色用户仅收到抄送通知，不参与审批

---

## 五、审批节点操作类型定义

审批人在审批节点可执行的操作类型：

```typescript
type ApprovalAction = 'approve' | 'reject' | 'transfer' | 'countersign' | 'withdraw';

interface ApprovalActionRequest {
  action: ApprovalAction;
  comment?: string;           // 审批意见/备注
  attachments?: Attachment[]; // 附件列表
  // 操作特定参数
  transferToUserId?: number;  // 转交目标用户ID（action=transfer时必填）
  countersignUserIds?: number[]; // 加签用户ID列表（action=countersign时必填）
  countersignType?: 'before' | 'after'; // 加签类型：前加签/后加签
}
```

### 5.1 操作类型说明

| Action | 中文名 | 说明 | 前端按钮 |
|--------|--------|------|----------|
| `approve` | 同意 | 通过当前节点，流转至下一节点或完成审批 | 主要按钮(蓝色) |
| `reject` | 拒绝 | 驳回审批，流程终止，申请人收到通知 | 危险按钮(红色) |
| `transfer` | 转交 | 将审批任务转交给其他人处理，原审批人不再参与 | 次要按钮(灰色) |
| `countersign` | 加签 | 增加额外审批人，需等待加签人审批后继续原流程 | 下拉菜单项 |
| `withdraw` | 撤回 | 申请人撤回已提交的审批（仅pending状态可撤回） | 表单操作按钮 |

### 5.2 操作详细说明

**1. 同意**
- 当前审批节点状态变为 `approved`
- 若有下一节点，流转至下一审批人并发送通知
- 若无下一节点，审批实例状态变为 `approved`，通知申请人

**2. 拒绝**
- 当前审批节点状态变为 `rejected`
- 审批实例状态变为 `rejected`，流程终止
- 通知申请人被驳回，附带拒绝理由

**3. 转交**
- 创建新的审批节点记录（node_order 不变，但 assigned_user_id 变更）
- 原审批人记录标记为 `transferred`
- 新审批人收到待审批通知
- 转交后原审批人不再参与此节点审批

**4. 加签**
- 在当前节点后插入新的审批节点（加签节点）
- 加签类型：
  - `before`（前加签）：加签人在当前审批人之前审批
  - `after`（后加签）：加签人在当前审批人审批通过后审批
- 支持多人为加签对象，按顺序依次审批
- 所有加签人通过后，流程继续原流程

**5. 撤回**
- 仅限申请人操作，且审批实例状态为 `pending`
- 审批实例状态变为 `withdrawn`
- 所有待审批节点状态变为 `cancelled`
- 通知相关审批人（审批已撤回）

---

## 六、数据库迁移规范

新增表单类型时需要：

### 6.1 必须

在迁移文件中 INSERT `oa_form_types` 种子数据：

```sql
INSERT INTO oa_form_types (code, name, icon, category, sort_order, description, form_schema, workflow_def, is_active, version)
VALUES (
  'other_payment',
  '其他付款申请单',
  'PayCircleOutlined',
  'finance',
  100,
  '用于其他付款事项的审批申请',
  '{"fields":[...]}'::jsonb,
  '{"nodes":[...]}'::jsonb,
  true,
  1
);
```

### 6.2 可选

如需新增专用权限（如某种表单只有特定角色可发起），需同时 INSERT permissions 和 role_permissions。

### 6.3 迁移文件命名

- `029_oa_approval.sql`（框架表）
- 后续表单类型更新使用 `030_add_xxx_form_type.sql`

---

## 七、前端适配规范

### 7.1 默认行为

FormRenderer 组件根据 formSchema 自动渲染表单，绝大多数情况无需修改前端代码。

### 7.2 需要修改前端的情况

1. 新增了 FormFieldType 中不存在的字段类型 → 需在 FormRenderer 中添加对应组件
2. 需要自定义表单布局 → 需在 Form 页面中为特定 typeCode 添加自定义渲染
3. 需要特殊的表单联动逻辑 → 需扩展 FormRenderer 的 visibleWhen 或添加自定义联动

### 7.3 禁止事项

- 禁止为每种表单类型创建独立页面组件（统一使用 Form 页面 + FormRenderer）
- 禁止硬编码表单字段（必须通过 formSchema 配置）
- 禁止在组件内直接写 API 地址（统一通过 services/api/ 调用）

---

## 八、权限规范

OA审批模块统一使用以下权限编码：

| 权限编码 | 说明 |
|----------|------|
| `oa:approval:read` | 查看审批（含发起页、审批中心、详情） |
| `oa:approval:write` | 发起审批、审批操作（通过/驳回/撤回） |
| `oa:data:read` | 查看审批数据管理 |
| `oa:data:export` | 导出审批数据 |

**无需为每种表单类型单独创建权限**。如后续需要按表单类型控制权限，在 workflowDef 中通过角色限制实现，不新增权限编码。

---

## 九、通知规范

### 9.1 钉钉通知触发点

| 触发事件 | 接收人 | 通知模板变量 |
|----------|--------|-------------|
| 提交审批 | 首节点审批人 | {title}, {formTypeName}, {applicantName}, {nodeName} |
| 审批通过→下一节点 | 下一审批人 | 同上 |
| 审批最终通过 | 申请人 | {title}, {formTypeName} |
| 审批驳回 | 申请人 | {title}, {formTypeName}, {rejectReason} |
| 转交 | 新审批人 | {title}, {formTypeName}, {fromUserName}, {nodeName} |
| 加签 | 加签人 | {title}, {formTypeName}, {fromUserName}, {nodeName} |
| 撤回审批 | 原待审批人 | {title}, {formTypeName}, {applicantName} |
| 抄送 | 抄送人 | {title}, {formTypeName}, {applicantName} |

### 9.2 钉钉消息格式

Markdown 格式，包含审批标题、类型、申请人、紧急程度、当前节点，附详情链接。

### 9.3 站内消息

与钉钉通知同步写入 `oa_in_app_messages` 表。

---

## 十、新增表单验证清单

新增审批表单后，必须验证以下项目：

### 10.1 后端验证

- [ ] form-types/index.ts 中已注册新表单
- [ ] 迁移文件中种子数据正确插入
- [ ] GET /api/oa-approval/form-types 返回新表单类型
- [ ] 提交审批：表单校验通过、流程节点正确创建、通知正确发送
- [ ] 审批通过：流程推进正确、最终状态正确
- [ ] 审批驳回：状态和通知正确
- [ ] 条件节点：条件满足/不满足时节点创建正确
- [ ] 转交操作：节点审批人变更、原审批人状态变更、通知正确
- [ ] 加签操作：新节点创建、流程顺序正确、通知正确
- [ ] 撤回操作：状态变更、通知正确

### 10.2 前端验证

- [ ] 发起审批页显示新表单卡片
- [ ] 表单页字段正确渲染、校验正确
- [ ] 审批中心列表显示新类型审批
- [ ] 详情页流程展示正确
- [ ] 转交弹窗：用户选择器正常
- [ ] 加签弹窗：用户选择器、加签类型选择正常

---

## 十一、UI/UX 设计规范

### 11.1 发起审批页 (Initiate)

**页面整体风格**：
- 背景色: #f5f7fa (浅灰蓝)
- 内容区背景: #ffffff (白色)
- 分类标题: 14px, #333333, 左侧带竖线装饰
- 卡片间距: 16px
- 分类间距: 24px

**FormTypeCard 卡片规格**：

| 属性 | 值 | 说明 |
|------|-----|------|
| 卡片尺寸 | 160px × 120px | 固定尺寸 |
| 背景 | #ffffff | 白色 |
| 圆角 | 8px | 圆角边框 |
| 阴影 | 0 2px 8px rgba(0,0,0,0.08) | 轻阴影 |
| 图标尺寸 | 48px × 48px | 居中显示 |
| 标题字号 | 14px | font-weight: 500 |
| 描述字号 | 12px | color: #999 |
| 内边距 | 16px | padding |
| 悬停阴影 | 0 4px 16px rgba(0,0,0,0.12) | 悬停加深 |
| 悬停效果 | translateY(-2px) | 轻微上浮 |
| 点击效果 | scale(0.98) | 点击缩放 |

**分类主题色映射**：

| 分类 | 图标色 | 卡片边框悬停色 |
|------|--------|----------------|
| 财务 | #faad14 (橙黄) | #faad14 |
| 供应链 | #52c41a (绿色) | #52c41a |
| 营销 | #eb2f96 (粉色) | #eb2f96 |
| 人事 | #1890ff (蓝色) | #1890ff |
| 行政 | #722ed1 (紫色) | #722ed1 |

**响应式设计**：
- 大屏(≥1200px): 每行6个卡片
- 中屏(768px-1199px): 每行4个卡片
- 小屏(576px-767px): 每行3个卡片
- 移动端(<576px): 每行2个卡片

### 11.2 表单填写页 (Form)

**页面整体风格**：
- 背景色: #f5f7fa (浅灰蓝)
- 表单卡片背景: #ffffff (白色)
- 表单卡片圆角: 8px
- 表单卡片阴影: 0 2px 12px rgba(0,0,0,0.08)
- 内边距: 24px

**表单字段规格**：

| 属性 | 值 |
|------|-----|
| 标签字号 | 14px |
| 标签颜色 | #333333 |
| 必填标记 | 红色星号 `*` |
| 输入框高度 | 36px |
| 输入框边框 | 1px solid #d9d9d9 |
| 输入框圆角 | 4px |
| 输入框聚焦边框 | #1890ff |
| placeholder颜色 | #bfbfbf |

**金额字段特殊设计**：
- 输入框右侧固定显示"元"单位
- 大写金额: 12px, #f5222d (红色)
- 实时转换: 输入数字时自动生成大写

### 11.3 审批中心页 (Center)

**整体设计理念**：采用 **「侧边导航 → 审批列表 → 审批详情 + 流程」** 的三级递进结构。

**整体风格与配色**：

| 元素 | 颜色/样式 | 说明 |
|------|----------|------|
| 页面背景 | #f5f7fa | 中性灰白基底 |
| 卡片背景 | #ffffff | 白色 |
| 主操作/选中 | #1890ff | 品牌蓝 |
| 待处理状态 | #fa8c16 | 橙色 |
| 已完成状态 | #52c41a | 绿色 |
| 提醒状态 | #f5222d | 红色 |

**左侧导航项规格**：

| 属性 | 值 | 说明 |
|------|-----|------|
| 导航宽度 | 180px | 固定宽度 |
| 导航项高度 | 48px | |
| 激活背景 | #e6f7ff | 浅蓝背景 |
| 激活左边框 | 3px, #1890ff | 左侧指示条 |
| 角标（数字） | 橙色圆角背景 | 高对比度提醒 |
| 小圆点 | 红色实心圆 | 弱提醒 |

**审批卡片规格**：

| 属性 | 值 |
|------|-----|
| 卡片圆角 | 8px |
| 卡片内边距 | 16px |
| 选中态 | 蓝色边框 2px |
| 标题字号 | 14px, 加粗 |

**紧急程度指示器**：

| 紧急程度 | 图标 | 颜色 | 左侧边框 |
|----------|------|------|----------|
| 非常紧急 | 红点 | #f5222d (红) | 4px 红色 |
| 紧急 | 橙点 | #fa8c16 (橙) | 4px 橙色 |
| 普通 | 无 | #999 (灰) | 无 |

**响应式设计**：

| 屏幕宽度 | 布局调整 |
|----------|----------|
| ≥1400px | 三栏完整显示 |
| 1024px-1399px | 左侧导航收起为图标 |
| 768px-1023px | 详情区覆盖列表 |
| <768px | 单列，底部Tab切换 |

### 11.4 状态标签设计

**ApprovalStatusTag 组件**：

| 状态 | 显示文字 | Tag颜色 |
|------|----------|---------|
| pending | 审批中 | blue |
| approved | 已通过 | green |
| rejected | 已拒绝 | red |
| withdrawn | 已撤回 | orange |
| cancelled | 已取消 | default |

**UrgencyTag 组件**：

| 紧急程度 | 显示文字 | Tag颜色 |
|----------|----------|---------|
| normal | 普通 | default |
| high | 紧急 | orange |
| urgent | 非常紧急 | red |

---

## 十二、API 端点规范

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /api/oa-approval/form-types | oa:approval:read | 可用表单类型列表 |
| GET | /api/oa-approval/form-types/:code | oa:approval:read | 单个表单类型详情 |
| GET | /api/oa-approval/instances | oa:approval:read | 审批列表（viewMode: pending/processed/my/cc） |
| GET | /api/oa-approval/instances/stats | oa:approval:read | 统计数 |
| GET | /api/oa-approval/instances/:id | oa:approval:read | 审批详情 |
| POST | /api/oa-approval/instances | oa:approval:write | 提交审批 |
| POST | /api/oa-approval/instances/:id/approve | oa:approval:write | 同意 |
| POST | /api/oa-approval/instances/:id/reject | oa:approval:write | 拒绝 |
| POST | /api/oa-approval/instances/:id/transfer | oa:approval:write | 转交 |
| POST | /api/oa-approval/instances/:id/countersign | oa:approval:write | 加签 |
| POST | /api/oa-approval/instances/:id/withdraw | oa:approval:write | 撤回 |
| POST | /api/oa-approval/instances/:id/cancel | oa:approval:write | 取消 |
| GET | /api/oa-approval/messages | oa:approval:read | 站内消息 |
| GET | /api/oa-approval/messages/unread-count | oa:approval:read | 未读数 |
| POST | /api/oa-approval/messages/:id/read | oa:approval:read | 标记已读 |
| POST | /api/oa-approval/messages/read-all | oa:approval:read | 全部已读 |
| GET | /api/oa-approval/data | oa:data:read | 数据管理查询 |

---

## 十三、FormRenderer 组件映射表

| FormFieldType | Ant Design 组件 | 特殊配置 |
|---------------|-----------------|----------|
| text | Input | maxLength 限制 |
| textarea | Input.TextArea | autoSize={{ minRows: 3 }} |
| number | InputNumber | precision, min, max, suffix |
| money | InputNumber + 大写显示 | formatter/parser, 上方显示大写 |
| select | Select | options 映射 |
| multi-select | Select mode="multiple" | options 映射 |
| date | DatePicker | showTime 根据 format |
| date-range | RangePicker | showTime |
| upload | Upload.Dragger | maxCount 限制 |
| photo | Upload (图片卡片) | listType="picture-card" |
| user-select | UserSelectModal | 弹窗选择 |
| department | TreeSelect | 部门树数据 |
| address | Cascader | 省市区数据 |
| table | EditableTable | 可编辑表格组件 |
| rating | Rate | allowHalf |
| text-note | Typography.Text | type="secondary" |
