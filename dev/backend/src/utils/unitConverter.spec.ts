import {
  convertStockUnits,
  baseToPackageUnit,
  packageToBaseUnit,
  parseUnitFactor,
  parseQuantity,
  formatMixedUnit,
} from './unitConverter';

describe('convertStockUnits', () => {
  it('converts to package units when pkgQuantity > 0', () => {
    const result = convertStockUnits({
      baseQuantity: 100,
      baseAvgDaily: 10,
      unitFactor: 10,
      baseUnitName: '个',
      pkgUnitName: '箱',
    });
    expect(result.displayQuantity).toBe(10);
    expect(result.displayUnit).toBe('箱');
    expect(result.displayAvgDaily).toBe(1);
  });

  it('falls back to base unit when pkgQuantity is 0 but baseQuantity > 0', () => {
    const result = convertStockUnits({
      baseQuantity: 5,
      baseAvgDaily: 2,
      unitFactor: 10,
      baseUnitName: '个',
      pkgUnitName: '箱',
    });
    expect(result.displayQuantity).toBe(5);
    expect(result.displayUnit).toBe('个');
    expect(result.displayAvgDaily).toBe(2);
  });

  it('uses base unit when unitFactor is 1', () => {
    const result = convertStockUnits({
      baseQuantity: 50,
      baseAvgDaily: 5,
      unitFactor: 1,
      baseUnitName: '个',
      pkgUnitName: '箱',
    });
    expect(result.displayQuantity).toBe(50);
    expect(result.displayUnit).toBe('箱'); // unitFactor<=1, use pkgUnitName
  });

  it('returns zero quantities correctly', () => {
    const result = convertStockUnits({
      baseQuantity: 0,
      baseAvgDaily: 0,
      unitFactor: 10,
      baseUnitName: '个',
      pkgUnitName: '箱',
    });
    expect(result.displayQuantity).toBe(0);
    expect(result.displayAvgDaily).toBe(0);
  });

  it('floors the package quantity', () => {
    const result = convertStockUnits({
      baseQuantity: 15,
      baseAvgDaily: 0,
      unitFactor: 4,
      baseUnitName: '个',
      pkgUnitName: '箱',
    });
    expect(result.displayQuantity).toBe(3); // 15/4 = 3.75 -> floor 3
    expect(result.displayUnit).toBe('箱');
  });
});

describe('baseToPackageUnit', () => {
  it('converts base to package', () => {
    expect(baseToPackageUnit(100, 10)).toBe(10);
  });

  it('floors the result', () => {
    expect(baseToPackageUnit(15, 4)).toBe(3);
  });

  it('returns baseQuantity when unitFactor <= 1', () => {
    expect(baseToPackageUnit(50, 1)).toBe(50);
    expect(baseToPackageUnit(50, 0)).toBe(50);
  });
});

describe('packageToBaseUnit', () => {
  it('converts package to base', () => {
    expect(packageToBaseUnit(10, 10)).toBe(100);
  });

  it('returns pkgQuantity when unitFactor <= 1', () => {
    expect(packageToBaseUnit(50, 1)).toBe(50);
  });
});

describe('parseUnitFactor', () => {
  it('parses numeric value', () => {
    expect(parseUnitFactor(10)).toBe(10);
  });

  it('parses string value', () => {
    expect(parseUnitFactor('12')).toBe(12);
  });

  it('returns 1 for NaN', () => {
    expect(parseUnitFactor('abc')).toBe(1);
  });

  it('returns 1 for value < 1', () => {
    expect(parseUnitFactor(0)).toBe(1);
    expect(parseUnitFactor(-5)).toBe(1);
    expect(parseUnitFactor(0.5)).toBe(1);
  });

  it('returns 1 for null/undefined', () => {
    expect(parseUnitFactor(null)).toBe(1);
    expect(parseUnitFactor(undefined)).toBe(1);
  });
});

describe('parseQuantity', () => {
  it('parses numeric value', () => {
    expect(parseQuantity(42)).toBe(42);
  });

  it('parses string value', () => {
    expect(parseQuantity('99.5')).toBe(99.5);
  });

  it('returns 0 for NaN', () => {
    expect(parseQuantity('abc')).toBe(0);
  });

  it('returns 0 for null/undefined', () => {
    expect(parseQuantity(null)).toBe(0);
    expect(parseQuantity(undefined)).toBe(0);
  });

  it('handles negative values', () => {
    expect(parseQuantity(-10)).toBe(-10);
  });
});

