/**
 * OA 钉钉集成适配器
 * @module services/oa/adapters/dingtalk-adapter
 *
 * 订阅集成端口事件，调用钉钉流程中心相关服务。
 * 将业务核心与钉钉 API 调用解耦。
 */

import { integrationEventPublisher } from '../ports/integration-port';
import {
  createProcessInstance,
  finalizeProcessInstance,
  createApprovalTodo,
  completeApprovalTodo,
  completeAllPendingTodos,
} from '../oa-process-centre';

integrationEventPublisher.subscribe(async event => {
  if (event.type === 'process_instance.create') {
    const p = event.payload;
    await createProcessInstance(
      event.instanceId,
      String(p.formTypeCode),
      String(p.formTypeName),
      Number(p.applicantUserId),
      String(p.title),
      p.formSchema as any,
      p.formData as Record<string, unknown>,
      p.baseUrlOverride as string | undefined
    );
    return;
  }

  if (event.type === 'process_instance.finalize') {
    const p = event.payload;
    await finalizeProcessInstance(event.instanceId, p.result as 'agree' | 'refuse');
    return;
  }

  if (event.type === 'approval_todo.create') {
    const p = event.payload;
    await createApprovalTodo(
      event.instanceId,
      String(p.instanceNo),
      String(p.title),
      String(p.formTypeName),
      String(p.applicantName),
      Number(p.approverUserId),
      p.formSchema as any,
      p.formData as Record<string, unknown>,
      p.nodeOrder ? Number(p.nodeOrder) : undefined,
      p.baseUrlOverride as string | undefined
    );
    return;
  }

  if (event.type === 'approval_todo.complete') {
    const p = event.payload;
    await completeApprovalTodo(
      event.instanceId,
      Number(p.userId),
      p.result as 'AGREE' | 'REFUSE' | undefined
    );
    return;
  }

  if (event.type === 'approval_todo.complete_all') {
    const p = event.payload;
    await completeAllPendingTodos(
      event.instanceId,
      p.result as 'agree' | 'refuse' | undefined
    );
    return;
  }

  // approval.notify 由通知服务处理，此处不订阅
});
