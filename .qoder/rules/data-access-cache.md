---
trigger: always_on
---
# 数据访问与缓存规范

版本：v1.0
适用范围：本项目所有涉及数据库查询和缓存使用的后端代码
核心原则：统一访问、写入即失效、缓存收敛

---

## 一、问题背景

数据访问和缓存管理缺乏统一架构，导致：
- 3种缓存实现并存（通用 MemoryCache、权限缓存服务、战略商品硬编码缓存）
- 缓存 key 无命名规范，pattern 清除容易误删
- 战略商品缓存不走通用 cache 系统，独立维护成本高
- 写操作分散在各 Service 中，缓存失效依赖"记得调用"，遗漏则数据不一致
- Service 层直接嵌入 SQL，业务逻辑与数据访问耦合
- 部分 Service 中存在 N+1 查询和循环内单条插入

---

## 二、核心规则

### 2.1 统一数据访问层（Repository 模式）

每个业务实体的数据访问收敛到对应的 Repository 文件，Service 层不再直接编写 SQL。

```
当前架构：
Controller → Service（内含 SQL + 缓存 + 业务逻辑）

目标架构：
Controller → Service（业务逻辑）→ Repository（SQL + 缓存）→ DB
```

Repository 文件命名与职责：

| 文件 | 命名 | 职责 |
|------|------|------|
| `{entity}.repository.ts` | 如 `ar-collection.repository.ts` | SQL 查询、缓存读写、结果映射 |

**Repository 的编写规范：**

```typescript
// ar-collection.repository.ts
import { cache, CACHE_TTL } from '../utils/cache';
import { query } from '../db/pool';

export class ArCollectionRepository {
  private static CACHE_PREFIX = 'ar:collection';

  async getTasks(params: TaskQueryParams): Promise<PaginatedResult<Task>> {
    const cacheKey = `${ArCollectionRepository.CACHE_PREFIX}:tasks:${JSON.stringify(params)}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const result = await query('SELECT ... WHERE ...', [params]);
    cache.set(cacheKey, result, CACHE_TTL.WARNING_LIST);
    return result;
  }

  async createTask(data: CreateTaskParams): Promise<Task> {
    const result = await query('INSERT INTO ... RETURNING *', [data]);
    // 写入后自动失效相关缓存
    this.invalidateTaskCache();
    return result.rows[0];
  }

  private invalidateTaskCache(): void {
    cache.invalidate(`${ArCollectionRepository.CACHE_PREFIX}:tasks:`);
  }
}
```

### 2.2 统一缓存实现

所有缓存必须使用 `dev/backend/src/utils/cache.ts` 的 `MemoryCache` 单例，禁止其他缓存实现。

**当前需收敛的缓存：**

| 现有实现 | 问题 | 迁移方案 |
|---------|------|---------|
| `warning-cache.ts` 的 `strategicGoodsIdsCache` | 独立变量，不走通用缓存 | 迁移到 `cache.set('strategic:product:ids', ...)` |
| `warning-cache.ts` 的 `strategicGoodsIdsCacheTime` | 手动管理 TTL | 交由 MemoryCache 的 TTL 机制 |
| 各 Service 中零散的 `cache.get/set` | 缓存逻辑混入业务 | 收敛到 Repository 层 |

**迁移后 `warning-cache.ts` 简化为：**

```typescript
// 迁移前：独立变量 + 手动 TTL
let strategicGoodsIdsCache: Set<string> | null = null;
let strategicGoodsIdsCacheTime = 0;
export function clearStrategicGoodsCache() { strategicGoodsIdsCache = null; }

// 迁移后：使用统一缓存
import { cache, CACHE_TTL } from '../utils/cache';

export async function getStrategicProductIds(): Promise<Set<string>> {
  const cacheKey = 'strategic:product:ids';
  const cached = cache.get<Set<string>>(cacheKey);
  if (cached) return cached;

  const result = await query('SELECT product_id FROM strategic_products WHERE ...');
  const ids = new Set(result.rows.map(r => r.product_id));
  cache.set(cacheKey, ids, CACHE_TTL.STRATEGIC_PRODUCT);
  return ids;
}

