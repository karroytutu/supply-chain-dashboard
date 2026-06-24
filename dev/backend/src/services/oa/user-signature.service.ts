/**
 * 用户签名持久化服务
 * 按用户隔离存储手写签名（base64），供跨表单签名控件自动填充
 * @module services/oa/user-signature.service
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('UserSignature');

import { appQuery } from '../../db/appPool';

/** 用户签名记录 */
export interface UserSignature {
  id: number;
  userId: number;
  signatureData: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 获取用户已保存的签名
 * @returns 签名记录，不存在时返回 null
 */
export async function getUserSignature(userId: number): Promise<UserSignature | null> {
  const result = await appQuery(
    `SELECT id, user_id, signature_data, created_at, updated_at
     FROM user_signatures
     WHERE user_id = $1`,
    [userId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id as number,
    userId: row.user_id as number,
    signatureData: row.signature_data as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * 保存签名（UPSERT）
 * 使用 ON CONFLICT(user_id) 覆盖旧签名
 */
export async function saveUserSignature(
  userId: number,
  signatureData: string
): Promise<UserSignature> {
  if (!signatureData?.trim()) {
    throw new Error('签名数据不能为空');
  }

  const result = await appQuery(
    `INSERT INTO user_signatures (user_id, signature_data)
     VALUES ($1, $2)
     ON CONFLICT (user_id)
     DO UPDATE SET
       signature_data = EXCLUDED.signature_data,
       updated_at = NOW()
     RETURNING id, user_id, signature_data, created_at, updated_at`,
    [userId, signatureData.trim()]
  );

  const row = result.rows[0];
  log.info(`用户签名保存成功: userId=${userId}`);

  return {
    id: row.id as number,
    userId: row.user_id as number,
    signatureData: row.signature_data as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * 删除用户已保存的签名
 * 仅允许删除自己的记录
 */
export async function deleteUserSignature(userId: number): Promise<void> {
  const result = await appQuery(
    `DELETE FROM user_signatures WHERE user_id = $1`,
    [userId]
  );

  if (result.rowCount === 0) {
    throw new Error('签名不存在');
  }

  log.info(`用户签名删除成功: userId=${userId}`);
}
