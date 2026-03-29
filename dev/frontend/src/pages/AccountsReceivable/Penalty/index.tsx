/**
 * 考核管理页面
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Card, message } from 'antd';
import { getPenalties, getMyPenalties } from '@/services/api/accounts-receivable';
import type { ArPenaltyRecord, PenaltyQueryParams, PenaltyLevel, ArPaginatedResult } from '@/types/accounts-receivable';
import PenaltyStatsCards from './components/PenaltyStatsCards';
import PenaltyFilters, { FilterValues } from './components/PenaltyFilters';
import PenaltyTable from './components/PenaltyTable';
import PenaltyRules from './components/PenaltyRules';
import styles from './index.less';

const PenaltyPage: React.FC = () => {
  // 加载状态
  const [loading, setLoading] = useState(true);
  // 考核记录数据
  const [data, setData] = useState<ArPaginatedResult<ArPenaltyRecord>>({ list: [], total: 0 });
  // 筛选条件
  const [filters, setFilters] = useState<FilterValues>({
    userId: undefined,
    penaltyLevel: undefined,
    dateRange: null,
    isMyPenalty: false,
  });
  // 分页参数
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10 });

  // 加载考核数据
  const loadPenalties = useCallback(async () => {
    setLoading(true);
    try {
      const params: PenaltyQueryParams = {
        page: pagination.page,
        pageSize: pagination.pageSize,
      };

      // 根据是否"我的考核"调用不同接口
      if (filters.isMyPenalty) {
        const result = await getMyPenalties({
          page: pagination.page,
          pageSize: pagination.pageSize,
        });
        setData(result);
      } else {
        // 非我的考核时，组装筛选条件
        if (filters.userId) params.userId = filters.userId;
        if (filters.penaltyLevel) params.penaltyLevel = filters.penaltyLevel as PenaltyLevel;
        if (filters.dateRange && filters.dateRange[0] && filters.dateRange[1]) {
          params.startDate = filters.dateRange[0].format('YYYY-MM-DD');
          params.endDate = filters.dateRange[1].format('YYYY-MM-DD');
        }
        const result = await getPenalties(params);
        setData(result);
      }
    } catch (error) {
      console.error('加载考核数据失败:', error);
      message.error('加载考核数据失败');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination]);

  useEffect(() => {
    loadPenalties();
  }, [loadPenalties]);

  // 处理筛选条件变化
  const handleFilterChange = (newFilters: FilterValues) => {
    setFilters(newFilters);
    setPagination((prev) => ({ ...prev, page: 1 })); // 重置页码
  };

  // 处理分页变化
  const handlePaginationChange = (page: number, pageSize: number) => {
    setPagination({ page, pageSize });
  };

  // 计算统计数据
  const stats = {
    totalAmount: data.list.reduce((sum, item) => sum + (item.penalty_amount || 0), 0),
    userCount: new Set(data.list.map((item) => item.user_id)).size,
    pendingCount: data.list.filter((item) => item.status === 'pending').length,
  };

  return (
    <div className={styles.penaltyPage}>
      {/* 页面标题 */}
      <div className={styles.header}>
        <h1 className={styles.title}>考核管理</h1>
      </div>

      {/* 统计概览 */}
      <PenaltyStatsCards
        totalAmount={stats.totalAmount}
        userCount={stats.userCount}
        pendingCount={stats.pendingCount}
        loading={loading}
      />

      {/* 筛选区域 */}
      <Card className={styles.filterCard}>
        <PenaltyFilters
          value={filters}
          onChange={handleFilterChange}
          onRefresh={loadPenalties}
        />
      </Card>

      {/* 考核记录表格 */}
      <Card className={styles.tableCard}>
        <PenaltyTable
          data={data}
          loading={loading}
          pagination={pagination}
          onPaginationChange={handlePaginationChange}
        />
      </Card>

      {/* 考核规则说明 */}
      <PenaltyRules />
    </div>
  );
};

export default PenaltyPage;
