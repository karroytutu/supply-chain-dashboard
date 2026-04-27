---
trigger: always_on
---
# 数据契约与DTO映射规范

版本：v1.0
适用范围：本项目所有涉及前后端数据交互的 API 开发
核心原则：边界转换、类型安全、声明式映射

---

## 一、问题背景

前后端没有统一的命名转换机制，导致：
- 37个后端文件中存在100+个手动转换函数（`transformTask`、`mapRowToReturnOrder` 等）
- 前端 API 层参数映射不完整（如 `handlerId`、`startDate` 未转 snake_case）
- 控制器中手动逐字段赋值做映射，容易遗漏
- 转换函数使用 `any → any` 类型签名，缺乏类型安全

---

## 二、核心规则

### 2.1 边界转换原则

snake_case ↔ camelCase 转换只在系统边界发生一次：
- **后端**：控制器层（响应出 → toCamelKeys，请求入 → fromDTO）
- **前端**：请求拦截器（参数 toSnakeKeys）或 API 层统一转换

Service 层、Repository 层内部始终使用 snake_case（与数据库一致），不做任何键名转换。

### 2.2 三层类型定义

每个业务实体维护三种类型文件：

| 文件 | 命名 | 用途 | 命名风格 |
|------|------|------|---------|
| `{entity}.types.ts` | 如 `ar-collection.types.ts` | 数据库实体类型 | snake_case |
| `{entity}.dto.ts` | 如 `ar-collection.dto.ts` | API 请求/响应类型 | camelCase |
| `{entity}.mapper.ts` | 如 `ar-collection.mapper.ts` | 映射函数 | - |

### 2.3 通用键名转换基座

新增 `dev/backend/src/utils/keyConvert.ts`，提供：

```typescript
// 递归转换所有键名
export function toCamelKeys<T>(obj: T): CamelCasedProperties<T>
export function toSnakeKeys<T>(obj: T): SnakeCasedProperties<T>
```

- 仅处理键名转换，不处理字段挑选或类型变换
- 当实体到 DTO 仅需键名转换时，直接使用 `toCamelKeys`
- 需要字段挑选、类型变换、计算字段时才编写自定义 mapper

### 2.4 DTO Mapper 的编写规范

`{entity}.mapper.ts` 导出两个纯函数：

```typescript
// 实体 → DTO（用于响应）
export function toDTO(entity: CollectionTask): CollectionTaskDTO {
  return {
    ...toCamelKeys(entity),
    // 额外处理：排除内部字段、数值精度修正等
  };
}

// DTO → 实体参数（用于请求）
export function fromDTO(dto: CreateTaskDTO, operatorId: string): CreateTaskParams {
  return {
    ...toSnakeKeys(dto),
    operator_id: operatorId, // 注入上下文信息
  };
}
```

### 2.5 控制器层统一使用 DTO

```typescript
// ✅ 正确：使用 mapper
const result = await service.getTasks(queryParams);
res.json(toDTO(result));

// ❌ 错误：手动逐字段映射
res.json({
  taskNo: result.task_no,
  consumerName: result.consumer_name,
  // ...容易遗漏
});
```

### 2.6 前端 API 层统一转换

在 `dev/frontend/src/services/api/request.ts` 的请求拦截器中，GET 请求的 `params` 自动将 camelCase 转为 snake_case。

### 2.7 禁止 any → any

- DTO mapper 的输入输出类型必须明确声明
- 禁止 `transformTask(task: any): any` 这种签名
- 前端 API 服务的泛型参数必须对应具体的 DTO 类型

---

## 三、反模式（禁止的做法）

- ❌ 在 Service 层做键名转换
- ❌ 在前端组件中手动映射字段名（`data.task_no` → `task.taskNo`）
- ❌ 使用 `any` 类型的转换函数
- ❌ 在多个地方重复编写同一实体的字段映射
- ❌ 控制器中手动逐字段赋值做映射

---

## 四、迁移路径

### 阶段1：建立基座
- 新建 `dev/backend/src/utils/keyConvert.ts`
- 新建 `dev/backend/src/utils/dto.types.ts`（工具类型定义）

### 阶段2：催收模块试点
- 将 `ar-collection.utils.ts` 中4个 transform 函数迁移为 `ar-collection.mapper.ts`
- 修改 `ar-collection-query.controller.ts` 和 `ar-collection-mutation.controller.ts` 使用 mapper
- 修改前端 `ar-collection.ts` API 层使用统一参数转换

### 阶段3：逐模块推广
- strategic-product → return-order → oa-approval → 其他
- 每次修改某模块时，顺手将其 transform 函数迁移为 mapper
- 新模块必须从第一天就使用 mapper 模式

---

## 五、关键文件

| 文件 | 当前问题 | 迁移后 |
|------|---------|--------|
| `dev/backend/src/services/ar-collection/ar-collection.utils.ts` | 4个 any→any 转换函数 | 迁移到 mapper 后删除 |
| `dev/backend/src/controllers/ar-collection-mutation.controller.ts` | 手动逐字段映射 | 使用 fromDTO |
| `dev/frontend/src/services/api/ar-collection.ts` | 参数映射不完整 | 使用统一转换 |
| `dev/backend/src/services/return-order/return-order-utils.ts` | mapRowToReturnOrder 重复模式 | 迁移到 mapper |
