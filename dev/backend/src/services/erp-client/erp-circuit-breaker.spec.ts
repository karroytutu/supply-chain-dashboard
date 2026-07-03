/**
 * 断路器单元测试
 */
import { CircuitBreaker, ErpCircuitOpenError } from './erp-circuit-breaker';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker({
      failureThreshold: 3,
      recoveryTimeoutMs: 1000, // 1秒便于测试
      halfOpenMaxRequests: 1,
    });
  });

  it('初始状态为 CLOSED', () => {
    expect(cb.getState()).toBe('CLOSED');
    expect(cb.allowRequest()).toBe(true);
  });

  it('CLOSED → OPEN：连续失败达到阈值', () => {
    cb.recordFailure();
    expect(cb.getState()).toBe('CLOSED');
    cb.recordFailure();
    expect(cb.getState()).toBe('CLOSED');
    cb.recordFailure(); // 第3次达到阈值
    expect(cb.getState()).toBe('OPEN');
    expect(cb.allowRequest()).toBe(false);
  });

  it('OPEN → HALF_OPEN：冷却期过后自动转换', async () => {
    // 触发 OPEN
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('OPEN');

    // 等待冷却期
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(cb.getState()).toBe('HALF_OPEN');
  });

  it('HALF_OPEN → CLOSED：探测请求成功', async () => {
    // 触发 OPEN
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();

    // 等待冷却期进入 HALF_OPEN
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(cb.getState()).toBe('HALF_OPEN');

    // 允许一个请求通过
    expect(cb.allowRequest()).toBe(true);

    // 记录成功 → 转 CLOSED
    cb.recordSuccess();
    expect(cb.getState()).toBe('CLOSED');
  });

  it('HALF_OPEN → OPEN：探测请求失败', async () => {
    // 触发 OPEN
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();

    // 等待冷却期进入 HALF_OPEN
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(cb.getState()).toBe('HALF_OPEN');

    // 允许一个请求通过
    expect(cb.allowRequest()).toBe(true);

    // 记录失败 → 回 OPEN
    cb.recordFailure();
    expect(cb.getState()).toBe('OPEN');
    expect(cb.allowRequest()).toBe(false);
  });

  it('CLOSED 状态下成功请求重置失败计数', () => {
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getStats().failureCount).toBe(2);

    cb.recordSuccess(); // 重置失败计数
    expect(cb.getStats().failureCount).toBe(0);

    // 需要重新累计 3 次才能 OPEN
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('CLOSED');
    cb.recordFailure();
    expect(cb.getState()).toBe('OPEN');
  });

  it('HALF_OPEN 只允许指定数量的请求通过', async () => {
    // 触发 OPEN
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();

    // 等待冷却期进入 HALF_OPEN
    await new Promise(resolve => setTimeout(resolve, 1100));

    // 第一个请求允许通过
    expect(cb.allowRequest()).toBe(true);
    // 第二个请求被拒绝（halfOpenMaxRequests=1）
    expect(cb.allowRequest()).toBe(false);
  });

  it('reset() 重置所有状态', () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('OPEN');

    cb.reset();
    expect(cb.getState()).toBe('CLOSED');
    expect(cb.getStats().failureCount).toBe(0);
    expect(cb.getStats().successCount).toBe(0);
    expect(cb.allowRequest()).toBe(true);
  });

  it('ErpCircuitOpenError 是 Error 实例', () => {
    const err = new ErpCircuitOpenError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ErpCircuitOpenError');
    expect(err.message).toContain('断路器');
  });

  it('getStats() 返回正确统计', () => {
    cb.recordSuccess();
    cb.recordSuccess();
    cb.recordFailure();

    const stats = cb.getStats();
    expect(stats.state).toBe('CLOSED');
    expect(stats.successCount).toBe(2);
    expect(stats.failureCount).toBe(1);
    expect(stats.lastFailureTime).toBeGreaterThan(0);
  });
});
