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

    it('sum 支持行内乘法表达式 (table.col1 * table.col2)', () => {
      expect(evaluateFormula('sum(items.price * items.qty)', tableCtx)).toBe(130); // 10*2 + 20*3 + 50*1
    });

    it('sum 支持行内减法表达式', () => {
      const ctx = {
        lines: [
          { revenue: 100, cost: 40 },
          { revenue: 200, cost: 80 },
        ],
      };
      expect(evaluateFormula('sum(lines.revenue - lines.cost)', ctx)).toBe(180);
    });

    it('sumSmallest 支持行内表达式参数', () => {
      expect(evaluateFormula('sumSmallest(items.price * items.qty, 2)', tableCtx)).toBe(70); // 行值[20,60,50]，最小2个: 20+50
    });
  });

  describe('filterSum 跨表过滤聚合', () => {
    const stepCtx = {
      seq: 2, // 当前阶梯号
      stepPresents: [
        { seq: 1, costPrice: 10, unitFactor: 1, quantity: 1 },
        { seq: 2, costPrice: 20, unitFactor: 1, quantity: 2 },
        { seq: 2, costPrice: 30, unitFactor: 1, quantity: 1 },
        { seq: 3, costPrice: 50, unitFactor: 1, quantity: 1 },
      ],
    };

    it('按 seq 过滤求和', () => {
      // seq=2 的行: cost*factor*qty = 20*1*2 + 30*1*1 = 70
      expect(evaluateFormula(
        'filterSum(stepPresents.costPrice * stepPresents.unitFactor * stepPresents.quantity, stepPresents.seq, seq)',
        stepCtx
      )).toBe(70);
    });

    it('无匹配行返回0', () => {
      expect(evaluateFormula(
        'filterSum(stepPresents.costPrice, stepPresents.seq, 99)',
        stepCtx
      )).toBe(0);
    });

    it('支持简单字段（非表达式）', () => {
      // seq=1 的行: costPrice = 10
      expect(evaluateFormula(
        'filterSum(stepPresents.costPrice, stepPresents.seq, 1)',
        stepCtx
      )).toBe(10);
    });

    it('字符串/数字混合 filterValue 比较', () => {
      const ctx = {
        seq: '2', // 字符串类型
        presents: [
          { seq: 2, cost: 15 }, // 数字类型
          { seq: 2, cost: 25 },
          { seq: 1, cost: 100 },
        ],
      };
      expect(evaluateFormula(
        'filterSum(presents.cost, presents.seq, seq)',
        ctx
      )).toBe(40); // 15 + 25
    });

    it('空表返回0', () => {
      expect(evaluateFormula(
        'filterSum(empty.cost, empty.seq, 1)',
        { seq: 1, empty: [] }
      )).toBe(0);
    });

    it('不存在的表返回0', () => {
      expect(evaluateFormula(
        'filterSum(missing.cost, missing.seq, 1)',
        { seq: 1 }
      )).toBe(0);
    });
  });

  describe('filterSumSmallest 过滤后取最小/最大N个', () => {
    const ctx = {
      seq: 1,
      giveCount: 2,
      presents: [
        { seq: 1, cost: 10 },
        { seq: 1, cost: 30 },
        { seq: 1, cost: 20 },
        { seq: 1, cost: 50 },
        { seq: 2, cost: 100 },
      ],
    };

    it('取最小的 N 个', () => {
      // seq=1 的 cost: [10, 30, 20, 50]，最小2个: 10 + 20 = 30
      expect(evaluateFormula(
        'filterSumSmallest(presents.cost, presents.seq, seq, giveCount)',
        ctx
      )).toBe(30);
    });

    it('取最大的 N 个（max=1）', () => {
      // seq=1 的 cost: [10, 30, 20, 50]，最大2个: 50 + 30 = 80
      expect(evaluateFormula(
        'filterSumSmallest(presents.cost, presents.seq, seq, giveCount, 1)',
        ctx
      )).toBe(80);
    });

    it('count 超过匹配行数时取全部', () => {
      // seq=1 只有4行，count=10 时取全部: 10+20+30+50=110
      expect(evaluateFormula(
        'filterSumSmallest(presents.cost, presents.seq, seq, 10)',
        ctx
      )).toBe(110);
    });

    it('无匹配行返回0', () => {
      expect(evaluateFormula(
        'filterSumSmallest(presents.cost, presents.seq, 99, 2)',
        ctx
      )).toBe(0);
    });
  });

  describe('满赠阶梯利润集成测试', () => {
    it('阶梯模式：跨阶梯取最低利润率', () => {
      const formData = {
        onSaleType: 'step',
        mainGoodsList: [
          { onSalePrice: 10, _costPrice: 5, _unitFactor: 1 },
          { onSalePrice: 20, _costPrice: 8, _unitFactor: 1 },
        ],
        stepRules: [
          { seq: 1, countLatch: 10, giveType: 1, giveCount: 0 },
          { seq: 2, countLatch: 20, giveType: 0, giveCount: 2 },
        ],
        stepPresents: [
          { seq: 1, _costPrice: 15, _unitFactor: 1, quantity: 1 },
          { seq: 2, _costPrice: 10, _unitFactor: 1 },
          { seq: 2, _costPrice: 25, _unitFactor: 1 },
          { seq: 2, _costPrice: 40, _unitFactor: 1 },
        ],
      };

      // 阶梯1: 门槛=10, 固定赠品
      // minPrice=10, min(price-cost)=min(10-5,20-8)=min(5,12)=5
      // 赠品成本(filterSum, seq=1)=15*1*1=15
      // 利润率 = (10*5 - 15) / (10*10) * 100 = 35%
      const step1MinMargin = evaluateFormula(
        'countLatch * min(mainGoodsList.onSalePrice) > 0 ? ((countLatch * min(mainGoodsList.onSalePrice - mainGoodsList._costPrice * mainGoodsList._unitFactor) - filterSum(stepPresents._costPrice * stepPresents._unitFactor * stepPresents.quantity, stepPresents.seq, seq)) / (countLatch * min(mainGoodsList.onSalePrice))) * 100 : 0',
        { ...formData, ...formData.stepRules[0] }
      );
      expect(step1MinMargin).toBe(35);

      // 阶梯2: 门槛=20, 任选2件（取最贵2个: 40+25=65）
      // minPrice=10, min(price-cost)=5
      // 赠品成本(filterSumSmallest max=1, seq=2, count=2)=65
      // 利润率 = (20*5 - 65) / (20*10) * 100 = 17.5%
      const step2MinMargin = evaluateFormula(
        'countLatch * min(mainGoodsList.onSalePrice) > 0 ? ((countLatch * min(mainGoodsList.onSalePrice - mainGoodsList._costPrice * mainGoodsList._unitFactor) - filterSumSmallest(stepPresents._costPrice * stepPresents._unitFactor, stepPresents.seq, seq, giveCount, 1)) / (countLatch * min(mainGoodsList.onSalePrice))) * 100 : 0',
        { ...formData, ...formData.stepRules[1] }
      );
      expect(step2MinMargin).toBe(17.5);
    });
  });

  describe('字符串字面量', () => {
    it('单引号字符串比较', () => {
      expect(evaluateFormula("x == 'hello'", { x: 'hello' })).toBe(1);
      expect(evaluateFormula("x == 'hello'", { x: 'world' })).toBe(0);
    });

    it('双引号字符串比较', () => {
      expect(evaluateFormula('x == "step"', { x: 'step' })).toBe(1);
      expect(evaluateFormula('x == "step"', { x: 'loop' })).toBe(0);
    });

    it('字符串比较用于三元条件', () => {
      expect(evaluateFormula("mode == 'step' ? 100 : 200", { mode: 'step' })).toBe(100);
      expect(evaluateFormula("mode == 'step' ? 100 : 200", { mode: 'loop' })).toBe(200);
    });

    it('字符串 != 比较', () => {
      expect(evaluateFormula("x != 'a' ? 1 : 0", { x: 'b' })).toBe(1);
      expect(evaluateFormula("x != 'a' ? 1 : 0", { x: 'a' })).toBe(0);
    });

    it('变量不存在时字符串比较返回0', () => {
      expect(evaluateFormula("x == 'hello'", {})).toBe(0);
    });

    it('数字变量与字符串字面量比较（类型不同时不等）', () => {
      expect(evaluateFormula("x == '1'", { x: 1 })).toBe(0);
    });

    it('未闭合字符串返回0', () => {
      expect(evaluateFormula("x == 'unclosed", { x: 'test' })).toBe(0);
    });
  });

  describe('比较运算和三元表达式', () => {
    it('大于运算', () => {
      expect(evaluateFormula('5 > 3', {})).toBe(1);
      expect(evaluateFormula('2 > 5', {})).toBe(0);
    });

    it('等于运算', () => {
      expect(evaluateFormula('3 == 3', {})).toBe(1);
      expect(evaluateFormula('3 == 4', {})).toBe(0);
    });

    it('三元条件表达式', () => {
      expect(evaluateFormula('x > 0 ? x * 2 : 0', { x: 5 })).toBe(10);
      expect(evaluateFormula('x > 0 ? x * 2 : 0', { x: -1 })).toBe(0);
    });

    it('括号内三元表达式', () => {
      expect(evaluateFormula('(2 > 1 ? 10 : 20)', {})).toBe(10);
      expect(evaluateFormula('(x > 0 ? x * 2 : 0) + 5', { x: 3 })).toBe(11);
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

  it('提取 filterSum 中的表名', () => {
    const deps = extractDependencies('filterSum(stepPresents.cost, stepPresents.seq, seq)');
    expect(deps).toEqual(expect.arrayContaining(['stepPresents', 'seq']));
  });

  it('提取 filterSumSmallest 中的表名和变量', () => {
    const deps = extractDependencies('filterSumSmallest(presents.cost, presents.seq, seq, giveCount, 1)');
    expect(deps).toEqual(expect.arrayContaining(['presents', 'seq', 'giveCount']));
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
