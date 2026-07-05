/**
 * 提成比例常量
 * @syncWith dev/backend/src/utils/constants.ts L185-194
 * 修改时必须同步更新后端同名常量，否则前后端提成计算结果不一致
 * @usedBy useTargetCalculation.ts, CategoryProductTable/index.tsx
 */

/** 必须与后端 constants.ts 同名常量保持一致：提成比例 - 增量部分（本月利润 >= 基线时，增量 * 此比例） */
export const COMMISSION_RATE_INCREMENT = 0.10;

/** 必须与后端 constants.ts 同名常量保持一致：提成比例 - 基准部分（本月利润 >= 基线80%时，* 此比例） */
export const COMMISSION_RATE_BASE = 0.07;

/** 必须与后端 constants.ts 同名常量保持一致：提成比例 - 低达成率（本月利润 < 基线80%时，* 此比例） */
export const COMMISSION_RATE_LOW = 0.05;

/** 必须与后端 constants.ts 同名常量保持一致：提成基线阈值比例（本月利润 >= 基线 * 此比例时适用基准比例） */
export const COMMISSION_BASELINE_THRESHOLD = 0.8;
