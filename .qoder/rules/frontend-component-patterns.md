---
trigger: always_on
---
# 前端组件模式规范

版本：v1.0
适用范围：本项目所有前端组件、Hook、工具函数的开发
核心原则：模式复用、职责单一、状态分层

---

## 一、问题背景

前端组件和 Hook 缺乏统一的架构规范，导致：
- 18个 Modal 组件重复编写 visible/onClose/onSuccess/loading/handleSubmit 模式
- 3个 Hook 文件超过 200 行（useOverview 279行、useStrategicProducts 278行、useUsers 247行）
- useOverview 中 11个 useState 聚合不足，状态管理混乱
- 工具函数重复实现（formatNumber 在 format.ts 和 calculation.ts 中各有一份）
- 筛选条件全用 useState 管理，页面刷新后状态丢失（缺失 URL State 策略）
- Hook 返回值过多且扁平（useUsers 返回 46 个属性），使用方需忍受命名冲突

---

## 二、核心规则

### 2.1 ActionFormModal 通用模式

所有涉及"弹窗表单 → 提交 → 刷新列表"的 Modal，必须遵循 `ActionFormModal` 模式：

**通用 Props 接口：**

```typescript
interface ActionFormModalProps<T = unknown> {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  record?: T;                    // 编辑时传入的数据
  selectedRows?: T[];            // 批量操作时传入
}
```

**通用内部结构：**

```typescript
const XxxModal: React.FC<ActionFormModalProps> = ({ visible, onClose, onSuccess, record }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await apiCall(record?.id ? { ...values, id: record.id } : values);
      message.success('操作成功');
      form.resetFields();
      onSuccess();
    } catch (error) {
      if (error?.errorFields) return;  // 表单验证错误，不需要提示
      message.error(error?.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      open={visible}
      onCancel={handleClose}
      onOk={handleSubmit}
      confirmLoading={loading}
      destroyOnClose
    >
      {/* 表单内容，仅包含与该 Modal 相关的表单项 */}
    </Modal>
  );
};
```

**Modal 文件大小限制：**

| 级别 | 行数 | 处理方式 |
|------|------|---------|
| 优秀 | ≤ 100行 | - |
| 合格 | ≤ 150行 | - |
| 超标 | > 150行 | 必须拆分子组件 |

**超标时的拆分策略：**

| 超标原因 | 拆分方式 | 示例 |
|---------|---------|------|
| 表单项过多 | 提取 `<XxxFormPanel>` 子组件 | `WarehouseFormPanel.tsx` |
| 包含表格 | 提取 `<XxxTableContent>` 子组件 | `ReturnDetailTable.tsx` |
| 多步骤流程 | 按步骤拆分，用状态机控制 | `Step1Form.tsx` + `Step2Confirm.tsx` |

### 2.2 Hook 职责拆分

**单个 Hook 文件 ≤ 100 行**，超出必须拆分。

拆分原则——按职责分离为三类 Hook：

| Hook 类型 | 命名 | 职责 | 示例 |
|----------|------|------|------|
| 数据加载 | `useXxxData` | API 调用、数据获取、loading 状态 | `useCollectionData` |
| 筛选/状态 | `useXxxFilters` | 筛选条件、分页、URL 同步 | `useCollectionFilters` |
| 业务操作 | `useXxxActions` | 增删改操作、Modal 控制 | `useCollectionActions` |

**页面级 Hook 组合示例：**

```typescript
// useCollection.ts（页面入口 Hook，仅做组合）
export function useCollection() {
  const filters = useCollectionFilters();
  const data = useCollectionData(filters);
  const actions = useCollectionActions(data.reloadData);

  return { ...filters, ...data, ...actions };
}

// useCollectionFilters.ts（筛选状态 + URL 同步）
export function useCollectionFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const statusTab = searchParams.get('tab') || 'collecting';
  const page = parseInt(searchParams.get('page') || '1');
  const keyword = searchParams.get('keyword') || '';

  const setStatusTab = (tab: string) => {
    setSearchParams({ tab, page: '1' });
  };

  return { statusTab, page, keyword, setStatusTab, setPage, setKeyword };
}

// useCollectionData.ts（数据获取）
export function useCollectionData(filters: CollectionFilters) {
  const [tasks, setTasks] = useState<CollectionTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchCollectionTasks(filters);
      setTasks(result.list);
      setTotal(result.total);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadData(); }, [loadData]);

  return { tasks, loading, total, reloadData: loadData };
}

// useCollectionActions.ts（业务操作）
export function useCollectionActions(reloadData: () => void) {
  const modalControl = useModalControl();

  const handleEscalate = async (id: string, data: EscalateParams) => {
    await escalateTask(id, data);
    reloadData();
  };

  return { modalControl, handleEscalate };
}
```