export function clearStrategicGoodsCache(): void {
  cache.invalidate('strategic:product:');
}
```

### 2.3 缓存 Key 命名规范

Key 格式：`{业务域}:{实体}:{操作/条件}`

| 业务域 | 实体 | Key 示例 |
|--------|------|---------|
| ar | collection | `ar:collection:tasks`, `ar:collection:stats` |
| strategic | product | `strategic:product:ids`, `strategic:product:list` |
| overview | stats | `overview:stats:summary`, `overview:stats:trend` |
| category | tree | `category:tree:availability` |
| permission | user | `permission:user:{userId}` |
| permission | tree | `permission:tree:full` |
| erp | customer | `erp:customer:search:{hash}`, `erp:customer:profile:{id}` |
| precomputed | daily | `precomputed:daily:sales`, `precomputed:stock:summary` |

**规则：**
- 使用小写英文和冒号分隔，禁止中文和特殊字符
- 同一实体的 key 共享前缀，便于 `cache.invalidate('ar:collection:')` 批量清除
- 动态参数拼接在最后，如 `erp:customer:profile:12345`
- Key 中禁止包含敏感信息（如完整密码、token）

### 2.4 写入必须失效缓存

**核心原则：任何写入操作（INSERT/UPDATE/DELETE）必须同时失效相关缓存。**

```typescript
// ✅ 正确：Repository 中写入后自动失效
async updateStrategicProduct(id: string, data: UpdateParams): Promise<void> {
  await query('UPDATE strategic_products SET ... WHERE id = $1', [id, ...data]);
  this.invalidateCache();  // 写入即失效
}

// ❌ 错误：在 Controller 中手动调用缓存清除
await strategicService.updateProduct(id, data);
clearStrategicGoodsCache();  // 容易遗漏，应收敛到 Repository
```

**缓存失效策略：**

| 场景 | 失效方式 | 示例 |
|------|---------|------|
| 单条数据更新 | 清除该实体的所有缓存 | `cache.invalidate('ar:collection:')` |
| 关联数据变更 | 级联清除关联实体的缓存 | 更新战略商品 → 清除 `strategic:product:` + `overview:stats:` |
| 批量操作 | 清除相关域的所有缓存 | 批量同步催收数据 → 清除 `ar:` 前缀 |

### 2.5 TTL 分层

缓存 TTL 按数据变化频率分为三档：

| 档位 | TTL | 适用数据 | 常量名 |
|------|-----|---------|--------|
| 短 | 30秒 | 高频变更数据（权限、预警列表） | `CACHE_TTL.HIGH_FREQUENCY` |
| 中 | 60秒 | 常规业务数据（仪表盘、概览统计） | `CACHE_TTL.DASHBOARD` |
| 长 | 5分钟 | 低频变更数据（品类树、ERP客户、战略商品ID） | `CACHE_TTL.LOW_FREQUENCY` |

**`dev/backend/src/utils/cache.ts` 中已有的 TTL 常量应统一为三档：**

```typescript
export const CACHE_TTL = {
  HIGH_FREQUENCY: 30 * 1000,    // 30秒：权限、预警
  DASHBOARD: 60 * 1000,         // 60秒：仪表盘、概览
  LOW_FREQUENCY: 5 * 60 * 1000, // 5分钟：品类、ERP、战略商品
} as const;
```

禁止在 Repository 或 Service 中硬编码 TTL 值（如 `5 * 60 * 1000`），必须引用 `CACHE_TTL` 常量。

### 2.6 禁止 N+1 查询

```typescript
// ❌ 错误：循环内逐条查询
for (const user of users) {
  const roles = await query('SELECT * FROM user_roles WHERE user_id = $1', [user.id]);
}

// ✅ 正确：批量查询后内存关联
const userIds = users.map(u => u.id);
const allRoles = await query('SELECT * FROM user_roles WHERE user_id = ANY($1)', [userIds]);
const rolesByUser = groupBy(allRoles.rows, 'user_id');
```

```typescript
// ❌ 错误：循环内逐条插入
for (const debt of debts) {
  await client.query('INSERT INTO ar_collection_details ...', [debt.id, taskId]);
}

