/**
 * 确认核销直接执行 Hook
 * 封装出纳确认核销的 API 调用逻辑
 * 核销确认后任务状态变更（verified/closed），不再停留详情页，直接返回列表
 */
import { useCallback, useState } from 'react';
import { message } from 'antd';
import { history } from 'umi';
import { confirmVerify } from '@/services/api/ar-collection';
import type { CollectionTask } from '@/types/ar-collection';

interface UseConfirmVerifyOptions {
  task: CollectionTask | null;
}

export function useConfirmVerify({ task }: UseConfirmVerifyOptions) {
  const [loading, setLoading] = useState(false);

  const execute = useCallback(async () => {
    if (!task) return;
    setLoading(true);
    try {
      await confirmVerify(task.id, { confirmed: true });
      message.success('核销确认成功');
      // 核销后任务状态已变更，导航回催收列表
      history.push('/collection');
    } catch (error: any) {
      message.error(error?.message || '核销确认失败');
    } finally {
      setLoading(false);
    }
  }, [task]);

  return { execute, loading };
}

export default useConfirmVerify;
