/**
 * 确认核销直接执行 Hook
 * 封装出纳确认核销的 API 调用逻辑
 */
import { useCallback, useState } from 'react';
import { message } from 'antd';
import { confirmVerify } from '@/services/api/ar-collection';
import type { CollectionTask } from '@/types/ar-collection';

interface UseConfirmVerifyOptions {
  task: CollectionTask | null;
  onSuccess: () => void;
}

export function useConfirmVerify({ task, onSuccess }: UseConfirmVerifyOptions) {
  const [loading, setLoading] = useState(false);

  const execute = useCallback(async () => {
    if (!task) return;
    setLoading(true);
    try {
      await confirmVerify(task.id, { confirmed: true });
      message.success('核销确认成功');
      onSuccess();
    } catch (error: any) {
      message.error(error?.message || '核销确认失败');
    } finally {
      setLoading(false);
    }
  }, [task, onSuccess]);

  return { execute, loading };
}

export default useConfirmVerify;
