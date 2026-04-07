/**
 * 超时预警数据 Hook
 * 封装 getTimeoutWarnings API 调用
 */
import { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import type { TimeoutWarningItem, ArPaginatedResult } from '@/types/accounts-receivable';
import { getTimeoutWarnings } from '@/services/api/accounts-receivable';

interface UseTimeoutWarningReturn {
  warnings: TimeoutWarningItem[];
  total: number;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useTimeoutWarning(page: number = 1, pageSize: number = 10): UseTimeoutWarningReturn {
  const [warnings, setWarnings] = useState<TimeoutWarningItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchWarnings = useCallback(async () => {
    setLoading(true);
    try {
      const result: ArPaginatedResult<TimeoutWarningItem> = await getTimeoutWarnings({ page, pageSize });
      setWarnings(result.list);
      setTotal(result.total);
    } catch (error) {
      message.error('获取超时预警数据失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    fetchWarnings();
  }, [fetchWarnings]);

  return {
    warnings,
    total,
    loading,
    refresh: fetchWarnings,
  };
}

export default useTimeoutWarning;