### 2.3 工具函数去重

**`dev/frontend/src/utils/format.ts` 是格式化函数的唯一权威来源。**

| 函数 | 权威位置 | 需清理的重复 |
|------|---------|-------------|
| `formatNumber` | `utils/format.ts` | `utils/calculation.ts` 中的同名函数 |
| `formatPercent` | `utils/format.ts` | `utils/calculation.ts` 中的同名函数 |
| `formatCurrency` | `utils/format.ts` | 各模块内联的格式化代码 |
| 日期格式化 | `utils/format.ts` | 各页面中 `dayjs().format()` 直接调用 |

**规则：**
- 新增格式化需求时，必须在 `format.ts` 中添加，其他文件引用
- 禁止在组件或 Hook 中内联编写格式化逻辑
- `calculation.ts` 应只包含计算逻辑（如周转天数、预警级别），不包含格式化
- 已有重复函数清理后，在原位置添加 `// 已迁移到 format.ts` 注释并标记 deprecated

### 2.4 三层状态分离

状态分为三层，各层使用不同的管理方式：

| 状态层 | 特征 | 管理方式 | 示例 |
|--------|------|---------|------|
| **URL State** | 可分享、可书签、刷新后保留 | `useSearchParams` / URL 参数 | 分页 page、筛选 tab、搜索关键词 |
| **Server State** | 来自后端 API，需要异步获取 | 自定义 Hook + 缓存 | 任务列表、统计数据 |
| **UI State** | 纯前端交互状态 | `useState` / `useReducer` | Modal 开关、loading、选中行 |

**核心判断规则——什么状态应该放 URL：**

| 放 URL 的条件 | 示例 |
|-------------|------|
| 用户可能想分享当前视图 | `/collection?tab=collecting&page=2` |
| 刷新后应保留 | 搜索关键词、当前页码 |
| 有默认值的筛选条件 | 状态 tab（默认 collecting） |

**不放进 URL 的条件：**

| 不放 URL 的条件 | 示例 |
|---------------|------|
| 临时交互状态 | Modal visible、loading |
| 敏感信息 | 搜索结果中的客户详情 |
| 不可序列化的状态 | Form 实例、ref |

**useState 聚合规则：**

当同一逻辑域的 `useState` 超过 5 个时，必须使用 `useReducer` 聚合：

```typescript
// ❌ 错误：11个 useState 分散管理
const [page, setPage] = useState(1);
const [pageSize, setPageSize] = useState(10);
const [statusTab, setStatusTab] = useState('collecting');
const [keyword, setKeyword] = useState('');
const [handlerId, setHandlerId] = useState('');
const [dateRange, setDateRange] = useState(null);
// ...还有5个

// ✅ 正确：useReducer 聚合 + URL 同步
interface FilterState {
  page: number;
  pageSize: number;
  statusTab: string;
  keyword: string;
  handlerId: string;
  dateRange: [string, string] | null;
}

type FilterAction =
  | { type: 'SET_PAGE'; payload: number }
  | { type: 'SET_FILTER'; payload: Partial<FilterState> }
  | { type: 'RESET' };

function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case 'SET_PAGE': return { ...state, page: action.payload };
    case 'SET_FILTER': return { ...state, ...action.payload, page: 1 };
    case 'RESET': return initialFilterState;
  }
}
```

### 2.5 Hook 返回值分组

当 Hook 返回超过 10 个属性时，必须按逻辑分组返回，禁止扁平结构：

```typescript
// ❌ 错误：扁平返回 46 个属性
return {
  loading, dataSource, total, page, pageSize, stats, selectedRowKeys,
  batchLoading, roles, filters, activeStatus, setFilters, setActiveStatus,
  setSelectedRowKeys, fetchUsers, handleSearch, handleReset, handlePageChange,
  handleToggleStatus, handleBatchEnable, handleBatchDisable, handleBatchAssignRoles,
  // ...
};

// ✅ 正确：按逻辑分组
return {
  data: { dataSource, total, stats, roles },
  pagination: { page, pageSize },
  filters: { filters, activeStatus, setFilters, setActiveStatus },
  selection: { selectedRowKeys, setSelectedRowKeys, batchLoading },
  actions: {
    reload: fetchUsers,
    search: handleSearch,
    reset: handleReset,
    pageChange: handlePageChange,
    toggleStatus: handleToggleStatus,
    batch: { enable: handleBatchEnable, disable: handleBatchDisable, assignRoles: handleBatchAssignRoles },
  },
};
```

