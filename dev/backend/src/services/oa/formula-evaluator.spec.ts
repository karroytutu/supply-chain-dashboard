/**
 * 公式求值器单元测试
 */
import {
  evaluateFormula,
  extractDependencies,
  detectCycles,
  topologicalSort,
} from './formula-evaluator';

describe('evaluateFormula', () => {
  describe('基础四则运算', () => {
    it('加法', () => {
      expect(evaluateFormula('2 + 3', {})).toBe(5);
    });

    it('减法', () => {
      expect(evaluateFormula('10 - 3', {})).toBe(7);
    });

    it('乘法', () => {
      expect(evaluateFormula('4 * 5', {})).toBe(20);
    });

    it('除法', () => {
      expect(evaluateFormula('20 / 4', {})).toBe(5);
    });

    it('小数运算', () => {
      expect(evaluateFormula('0.1 + 0.2', {})).toBeCloseTo(0.3, 10);
    });
  });

  describe('运算符优先级', () => {
    it('乘除优先于加减', () => {
      expect(evaluateFormula('2 + 3 * 4', {})).toBe(14);
      expect(evaluateFormula('10 - 2 * 3', {})).toBe(4);
      expect(evaluateFormula('10 / 2 + 3', {})).toBe(8);
    });

    it('括号改变优先级', () => {
      expect(evaluateFormula('(2 + 3) * 4', {})).toBe(20);
      expect(evaluateFormula('10 / (2 + 3)', {})).toBe(2);
    });

    it('嵌套括号', () => {
      expect(evaluateFormula('((2 + 3) * (4 - 1))', {})).toBe(15);
    });
  });

  describe('一元运算符', () => {
    it('负号', () => {
      expect(evaluateFormula('-5', {})).toBe(-5);
      expect(evaluateFormula('-5 + 10', {})).toBe(5);
    });

    it('正号', () => {
      expect(evaluateFormula('+5', {})).toBe(5);
    });
  });

  describe('变量替换', () => {
    it('简单变量', () => {
      expect(evaluateFormula('quantity * unitPrice', { quantity: 5, unitPrice: 10 })).toBe(50);
    });

    it('多变量运算', () => {
      expect(evaluateFormula('a + b * c', { a: 1, b: 2, c: 3 })).toBe(7);
    });

    it('变量缺失时视为0', () => {
      expect(evaluateFormula('a + b', { a: 5 })).toBe(5);
      expect(evaluateFormula('a + b', {})).toBe(0);
    });

    it('变量为 null 或空字符串时视为0', () => {
      expect(evaluateFormula('a + b', { a: null, b: '' })).toBe(0);
      expect(evaluateFormula('a + b', { a: undefined, b: 5 })).toBe(5);
    });

    it('带下划线的变量名', () => {
      expect(evaluateFormula('_count + 1', { _count: 9 })).toBe(10);
    });
  });

  describe('除零保护', () => {
    it('除以零返回0', () => {
      expect(evaluateFormula('10 / 0', {})).toBe(0);
      expect(evaluateFormula('a / b', { a: 10, b: 0 })).toBe(0);
    });
  });

  describe('聚合函数', () => {
    const tableCtx = {
      items: [
        { qty: 2, price: 10, amount: 20 },
        { qty: 3, price: 20, amount: 60 },
        { qty: 1, price: 50, amount: 50 },
      ],
    };

    it('sum 求和', () => {
      expect(evaluateFormula('sum(items.amount)', tableCtx)).toBe(130);
    });

    it('count 计数', () => {
      expect(evaluateFormula('count(items.qty)', tableCtx)).toBe(3);
    });

    it('avg 平均值', () => {
      expect(evaluateFormula('avg(items.price)', tableCtx)).toBeCloseTo(26.67, 1);
    });

    it('min 最小值', () => {
      expect(evaluateFormula('min(items.price)', tableCtx)).toBe(10);
    });

    it('max 最大值', () => {
      expect(evaluateFormula('max(items.price)', tableCtx)).toBe(50);
    });

    it('空数组返回0', () => {
      expect(evaluateFormula('sum(empty.amount)', { empty: [] })).toBe(0);
      expect(evaluateFormula('avg(empty.amount)', { empty: [] })).toBe(0);
      expect(evaluateFormula('min(empty.amount)', { empty: [] })).toBe(0);
      expect(evaluateFormula('max(empty.amount)', { empty: [] })).toBe(0);
    });

    it('不存在的表格返回0', () => {
      expect(evaluateFormula('sum(missing.amount)', {})).toBe(0);
    });

    it('行内公式（以行数据为上下文）', () => {
      const rowData = { quantity: 3, unitPrice: 25 };
      expect(evaluateFormula('quantity * unitPrice', rowData)).toBe(75);
    });
  });

  describe('错误处理', () => {
    it('非法公式返回0', () => {
      expect(evaluateFormula('@@invalid', {})).toBe(0);
    });

    it('空公式返回0', () => {
      expect(evaluateFormula('', {})).toBe(0);
    });
  });
});