describe('formatMixedUnit', () => {
  // === 三级单位场景（箱/包/瓶） ===

  it('三级单位混合显示：150瓶 → 1箱2包6瓶（1箱=120瓶，1包=12瓶）', () => {
    expect(formatMixedUnit({
      baseQuantity: 150,
      pkgUnitName: '箱',
      baseUnitName: '瓶',
      pkgUnitFactor: 120,
      midUnitName: '包',
      midUnitFactor: 12,
    })).toBe('1箱2包6瓶');
  });

  it('三级单位整除：144瓶 → 1箱2包（无余数瓶）', () => {
    expect(formatMixedUnit({
      baseQuantity: 144,
      pkgUnitName: '箱',
      baseUnitName: '瓶',
      pkgUnitFactor: 120,
      midUnitName: '包',
      midUnitFactor: 12,
    })).toBe('1箱2包');
  });

  it('三级单位只显示大单位：120瓶 → 1箱', () => {
    expect(formatMixedUnit({
      baseQuantity: 120,
      pkgUnitName: '箱',
      baseUnitName: '瓶',
      pkgUnitFactor: 120,
      midUnitName: '包',
      midUnitFactor: 12,
    })).toBe('1箱');
  });

  it('三级单位中间零跳过：123瓶 → 1箱3瓶（跳过0包）', () => {
    expect(formatMixedUnit({
      baseQuantity: 123,
      pkgUnitName: '箱',
      baseUnitName: '瓶',
      pkgUnitFactor: 120,
      midUnitName: '包',
      midUnitFactor: 12,
    })).toBe('1箱3瓶');
  });

  it('三级单位不足一箱：15瓶 → 1包3瓶', () => {
    expect(formatMixedUnit({
      baseQuantity: 15,
      pkgUnitName: '箱',
      baseUnitName: '瓶',
      pkgUnitFactor: 120,
      midUnitName: '包',
      midUnitFactor: 12,
    })).toBe('1包3瓶');
  });

  it('三级单位不足一包：5瓶 → 5瓶', () => {
    expect(formatMixedUnit({
      baseQuantity: 5,
      pkgUnitName: '箱',
      baseUnitName: '瓶',
      pkgUnitFactor: 120,
      midUnitName: '包',
      midUnitFactor: 12,
    })).toBe('5瓶');
  });

  it('三级单位大数量：100000瓶 → 833箱3包4瓶', () => {
    expect(formatMixedUnit({
      baseQuantity: 100000,
      pkgUnitName: '箱',
      baseUnitName: '瓶',
      pkgUnitFactor: 120,
      midUnitName: '包',
      midUnitFactor: 12,
    })).toBe('833箱3包4瓶');
  });

  // === 两级单位场景（件/瓶） ===

  it('两级单位混合显示：8832瓶 → 80件32瓶（1件=110瓶）', () => {
    expect(formatMixedUnit({
      baseQuantity: 8832,
      pkgUnitName: '件',
      baseUnitName: '瓶',
      pkgUnitFactor: 110,
    })).toBe('80件32瓶');
  });

  it('两级单位整除：8800瓶 → 80件', () => {
    expect(formatMixedUnit({
      baseQuantity: 8800,
      pkgUnitName: '件',
      baseUnitName: '瓶',
      pkgUnitFactor: 110,
    })).toBe('80件');
  });

  it('两级单位不足一件：50瓶 → 50瓶', () => {
    expect(formatMixedUnit({
      baseQuantity: 50,
      pkgUnitName: '件',
      baseUnitName: '瓶',
      pkgUnitFactor: 110,
    })).toBe('50瓶');
  });

  // === 边界场景 ===

  it('零库存：0瓶 → 0瓶', () => {
    expect(formatMixedUnit({
      baseQuantity: 0,
      pkgUnitName: '件',
      baseUnitName: '瓶',
      pkgUnitFactor: 110,
    })).toBe('0瓶');
  });

  it('无换算关系（factor<=1）：100瓶 → 100瓶', () => {
    expect(formatMixedUnit({
      baseQuantity: 100,
      pkgUnitName: '件',
      baseUnitName: '瓶',
      pkgUnitFactor: 1,
    })).toBe('100瓶');
  });

  it('包装单位和基本单位同名：100个 → 100个', () => {
    expect(formatMixedUnit({
      baseQuantity: 100,
      pkgUnitName: '个',
      baseUnitName: '个',
      pkgUnitFactor: 10,
    })).toBe('100个');
  });

  it('中单位与基本单位同名时降级为两级：100瓶 → 10件', () => {
    expect(formatMixedUnit({
      baseQuantity: 100,
      pkgUnitName: '件',
      baseUnitName: '瓶',
      pkgUnitFactor: 10,
      midUnitName: '瓶',
      midUnitFactor: 1,
    })).toBe('10件');
  });
});
