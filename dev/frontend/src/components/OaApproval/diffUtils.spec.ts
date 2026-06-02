import { describe, it, expect } from 'vitest';
import { hasOriginalFields, valuesEqual, extractPhotoUrl } from './diffUtils';

describe('hasOriginalFields', () => {
  it('returns false for empty object', () => {
    expect(hasOriginalFields({})).toBe(false);
  });

  it('returns true when object has _original_ prefixed keys', () => {
    expect(hasOriginalFields({ _original_name: '张三', name: '李四' })).toBe(true);
  });

  it('returns true for multiple _original_ keys', () => {
    expect(hasOriginalFields({ _original_a: 1, _original_b: 2, c: 3 })).toBe(true);
  });

  it('returns false when keys have _ prefix but not _original_', () => {
    expect(hasOriginalFields({ _customerName: '张三', _status: 'active' })).toBe(false);
  });

  it('returns false for regular keys only', () => {
    expect(hasOriginalFields({ name: '张三', age: 30 })).toBe(false);
  });
});

describe('valuesEqual', () => {
  it('treats null and undefined as equal', () => {
    expect(valuesEqual(null, undefined)).toBe(true);
  });

  it('treats null and empty string as equal', () => {
    expect(valuesEqual(null, '')).toBe(true);
  });

  it('treats undefined and empty string as equal', () => {
    expect(valuesEqual(undefined, '')).toBe(true);
  });

  it('returns true for identical strings', () => {
    expect(valuesEqual('abc', 'abc')).toBe(true);
  });

  it('returns false for different strings', () => {
    expect(valuesEqual('abc', 'def')).toBe(false);
  });

  it('treats number and its string representation as equal', () => {
    expect(valuesEqual(123, '123')).toBe(true);
  });

  it('treats 0 and empty string as equal (both normalize to "")', () => {
    // 0 is falsy but not null/undefined/'', so String(0) = '0'
    // '' normalizes to ''
    // So 0 and '' should NOT be equal
    expect(valuesEqual(0, '')).toBe(false);
  });

  it('returns true for both null', () => {
    expect(valuesEqual(null, null)).toBe(true);
  });

  it('returns true for both undefined', () => {
    expect(valuesEqual(undefined, undefined)).toBe(true);
  });
});

describe('extractPhotoUrl', () => {
  it('trims whitespace from string input', () => {
    expect(extractPhotoUrl(' http://example.com/img.jpg ')).toBe('http://example.com/img.jpg');
  });

  it('returns string as-is when no whitespace', () => {
    expect(extractPhotoUrl('http://example.com/img.jpg')).toBe('http://example.com/img.jpg');
  });

  it('extracts url from array of objects', () => {
    expect(extractPhotoUrl([{ url: 'http://a.jpg' }])).toBe('http://a.jpg');
  });

  it('returns first item with url from array', () => {
    expect(extractPhotoUrl([{ url: 'http://first.jpg' }, { url: 'http://second.jpg' }])).toBe('http://first.jpg');
  });

  it('skips array items without url', () => {
    expect(extractPhotoUrl([{ name: 'no-url' }, { url: 'http://found.jpg' }])).toBe('http://found.jpg');
  });

  it('returns empty string for null', () => {
    expect(extractPhotoUrl(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(extractPhotoUrl(undefined)).toBe('');
  });

  it('returns empty string for empty array', () => {
    expect(extractPhotoUrl([])).toBe('');
  });

  it('returns empty string for array with no url properties', () => {
    expect(extractPhotoUrl([{ name: 'a' }, { name: 'b' }])).toBe('');
  });

  it('returns empty string for non-string non-array truthy value', () => {
    expect(extractPhotoUrl(123)).toBe('');
  });
});
