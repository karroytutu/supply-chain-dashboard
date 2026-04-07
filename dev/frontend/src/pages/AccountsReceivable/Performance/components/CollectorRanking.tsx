/**
 * 催收人员排名表组件
 * 展示催收人员的绩效排名
 */
import React, { useMemo } from 'react';
import { Table, Progress } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { TrophyOutlined } from '@ant-design/icons';
import type { CollectorPerformance } from '@/types/accounts-receivable';
import styles from '../index.less';

interface CollectorRankingProps {
  collectors: CollectorPerformance[];
}

// 排名颜色配置
const RANK_COLORS: Record<number, string> = {
  1: 'gold',
  2: 'silver',
  3: 'bronze',
};

const CollectorRanking: React.FC<CollectorRankingProps> = ({ collectors = [] }) => {
  // 按成功率排序，成功率相同则按完成数排序
  const sortedCollectors = useMemo(() => {
    return [...(collectors || [])].sort((a, b) => {
      if (b.successRate !== a.successRate) {
        return b.successRate - a.successRate;
      }
      return b.completedCount - a.completedCount;
    });
  }, [collectors]);

  // 获取排名徽章
  const getRankBadge = (index: number) => {
    const rank = index + 1;
    if (rank <= 3) {
      return (
        <span className={`${styles.rankBadge} ${styles[RANK_COLORS[rank]]}`}>
          {rank === 1 ? <TrophyOutlined /> : rank}
        </span>
      );
    }
    return <span className={`${styles.rankBadge} ${styles.normal}`}>{rank}</span>;
  };

  // 获取成功率颜色
  const getSuccessRateColor = (rate: number): string => {
    if (rate >= 80) return '#52c41a';
    if (rate >= 60) return '#faad14';
    return '#ff4d4f';
  };

  const columns: ColumnsType<CollectorPerformance> = [
    {
      title: '排名',
      dataIndex: 'rank',
      key: 'rank',
      width: 70,
      align: 'center',
      render: (_: unknown, __: CollectorPerformance, index: number) => getRankBadge(index),
    },
    {
      title: '催收人员',
      dataIndex: 'collectorName',
      key: 'collectorName',
      width: 120,
    },
    {
      title: '任务数',
      dataIndex: 'taskCount',
      key: 'taskCount',
      width: 90,
      align: 'right',
      render: (val: number) => (val ?? 0).toLocaleString(),
    },
    {
      title: '完成数',
      dataIndex: 'completedCount',
      key: 'completedCount',
      width: 90,
      align: 'right',
      render: (val: number) => (val ?? 0).toLocaleString(),
    },
    {
      title: '成功率',
      dataIndex: 'successRate',
      key: 'successRate',
      width: 160,
      render: (rate: number) => (
        <div className={styles.successRateWrapper}>
          <Progress
            percent={rate}
            size="small"
            strokeColor={getSuccessRateColor(rate)}
            showInfo={false}
          />
          <span className={styles.successRateText}>{rate}%</span>
        </div>
      ),
    },
    {
      title: '平均耗时',
      dataIndex: 'avgHours',
      key: 'avgHours',
      width: 100,
      align: 'right',
      render: (val: number) => `${(val ?? 0).toFixed(1)}小时`,
    },
    {
      title: '超时次数',
      dataIndex: 'timeoutCount',
      key: 'timeoutCount',
      width: 100,
      align: 'center',
      render: (val: number) =>
        val > 0 ? (
          <span className={styles.timeoutHighlight}>{val}</span>
        ) : (
          <span>0</span>
        ),
    },
  ];

  return (
    <div className={styles.rankingSection}>
      <div className={styles.rankingHeader}>催收人员排名</div>
      <Table
        columns={columns}
        dataSource={sortedCollectors}
        rowKey="collectorId"
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 条`,
        }}
        size="middle"
        scroll={{ x: 700 }}
      />
    </div>
  );
};

export default CollectorRanking;