---

## 三、反模式（禁止的做法）

- ❌ 新增 Modal 时不遵循 ActionFormModal 模式，自行编写 visible/onClose/onSuccess/loading 逻辑
- ❌ 单个 Hook 文件超过 100 行而不拆分
- ❌ 在组件或 Hook 中内联编写格式化函数（应在 format.ts 中定义）
- ❌ 筛选条件、分页使用 `useState` 而非 URL 参数（导致刷新后丢失）
- ❌ 同一逻辑域超过 5 个 `useState` 而不使用 `useReducer` 聚合
- ❌ Hook 返回超过 10 个扁平属性而不分组
- ❌ 复制已有 Modal/Hook 代码稍作修改后使用（应提取共享模式）

---

## 四、迁移路径

### 阶段1：工具函数去重

- 清理 `calculation.ts` 中与 `format.ts` 重复的格式化函数
- 添加 deprecated 注释，所有引用改为从 `format.ts` 导入
- **优先级：P0**（改动小，风险低，收益明显）

### 阶段2：催收模块 Hook 拆分试点

- 将 `useOverview`（279行）拆分为 `useCollectionData` + `useCollectionFilters` + `useCollectionActions`
- 筛选条件迁移到 URL State（useSearchParams）
- 11个 useState 聚合为 useReducer
- **优先级：P1**

### 阶段3：Modal 模式统一

- 梳理 18 个 Modal 组件，确认均遵循 ActionFormModal 模式
- 超过 150 行的 Modal（如 WarehouseExecuteModal 259行）拆分子组件
- **优先级：P1**

### 阶段4：其他模块推广

- useStrategicProducts、useUsers 等 Hook 拆分
- Hook 返回值分组优化
- 新页面必须从第一天就遵循本规范

---

## 五、关键文件

| 文件 | 当前问题 | 迁移后 |
|------|---------|--------|
| `dev/frontend/src/utils/format.ts` | 权威来源，但被其他文件重复实现 | 确认为唯一格式化来源 |
| `dev/frontend/src/utils/calculation.ts` | 包含与 format.ts 重复的函数 | 清理重复，仅保留计算逻辑 |
| `dev/frontend/src/pages/Collection/hooks/useOverview.ts` | 279行，11个 useState | 拆分为 3 个职责 Hook |
| `dev/frontend/src/pages/Collection/hooks/useStrategicProducts.ts` | 278行，状态过多 | 同上 |
| `dev/frontend/src/pages/System/User/hooks/useUsers.ts` | 247行，返回 46 个属性 | 拆分 + 返回值分组 |
| `dev/frontend/src/pages/ProcurementReturn/components/WarehouseExecuteModal/index.tsx` | 259行，超标 | 拆分 FormPanel + TableContent |
| `dev/frontend/src/hooks/useModalControl.ts` | 23行，优秀范例 | - |
| `dev/frontend/src/hooks/useTablePagination.ts` | 49行，优秀范例 | - |

---

## 六、与《数据契约规范》的协作

前端 API 层与后端的数据交互，遵循《数据契约与DTO映射规范》：

```
前端组件 → Hook(useXxxData) → API Service(request.ts 拦截器 toSnakeKeys)
                                                      ↓
前端组件 ← Hook(useXxxData) ← API Service(响应拦截器 toCamelKeys)
```

- **组件和 Hook 中不处理 snake_case 字段**，所有字段映射在 API 层完成
- 如果组件中出现 `data.xxx_name` 的访问，说明 API 层的转换不完整
- Hook 接收和返回的数据全部是 camelCase 格式

---

## 七、页面布局容器规范

### 7.1 标准页面容器

`dev/frontend/src/styles/global.less` 中定义了两种标准页面容器类：

| 类名 | 用途 | 样式特征 |
|------|------|--------|
| `.page-full` | 一屏展示页面，内部容器滚动 | `height: calc(100vh - @layout-header-height)` + `overflow: hidden` + flex column |
| `.page-scroll` | 内容可超出视口，页面整体滚动 | `min-height: calc(100vh - @layout-header-height)` |

