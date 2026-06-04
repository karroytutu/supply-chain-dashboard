import {
  groupBy,
  sumBy,
  countBy,
  maxBy,
  leftJoin,
  filterAndPaginate,
  aggregateSum,
  lastBy,
  getCategoryLevel,
  getCategoryName,
} from './arrayAggregation';

describe('groupBy', () => {
  it('groups items by key function', () => {
    const items = [
      { type: 'a', val: 1 },
      { type: 'b', val: 2 },
      { type: 'a', val: 3 },
    ];
    const result = groupBy(items, i => i.type);
    expect(result.get('a')).toHaveLength(2);
    expect(result.get('b')).toHaveLength(1);
  });

  it('returns empty map for empty array', () => {
    const result = groupBy([], () => 'x');
    expect(result.size).toBe(0);
  });
});

describe('sumBy', () => {
  it('sums values', () => {
    const items = [{ v: 10 }, { v: 20 }, { v: 30 }];
    expect(sumBy(items, i => i.v)).toBe(60);
  });

  it('returns 0 for empty array', () => {
    expect(sumBy([], () => 1)).toBe(0);
  });
});

describe('countBy', () => {
  it('counts matching items', () => {
    const items = [1, 2, 3, 4, 5];
    expect(countBy(items, i => i > 3)).toBe(2);
  });

  it('returns 0 when nothing matches', () => {
    expect(countBy([1, 2], i => i > 10)).toBe(0);
  });
});

describe('maxBy', () => {
  it('returns item with max value', () => {
    const items = [{ v: 5 }, { v: 20 }, { v: 3 }];
    expect(maxBy(items, i => i.v)).toEqual({ v: 20 });
  });

  it('returns undefined for empty array', () => {
    expect(maxBy([], () => 0)).toBeUndefined();
  });
});

describe('leftJoin', () => {
  it('joins left and right arrays by key', () => {
    const left = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }];
    const right = [{ pid: '1', val: 10 }, { pid: '1', val: 20 }, { pid: '3', val: 30 }];
    const result = leftJoin(left, right, l => l.id, r => r.pid);
    expect(result.get('1')!.rights).toHaveLength(2);
    expect(result.get('2')!.rights).toHaveLength(0);
  });

  it('handles empty arrays', () => {
    const result = leftJoin([], [{ id: '1' }], () => '', r => (r as any).id);
    expect(result.size).toBe(0);
  });
});

describe('filterAndPaginate', () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, active: i % 2 === 0 }));

  it('filters and paginates', () => {
    const result = filterAndPaginate(items, i => i.active, 1, 5);
    expect(result.data).toHaveLength(5);
    expect(result.total).toBe(13); // 0,2,4,...,24 => 13 items
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(5);
  });

  it('returns empty data for out-of-range page', () => {
    const result = filterAndPaginate(items, i => i.active, 999, 5);
    expect(result.data).toHaveLength(0);
  });

  it('clamps pageSize to max 100', () => {
    const result = filterAndPaginate(items, () => true, 1, 200);
    expect(result.pageSize).toBe(100);
  });

  it('clamps page to minimum 1', () => {
    const result = filterAndPaginate(items, () => true, 0, 10);
    expect(result.page).toBe(1);
  });

  it('clamps pageSize to minimum 1', () => {
    const result = filterAndPaginate(items, () => true, 1, 0);
    expect(result.pageSize).toBe(1);
  });
});

describe('aggregateSum', () => {
  it('aggregates sum by key', () => {
    const items = [
      { name: 'A', cost: 10 },
      { name: 'B', cost: 20 },
      { name: 'A', cost: 30 },
    ];
    const result = aggregateSum(items, i => i.name, i => i.cost);
    expect(result.get('A')).toBe(40);
    expect(result.get('B')).toBe(20);
  });

  it('returns empty map for empty array', () => {
    expect(aggregateSum([], () => '', () => 0).size).toBe(0);
  });
});

describe('lastBy', () => {
  it('returns the last item per key by compare function', () => {
    const items = [
      { name: 'A', date: '2026-01-01' },
      { name: 'A', date: '2026-03-01' },
      { name: 'B', date: '2026-02-01' },
    ];
    const result = lastBy(items, i => i.name, i => i.date);
    expect(result.get('A')!.date).toBe('2026-03-01');
    expect(result.get('B')!.date).toBe('2026-02-01');
  });
});

describe('getCategoryLevel', () => {
  it('returns L1 for level=0', () => {
    expect(getCategoryLevel('食品/零食/坚果', 0)).toBe('食品');
  });

  it('returns L1/L2 for level=1', () => {
    expect(getCategoryLevel('食品/零食/坚果', 1)).toBe('食品/零食');
  });

  it('returns full path for level=2', () => {
    expect(getCategoryLevel('食品/零食/坚果', 2)).toBe('食品/零食/坚果');
  });

  it('returns available parts when level exceeds depth', () => {
    expect(getCategoryLevel('食品/零食', 5)).toBe('食品/零食');
  });

  it('returns 未分类 for null/undefined', () => {
    expect(getCategoryLevel(null)).toBe('未分类');
    expect(getCategoryLevel(undefined)).toBe('未分类');
  });

  it('returns 未分类 for empty string', () => {
    expect(getCategoryLevel('')).toBe('未分类');
  });
});

describe('getCategoryName', () => {
  it('returns L1 category name', () => {
    expect(getCategoryName('食品/零食/坚果')).toBe('食品');
  });

  it('returns 未分类 for null', () => {
    expect(getCategoryName(null)).toBe('未分类');
  });
});
