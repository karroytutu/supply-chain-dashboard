/**
 * ERP 请求限流器 — 按分组并发控制
 * 替代原全局单点限流(_lastRequestTime)，支持不同 API 端点并行
 *
 * 设计要点：
 * - 按「分组」维护独立并发池，不同分组互不阻塞
 * - 默认分组键 = 完整端点路径(pathPrefix + path)，使欠款/销售/客户等端点真正并行
 * - 全局并发上限作为安全阀，防止分组过多时总量打爆 ERP
 * - 仅在 HTTP 请求进行期间持有槽位，重试退避期间释放
 * @module services/erp-client/erp-rate-limiter
 */
import { getErpConfig } from './erp-config';

/** 计数信号量 */
class Semaphore {
  private active = 0;
  private waiters: Array<() => void> = [];
  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    await new Promise<void>(resolve => this.waiters.push(resolve));
    this.active++;
  }

  release(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.waiters.shift();
    if (next) next();
  }

  stats() {
    return { active: this.active, waiting: this.waiters.length, max: this.max };
  }
}

const groupSemaphores = new Map<string, Semaphore>();
let globalSemaphore: Semaphore | null = null;

function getGlobalSemaphore(): Semaphore {
  if (!globalSemaphore) {
    const cfg = getErpConfig() as ErpApiConfigWithConcurrency;
    globalSemaphore = new Semaphore(cfg.maxGlobalConcurrency ?? 12);
  }
  return globalSemaphore;
}

function getGroupSemaphore(group: string): Semaphore {
  let sem = groupSemaphores.get(group);
  if (!sem) {
    const cfg = getErpConfig() as ErpApiConfigWithConcurrency;
    sem = new Semaphore(cfg.maxGroupConcurrency ?? 4);
    groupSemaphores.set(group, sem);
  }
  return sem;
}

/** 含并发配置的 ErpApiConfig（向后兼容扩展） */
interface ErpApiConfigWithConcurrency {
  maxGroupConcurrency?: number;
  maxGlobalConcurrency?: number;
}

/**
 * 默认分组键：完整端点路径（pathPrefix + path 归一化）
 * 不同端点（欠款/销售/客户）的 pathPrefix 可能相同（如 /toliman/），
 * 必须用完整路径区分，否则不同端点仍会互相阻塞。
 */
export function defaultRateLimitGroup(pathPrefix: string, path: string): string {
  return `${pathPrefix}${path}`.replace(/\/+/g, '/');
}

/**
 * 获取一个并发槽位，返回释放函数
 * 先占分组槽、再占全局槽；HTTP 完成后调用返回的函数释放两者
 */
export async function acquireRateSlot(group: string): Promise<() => void> {
  const groupSem = getGroupSemaphore(group);
  const globalSem = getGlobalSemaphore();
  await groupSem.acquire();
  await globalSem.acquire();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    groupSem.release();
    globalSem.release();
  };
}

/** 限流器运行时统计（供调试/健康检查） */
export function getRateLimiterStats() {
  return {
    global: globalSemaphore?.stats() ?? null,
    groups: Object.fromEntries([...groupSemaphores.entries()].map(([k, v]) => [k, v.stats()])),
  };
}
