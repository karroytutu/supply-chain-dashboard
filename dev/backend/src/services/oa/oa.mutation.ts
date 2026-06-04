/**
 * OA实例变更服务 - 统一导出入口
 * 实际实现已拆分到 mutations/ 子目录，此文件仅做 re-export 保持向后兼容
 * @module services/oa/oa.mutation
 */

import { appQuery as query } from '../../db/appPool';

// 提交审批
export { submitApproval } from './mutations/submit-approval';

// 同意审批 + 自动节点操作
export {
  approveApproval,
  executeAutoNodeCallback,
  retryAutoNode,
} from './mutations/approve-approval';

// 拒绝 + 转交
export { rejectApproval, transferApproval } from './mutations/reject-transfer';

// 加签 + 撤回
export { countersignApproval, withdrawApproval } from './mutations/countersign-withdraw';

/**
 * 标记抄送已读
 */
export async function markCcRead(instanceId: number, userId: number): Promise<void> {
  await query(`UPDATE oa_approval_cc SET read_at = NOW() WHERE instance_id = $1 AND user_id = $2`, [
    instanceId,
    userId,
  ]);
}
