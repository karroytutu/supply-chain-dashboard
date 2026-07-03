/**
 * 考核中心数据获取 Hook
 * 负责列表数据的加载
 */
import { useState, useEffect, useCallback } from 'react';
import { getAssessmentRecords } from '@/services/api/assessment';
import { createLogger } from '../../../utils/logger';
const log = createLogger('Assessmenthooks');

export function useAssessmentData(queryParams: AssessmentQueryParams) {
  const [records, setRecords] = useState<AssessmentRecord[]>([]);
  const [total, setTotal] = useState(0);
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

  // queryParams 变化时重新加载列表
  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  return {
    records,
    total,
    loading,
    reloadData: loadRecords,
  };
}
