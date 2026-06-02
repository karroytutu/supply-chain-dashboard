import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatCurrency,
  formatNumber,
  formatPercent,
  formatFileSize,
} from './format';

describe('formatDate', () => {
  it('formats valid date string', () => {
    expect(formatDate('2024-03-15')).toBe('2024-03-15');
  });

  it('returns dash for null/undefined/empty', () => {
    expect(formatDate(null)).toBe('-');
    expect(formatDate(undefined)).toBe('-');
    expect(formatDate('')).toBe('-');
  });

  it('supports custom format', () => {
    expect(formatDate('2024-03-15', 'YYYY/MM/DD')).toBe('2024/03/15');
  });
});

describe('formatDateTime', () => {
  it('formats date with time', () => {
    const result = formatDateTime('2024-03-15 14:30:00');
    expect(result).toBe('2024-03-15 14:30:00');
  });

  it('returns dash for null', () => {
    expect(formatDateTime(null)).toBe('-');
  });
});

describe('formatCurrency', () => {
  it('formats number with default prefix', () => {
    expect(formatCurrency(1234.5)).toBe('¥1,234.50');
  });

  it('formats string number', () => {
    expect(formatCurrency('1234.5')).toBe('¥1,234.50');
  });

  it('returns dash for null/undefined/empty/NaN', () => {
    expect(formatCurrency(null)).toBe('-');
    expect(formatCurrency(undefined)).toBe('-');
    expect(formatCurrency('')).toBe('-');
    expect(formatCurrency('abc')).toBe('-');
  });

  it('supports custom precision', () => {
    expect(formatCurrency(1234, { precision: 0 })).toBe('¥1,234');
  });

  it('supports custom prefix/suffix', () => {
    expect(formatCurrency(100, { prefix: '$', suffix: ' USD' })).toBe('$100.00 USD');
  });
});

describe('formatNumber', () => {
  it('formats integer with thousands separator', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('formats with precision', () => {
    expect(formatNumber(1234.5, 2)).toBe('1,234.50');
  });

  it('formats string number', () => {
    expect(formatNumber('1234.5')).toBe('1,234.5');
  });

  it('returns dash for null/NaN', () => {
    expect(formatNumber(null)).toBe('-');
    expect(formatNumber('abc')).toBe('-');
  });
});

describe('formatPercent', () => {
  it('formats decimal as percentage', () => {
    expect(formatPercent(0.856)).toBe('85.60%');
  });

  it('supports custom precision', () => {
    expect(formatPercent(0.856, 1)).toBe('85.6%');
  });

  it('returns dash for null/NaN', () => {
    expect(formatPercent(null)).toBe('-');
    expect(formatPercent('abc')).toBe('-');
  });
});

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500.00 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1.00 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(1048576)).toBe('1.00 MB');
  });

  it('formats gigabytes', () => {
    expect(formatFileSize(1073741824)).toBe('1.00 GB');
  });

  it('returns dash for null', () => {
    expect(formatFileSize(null)).toBe('-');
  });
});
