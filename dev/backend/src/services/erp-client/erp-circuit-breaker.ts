/**
 * ERP 断路器
 * 当 ERP 连续不可用时快速失败，避免每个请求都打满重试拖垮系统
 * @module services/erp-client/erp-circuit-breaker
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  /** 连续失败多少次后进入 OPEN 状态，默认 5 */
  failureThreshold: number;
  /** OPEN 状态持续多少毫秒后自动进入 HALF_OPEN，默认 60000 (60s) */
  recoveryTimeoutMs: number;
  /** HALF_OPEN 状态下允许多少个探测请求通过，默认 1 */
  halfOpenMaxRequests: number;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastStateChangeTime: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeoutMs: 60_000,
  halfOpenMaxRequests: 1,
};

/**
 * 断路器类
 *
 * 三态转换：
 * - CLOSED → OPEN：连续失败达到 failureThreshold
 * - OPEN → HALF_OPEN：冷却期（recoveryTimeoutMs）过后自动转入
 * - HALF_OPEN → CLOSED：探测请求成功
 * - HALF_OPEN → OPEN：探测请求失败
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private lastStateChangeTime = Date.now();
  private halfOpenActiveRequests = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 获取当前状态（含 OPEN→HALF_OPEN 自动转换） */
  getState(): CircuitState {
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastStateChangeTime;
      if (elapsed >= this.config.recoveryTimeoutMs) {
        this.transitionTo('HALF_OPEN');
      }
    }
    return this.state;
  }

  /**
   * 请求前检查是否允许通过
   * @returns true = 允许请求, false = 断路器打开应快速失败
   */
  allowRequest(): boolean {
    const state = this.getState();
    if (state === 'CLOSED') return true;
    if (state === 'HALF_OPEN') {
      if (this.halfOpenActiveRequests < this.config.halfOpenMaxRequests) {
        this.halfOpenActiveRequests++;
        return true;
      }
      return false;
    }
    // OPEN
    return false;
  }

  /** 记录一次成功 */
  recordSuccess(): void {
    this.successCount++;
    if (this.state === 'HALF_OPEN') {
      this.transitionTo('CLOSED');
    }
    // CLOSED 状态下成功不改变状态，但重置失败计数
    if (this.state === 'CLOSED') {
      this.failureCount = 0;
    }
  }

  /** 记录一次失败（仅网络/超时错误，不含业务错误） */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.transitionTo('OPEN');
      return;
    }

    if (this.state === 'CLOSED' && this.failureCount >= this.config.failureThreshold) {
      this.transitionTo('OPEN');
    }
  }

  /** 获取统计信息 */
  getStats(): CircuitBreakerStats {
    return {
      state: this.getState(),
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastStateChangeTime: this.lastStateChangeTime,
    };
  }

  /** 手动重置断路器 */
  reset(): void {
    this.transitionTo('CLOSED');
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
  }

  private transitionTo(newState: CircuitState): void {
    this.state = newState;
    this.lastStateChangeTime = Date.now();
    if (newState === 'CLOSED') {
      this.failureCount = 0;
      this.halfOpenActiveRequests = 0;
    }
    if (newState === 'HALF_OPEN') {
      this.halfOpenActiveRequests = 0;
    }
  }
}

/** 全局 ERP 断路器单例 */
let _erpCircuitBreaker: CircuitBreaker | null = null;

/** 获取全局 ERP 断路器（延迟初始化） */
export function getErpCircuitBreaker(): CircuitBreaker {
  if (!_erpCircuitBreaker) {
    _erpCircuitBreaker = new CircuitBreaker();
  }
  return _erpCircuitBreaker;
}

/** 获取断路器统计信息 */
export function getCircuitBreakerStats(): CircuitBreakerStats {
  return getErpCircuitBreaker().getStats();
}

/** ERP 断路器打开错误 */
export class ErpCircuitOpenError extends Error {
  constructor() {
    super('ERP 服务暂不可用（断路器打开），请稍后重试');
    this.name = 'ErpCircuitOpenError';
  }
}
