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
