import { escapeLikePattern } from './sqlHelpers';

describe('escapeLikePattern', () => {
  it('escapes percent signs', () => {
    expect(escapeLikePattern('50%')).toBe('50\\%');
  });

  it('escapes underscores', () => {
    expect(escapeLikePattern('hello_world')).toBe('hello\\_world');
  });

  it('escapes backslashes', () => {
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
  });

  it('escapes all special characters together', () => {
    expect(escapeLikePattern('%discount_50\\special')).toBe('\\%discount\\_50\\\\special');
  });

  it('returns empty string unchanged', () => {
    expect(escapeLikePattern('')).toBe('');
  });

  it('returns normal string unchanged', () => {
    expect(escapeLikePattern('hello')).toBe('hello');
  });

  it('handles multiple consecutive special chars', () => {
    expect(escapeLikePattern('%%__\\\\')).toBe('\\%\\%\\_\\_\\\\\\\\');
  });
});
