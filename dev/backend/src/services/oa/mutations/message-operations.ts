/**
 * OA - 站内消息操作
 * @module services/oa/mutations/message-operations
 */

import { appQuery as query } from '../../../db/appPool';

/**
 * 标记消息已读
 */
export async function markMessageRead(messageId: number, userId: number): Promise<void> {
  await query(
    `UPDATE oa_in_app_messages SET is_read = true, read_at = NOW() WHERE id = $1 AND user_id = $2`,
    [messageId, userId]
  );
}

/**
 * 标记所有消息已读
 */
export async function markAllMessagesRead(userId: number): Promise<void> {
  await query(
    `UPDATE oa_in_app_messages SET is_read = true, read_at = NOW() WHERE user_id = $1 AND is_read = false`,
    [userId]
  );
}

/**
 * 标记抄送已读
 */
export async function markCcRead(instanceId: number, userId: number): Promise<void> {
  await query(
    `UPDATE oa_approval_cc SET read_at = NOW() WHERE instance_id = $1 AND user_id = $2`,
    [instanceId, userId]
  );
}
