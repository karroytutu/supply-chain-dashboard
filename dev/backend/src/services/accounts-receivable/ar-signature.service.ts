import { appQuery } from '../../db/appPool';

/**
 * 保存用户签名
 * @param userId - 用户ID
 * @param signatureData - 签名数据（Base64编码的图片数据）
 * @param isDefault - 是否设为默认签名
 * @returns 返回创建的签名记录ID
 * @throws 数据库操作失败时抛出错误
 */
export async function saveSignature(
  userId: number,
  signatureData: string,
  isDefault: boolean = false
): Promise<{ id: number }> {
  // 如果设为默认签名，先取消该用户其他默认签名
  if (isDefault) {
    await appQuery(
      'UPDATE ar_user_signatures SET is_default = FALSE WHERE user_id = $1',
      [userId]
    );
  }

  const result = await appQuery(
    `INSERT INTO ar_user_signatures (user_id, signature_data, is_default)
     VALUES ($1, $2, $3) RETURNING id`,
    [userId, signatureData, isDefault]
  );

  return { id: result.rows[0].id };
}

/**
 * 获取用户历史签名列表
 * @param userId - 用户ID
 * @returns 返回用户的签名列表，按默认优先、时间倒序排列
 * @throws 数据库操作失败时抛出错误
 */
export async function getUserSignatures(
  userId: number
): Promise<
  Array<{
    id: number;
    signature_data: string;
    is_default: boolean;
    created_at: Date;
  }>
> {
  const result = await appQuery(
    `SELECT id, signature_data, is_default, created_at
     FROM ar_user_signatures
     WHERE user_id = $1
     ORDER BY is_default DESC, created_at DESC`,
    [userId]
  );
  return result.rows;
}

/**
 * 设置默认签名
 * @param userId - 用户ID
 * @param signatureId - 要设为默认的签名ID
 * @throws 数据库操作失败时抛出错误
 */
export async function setDefaultSignature(
  userId: number,
  signatureId: number
): Promise<void> {
  // 先取消所有默认
  await appQuery(
    'UPDATE ar_user_signatures SET is_default = FALSE WHERE user_id = $1',
    [userId]
  );
  // 设置新的默认
  await appQuery(
    'UPDATE ar_user_signatures SET is_default = TRUE WHERE id = $1 AND user_id = $2',
    [signatureId, userId]
  );
}

/**
 * 删除签名
 * @param userId - 用户ID
 * @param signatureId - 要删除的签名ID
 * @throws 数据库操作失败时抛出错误
 */
export async function deleteSignature(
  userId: number,
  signatureId: number
): Promise<void> {
  await appQuery(
    'DELETE FROM ar_user_signatures WHERE id = $1 AND user_id = $2',
    [signatureId, userId]
  );
}
