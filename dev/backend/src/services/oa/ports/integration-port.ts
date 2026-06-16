/**
 * OA 外部集成端口
 * @module services/oa/ports/integration-port
 *
 * 定义业务核心与钉钉/ERP 等外部系统交互的事件接口。
 * 本次先抽象接口，将直接调用改为通过端口发布事件；
 * 长期可替换为事件总线或消息队列，本次不阻塞业务修复。
 */

export type IntegrationEventType =
  | 'process_instance.create'
  | 'process_instance.finalize'
  | 'approval_todo.create'
  | 'approval_todo.complete'
  | 'approval_todo.complete_all'
  | 'approval.notify';

export interface IntegrationEvent {
  type: IntegrationEventType;
  instanceId: number;
  payload: Record<string, unknown>;
  occurredAt: Date;
}

export interface IntegrationEventPublisher {
  publish(event: IntegrationEvent): Promise<void>;
  subscribe(handler: (event: IntegrationEvent) => Promise<void> | void): void;
}

/** 内存发布器（默认实现，适合单进程；集群环境建议替换为消息队列） */
class InMemoryIntegrationEventPublisher implements IntegrationEventPublisher {
  private handlers: Array<(event: IntegrationEvent) => Promise<void> | void> = [];

  subscribe(handler: (event: IntegrationEvent) => Promise<void> | void): void {
    this.handlers.push(handler);
  }

  async publish(event: IntegrationEvent): Promise<void> {
    for (const handler of this.handlers) {
      try {
        await handler(event);
      } catch (err) {
        // 内存发布器不阻塞业务，错误由订阅方自行处理或落入异步任务表
        console.error('Integration event handler failed:', err);
      }
    }
  }
}

export const integrationEventPublisher: IntegrationEventPublisher = new InMemoryIntegrationEventPublisher();
