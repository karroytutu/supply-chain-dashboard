import type { ApprovalNode } from '@/types/oa';

/** 判断流程中是否有自动节点已执行（无论成功/失败/执行中） */
export function hasExecutedAutoNode(nodes: ApprovalNode[]): boolean {
  return nodes.some(
    n => n.nodeType === 'auto' && n.status !== 'pending' && n.status !== 'cancelled',
  );
}
