/**
 * OA - 站内消息查询
 * @module services/oa/queries/message-query
 */

import { appQuery as query } from '../../../db/appPool';

/**
 * 获取站内消息列表
 */
export async function getMessages(
  userId: number,
  page: number = 1,
  pageSize: number = 20
): Promise<{ list: MessageItem[]; total: number }> {
  const offset = (page - 1) * pageSize;

  const countResult = await query<{ total: number }>(
    `SELECT COUNT(*) as total FROM oa_in_app_messages WHERE user_id = $1`,
    [userId]
  );

  const listResult = await query<any>(`
    SELECT 
      id, user_id, type, title, content, instance_id, is_read, read_at, created_at
    FROM oa_in_app_messages
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `, [userId, pageSize, offset]);

  return {
    list: listResult.rows.map(formatMessageItem),
    total: countResult.rows[0]?.total || 0,
  };
}

export interface MessageItem {
  id: number;
  userId: number;
  type: string;
  title: string;
  content: string | null;
  instanceId: number | null;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}

function formatMessageItem(row: any): MessageItem {
  return {
    id: row.id as number,
    userId: row.user_id as number,
    type: row.type as string,
    title: row.title as string,
    content: row.content as string | null,
    instanceId: row.instance_id as number | null,
    isRead: row.is_read as boolean,
    readAt: row.read_at as Date | null,
    createdAt: row.created_at as Date,
  };
}

/**
 * 获取未读消息数量
 */
export async function getUnreadMessageCount(userId: number): Promise<number> {
  const result = await query<{ count: number }>(
    `SELECT COUNT(*) as count FROM oa_in_app_messages WHERE user_id = $1 AND is_read = false`,
    [userId]
  );
  return result.rows[0]?.count || 0;
}
