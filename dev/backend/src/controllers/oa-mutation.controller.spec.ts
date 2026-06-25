jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../services/oa/oa-form-type.query', () => ({
  getFormTypeByCodeQuery: jest.fn(),
}));

jest.mock('../services/oa/oa.mutation', () => ({
  submitApproval: jest.fn(),
  approveApproval: jest.fn(),
  rejectApproval: jest.fn(),
  transferApproval: jest.fn(),
  countersignApproval: jest.fn(),
  withdrawApproval: jest.fn(),
  markCcRead: jest.fn(),
}));

jest.mock('../services/oa/mutations/update-instance', () => ({
  updateInstanceFormData: jest.fn(),
}));

import {
  submit,
  approve,
  reject,
  transfer,
  countersign,
  withdraw,
  markCcAsRead,
  updateInstance,
} from './oa-mutation.controller';
import { getFormTypeByCodeQuery } from '../services/oa/oa-form-type.query';
import {
  submitApproval,
  approveApproval,
  rejectApproval,
  transferApproval,
  countersignApproval,
  withdrawApproval,
  markCcRead,
} from '../services/oa/oa.mutation';
import { updateInstanceFormData } from '../services/oa/mutations/update-instance';
import { createMockRequest, createMockResponse } from '../__tests__/helpers/testFactory';

beforeEach(() => {
  jest.resetAllMocks();
});

const authReq = (overrides = {}) =>
  createMockRequest({ user: { userId: 1, name: 'tester' }, ...overrides } as any);

const noAuthReq = () => {
  const req = createMockRequest();
  (req as any).user = undefined;
  return req;
};

