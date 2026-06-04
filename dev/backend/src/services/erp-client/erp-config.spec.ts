/**
 * ERP API 配置管理单元测试
 * 纯函数测试
 */

jest.mock('../../config', () => ({
  config: {
    erpApi: {
      baseUrl: 'https://test.example.com',
      cid: '99999',
      uid: '5',
      timeout: 5000,
      retryMax: 2,
      rateLimitMs: 100,
    },
  },
}));

import { getErpConfig, getErpDefaults, ERP_API_VERSION } from './erp-config';

// 清除模块缓存以确保 _erpConfig 被重置
beforeEach(() => {
  jest.resetModules();
});

describe('getErpConfig', () => {
  it('返回完整配置对象', () => {
    const config = getErpConfig();
    expect(config.baseUrl).toBe('https://test.example.com');
    expect(config.cid).toBe('99999');
    expect(config.uid).toBe('5');
    expect(config.timeout).toBe(5000);
    expect(config.retryMax).toBe(2);
  });

  it('多次调用返回同一实例（单例）', () => {
    const a = getErpConfig();
    const b = getErpConfig();
    expect(a).toBe(b);
  });

  it('包含 API 路径配置', () => {
    const config = getErpConfig();
    expect(config.assetPathPrefix).toBeDefined();
    expect(config.customerPathPrefix).toBeDefined();
    expect(config.assetCreatePath).toBeDefined();
    expect(config.expenditureBillPath).toBeDefined();
  });
});

describe('getErpDefaults', () => {
  it('返回常用业务默认值', () => {
    const defaults = getErpDefaults();
    expect(defaults.cid).toBe('99999');
    expect(defaults.uid).toBe('5');
    expect(defaults.defaultPaymentSubjectId).toBeDefined();
    expect(defaults.defaultSalesmanId).toBeDefined();
    expect(defaults.defaultDeptId).toBeDefined();
  });
});

describe('ERP_API_VERSION', () => {
  it('版本号为字符串', () => {
    expect(typeof ERP_API_VERSION).toBe('string');
    expect(ERP_API_VERSION.length).toBeGreaterThan(0);
  });
});
