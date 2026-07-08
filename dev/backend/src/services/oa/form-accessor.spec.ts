import { FormAccessor, createFormAccessor } from './form-accessor';

describe('FormAccessor', () => {
  describe('getTableRecords', () => {
    it('returns object records from array', () => {
      const form = new FormAccessor({
        items: [{ id: 1, name: 'A' }, { id: 2 }],
      });
      expect(form.getTableRecords('items')).toEqual([
        { id: 1, name: 'A' },
        { id: 2 },
      ]);
    });

    it('returns empty array for empty array', () => {
      const form = new FormAccessor({ items: [] });
      expect(form.getTableRecords('items')).toEqual([]);
    });

    it('returns empty array for missing field', () => {
      const form = new FormAccessor({});
      expect(form.getTableRecords('items')).toEqual([]);
    });

    it('returns empty array for non-array value', () => {
      const form = new FormAccessor({ items: 'not-an-array' });
      expect(form.getTableRecords('items')).toEqual([]);
    });

    it('filters out non-object elements', () => {
      const form = new FormAccessor({
        items: [{ id: 1 }, 'string-item', null, 42, { id: 2 }],
      });
      expect(form.getTableRecords('items')).toEqual([{ id: 1 }, { id: 2 }]);
    });

    // --- SSOT: _details fallback 已移除，主字段即唯一数据源 ---

    it('returns empty when main field is ID array (no _details fallback)', () => {
      const form = new FormAccessor({ items: [1, 2] });
      expect(form.getTableRecords('items')).toEqual([]);
    });

    it('returns records when main field is object array', () => {
      const form = new FormAccessor({
        items: [{ id: 10 }],
      });
      expect(form.getTableRecords('items')).toEqual([{ id: 10 }]);
    });
  });

  describe('getTableIds', () => {
    it('extracts IDs by valueKey from object array', () => {
      const form = new FormAccessor({
        orders: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }],
      });
      expect(form.getTableIds('orders', 'id')).toEqual(['1', '2']);
    });

    it('extracts by custom valueKey (e.g. bizId)', () => {
      const form = new FormAccessor({
        orders: [{ bizId: 100, label: 'X' }, { bizId: 200, label: 'Y' }],
      });
      expect(form.getTableIds('orders', 'bizId')).toEqual(['100', '200']);
    });

    it('handles historical ID array format (backward compat)', () => {
      const form = new FormAccessor({ orders: [136012, 136539] });
      expect(form.getTableIds('orders', 'id')).toEqual(['136012', '136539']);
    });

    it('falls back to String(item) when valueKey not found', () => {
      const form = new FormAccessor({ orders: [{ name: 'A' }] });
      const result = form.getTableIds('orders', 'id');
      expect(result).toEqual(['[object Object]']);
    });

    it('returns empty array for missing field', () => {
      const form = new FormAccessor({});
      expect(form.getTableIds('orders', 'id')).toEqual([]);
    });

    it('returns empty array for non-array value', () => {
      const form = new FormAccessor({ orders: null });
      expect(form.getTableIds('orders', 'id')).toEqual([]);
    });
  });

  describe('getTableIdSet', () => {
    it('returns Set with unique IDs', () => {
      const form = new FormAccessor({
        orders: [{ id: 1 }, { id: 1 }, { id: 2 }],
      });
      const set = form.getTableIdSet('orders', 'id');
      expect(set.size).toBe(2);
      expect(set.has('1')).toBe(true);
      expect(set.has('2')).toBe(true);
    });
  });

  describe('getString', () => {
    it('returns string value as-is', () => {
      const form = new FormAccessor({ name: 'hello' });
      expect(form.getString('name')).toBe('hello');
    });

    it('converts number to string', () => {
      const form = new FormAccessor({ count: 42 });
      expect(form.getString('count')).toBe('42');
    });

    it('returns undefined for null', () => {
      const form = new FormAccessor({ name: null });
      expect(form.getString('name')).toBeUndefined();
    });

    it('returns undefined for missing field', () => {
      const form = new FormAccessor({});
      expect(form.getString('name')).toBeUndefined();
    });
  });

  describe('getNumber', () => {
    it('returns number value', () => {
      const form = new FormAccessor({ amount: 42 });
      expect(form.getNumber('amount')).toBe(42);
    });

    it('parses string number', () => {
      const form = new FormAccessor({ amount: '3.14' });
      expect(form.getNumber('amount')).toBe(3.14);
    });

    it('returns undefined for NaN string', () => {
      const form = new FormAccessor({ amount: 'abc' });
      expect(form.getNumber('amount')).toBeUndefined();
    });

    it('returns undefined for null', () => {
      const form = new FormAccessor({ amount: null });
      expect(form.getNumber('amount')).toBeUndefined();
    });
  });

  describe('getBoolean', () => {
    it('returns boolean true', () => {
      const form = new FormAccessor({ flag: true });
      expect(form.getBoolean('flag')).toBe(true);
    });

    it('returns boolean false', () => {
      const form = new FormAccessor({ flag: false });
      expect(form.getBoolean('flag')).toBe(false);
    });

    it('parses string "true"', () => {
      const form = new FormAccessor({ flag: 'true' });
      expect(form.getBoolean('flag')).toBe(true);
    });

    it('parses string "false"', () => {
      const form = new FormAccessor({ flag: 'false' });
      expect(form.getBoolean('flag')).toBe(false);
    });

    it('returns undefined for null', () => {
      const form = new FormAccessor({ flag: null });
      expect(form.getBoolean('flag')).toBeUndefined();
    });

    it('returns undefined for non-boolean string', () => {
      const form = new FormAccessor({ flag: 'yes' });
      expect(form.getBoolean('flag')).toBeUndefined();
    });
  });

  describe('getRaw', () => {
    it('returns raw value without conversion', () => {
      const obj = { nested: true };
      const form = new FormAccessor({ data: obj });
      expect(form.getRaw('data')).toBe(obj);
    });
  });

  describe('getRawData', () => {
    it('returns the underlying formData', () => {
      const data = { a: 1, b: 'two' };
      const form = new FormAccessor(data);
      expect(form.getRawData()).toBe(data);
    });
  });
});

describe('createFormAccessor', () => {
  it('creates a FormAccessor from formData', () => {
    const data = { customerId: '294', items: [{ id: 1 }] };
    const form = createFormAccessor(data);
    expect(form).toBeInstanceOf(FormAccessor);
    expect(form.getString('customerId')).toBe('294');
    expect(form.getTableIds('items', 'id')).toEqual(['1']);
  });
});
