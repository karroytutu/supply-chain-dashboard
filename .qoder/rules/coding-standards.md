---
trigger: always_on
---
# 项目文件规范文档

本文档定义了供应链仪表盘项目的代码组织规范，供 AI 助手和开发者参考。

---

## 一、文件大小限制

| 文件类型 | 上限 | 警告阈值 | 超出处理 |
|----------|------|----------|----------|
| Service 文件 | 300 行 | 200 行 | 按领域拆分 |
| Component 文件 | 200 行 | 150 行 | 提取子组件 |
| 工具函数文件 | 150 行 | 100 行 | 按功能拆分 |
| 单个函数 | 50 行 | 30 行 | 提取子函数 |
| SQL 查询 | 30 行 | 20 行 | 移至独立文件 |

---

## 二、函数复杂度限制

| 指标 | 限制 | 说明 |
|------|------|------|
| 圈复杂度 | ≤ 10 | 分支/循环数量 |
| 嵌套深度 | ≤ 3 | 超过则提取子函数 |
| 参数数量 | ≤ 4 | 超过使用对象参数 |

---

## 三、命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件文件 | PascalCase | `MetricCard.tsx` |
| 服务/工具文件 | camelCase | `calculation.ts` |
| 类型定义 | camelCase + `.d.ts` | `dashboard.d.ts` |
| 样式文件 | 与组件同名 | `index.less` |
| 测试文件 | 源文件名 + `.spec.ts` | `calculation.spec.ts` |
| 目录名 | camelCase 或 kebab-case | `availability/`, `user-management/` |

---

## 四、目录结构规范

### 4.1 前端目录结构

```
src/
├── components/           # 通用组件
│   ├── MetricCard/
│   │   ├── index.tsx
│   │   └── index.less
│   └── ...
├── pages/               # 页面组件
│   ├── Dashboard/
│   │   ├── index.tsx
│   │   ├── index.less
│   │   ├── hooks/       # 页面专属 hooks
│   │   └── components/  # 页面专属组件
│   └── System/
│       ├── User/
│       ├── Role/
│       └── Permission/
├── services/            # API 服务
│   └── api/
├── utils/               # 工具函数
├── types/               # 类型定义
├── models/              # dva models
└── styles/              # 全局样式
```

### 4.2 后端目录结构

```
server/src/
├── controllers/         # 路由控制器
├── services/            # 业务逻辑层
│   ├── dashboard/       # 仪表盘相关服务
│   │   ├── index.ts
│   │   ├── availability.service.ts
│   │   └── ...
│   ├── auth/            # 认证相关服务
│   └── ...
├── utils/               # 工具函数
│   ├── constants.ts     # 业务常量
│   ├── cache.ts         # 缓存工具
│   └── ...
├── types/               # 类型定义
├── middleware/          # 中间件
├── routes/              # 路由定义
├── db/                  # 数据库配置
└── config/              # 配置文件
```

---

## 五、代码组织原则

### 5.1 单一职责原则

- 每个 Service 文件专注一个业务领域
- 每个函数只做一件事
- 每个组件只负责一个 UI 功能

### 5.2 模块导出规范

```typescript
// 推荐：使用 index.ts 作为模块入口
// services/availability/index.ts
export { getAvailabilityData, getCategoryTreeData } from './availability.service';
export type { AvailabilityData, CategoryMetric } from './availability.types';

// 使用方
import { getAvailabilityData, AvailabilityData } from './services/availability';
```

### 5.3 依赖分层架构

```
┌─────────────────────────────────────┐
│           Controllers               │  ← 路由处理
├─────────────────────────────────────┤
│            Services                 │  ← 业务逻辑
├─────────────────────────────────────┤
│             Utils                   │  ← 工具函数
├─────────────────────────────────────┤
│              DB                     │  ← 数据库访问
└─────────────────────────────────────┘
```

---

## 六、TypeScript 规范

### 6.1 类型定义

- 优先使用 `interface` 定义对象类型
- 使用 `type` 定义联合类型、交叉类型
- 类型定义与实现分离，放在 `.types.ts` 文件中

```typescript
// availability.types.ts
export interface AvailabilityData {
  value: number;
  unit: 'percent';
  totalSku: number;
  categories: CategoryMetric[];
}

export interface CategoryMetric {
  categoryId: string;
  categoryName: string;
  value: number;
  trend: number;
}
```

### 6.2 函数签名

- 参数超过 4 个时使用对象参数
- 返回值必须明确类型

```typescript
// 推荐
interface GetProductsParams {
  page: number;
  pageSize: number;
  categoryId?: string;
  warningLevel?: WarningLevel;
}

async function getProducts(params: GetProductsParams): Promise<PaginatedResult<Product>> {
  // ...
}
```

---

## 七、SQL 查询规范

### 7.1 参数化查询

- 必须使用参数化查询防止 SQL 注入
- 使用 `$1, $2, ...` 占位符

```typescript
// 正确
const result = await query(
  'SELECT * FROM products WHERE category_id = $1 AND status = $2',
  [categoryId, status]
);

// 错误 - SQL 注入风险
const result = await query(
  `SELECT * FROM products WHERE category_id = '${categoryId}'`
);
```

### 7.2 复杂查询组织

- 超过 20 行的查询考虑提取到独立文件
- 使用 CTE (Common Table Expression) 组织复杂查询

---

## 八、错误处理规范

### 8.1 服务层错误处理

```typescript
// 抛出明确的错误信息
if (!product) {
  throw new Error('Product not found');
}

// 使用 try-catch 处理数据库错误
try {
  const result = await query(...);
  return result.rows;
} catch (error) {
  console.error('Database query failed:', error);
  throw new Error('Failed to fetch products');
}
```

### 8.2 控制器层错误处理

- 统一使用错误处理中间件
- 返回合适的 HTTP 状态码

---

## 九、性能优化规范

### 9.1 避免 N+1 查询

```typescript
// 错误：N+1 查询
for (const user of users) {
  const roles = await getRolesByUserId(user.id);  // N 次查询
}

// 正确：批量查询
const userIds = users.map(u => u.id);
const allRoles = await getRolesByUserIds(userIds);  // 1 次查询
const rolesByUserId = groupBy(allRoles, 'user_id');
```

### 9.2 缓存使用

- 频繁访问的数据使用缓存
- 设置合理的过期时间

---

## 十、测试规范

### 10.1 测试文件命名

- 单元测试：`*.spec.ts`
- 集成测试：`*.integration.spec.ts`

### 10.2 测试组织

```
server/src/
├── services/
│   └── availability/
│       ├── availability.service.ts
│       └── availability.service.spec.ts
└── __tests__/
    └── integration/
```
