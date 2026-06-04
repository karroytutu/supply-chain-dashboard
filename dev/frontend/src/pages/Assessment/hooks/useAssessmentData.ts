/**
 * 考核中心数据获取 Hook
 * 负责列表数据和统计数据的加载
 */
import { useState, useEffect, useCallback } from 'react';
import { getAssessmentRecords, getAssessmentStats } from '@/services/api/assessment';
import { createLogger } from '../../../utils/logger';
const log = createLogger('Assessmenthooks');

/** 统计数据初始值 */
const INITIAL_STATS: AssessmentStats = {
  totalAmount: 0,
  pendingCount: 0,
  pendingAmount: 0,
  confirmedCount: 0,
  todayNew: 0,
  involvedUsers: 0,
};

export function useAssessmentData(queryParams: AssessmentQueryParams) {
  const [records, setRecords] = useState<AssessmentRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<AssessmentStats>(INITIAL_STATS);
  const [loading, setLoading] = useState(false);

  /** 加载列表数据 */
  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAssessmentRecords(queryParams);
      setRecords(res?.list || []);
      setTotal(res?.total || 0);
    } catch (error) {
      log.error('加载考核记录失败:', error);
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  /** 加载统计数据 */
  const loadStats = useCallback(async () => {
    try {
      const res = await getAssessmentStats(queryParams.category);
      if (res) {
        setStats(res);
      }
    } catch (error) {
      log.error('加载统计数据失败:', error);
    }
  }, [queryParams.category]);

  /** 刷新所有数据 */
  const reloadData = useCallback(() => {
    loadRecords();
    loadStats();
  }, [loadRecords, loadStats]);

  // queryParams 变化时重新加载列表
  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  // category 变化时重新加载统计
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return {
    records,
    total,
    stats,
    loading,
    reloadData,
  };
}
