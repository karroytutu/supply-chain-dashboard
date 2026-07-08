import { describe, it, expect } from 'vitest';
import { hasExecutedAutoNode } from './oaNodeUtils';
import type { ApprovalNode } from '@/types/oa';

// 最小化构造辅助：只填充 hasExecutedAutoNode 需要的字段
const makeNode = (nodeType: string, status: string): ApprovalNode =>
  ({ nodeType, status } as unknown as ApprovalNode);

describe('hasExecutedAutoNode', () => {
  it('auto 节点 status=approved 时返回 true', () => {
    expect(hasExecutedAutoNode([makeNode('auto', 'approved')])).toBe(true);
  });

  it('auto 节点 status=failed 时返回 true', () => {
    expect(hasExecutedAutoNode([makeNode('auto', 'failed')])).toBe(true);
  });

  it('auto 节点 status=processing 时返回 true', () => {
    expect(hasExecutedAutoNode([makeNode('auto', 'processing')])).toBe(true);
  });

  it('auto 节点 status=pending 时返回 false', () => {
    expect(hasExecutedAutoNode([makeNode('auto', 'pending')])).toBe(false);
  });

  it('auto 节点 status=cancelled 时返回 false', () => {
    expect(hasExecutedAutoNode([makeNode('auto', 'cancelled')])).toBe(false);
  });

  it('无 auto 节点（全为 approval/handle）时返回 false', () => {
    const nodes = [
      makeNode('approval', 'approved'),
      makeNode('handle', 'pending'),
    ];
    expect(hasExecutedAutoNode(nodes)).toBe(false);
  });

  it('空数组时返回 false', () => {
    expect(hasExecutedAutoNode([])).toBe(false);
  });
});
