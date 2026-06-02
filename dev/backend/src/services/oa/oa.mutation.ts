/**
 * OA实例变更服务 - 统一导出入口
 * 实际实现已拆分到 mutations/ 子目录，此文件仅做 re-export 保持向后兼容
 * @module services/oa/oa.mutation
 */

// 提交审批
export { submitApproval } from './mutations/submit-approval';

// 同意审批 + 自动节点操作
export { approveApproval, executeAutoNodeCallback, retryAutoNode } from './mutations/approve-approval';

// 拒绝 + 转交
export { rejectApproval, transferApproval } from './mutations/reject-transfer';

// 加签 + 撤回
export { countersignApproval, withdrawApproval } from './mutations/countersign-withdraw';

// 站内消息操作
export { markMessageRead, markAllMessagesRead, markCcRead } from './mutations/message-operations';
