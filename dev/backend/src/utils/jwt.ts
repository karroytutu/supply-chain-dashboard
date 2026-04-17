import { SignOptions, sign, verify, decode, TokenExpiredError, JsonWebTokenError, NotBeforeError } from 'jsonwebtoken';
import { config } from '../config';

export interface JwtPayload {
  userId: number;
  dingtalkUserId: string;
  name: string;
  roles: string[];
  permissions: string[];
}

/**
 * 生成访问令牌
 */
export function generateToken(payload: JwtPayload): string {
  const options: SignOptions = {
    expiresIn: '24h',
  };
  return sign(payload, config.jwt.secret, options);
}

/**
 * 验证令牌
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = verify(token, config.jwt.secret) as JwtPayload;
    return decoded;
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      console.warn('[JWT] Token expired:', error.expiredAt);
    } else if (error instanceof JsonWebTokenError) {
      console.warn('[JWT] Invalid token:', error.message);
    } else if (error instanceof NotBeforeError) {
      console.warn('[JWT] Token not yet active');
    } else {
      console.error('[JWT] Unknown verification error:', error);
    }
    return null;
  }
}

/**
 * 解码令牌（不验证签名）
 */
export function decodeToken(token: string): JwtPayload | null {
  try {
    const decoded = decode(token) as JwtPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * 从请求头提取令牌
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }
  
  return parts[1];
}
