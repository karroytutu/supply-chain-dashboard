/**
 * 逾期统计数据 Hook
 * 封装 getOverdueStats API 调用
 */
import { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import type { OverdueStatsResponse } from '@/types/accounts-receivable';
import { getOverdueStats } from '@/services/api/accounts-receivable';

interface UseOverdueStatsReturn {
  stats: OverdueStatsResponse | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useOverdueStats(): UseOverdueStatsReturn {
  const [stats, setStats] = useState<OverdueStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getOverdueStats();
      setStats(result);
    } catch (error) {
      message.error('获取逾期统计数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    loading,
    refresh: fetchStats,
  };
}

export default useOverdueStats;
