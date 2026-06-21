/**
 * OA 添加评论单元测试
 * 覆盖：权限校验（参与者判定）、实例存在性校验、空评论校验、终态可评论
 */

jest.mock('../../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('../oa-utils', () => ({
  isApprovalParticipant: jest.fn(),
}));

import { appQuery } from '../../../db/appPool';
import { isApprovalParticipant } from '../oa-utils';
import { addCommentToInstance } from './add-comment';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockIsParticipant = isApprovalParticipant as jest.MockedFunction<typeof isApprovalParticipant>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('addCommentToInstance', () => {
  it('评论内容为空 → 抛出 "评论内容不能为空"', async () => {
    await expect(addCommentToInstance(1, 100, '用户', '')).rejects.toThrow('评论内容不能为空');
    expect(mockAppQuery).not.toHaveBeenCalled();
  });

  it('评论内容仅空白 → 抛出 "评论内容不能为空"', async () => {
    await expect(addCommentToInstance(1, 100, '用户', '   ')).rejects.toThrow('评论内容不能为空');
  });

  it('审批实例不存在 → 抛出 "审批实例不存在"', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [] } as any);

    await expect(addCommentToInstance(999, 100, '用户', '测试评论')).rejects.toThrow('审批实例不存在');
  });

  it('非参与者评论 → 抛出 "您没有权限评论此审批"', async () => {
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ current_node_order: 1 }],
    } as any);
    mockIsParticipant.mockResolvedValueOnce(false);

    await expect(addCommentToInstance(1, 300, '无关用户', '想评论')).rejects.toThrow('您没有权限评论此审批');
  });

  it('申请人评论 → INSERT 成功', async () => {
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ current_node_order: 1 }],
    } as any);
    mockIsParticipant.mockResolvedValueOnce(true);
    mockAppQuery.mockResolvedValueOnce({ rows: [] } as any); // INSERT

    await expect(addCommentToInstance(1, 100, '申请人', '申请人评论')).resolves.toBeUndefined();

    // 验证 INSERT 被调用
    const insertCall = mockAppQuery.mock.calls[1];
    expect(insertCall[0]).toContain('INSERT INTO oa_approval_actions');
    expect(insertCall[1]).toEqual([1, 100, '申请人', 1, '申请人评论']);
  });

  it('已通过节点审批人评论（非当前审批人）→ INSERT 成功', async () => {
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ current_node_order: 2 }],
    } as any);
    mockIsParticipant.mockResolvedValueOnce(true);
    mockAppQuery.mockResolvedValueOnce({ rows: [] } as any); // INSERT

    await expect(addCommentToInstance(1, 50, '已审批主管', '补充意见')).resolves.toBeUndefined();

    const insertCall = mockAppQuery.mock.calls[1];
    expect(insertCall[0]).toContain("'comment'");
    expect(insertCall[1]).toContain(50); // userId
    expect(insertCall[1]).toContain(2); // current_node_order
  });

  it('抄送人评论 → INSERT 成功', async () => {
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ current_node_order: 1 }],
    } as any);
    mockIsParticipant.mockResolvedValueOnce(true);
    mockAppQuery.mockResolvedValueOnce({ rows: [] } as any); // INSERT

    await expect(addCommentToInstance(1, 200, '抄送人', '抄送意见')).resolves.toBeUndefined();

    const insertCall = mockAppQuery.mock.calls[1];
    expect(insertCall[0]).toContain('INSERT INTO oa_approval_actions');
  });

  it('已通过实例评论 → INSERT 成功', async () => {
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ current_node_order: 4 }],
    } as any);
    mockIsParticipant.mockResolvedValueOnce(true);
    mockAppQuery.mockResolvedValueOnce({ rows: [] } as any); // INSERT

    await expect(addCommentToInstance(1, 24, '罗国娜', '事后补充备注')).resolves.toBeUndefined();

    const insertCall = mockAppQuery.mock.calls[1];
    expect(insertCall[0]).toContain('INSERT INTO oa_approval_actions');
    expect(insertCall[1]).toEqual([1, 24, '罗国娜', 4, '事后补充备注']);
  });
});
