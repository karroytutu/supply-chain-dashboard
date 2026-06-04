/**
 * 催收管理变更服务 - 统一导出入口
 * 实际实现已拆分到 mutations/ 子目录，此文件仅做 re-export 保持向后兼容
 * @module services/ar-collection/ar-collection.mutation
 */

export {
  submitVerify,
  applyExtension,
  markDifference,
  confirmVerify,
} from './mutations/verify-extension';
export {
  escalateTask,
  resolveDifference,
  rollbackEscalation,
} from './mutations/escalate-operations';
