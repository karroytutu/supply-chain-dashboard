import {
  convertStockUnits,
  baseToPackageUnit,
  packageToBaseUnit,
  parseUnitFactor,
  parseQuantity,
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