### 7.2 规则

- 页面根容器必须使用 `.page-full` 或 `.page-scroll`，禁止自行编写 `height` / `min-height`
- 禁止用 `height: 100%` 级联传递高度，高度由 `calc(100vh - @layout-header-height)` 统一计算
- 布局容器（flex/grid）的直接子元素不得被第三方包裹组件（Spin、Card）隔断高度链
- 加载状态由面板组件内部处理，不在布局链上插入 `<Spin>` 包裹层

### 7.3 正确用法

```tsx
// 正确：全局类 + 本地样式补充
<div className={`page-full ${styles.page}`}>
  <Toolbar />
  <div className={styles.contentWrapper}> {/* flex: 1, min-height: 0 */}
    <PanelA />  {/* height: 100% */}
    <PanelB />  {/* height: 100% */}
  </div>
</div>

// 错误：Spin 包裹布局容器，打断高度链
<div className={styles.page}>
  <Spin spinning={loading}>
    <div className={styles.mainContent}>
      <PanelA />
      <PanelB />
    </div>
  </Spin>
</div>
```

---

## 八、Ant Design 样式定制规范

### 8.1 核心原则

**不和 Ant Design 的 CSS 打仗，改用 Ant Design 自己的定制入口。**

Ant Design v5 使用 CSS-in-JS（emotion），生成的样式选择器优先级高于 `.less` 文件。用外部 CSS 覆盖会导致 `!important` 和 `:global(.ant-xxx)` 穿透的恶性循环。

### 8.2 禁止做法

- 禁止使用 `:global(.ant-xxx)` 穿透组件内部 DOM
- 禁止使用 `!important` 覆盖 Ant Design 样式
- 禁止通过 CSS 选择器修改 Ant Design 组件的内部布局

### 8.3 正确做法

| 定制需求 | 正确方式 | 错误方式 |
|---------|--------|--------|
| Select 宽度 | `<Select style={{ width: '100%' }}>` | `:global(.ant-select) { width: 100% !important }` |
| Select 尺寸 | `<Select size="small">` | `:global(.ant-select-selector) { height: 28px !important }` |
| Collapse 内边距 | `<Collapse styles={{ header: { padding: '12px 16px' } }}>` | `:global(.ant-collapse-header) { padding: 12px 16px !important }` |
| Button 颜色 | `<Button style={{ background: color }}>` | `.btn { background: color !important }` |
| Table 行高亮 | `rowClassName` + `tr.myRow > td` 选择器 | `:global(.ant-table-row) { background: color !important }` |
| Title 边距 | `<Title style={{ margin: 0 }}>` | `.title { margin: 0 !important }` |
| Table 内部滚动 | `<Table scroll={{ y: 'calc(100vh - 400px)' }}>` | `:global(.ant-table-body) { flex: 1 }` |

### 8.4 主题令牌统一

Ant Design 组件的默认设计令牌通过 `ConfigProvider` 的 `theme.token` 在 `app.tsx` 中统一配置，与 `variables.less` 中的定义对齐：

```tsx
<ConfigProvider theme={{
  token: {
    borderRadius: 8,           // 对应 @border-radius-base
    colorBgContainer: '#ffffff', // 对应 @bg-color-card
    colorBgLayout: '#f5f7fa',    // 对应 @bg-color-base
  },
}}>
```

---

## 九、设计令牌使用规范

### 9.1 规则

- 禁止硬编码已定义在 `variables.less` 中的值
- 新增设计值时，先在 `variables.less` 定义变量，再在代码中引用
- Ant Design 组件的主题令牌通过 `ConfigProvider` 统一配置

### 9.2 常见替换

| 硬编码值 | 变量引用 |
|---------|--------|
| `border-radius: 8px` | `@border-radius-base` |
| `border-radius: 4px` | `@border-radius-sm`（待新增） |
| `background: #fff` | `@bg-color-card` |
| `background: #f5f7fa` | `@bg-color-base` |
| `box-shadow: 0 2px 8px rgba(0,0,0,0.06)` | `@box-shadow-card` |
| `#fff7e6` | `@warning-alert-bg` |
| `#fff1f0` | `@warning-serious-bg` |
| `padding: 24px` | `@spacing-lg` |
| `padding: 16px` | `@spacing-md` |
| `padding: 8px` | `@spacing-sm` |
