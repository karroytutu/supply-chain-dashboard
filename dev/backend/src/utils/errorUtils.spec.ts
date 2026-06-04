import { getErrorMessage, getErrorObject, isPgError, isAxiosError } from './errorUtils';

describe('errorUtils', () => {
  describe('getErrorMessage', () => {
    it('returns message from Error', () => {
      expect(getErrorMessage(new Error('boom'))).toBe('boom');
    });

    it('returns string error', () => {
      expect(getErrorMessage('string error')).toBe('string error');
    });

    it('returns message from object', () => {
      expect(getErrorMessage({ message: 'obj error' })).toBe('obj error');
    });

    it('returns fallback for null', () => {
      expect(getErrorMessage(null)).toBe('操作失败');
    });

    it('returns custom fallback', () => {
      expect(getErrorMessage(null, 'custom')).toBe('custom');
    });

    it('returns fallback for number', () => {
      expect(getErrorMessage(42)).toBe('操作失败');
    });
  });

  describe('getErrorObject', () => {
    it('extracts from Error', () => {
      const err = Object.assign(new Error('test'), { code: 'E001', status: 500 });
      const result = getErrorObject(err);
      expect(result.message).toBe('test');
      expect(result.code).toBe('E001');
      expect(result.status).toBe(500);
    });

    it('extracts from plain object', () => {
      const result = getErrorObject({ message: 'obj', statusCode: 400 });
      expect(result.message).toBe('obj');
      expect(result.statusCode).toBe(400);
    });

    it('handles null', () => {
      const result = getErrorObject(null);
      expect(result.message).toContain('未知错误');
    });

    it('handles string', () => {
      const result = getErrorObject('str err');
      expect(result.message).toBe('str err');
    });
  });

  describe('isPgError', () => {
    it('returns true for Error with code', () => {
      const err = Object.assign(new Error('pg'), { code: '23505' });
      expect(isPgError(err)).toBe(true);
    });

    it('returns false for plain Error', () => {
      expect(isPgError(new Error('no code'))).toBe(false);
    });

    it('returns false for null', () => {
      expect(isPgError(null)).toBe(false);
    });
  });

  describe('isAxiosError', () => {
    it('returns true for Error with response', () => {
      const err = Object.assign(new Error('axios'), { response: { status: 404, data: {} }, status: 404 });
      expect(isAxiosError(err)).toBe(true);
    });

    it('returns false for plain Error', () => {
      expect(isAxiosError(new Error('no resp'))).toBe(false);
    });

    it('returns false for null', () => {
      expect(isAxiosError(null)).toBe(false);
    });

    it('returns false when response is null', () => {
      const err = Object.assign(new Error('null resp'), { response: null });
      expect(isAxiosError(err)).toBe(false);
    });
  });
});