describe('extractDependencies', () => {
  it('提取简单变量', () => {
    const deps = extractDependencies('quantity * unitPrice');
    expect(deps).toEqual(expect.arrayContaining(['quantity', 'unitPrice']));
    expect(deps).toHaveLength(2);
  });

  it('提取聚合函数中的表名', () => {
    const deps = extractDependencies('sum(items.amount)');
    expect(deps).toEqual(['items']);
  });

  it('混合提取', () => {
    const deps = extractDependencies('tax + sum(lines.amount) * rate');
    expect(deps).toEqual(expect.arrayContaining(['tax', 'lines', 'rate']));
    expect(deps).toHaveLength(3);
  });

  it('非法公式返回空数组', () => {
    expect(extractDependencies('@@invalid')).toEqual([]);
  });

  it('重复变量去重', () => {
    const deps = extractDependencies('a + a * b');
    expect(deps).toEqual(expect.arrayContaining(['a', 'b']));
    expect(deps).toHaveLength(2);
  });
});

describe('detectCycles', () => {
  it('无循环时返回 null', () => {
    const result = detectCycles([
      { key: 'total', expression: 'quantity * unitPrice' },
      { key: 'tax', expression: 'total * 0.13' },
    ]);
    expect(result).toBeNull();
  });

  it('检测到循环', () => {
    const result = detectCycles([
      { key: 'a', expression: 'b + 1' },
      { key: 'b', expression: 'a + 1' },
    ]);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1); // 找到环后返回
  });

  it('间接循环', () => {
    const result = detectCycles([
      { key: 'a', expression: 'b' },
      { key: 'b', expression: 'c' },
      { key: 'c', expression: 'a' },
    ]);
    expect(result).not.toBeNull();
  });

  it('自引用', () => {
    const result = detectCycles([
      { key: 'a', expression: 'a + 1' },
    ]);
    expect(result).not.toBeNull();
  });

  it('无公式字段返回 null', () => {
    expect(detectCycles([])).toBeNull();
  });
});

describe('topologicalSort', () => {
  it('按依赖顺序排列', () => {
    const formulas = [
      { key: 'tax', expression: 'total * 0.13' },
      { key: 'total', expression: 'quantity * unitPrice' },
    ];
    const sorted = topologicalSort(formulas);
    expect(sorted[0].key).toBe('total');
    expect(sorted[1].key).toBe('tax');
  });

  it('无依赖时保持原序', () => {
    const formulas = [
      { key: 'a', expression: 'x + y' },
      { key: 'b', expression: 'z * 2' },
    ];
    const sorted = topologicalSort(formulas);
    expect(sorted).toHaveLength(2);
  });

  it('链式依赖', () => {
    const formulas = [
      { key: 'c', expression: 'b + 1' },
      { key: 'a', expression: 'x' },
      { key: 'b', expression: 'a * 2' },
    ];
    const sorted = topologicalSort(formulas);
    const keys = sorted.map(f => f.key);
    expect(keys.indexOf('a')).toBeLessThan(keys.indexOf('b'));
    expect(keys.indexOf('b')).toBeLessThan(keys.indexOf('c'));
  });
});
