import { toCamelCase, toSnakeCase, toCamelKeys, toSnakeKeys } from './keyConvert';

describe('toCamelCase', () => {
  it('converts simple snake_case', () => {
    expect(toCamelCase('hello_world')).toBe('helloWorld');
  });

  it('converts multiple underscores', () => {
    expect(toCamelCase('my_long_variable_name')).toBe('myLongVariableName');
  });

  it('returns already camelCase unchanged', () => {
    expect(toCamelCase('helloWorld')).toBe('helloWorld');
  });

  it('handles single word', () => {
    expect(toCamelCase('hello')).toBe('hello');
  });

  it('handles empty string', () => {
    expect(toCamelCase('')).toBe('');
  });
});

describe('toSnakeCase', () => {
  it('converts simple camelCase', () => {
    expect(toSnakeCase('helloWorld')).toBe('hello_world');
  });

  it('converts multiple capitals', () => {
    expect(toSnakeCase('myLongVariableName')).toBe('my_long_variable_name');
  });

  it('returns already snake_case unchanged', () => {
    expect(toSnakeCase('hello_world')).toBe('hello_world');
  });

  it('handles single word', () => {
    expect(toSnakeCase('hello')).toBe('hello');
  });
});

describe('toCamelKeys', () => {
  it('converts flat object keys', () => {
    expect(toCamelKeys({ first_name: 'John', last_name: 'Doe' }))
      .toEqual({ firstName: 'John', lastName: 'Doe' });
  });

  it('converts nested object keys', () => {
    expect(toCamelKeys({ user_info: { first_name: 'John', home_address: { zip_code: '12345' } } }))
      .toEqual({ userInfo: { firstName: 'John', homeAddress: { zipCode: '12345' } } });
  });

  it('converts arrays of objects', () => {
    expect(toCamelKeys([{ first_name: 'A' }, { first_name: 'B' }]))
      .toEqual([{ firstName: 'A' }, { firstName: 'B' }]);
  });

  it('preserves null and undefined', () => {
    expect(toCamelKeys(null)).toBeNull();
    expect(toCamelKeys(undefined)).toBeUndefined();
  });

  it('preserves Date objects', () => {
    const date = new Date('2024-01-01');
    const result = toCamelKeys({ created_at: date }) as any;
    expect(result.createdAt).toBe(date);
  });

  it('preserves primitive values', () => {
    expect(toCamelKeys(42)).toBe(42);
    expect(toCamelKeys('hello')).toBe('hello');
    expect(toCamelKeys(true)).toBe(true);
  });

  it('handles nested arrays within objects', () => {
    expect(toCamelKeys({ order_items: [{ item_name: 'A', unit_price: 10 }] }))
      .toEqual({ orderItems: [{ itemName: 'A', unitPrice: 10 }] });
  });
});

describe('toSnakeKeys', () => {
  it('converts flat object keys', () => {
    expect(toSnakeKeys({ firstName: 'John', lastName: 'Doe' }))
      .toEqual({ first_name: 'John', last_name: 'Doe' });
  });

  it('converts nested object keys', () => {
    expect(toSnakeKeys({ userInfo: { firstName: 'John', homeAddress: { zipCode: '12345' } } }))
      .toEqual({ user_info: { first_name: 'John', home_address: { zip_code: '12345' } } });
  });

  it('converts arrays of objects', () => {
    expect(toSnakeKeys([{ firstName: 'A' }, { firstName: 'B' }]))
      .toEqual([{ first_name: 'A' }, { first_name: 'B' }]);
  });

  it('preserves null and undefined', () => {
    expect(toSnakeKeys(null)).toBeNull();
    expect(toSnakeKeys(undefined)).toBeUndefined();
  });

  it('roundtrip: toCamelKeys(toSnakeKeys(obj)) preserves data', () => {
    const original = { firstName: 'John', homeAddress: { zipCode: '12345' }, orderItems: [{ itemName: 'Widget' }] };
    expect(toCamelKeys(toSnakeKeys(original))).toEqual(original);
  });
});
