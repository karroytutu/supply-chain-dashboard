/**
 * 时效分析报表页面
 * 展示催收流程各节点的时效统计与分析
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Spin, message } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import type {
  TimeEfficiencyItem,
  TimeEfficiencyResponse,
  OverdueLevel,
} from '@/types/accounts-receivable';
import { getTimeEfficiency } from '@/services/api/accounts-receivable';
import EfficiencyStatsCards from './components/EfficiencyStatsCards';
import EfficiencyFilters from './components/EfficiencyFilters';
import EfficiencyTable from './components/EfficiencyTable';
import styles from './index.less';

/** 筛选参数 */
interface FilterParams {
  dateRange: [Dayjs, Dayjs] | null;
  overdueLevel: OverdueLevel | undefined;
  nodeType: string | undefined;
}

const TimeEfficiency: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TimeEfficiencyResponse | null>(null);
  const [filters, setFilters] = useState<FilterParams>({
    dateRange: null,
    overdueLevel: undefined,
    nodeType: undefined,
  });
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10 });

  useEffect(() => {
    loadData();
  }, [filters, pagination.page, pagination.pageSize]);

  /**
   * 加载时效分析数据
   */
  const loadData = async () => {
    setLoading(true);
    try {
      const params: any = {
        page: pagination.page,
        pageSize: pagination.pageSize,
      };
      if (filters.dateRange) {
        params.startDate = filters.dateRange[0].format('YYYY-MM-DD');
        params.endDate = filters.dateRange[1].format('YYYY-MM-DD');
      }
      if (filters.overdueLevel) {
        params.overdueLevel = filters.overdueLevel;
      }
      const result = await getTimeEfficiency(params);
      setData(result);
    } catch (error) {
      message.error('数据加载失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 筛选条件变更
   */
  const handleFilterChange = useCallback((newFilters: FilterParams) => {
    setFilters(newFilters);
    setPagination((prev) => ({ ...prev, page: 1 })); // 重置分页
  }, []);

  /**
   * 分页变更
   */
  const handlePageChange = useCallback((page: number, pageSize: number) => {
    setPagination({ page, pageSize });
  }, []);

  if (loading && !data) {
    return (
      <div className={styles.loadingContainer}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  return (
    <div className={styles.timeEfficiency}>
      {/* 页面头部 */}
      <div className={styles.pageHeader}>
        <h3>时效分析报表</h3>
      </div>

      {/* 统计卡片 */}
      {data && (
        <EfficiencyStatsCards
          avgTotalHours={data.avgTotalHours}
          onTimeRate={data.onTimeRate}
          timeoutCount={data.timeoutCount}
        />
      )}

      {/* 筛选条件 */}
      <EfficiencyFilters
        filters={filters}
        onChange={handleFilterChange}
      />

      {/* 时效明细表 */}
      <div className={styles.tableSection}>
        <EfficiencyTable
          data={data?.list || []}
          total={data?.total || 0}
          loading={loading}
          pagination={{
            current: pagination.page,
            pageSize: pagination.pageSize,
            total: data?.total || 0,
          }}
          onPageChange={handlePageChange}
        />
      </div>
    </div>
  );
};

export default TimeEfficiency;
