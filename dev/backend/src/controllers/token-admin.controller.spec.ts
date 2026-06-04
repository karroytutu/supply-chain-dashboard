jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../services/token-manager', () => ({
  getAllTokensStatus: jest.fn(),
  performErpLoginAndSave: jest.fn(),
  performWmsLoginAndSave: jest.fn(),
  performB2bExchangeAndSave: jest.fn(),
  verifyErpToken: jest.fn(),
  verifyWmsToken: jest.fn(),
  verifyB2bToken: jest.fn(),
}));

jest.mock('../services/token-manager/token-repository', () => ({
  getOperationLogs: jest.fn(),
  getTokenRecord: jest.fn(),
  getTokenValue: jest.fn(),
}));

import {
  getTokenStatusController,
  getTokenLogsController,
  triggerErpLoginController,
  triggerWmsLoginController,
  submitWmsSmsCodeController,
  triggerB2bExchangeController,
  verifyErpTokenController,
  verifyWmsTokenController,
  verifyB2bTokenController,
} from './token-admin.controller';
import {
  getAllTokensStatus,
  performErpLoginAndSave,
  performWmsLoginAndSave,
  performB2bExchangeAndSave,
  verifyErpToken,
  verifyWmsToken,
  verifyB2bToken,
} from '../services/token-manager';
import * as tokenRepo from '../services/token-manager/token-repository';
import { createMockRequest, createMockResponse } from '../__tests__/helpers/testFactory';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('getTokenStatusController', () => {
  it('成功获取状态', async () => {
    (getAllTokensStatus as jest.Mock).mockResolvedValueOnce({ erp: { valid: true } });
    const req = createMockRequest();
    const res = createMockResponse();
    await getTokenStatusController(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
  });

  it('异常返回 500', async () => {
    (getAllTokensStatus as jest.Mock).mockRejectedValueOnce(new Error('fail'));
    const req = createMockRequest();
    const res = createMockResponse();
    await getTokenStatusController(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('getTokenLogsController', () => {
  it('成功查询日志', async () => {
    (tokenRepo.getOperationLogs as jest.Mock).mockResolvedValueOnce({ rows: [], total: 0 });
    const req = createMockRequest({ query: { page: '1', pageSize: '20' } });
    const res = createMockResponse();
    await getTokenLogsController(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200, total: 0 }));
  });

  it('无效 system 参数返回 400', async () => {
    const req = createMockRequest({ query: { system: 'invalid' } });
    const res = createMockResponse();
    await getTokenLogsController(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('有效 system 参数', async () => {
    (tokenRepo.getOperationLogs as jest.Mock).mockResolvedValueOnce({ rows: [], total: 0 });
    const req = createMockRequest({ query: { system: 'erp' } });
    const res = createMockResponse();
    await getTokenLogsController(req, res);
    expect(tokenRepo.getOperationLogs).toHaveBeenCalledWith(expect.objectContaining({ system: 'erp' }));
  });

  it('异常返回 500', async () => {
    (tokenRepo.getOperationLogs as jest.Mock).mockRejectedValueOnce(new Error('fail'));
    const req = createMockRequest({ query: {} });
    const res = createMockResponse();
    await getTokenLogsController(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('triggerErpLoginController', () => {
  it('触发 ERP 登录', async () => {
    (performErpLoginAndSave as jest.Mock).mockResolvedValueOnce(undefined);
    const req = createMockRequest({ user: { userId: 1 } });
    const res = createMockResponse();
    await triggerErpLoginController(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
  });
});

describe('triggerWmsLoginController', () => {
  it('WMS 登录成功', async () => {
    (performWmsLoginAndSave as jest.Mock).mockResolvedValueOnce(true);
    const req = createMockRequest({ user: { userId: 1 }, body: {} });
    const res = createMockResponse();
    await triggerWmsLoginController(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { message: 'WMS 登录成功' } }));
  });

  it('需要短信验证码', async () => {
    (performWmsLoginAndSave as jest.Mock).mockResolvedValueOnce(false);
    (tokenRepo.getTokenRecord as jest.Mock).mockResolvedValueOnce({ needs_sms: true });
    const req = createMockRequest({ user: { userId: 1 }, body: {} });
    const res = createMockResponse();
    await triggerWmsLoginController(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ needsSms: true }) })
    );
  });

  it('WMS 登录失败返回 400', async () => {
    (performWmsLoginAndSave as jest.Mock).mockResolvedValueOnce(false);
    (tokenRepo.getTokenRecord as jest.Mock).mockResolvedValueOnce({ needs_sms: false });
    const req = createMockRequest({ user: { userId: 1 }, body: {} });
    const res = createMockResponse();
    await triggerWmsLoginController(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('异常返回 500', async () => {
    (performWmsLoginAndSave as jest.Mock).mockRejectedValueOnce(new Error('fail'));
    const req = createMockRequest({ user: { userId: 1 }, body: {} });
    const res = createMockResponse();
    await triggerWmsLoginController(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('submitWmsSmsCodeController', () => {
  it('缺少验证码返回 400', async () => {
    const req = createMockRequest({ user: { userId: 1 }, body: {} });
    const res = createMockResponse();
    await submitWmsSmsCodeController(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('验证码正确登录成功', async () => {
    (performWmsLoginAndSave as jest.Mock).mockResolvedValueOnce(true);
    const req = createMockRequest({ user: { userId: 1 }, body: { code: '123456' } });
    const res = createMockResponse();
    await submitWmsSmsCodeController(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { message: 'WMS 登录成功' } }));
  });

  it('验证码错误返回 400', async () => {
    (performWmsLoginAndSave as jest.Mock).mockResolvedValueOnce(false);
    const req = createMockRequest({ user: { userId: 1 }, body: { code: '000000' } });
    const res = createMockResponse();
    await submitWmsSmsCodeController(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('triggerB2bExchangeController', () => {
  it('兑换成功', async () => {
    (performB2bExchangeAndSave as jest.Mock).mockResolvedValueOnce(true);
    const req = createMockRequest({ user: { userId: 1 } });
    const res = createMockResponse();
    await triggerB2bExchangeController(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { message: 'B2B Token 兑换成功' } })
    );
  });

  it('兑换失败返回 400', async () => {
    (performB2bExchangeAndSave as jest.Mock).mockResolvedValueOnce(false);
    const req = createMockRequest({ user: { userId: 1 } });
    const res = createMockResponse();
    await triggerB2bExchangeController(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('异常返回 500', async () => {
    (performB2bExchangeAndSave as jest.Mock).mockRejectedValueOnce(new Error('fail'));
    const req = createMockRequest({ user: { userId: 1 } });
    const res = createMockResponse();
    await triggerB2bExchangeController(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('verifyErpTokenController', () => {
  it('token 不存在', async () => {
    (tokenRepo.getTokenValue as jest.Mock).mockResolvedValueOnce(null);
    const req = createMockRequest();
    const res = createMockResponse();
    await verifyErpTokenController(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { valid: false, message: 'ERP Token 不存在' } })
    );
  });

  it('token 有效', async () => {
    (tokenRepo.getTokenValue as jest.Mock).mockResolvedValueOnce('tok');
    (verifyErpToken as jest.Mock).mockResolvedValueOnce(true);
    const req = createMockRequest();
    const res = createMockResponse();
    await verifyErpTokenController(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { valid: true } }));
  });
});

describe('verifyWmsTokenController', () => {
  it('session 不存在', async () => {
    (tokenRepo.getTokenValue as jest.Mock).mockResolvedValueOnce(null);
    const req = createMockRequest();
    const res = createMockResponse();
    await verifyWmsTokenController(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { valid: false, message: 'WMS Session 不存在' } })
    );
  });

  it('session 有效', async () => {
    (tokenRepo.getTokenValue as jest.Mock).mockResolvedValueOnce('sess');
    (verifyWmsToken as jest.Mock).mockResolvedValueOnce(true);
    const req = createMockRequest();
    const res = createMockResponse();
    await verifyWmsTokenController(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { valid: true } }));
  });
});

describe('verifyB2bTokenController', () => {
  it('token 不存在', async () => {
    (tokenRepo.getTokenValue as jest.Mock).mockResolvedValueOnce(null);
    const req = createMockRequest();
    const res = createMockResponse();
    await verifyB2bTokenController(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { valid: false, message: 'B2B Token 不存在' } })
    );
  });

  it('token 有效', async () => {
    (tokenRepo.getTokenValue as jest.Mock).mockResolvedValueOnce('tok');
    (verifyB2bToken as jest.Mock).mockResolvedValueOnce(true);
    const req = createMockRequest();
    const res = createMockResponse();
    await verifyB2bTokenController(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { valid: true } }));
  });

  it('异常返回 500', async () => {
    (tokenRepo.getTokenValue as jest.Mock).mockRejectedValueOnce(new Error('fail'));
    const req = createMockRequest();
    const res = createMockResponse();
    await verifyB2bTokenController(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