describe('submit', () => {
  it('未登录返回 401', async () => {
    const res = createMockResponse();
    await submit(noAuthReq(), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('缺少参数返回 400', async () => {
    const req = authReq({ body: {} });
    const res = createMockResponse();
    await submit(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('表单类型不存在返回 400', async () => {
    (getFormTypeByCodeQuery as jest.Mock).mockResolvedValueOnce(null);
    const req = authReq({ body: { formTypeCode: 'credit', formData: {}, title: 't' } });
    const res = createMockResponse();
    await submit(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '表单类型不存在' }));
  });

  it('提交成功', async () => {
    (getFormTypeByCodeQuery as jest.Mock).mockResolvedValueOnce({ id: 1, code: 'credit' });
    (submitApproval as jest.Mock).mockResolvedValueOnce({ instanceId: 10 });
    const req = authReq({ body: { formTypeCode: 'credit', formData: {}, title: 't' } });
    const res = createMockResponse();
    await submit(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { instanceId: 10 }, message: '提交成功' })
    );
  });

  it('异常返回 400', async () => {
    (getFormTypeByCodeQuery as jest.Mock).mockResolvedValueOnce({ id: 1 });
    (submitApproval as jest.Mock).mockRejectedValueOnce(new Error('提交失败'));
    const req = authReq({ body: { formTypeCode: 'credit', formData: {}, title: 't' } });
    const res = createMockResponse();
    await submit(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('approve', () => {
  it('未登录返回 401', async () => {
    const res = createMockResponse();
    await approve(noAuthReq(), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('审批通过', async () => {
    (approveApproval as jest.Mock).mockResolvedValueOnce({ status: 'approved' });
    const req = authReq({ params: { id: '1' }, body: { comment: 'ok' } });
    const res = createMockResponse();
    await approve(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '审批通过' }));
  });

  it('审批处理中返回 202', async () => {
    (approveApproval as jest.Mock).mockResolvedValueOnce({ status: 'processing' });
    const req = authReq({ params: { id: '1' }, body: {} });
    const res = createMockResponse();
    await approve(req, res);
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it('异常返回 400', async () => {
    (approveApproval as jest.Mock).mockRejectedValueOnce(new Error('fail'));
    const req = authReq({ params: { id: '1' }, body: {} });
    const res = createMockResponse();
    await approve(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('reject', () => {
  it('未登录返回 401', async () => {
    const res = createMockResponse();
    await reject(noAuthReq(), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('缺少拒绝原因返回 400', async () => {
    const req = authReq({ params: { id: '1' }, body: {} });
    const res = createMockResponse();
    await reject(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('拒绝成功', async () => {
    (rejectApproval as jest.Mock).mockResolvedValueOnce(undefined);
    const req = authReq({ params: { id: '1' }, body: { comment: 'no' } });
    const res = createMockResponse();
    await reject(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '已拒绝' }));
  });
});

describe('transfer', () => {
  it('未登录返回 401', async () => {
    const res = createMockResponse();
    await transfer(noAuthReq(), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('缺少转交对象返回 400', async () => {
    const req = authReq({ params: { id: '1' }, body: {} });
    const res = createMockResponse();
    await transfer(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('转交成功', async () => {
    (transferApproval as jest.Mock).mockResolvedValueOnce(undefined);
    const req = authReq({ params: { id: '1' }, body: { transferToUserId: 2 } });
    const res = createMockResponse();
    await transfer(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '转交成功' }));
  });
});

describe('countersign', () => {
  it('未登录返回 401', async () => {
    const res = createMockResponse();
    await countersign(noAuthReq(), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('缺少加签信息返回 400', async () => {
    const req = authReq({ params: { id: '1' }, body: {} });
    const res = createMockResponse();
    await countersign(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('加签成功', async () => {
    (countersignApproval as jest.Mock).mockResolvedValueOnce(undefined);
    const req = authReq({
      params: { id: '1' },
      body: { countersignType: 'before', countersignUserIds: [2, 3] },
    });
    const res = createMockResponse();
    await countersign(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '加签成功' }));
  });
});

describe('withdraw', () => {
  it('未登录返回 401', async () => {
    const res = createMockResponse();
    await withdraw(noAuthReq(), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('撤回成功', async () => {
    (withdrawApproval as jest.Mock).mockResolvedValueOnce(undefined);
    const req = authReq({ params: { id: '1' } });
    const res = createMockResponse();
    await withdraw(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '撤回成功' }));
  });

  it('异常返回 400', async () => {
    (withdrawApproval as jest.Mock).mockRejectedValueOnce(new Error('不能撤回'));
    const req = authReq({ params: { id: '1' } });
    const res = createMockResponse();
    await withdraw(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('updateInstance', () => {
  it('未登录返回 401', async () => {
    const res = createMockResponse();
    await updateInstance(noAuthReq(), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('缺少 formData 参数返回 400', async () => {
    const req = authReq({ params: { id: '1' }, body: {} });
    const res = createMockResponse();
    await updateInstance(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('formData 类型不是对象返回 400', async () => {
    const req = authReq({ params: { id: '1' }, body: { formData: 'string' } });
    const res = createMockResponse();
    await updateInstance(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('正常更新返回成功', async () => {
    (updateInstanceFormData as jest.MockedFunction<typeof updateInstanceFormData>).mockResolvedValueOnce(undefined);
    const req = authReq({
      params: { id: '5' },
      body: { formData: { field1: 'value1' }, comment: '更新备注' },
    });
    const res = createMockResponse();
    await updateInstance(req, res);
    expect(updateInstanceFormData).toHaveBeenCalledWith(
      5, 1, 'tester', { field1: 'value1' }, '更新备注', undefined
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: '数据已更新' })
    );
  });

  it('服务层异常返回 400', async () => {
    (updateInstanceFormData as jest.MockedFunction<typeof updateInstanceFormData>).mockRejectedValueOnce(
      new Error('审批实例不存在')
    );
    const req = authReq({
      params: { id: '999' },
      body: { formData: { x: 1 } },
    });
    const res = createMockResponse();
    await updateInstance(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('审批实例不存在') })
    );
  });
});

describe('markCcAsRead', () => {
  it('未登录返回 401', async () => {
    const res = createMockResponse();
    await markCcAsRead(noAuthReq(), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('标记已读成功', async () => {
    (markCcRead as jest.Mock).mockResolvedValueOnce(undefined);
    const req = authReq({ params: { id: '1' } });
    const res = createMockResponse();
    await markCcAsRead(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '已标记已读' }));
  });

  it('异常返回 400', async () => {
    (markCcRead as jest.Mock).mockRejectedValueOnce(new Error('fail'));
    const req = authReq({ params: { id: '1' } });
    const res = createMockResponse();
    await markCcAsRead(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
