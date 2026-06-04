jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../config', () => ({
  config: {
    dingtalk: { corpId: 'test-corp', agentId: 'test-agent', appKey: 'test-key' },
    app: { baseUrl: 'http://localhost:3100' },
  },
}));

jest.mock('../services/auth.service', () => ({
  autoLogin: jest.fn(),
  qrcodeCallback: jest.fn(),
  getCurrentUser: jest.fn(),
  devLogin: jest.fn(),
  devSwitchUser: jest.fn(),
  devGetUsers: jest.fn(),
}));

import {
  checkEnv,
  dingtalkAutoLogin,
  getQrcodeConfig,
  dingtalkCallback,
  getMe,
  logout,
  developmentLogin,
  developmentGetUsers,
  developmentSwitchUser,
} from './auth.controller';
import {
  autoLogin,
  qrcodeCallback,
  getCurrentUser,
  devLogin,
  devSwitchUser,
  devGetUsers,
} from '../services/auth.service';
import { createMockRequest, createMockResponse } from '../__tests__/helpers/testFactory';

function mockReq(overrides: Record<string, unknown> = {}) {
  const req = createMockRequest(overrides as any);
  (req as any).ip = '127.0.0.1';
  (req as any).socket = { remoteAddress: '127.0.0.1' };
  return req;
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('checkEnv', () => {
  it('检测钉钉PC环境', async () => {
    const req = createMockRequest({ headers: { 'user-agent': 'Mozilla DingTalk' } });
    const res = createMockResponse();
    await checkEnv(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isInDingtalk: true, clientType: 'pc' }),
      })
    );
  });

  it('检测钉钉移动端', async () => {
    const req = createMockRequest({ headers: { 'user-agent': 'Mozilla DingTalk Mobile Android' } });
    const res = createMockResponse();
    await checkEnv(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isInDingtalk: true, clientType: 'mobile' }),
      })
    );
  });

  it('非钉钉环境', async () => {
    const req = createMockRequest({ headers: { 'user-agent': 'Mozilla Chrome' } });
    const res = createMockResponse();
    await checkEnv(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isInDingtalk: false, clientType: 'outside' }),
      })
    );
  });
});

describe('dingtalkAutoLogin', () => {
  it('缺少 authCode 返回 400', async () => {
    const req = createMockRequest({ body: {} });
    const res = createMockResponse();
    await dingtalkAutoLogin(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('免登成功', async () => {
    (autoLogin as jest.Mock).mockResolvedValueOnce({
      success: true,
      token: 'jwt-token',
      user: { id: 1 },
    });
    const req = mockReq({ body: { authCode: 'test-auth-code-123' } });
    const res = createMockResponse();
    await dingtalkAutoLogin(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ token: 'jwt-token' }) })
    );
  });

  it('免登失败返回 401', async () => {
    (autoLogin as jest.Mock).mockResolvedValueOnce({ success: false, message: '失败' });
    const req = mockReq({ body: { authCode: 'test-auth-code-123' } });
    const res = createMockResponse();
    await dingtalkAutoLogin(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('getQrcodeConfig', () => {
  it('成功返回扫码配置', async () => {
    const req = mockReq({ headers: { origin: 'http://localhost:3100' } });
    const res = createMockResponse();
    await getQrcodeConfig(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ appId: 'test-key', state: expect.any(String) }),
      })
    );
  });
});

describe('dingtalkCallback', () => {
  it('缺少授权码返回 400', async () => {
    const req = createMockRequest({ body: {} });
    const res = createMockResponse();
    await dingtalkCallback(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('无效 state 返回 400', async () => {
    const req = mockReq({ body: { authCode: 'code1', state: 'bad-state' } });
    const res = createMockResponse();
    await dingtalkCallback(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: '无效的state参数' })
    );
  });

  it('扫码回调成功', async () => {
    (qrcodeCallback as jest.Mock).mockResolvedValueOnce({
      success: true,
      token: 'jwt',
      user: { id: 1 },
    });
    const req = mockReq({ body: { authCode: 'code123' } });
    const res = createMockResponse();
    await dingtalkCallback(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ token: 'jwt' }) })
    );
  });

  it('扫码回调失败返回 401', async () => {
    (qrcodeCallback as jest.Mock).mockResolvedValueOnce({ success: false });
    const req = mockReq({ body: { code: 'code123' } });
    const res = createMockResponse();
    await dingtalkCallback(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('getMe', () => {
  it('未登录返回 401', async () => {
    const req = createMockRequest();
    (req as any).user = undefined;
    const res = createMockResponse();
    await getMe(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('用户不存在返回 404', async () => {
    (getCurrentUser as jest.Mock).mockResolvedValueOnce(null);
    const req = createMockRequest({ user: { userId: 99 } });
    const res = createMockResponse();
    await getMe(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('成功返回用户信息', async () => {
    (getCurrentUser as jest.Mock).mockResolvedValueOnce({ id: 1, name: 'test' });
    const req = createMockRequest({ user: { userId: 1 } });
    const res = createMockResponse();
    await getMe(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { id: 1, name: 'test' } })
    );
  });
});

describe('logout', () => {
  it('返回已登出', async () => {
    const req = createMockRequest();
    const res = createMockResponse();
    await logout(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: '已登出' }));
  });
});

describe('developmentLogin', () => {
  const origEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = origEnv;
  });

  it('生产环境禁止', async () => {
    process.env.NODE_ENV = 'production';
    const req = createMockRequest();
    const res = createMockResponse();
    await developmentLogin(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('开发环境登录成功', async () => {
    process.env.NODE_ENV = 'development';
    (devLogin as jest.Mock).mockResolvedValueOnce({
      success: true,
      token: 'dev-jwt',
      user: { id: 1 },
    });
    const req = mockReq();
    const res = createMockResponse();
    await developmentLogin(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ token: 'dev-jwt' }) })
    );
  });

  it('开发环境登录失败', async () => {
    process.env.NODE_ENV = 'development';
    (devLogin as jest.Mock).mockResolvedValueOnce({ success: false, message: '失败' });
    const req = mockReq();
    const res = createMockResponse();
    await developmentLogin(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('developmentGetUsers', () => {
  it('返回用户列表', async () => {
    (devGetUsers as jest.Mock).mockResolvedValueOnce([{ id: 1, name: 'admin' }]);
    const req = createMockRequest();
    const res = createMockResponse();
    await developmentGetUsers(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: [{ id: 1, name: 'admin' }] })
    );
  });
});

describe('developmentSwitchUser', () => {
  it('缺少 userId 返回 400', async () => {
    const req = createMockRequest({ body: {} });
    const res = createMockResponse();
    await developmentSwitchUser(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('userId 非数字返回 400', async () => {
    const req = createMockRequest({ body: { userId: 'abc' } });
    const res = createMockResponse();
    await developmentSwitchUser(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('切换用户成功', async () => {
    (devSwitchUser as jest.Mock).mockResolvedValueOnce({
      success: true,
      token: 'switch-jwt',
      user: { id: 2 },
    });
    const req = createMockRequest({ body: { userId: 2 } });
    const res = createMockResponse();
    await developmentSwitchUser(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ token: 'switch-jwt' }) })
    );
  });

  it('切换失败返回 401', async () => {
    (devSwitchUser as jest.Mock).mockResolvedValueOnce({ success: false });
    const req = createMockRequest({ body: { userId: 2 } });
    const res = createMockResponse();
    await developmentSwitchUser(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
