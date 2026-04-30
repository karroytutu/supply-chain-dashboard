/**
 * 统一考核管理 - 共用工具函数
 * 提供角色用户查询、用户查找、商品进价获取等通用能力
 */

import { appQuery } from '../../db/appPool';
import { query } from '../../db/pool';

/** 用户基础信息 */
interface UserBasicInfo {
  id: number;
  name: string;
  dingtalk_user_id?: string;
}

/**
 * 根据角色编码获取用户列表
 * @param roleCode 角色编码
 * @param departmentId 可选部门ID筛选
 * @usedBy ar-collection-rules.ts, return-order-rules.ts
 */
export async function getUsersByRole(
  roleCode: string,
  departmentId?: number
): Promise<UserBasicInfo[]> {
  let sql = `
    SELECT u.id, u.name, u.dingtalk_user_id
    FROM users u
    JOIN user_roles ur ON u.id = ur.user_id
    JOIN roles r ON ur.role_id = r.id
    WHERE r.code = $1 AND u.status = 1`;

  const params: (string | number)[] = [roleCode];

  if (departmentId) {
    sql += ` AND u.department_id = $2`;
    params.push(departmentId);
  }

  const result = await appQuery<UserBasicInfo>(sql, params);
  return result.rows;
}

/**
 * 根据用户名查找用户
 * @param name 用户姓名
 * @usedBy return-order-rules.ts (通过营销师姓名查找用户)
 */
export async function findUserByName(
  name: string
): Promise<UserBasicInfo | null> {
  if (!name) return null;

  const result = await appQuery<UserBasicInfo>(
    'SELECT id, name, dingtalk_user_id FROM users WHERE name = $1 AND status = 1 LIMIT 1',
    [name]
  );

  return result.rows[0] || null;
}

/**
 * 获取商品平均进价
 * 从实时库存表获取 baseCostPrice 的加权平均值
 * @param goodsName 商品名称
 * @usedBy return-order-rules.ts (获取商品进价计算考核金额)
 */
export async function getPurchasePrice(goodsName: string): Promise<number> {
  try {
    const result = await query<{ avg_price: string }>(
      `SELECT
        SUM(r."baseCostPrice" * r."availableBaseQuantity") /
        NULLIF(SUM(r."availableBaseQuantity"), 0) as avg_price
       FROM "实时库存表" r
       WHERE r."goodsName" = $1`,
      [goodsName]
    );

    const avgPrice = parseFloat(result.rows[0]?.avg_price || '0');
    return avgPrice > 0 ? avgPrice : 0;
  } catch (error) {
    console.error('[Assessment] 获取商品进价失败:', goodsName, error);
    return 0;
  }
}

/**
 * 批量获取用户钉钉ID映射
 * @param userIds 用户ID数组
 */
export async function getDingtalkUserIdMap(
  userIds: number[]
): Promise<Map<number, string>> {
  if (userIds.length === 0) return new Map();

  const result = await appQuery<{ id: number; dingtalk_user_id: string }>(
    `SELECT id, dingtalk_user_id FROM users
     WHERE id = ANY($1) AND status = 1 AND dingtalk_user_id IS NOT NULL`,
    [userIds]
  );

  const map = new Map<number, string>();
  for (const row of result.rows) {
    if (row.dingtalk_user_id && row.dingtalk_user_id !== 'dev_admin') {
      map.set(row.id, row.dingtalk_user_id);
    }
  }
  return map;
}
