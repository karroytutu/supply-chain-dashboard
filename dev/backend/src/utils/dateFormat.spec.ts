import { formatDateOnly, formatDateTime } from './dateFormat';

describe('formatDateOnly', () => {
  it('formats Date object to YYYY-MM-DD', () => {
    const d = new Date('2026-03-15T10:30:00Z');
    expect(formatDateOnly(d)).toBe('2026-03-15');
  });

  it('formats date string to YYYY-MM-DD', () => {
    expect(formatDateOnly('2026-06-01T12:00:00.000Z')).toBe('2026-06-01');
  });

  it('handles plain YYYY-MM-DD string', () => {
    expect(formatDateOnly('2026-01-01')).toBe('2026-01-01');
  });

  it('handles unknown types by converting to string', () => {
    expect(formatDateOnly(12345)).toBe('12345');
  });

  it('handles null by returning string "null"', () => {
    expect(formatDateOnly(null)).toBe('null');
  });

  it('handles undefined by returning string "undefi"', () => {
    // String(undefined) = "undefined", sliced to 10 chars
    expect(formatDateOnly(undefined)).toBe('undefined');
  });
});

describe('formatDateTime', () => {
  it('formats Date object to ISO string', () => {
    const d = new Date('2026-03-15T10:30:00.000Z');
    expect(formatDateTime(d)).toBe('2026-03-15T10:30:00.000Z');
  });

  it('returns string as-is', () => {
    const iso = '2026-06-01T12:00:00.000Z';
    expect(formatDateTime(iso)).toBe(iso);
  });

  it('converts unknown types to string', () => {
    expect(formatDateTime(12345)).toBe('12345');
  });

  it('handles null', () => {
    expect(formatDateTime(null)).toBe('null');
  });
});
