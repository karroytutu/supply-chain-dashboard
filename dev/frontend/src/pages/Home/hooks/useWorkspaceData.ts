/**
 * 工作台数据加载 Hook
 */

import { useState, useEffect, useCallback } from 'react';
import { getWorkspaceData } from '@/services/api/workspace';
import type { WorkspaceData } from '@/types/workspace';
import { createLogger } from '../../../utils/logger';
const log = createLogger('Homehooks');

export function useWorkspaceData() {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getWorkspaceData();
      setData(result);
    } catch (error) {
      log.error('获取工作台数据失败:', error);
      setError(error instanceof Error ? error : new Error('加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, reload: fetchData };
}