// ✅ 正确：批量 VALUES 插入
const values = debts.map((d, i) => `($${i*2+1}, $${i*2+2})`).join(', ');
const params = debts.flatMap(d => [d.id, taskId]);
await client.query(`INSERT INTO ar_collection_details (debt_id, task_id) VALUES ${values}`, params);
```

---

## 三、反模式（禁止的做法）

- ❌ 在 Service 层直接编写 SQL 查询（应收敛到 Repository）
- ❌ 使用独立变量管理缓存（如 `let xxxCache = null`），必须使用统一 `MemoryCache`
- ❌ 在 Controller 中手动调用缓存清除函数（应收敛到 Repository 的写入方法中）
- ❌ 缓存 key 不含业务域前缀（如 `stats` 而非 `overview:stats`）
- ❌ 在代码中硬编码 TTL 值（如 `5 * 60 * 1000`），必须使用 `CACHE_TTL` 常量
- ❌ 循环内执行单条 SQL 查询或插入，导致 N+1 问题
- ❌ 写入数据后不清除相关缓存，导致数据不一致

---

## 四、迁移路径

### 阶段1：缓存统一化

- 将 `warning-cache.ts` 中的战略商品缓存迁移到通用 `MemoryCache`
- 统一 `CACHE_TTL` 常量为三档
- 补齐权限修改后的缓存失效调用
- **优先级：P0**（已有数据不一致风险）

### 阶段2：催收模块 Repository 试点

- 新建 `dev/backend/src/repositories/ar-collection.repository.ts`
- 将 `ar-collection.query.ts` 和 `ar-collection.mutation.ts` 中的 SQL 和缓存逻辑迁移到 Repository
- Service 层改为调用 Repository
- **优先级：P1**

### 阶段3：战略商品模块 Repository

- 新建 `dev/backend/src/repositories/strategic-product.repository.ts`
- 将 `strategic-product.query.ts` 和 `strategic-product.mutation.ts` 迁移
- 合并 `warning-cache.ts` 中的缓存逻辑
- **优先级：P1**

### 阶段4：逐模块推广

- return-order → overview → availability → 其他
- 每次修改某模块时，顺手建立其 Repository
- 新模块必须从第一天就使用 Repository 模式

---

## 五、关键文件

| 文件 | 当前问题 | 迁移后 |
|------|---------|--------|
| `dev/backend/src/utils/cache.ts` | TTL 常量分散、缺少三档分层 | 统一为三档 `CACHE_TTL` 常量 |
| `dev/backend/src/utils/warning-cache.ts` | 独立缓存实现，不走通用系统 | 迁移到通用缓存后删除 |
| `dev/backend/src/services/ar-collection/ar-collection.query.ts` | SQL + 缓存 + 业务逻辑混合 | SQL 和缓存迁移到 Repository |
| `dev/backend/src/services/ar-collection/ar-collection.mutation.ts` | 写操作后缓存失效逻辑分散 | 收敛到 Repository 的写入方法 |
| `dev/backend/src/services/strategic-product/strategic-product.query.ts` | 同上 | 同上 |
| `dev/backend/src/services/strategic-product/strategic-product.mutation.ts` | 循环逐条更新，写后不清缓存 | Repository + 批量更新 + 自动失效 |
| `dev/backend/src/db/pool.ts` | 直接暴露 `query()` 函数 | 仅 Repository 层使用 |

---

## 六、与《数据契约规范》的协作

Repository 层返回的数据是 snake_case 的数据库行，与《数据契约与DTO映射规范》的分工：

```
Controller → fromDTO(请求) → Service → Repository → DB
                                                  ← snake_case 行
Controller ← toDTO(响应) ← Service ← Repository ←
```

- **Repository** 返回 snake_case 的原始数据
- **Mapper**（在 Controller 层调用）负责 snake_case ↔ camelCase 转换
- **Repository 不做键名转换**，只负责数据存取和缓存
