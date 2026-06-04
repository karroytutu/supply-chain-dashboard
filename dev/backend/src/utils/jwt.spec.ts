import { generateToken, verifyToken, decodeToken, extractTokenFromHeader, JwtPayload } from './jwt';
import * as jsonwebtoken from 'jsonwebtoken';

jest.mock('../config', () => ({
  config: { jwt: { secret: 'test-secret' } },
}));
jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

describe('jwt utils', () => {
  const mockPayload: JwtPayload = {
    userId: 1,
    dingtalkUserId: '123',
    name: 'Test User',
    roles: ['admin'],
    permissions: ['read'],
  };

  describe('generateToken', () => {
    it('should generate a token', () => {
      const token = generateToken(mockPayload);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const token = generateToken(mockPayload);
      const decoded = verifyToken(token);
      expect(decoded).toBeDefined();
      expect(decoded?.userId).toBe(1);
    });

    it('should return null for invalid token', () => {
      const decoded = verifyToken('invalid-token');
      expect(decoded).toBeNull();
    });

    it('should return null for expired token', () => {
      const expiredToken = jsonwebtoken.sign(mockPayload, 'test-secret', { expiresIn: '-1s' });
      const decoded = verifyToken(expiredToken);
      expect(decoded).toBeNull();
    });
  });

  describe('decodeToken', () => {
    it('should decode a token', () => {
      const token = generateToken(mockPayload);
      const decoded = decodeToken(token);
      expect(decoded).toBeDefined();
      expect(decoded?.userId).toBe(1);
    });

    it('should return null for invalid token', () => {
      const decoded = decodeToken('invalid-token');
      expect(decoded).toBeNull();
    });
  });

  describe('extractTokenFromHeader', () => {
    it('should extract token from valid header', () => {
      const token = extractTokenFromHeader('Bearer abc123');
      expect(token).toBe('abc123');
    });

    it('should return null for undefined header', () => {
      const token = extractTokenFromHeader(undefined);
      expect(token).toBeNull();
    });

    it('should return null for invalid format', () => {
      const token = extractTokenFromHeader('InvalidFormat');
      expect(token).toBeNull();
    });

    it('should return null for non-bearer token', () => {
      const token = extractTokenFromHeader('Basic abc123');
      expect(token).toBeNull();
    });
  });
});
