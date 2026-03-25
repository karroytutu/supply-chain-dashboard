import { SignOptions, sign, verify, decode } from 'jsonwebtoken';
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
