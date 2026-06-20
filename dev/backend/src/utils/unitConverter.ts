/**
 * 单位转换工具模块
 * 处理库存数量和销量的单位换算
 */

/**
 * 单位转换结果
 */
export interface UnitConversionResult {
  /** 显示数量 */
  displayQuantity: number;
  /** 显示单位名称 */
  displayUnit: string;
  /** 显示日均销量 */
  displayAvgDaily: number;
}

/**
 * 库存单位转换选项
 */
export interface StockUnitConversionOptions {
  /** 基本单位数量 */
  baseQuantity: number;
  /** 基本单位日均销量 */
  baseAvgDaily: number;
  /** 包装单位换算系数 */
  unitFactor: number;
  /** 基本单位名称 */
  baseUnitName: string;
  /** 包装单位名称 */
  pkgUnitName: string;
}

/**
 * 转换库存数量和日均销量到显示单位
 *
 * 规则：
 * 1. 优先使用包装单位显示
 * 2. 如果包装单位数量为0但基本单位数量大于0，则显示基本单位
 * 3. 这种情况说明库存不足以凑成一个包装单位
 */
export function convertStockUnits(options: StockUnitConversionOptions): UnitConversionResult {
  const { baseQuantity, baseAvgDaily, unitFactor, baseUnitName, pkgUnitName } = options;

  // 计算包装单位数量
  const pkgQuantity = unitFactor > 1 ? Math.floor(baseQuantity / unitFactor) : baseQuantity;

  // 计算包装单位日均销量
  const pkgAvgDaily = unitFactor > 1 ? baseAvgDaily / unitFactor : baseAvgDaily;

  // 判断是否使用基本单位显示
  const useBaseUnit = pkgQuantity === 0 && baseQuantity > 0;

  return {
    displayQuantity: useBaseUnit ? baseQuantity : pkgQuantity,
    displayUnit: useBaseUnit ? baseUnitName : pkgUnitName,
    displayAvgDaily: useBaseUnit ? baseAvgDaily : pkgAvgDaily,
  };
}

/**
 * 基本单位转包装单位
 */
export function baseToPackageUnit(baseQuantity: number, unitFactor: number): number {
  if (unitFactor <= 1) return baseQuantity;
  return Math.floor(baseQuantity / unitFactor);
}

/**
 * 包装单位转基本单位
 */
export function packageToBaseUnit(pkgQuantity: number, unitFactor: number): number {
  if (unitFactor <= 1) return pkgQuantity;
  return pkgQuantity * unitFactor;
}

/**
 * 解析单位换算系数（处理可能的字符串或数字类型）
 */
export function parseUnitFactor(value: unknown): number {
  const factor = typeof value === 'string' ? parseFloat(value) : Number(value);
  return isNaN(factor) || factor < 1 ? 1 : factor;
}

/**
 * 解析数量值（处理可能的字符串或数字类型）
 */
export function parseQuantity(value: unknown): number {
  const quantity = typeof value === 'string' ? parseFloat(value) : Number(value);
  return isNaN(quantity) ? 0 : quantity;
}

// =====================================================
// 混合单位格式化（支持三级/两级单位从大到小显示）
// =====================================================

/**
 * 混合单位格式化选项
 * 支持 ERP 三级单位体系：大单位（箱/件）、中单位（包/打，可选）、小单位（瓶/个）
 */
export interface MixedUnitOptions {
  /** 基本单位总数量（如库存的物理库存量，始终是最小单位） */
  baseQuantity: number;
  /** 包装单位（大单位）名称，如"箱"、"件" */
  pkgUnitName: string;
  /** 基本单位（小单位）名称，如"瓶"、"个" */
  baseUnitName: string;
  /**
   * 包装单位换算系数：1个大单位 = 多少个小单位
   * 如 1箱=120瓶，则 pkgUnitFactor=120
   */
  pkgUnitFactor: number;
  /** 中单位名称（可选），如"包"、"打" */
  midUnitName?: string | null;
  /**
   * 中单位换算系数（可选）：1个中单位 = 多少个小单位
   * 如 1包=12瓶，则 midUnitFactor=12
   * 必须满足 pkgUnitFactor > midUnitFactor > 1
   */
  midUnitFactor?: number | null;
}

/**
 * 将基本单位数量格式化为混合单位显示字符串（从大到小）
 *
 * 三级单位示例（1箱=120瓶，1包=12瓶）：
 *   formatMixedUnit({ baseQuantity: 150, pkgUnitName: '箱', baseUnitName: '瓶',
 *                     pkgUnitFactor: 120, midUnitName: '包', midUnitFactor: 12 })
 *   → "1箱2包6瓶"
 *
 * 两级单位示例（1件=110瓶）：
 *   formatMixedUnit({ baseQuantity: 8832, pkgUnitName: '件', baseUnitName: '瓶',
 *                     pkgUnitFactor: 110 })
 *   → "80件32瓶"
 *
 * 换算规则：
 * 1. pkgUnitFactor <= 1 或包装/基本单位同名：只显示基本单位
 * 2. 有有效中单位（midUnitName + midUnitFactor > 1 且 < pkgUnitFactor）：三级拆解
 * 3. 无有效中单位：两级拆解
 * 4. 为零的中间级别不显示（如"1箱3瓶"而非"1箱0包3瓶"）
 */
export function formatMixedUnit(options: MixedUnitOptions): string {
  const {
    baseQuantity,
    pkgUnitName,
    baseUnitName,
    pkgUnitFactor,
    midUnitName,
    midUnitFactor,
  } = options;

  // 边界：无效换算系数或单位同名，降级为基本单位
  if (pkgUnitFactor <= 1 || pkgUnitName === baseUnitName) {
    return `${baseQuantity}${baseUnitName}`;
  }

  // 数量为 0
  if (baseQuantity === 0) {
    return `0${baseUnitName}`;
  }

  // 判断是否有有效的中单位
  const hasMidUnit = !!(midUnitName
    && midUnitName !== baseUnitName
    && midUnitName !== pkgUnitName
    && midUnitFactor
    && midUnitFactor > 1
    && midUnitFactor < pkgUnitFactor);

  if (hasMidUnit) {
    // 三级拆解：大 → 中 → 小
    const pkgQty = Math.floor(baseQuantity / pkgUnitFactor);
    const afterPkg = baseQuantity % pkgUnitFactor;
    const midQty = Math.floor(afterPkg / midUnitFactor!);
    const baseQty = afterPkg % midUnitFactor!;

    // 拼接非零部分
    const parts: string[] = [];
    if (pkgQty > 0) parts.push(`${pkgQty}${pkgUnitName}`);
    if (midQty > 0) parts.push(`${midQty}${midUnitName}`);
    if (baseQty > 0) parts.push(`${baseQty}${baseUnitName}`);
    return parts.join('');
  }

  // 两级拆解：大 → 小
  const pkgQty = Math.floor(baseQuantity / pkgUnitFactor);
  const baseQty = baseQuantity % pkgUnitFactor;

  if (pkgQty === 0) {
    return `${baseQty}${baseUnitName}`;
  }
  if (baseQty === 0) {
    return `${pkgQty}${pkgUnitName}`;
  }
  return `${pkgQty}${pkgUnitName}${baseQty}${baseUnitName}`;
}
