---
trigger: always_on
alwaysApply: true
---
# 业务常量与规则管理规范

版本：v1.0
适用范围：本项目所有涉及业务阈值、规则配置的代码
核心原则：唯一定义、语义命名、影响可追踪

---

## 一、问题背景

业务常量散落在代码各处，导致：
- 魔法数字（7天、15天、30天阈值、考核起效日期）分散在多个文件中
- 前后端重复定义同一业务规则（如预警阈值）
- 修改业务规则时无法追踪影响范围，改一处漏三处
- 同一阈值在不同文件中使用不同数值，造成数据不一致

---

## 二、核心规则

### 2.1 唯一定义原则

每个业务阈值在项目中只定义一次，其他位置通过引用使用。

```typescript
// ❌ 错误：多处硬编码同一阈值
// 文件A: if (days >= 15) ...
// 文件B: if (daysToExpire >= 15) ...
// 文件C: const threshold = 15;

// ✅ 正确：唯一定义，所有位置引用
// constants.ts
export const RETURN_EXPIRE_INSUFFICIENT_DAYS = 15;
// 文件A: if (days >= RETURN_EXPIRE_INSUFFICIENT_DAYS)
// 文件B: if (daysToExpire >= RETURN_EXPIRE_INSUFFICIENT_DAYS)
```

### 2.2 语义命名原则

常量名必须表达业务含义而非数值：

| ❌ 错误 | ✅ 正确 |
|---------|---------|
| `FIFTEEN_DAYS` | `RETURN_EXPIRE_INSUFFICIENT_DAYS` |
| `SEVEN` | `DEFAULT_OVERDUE_WARNING_DAYS` |
| `THIRTY` | `AR_EXTENSION_MAX_DAYS` |

### 2.3 常量收敛到统一文件

后端 `dev/backend/src/utils/constants.ts` 按业务域分区（已有良好基础）：

```typescript
// ==================== 周转相关阈值 ====================
export const TURNOVER_GOOD_DAYS = 30;     // 已存在
export const TURNOVER_WARNING_DAYS = 60;  // 已存在

// ==================== 临期相关阈值 ====================
export const EXPIRING_SERIOUS_DAYS = 7;   // 已存在
export const EXPIRING_WARNING_DAYS = 15;  // 已存在

// ==================== 催收相关阈值（新增）====================
export const AR_EXTENSION_MAX_DAYS = 30;
export const AR_DEFAULT_EXPIRE_DAYS = 7;
export const AR_SETTLE_METHOD_CONSUMER_EXPIRE = 2;
export const AR_ASSESSMENT_EFFECTIVE_DATE = '2026-04-23';

// ==================== 退货考核阈值（新增）====================
export const RETURN_EXPIRE_INSUFFICIENT_DAYS = 15;

// ==================== 缓存时间配置（新增）====================
export const CACHE_TTL_STRATEGIC_PRODUCT = 5 * 60 * 1000;
export const CACHE_TTL_PERMISSION = 30 * 1000;
```

### 2.4 影响追踪

每个常量的 JSDoc 包含 `@usedBy` 标注：

```typescript
/**
 * 催收延期最大天数
 * @usedBy ar-collection.mutation.ts (校验延期天数)
 * @usedBy ar-collection-notify.ts (判断延期到期)
 */
export const AR_EXTENSION_MAX_DAYS = 30;
```

### 2.5 前后端同步策略

- **方案A（推荐）**：前端通过 API 获取后端配置值（如 `/api/config/thresholds`）
- **方案B（轻量）**：前端常量文件中注释标注"此值必须与后端 constants.ts 中的 XXX 保持一致"

当前 `dev/frontend/src/constants/warning.ts` 中的 `EXPIRING_WARNING_CONFIG`（7/15/30天）与后端 `constants.ts` 的 `EXPIRING_*_DAYS` 是同一规则的重复定义，必须收敛。

### 2.6 考核/分级规则的配置化

`return-penalty.types.ts` 中的 `PENALTY_RULES` 是良好范例——将业务规则结构化为对象：

```typescript
export const PENALTY_RULES = [
  {
    name: 'return_expire_insufficient',
    description: '退货时保质期不足',
    deadlineDays: 15,
    penaltyPerDay: 0,
  },
  // ...
];
```

其他硬编码的分级规则应参照此模式结构化，如 `ar-assessment.types.ts` 中的"一级(3-5天)""二级(5-7天)""三级(7天以上)"应结构化为 `ASSESSMENT_TIERS` 配置数组。

---

## 三、反模式（禁止的做法）

- ❌ 在代码中直接使用数字字面量表示业务规则（`if (days >= 30)`）
- ❌ 前后端分别定义同一业务规则的不同值
- ❌ 将业务阈值写在组件或函数内部
- ❌ 在函数内部定义常量（`const TTL = 5 * 60 * 1000`，应提取到 constants.ts）
- ❌ 常量名只表达数值不表达含义（`THRESHOLD_15`）

---

## 四、需提取的典型魔法数字

| 文件 | 当前代码 | 应提取为 |
|------|---------|---------|
| `ar-warning.query.ts` | `settleMethod === 2 则用 consumerExpireDay，否则7天` | `AR_SETTLE_METHOD_CONSUMER_EXPIRE` + `AR_DEFAULT_EXPIRE_DAYS` |
| `return-penalty-calculate.ts` | `daysToExpireAtReturn >= 15` | `RETURN_EXPIRE_INSUFFICIENT_DAYS` |
| `ar-assessment-calculate.ts` | 考核起效日期 `2026-04-23` | `AR_ASSESSMENT_EFFECTIVE_DATE` |
| `warning-cache.ts` | `STRATEGIC_CACHE_TTL = 5 * 60 * 1000` | `CACHE_TTL_STRATEGIC_PRODUCT` |
| `ar-collection.mutation.ts` | `延期天数不得超过30天` | `AR_EXTENSION_MAX_DAYS` |

---

## 五、迁移路径

### 阶段1：盘点与提取
- 扫描所有魔法数字，建立清单
- 在 `constants.ts` 中定义带语义名的常量
- 前端常量文件同步整理

### 阶段2：催收/退货模块优先迁移
- 将 ar-collection 和 return-penalty 中的魔法数字替换为常量引用
- 将 warning-cache.ts 中的缓存 TTL 并入统一常量
- 将 ar-assessment 中的硬编码分级结构化为配置

### 阶段3：持续收敛
- 每次修改涉及魔法数字的代码时，顺手提取常量
- 新代码强制要求使用常量而非字面量
- 考虑将来将业务常量入库，通过 API 动态获取

---

## 六、关键文件

| 文件 | 说明 |
|------|------|
| `dev/backend/src/utils/constants.ts` | 后端常量统一管理的核心文件 |
| `dev/frontend/src/constants/warning.ts` | 与后端重复的 EXPIRING_WARNING_CONFIG，需收敛 |
| `dev/backend/src/services/return-penalty/return-penalty.types.ts` | PENALTY_RULES 结构化配置的良好范例 |
| `dev/backend/src/services/ar-assessment/ar-assessment.types.ts` | 硬编码分级，需结构化 |
