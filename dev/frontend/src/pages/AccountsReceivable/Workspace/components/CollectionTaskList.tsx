/**
 * 催收任务列表组件
 * 卡片式布局，按紧急程度排序
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Empty, Spin, Badge, Tag } from 'antd';
import { RightOutlined, ExclamationCircleFilled } from '@ant-design/icons';
import type { ArCollectionTask } from '@/types/accounts-receivable';
import { getMyTasks } from '@/services/api/accounts-receivable';
import TimeoutWarning from './TimeoutWarning';
import styles from './CollectionTaskList.less';

interface CollectionTaskListProps {
  onTaskClick: (task: ArCollectionTask) => void;
  onViewDetail: (arId: number) => void;
}

const CollectionTaskList: React.FC<CollectionTaskListProps> = ({
  onTaskClick,
  onViewDetail,
}) => {
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<ArCollectionTask[]>([]);

  // 加载任务数据
  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getMyTasks({ page: 1, pageSize: 50 });
      // 按紧急程度排序：超时的排前面，然后按剩余时间排序
      const sortedTasks = result.list.sort((a, b) => {
        const aTimeout = (a.timeout_days || 0) > 0 || (a.remaining_hours || 0) <= 0;
        const bTimeout = (b.timeout_days || 0) > 0 || (b.remaining_hours || 0) <= 0;
        
        if (aTimeout && !bTimeout) return -1;
        if (!aTimeout && bTimeout) return 1;
        
        // 都超时或都未超时，按剩余时间排序
        return (a.remaining_hours || 0) - (b.remaining_hours || 0);
      });
      setTasks(sortedTasks);
    } catch (error) {
      console.error('加载催收任务失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // 刷新数据
  const handleRefresh = () => {
    loadTasks();
  };

  // 格式化金额
  const formatAmount = (amount?: number): string => {
    if (amount === undefined) return '¥0.00';
    return `¥${amount.toFixed(2)}`;
  };

  // 判断是否已超时
  const isTimeout = (task: ArCollectionTask): boolean => {
    return (task.timeout_days || 0) > 0 || (task.remaining_hours || 0) <= 0;
  };

  return (
    <div className={styles.collectionTaskList}>
      <Spin spinning={loading}>
        {tasks.length > 0 ? (
          <div className={styles.taskGrid}>
            {tasks.map((task) => (
              <Card
                key={task.id}
                className={`${styles.taskCard} ${isTimeout(task) ? styles.timeoutCard : ''}`}
                hoverable
                onClick={() => onViewDetail(task.ar_id)}
              >
                {/* 卡片头部 */}
                <div className={styles.cardHeader}>
                  <div className={styles.consumerName}>
                    {isTimeout(task) && (
                      <ExclamationCircleFilled className={styles.timeoutIcon} />
                    )}
                    <span className={styles.name}>{task.consumer_name}</span>
                  </div>
                  <Badge
                    count={task.status === 'timeout' ? '超时' : task.status}
                    style={{
                      backgroundColor: isTimeout(task) ? '#ff4d4f' : '#1890ff',
                    }}
                  />
                </div>

                {/* 超时警告 */}
                <TimeoutWarning
                  remainingHours={task.remaining_hours}
                  timeoutDays={task.timeout_days}
                  penaltyAmount={task.penalty_amount}
                />

                {/* 欠款信息 */}
                <div className={styles.amountSection}>
                  <div className={styles.amountItem}>
                    <span className={styles.label}>欠款金额</span>
                    <span className={`${styles.value} ${styles.amount}`}>
                      {formatAmount(task.left_amount)}
                    </span>
                  </div>
                  <div className={styles.amountItem}>
                    <span className={styles.label}>逾期天数</span>
                    <span className={`${styles.value} ${isTimeout(task) ? styles.overdue : ''}`}>
                      {task.overdue_days || 0} 天
                    </span>
                  </div>
                </div>

                {/* 催收人信息 */}
                <div className={styles.collectorInfo}>
                  <Tag color="blue">{task.collector_name}</Tag>
                  <span className={styles.roleTag}>
                    {task.collector_role === 'marketing' && '营销师'}
                    {task.collector_role === 'supervisor' && '主管'}
                    {task.collector_role === 'finance' && '财务'}
                  </span>
                </div>

                {/* 操作按钮 */}
                <div className={styles.actions}>
                  <Button
                    type="primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTaskClick(task);
                    }}
                  >
                    立即处理
                    <RightOutlined />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Empty
            description="暂无催收任务"
            className={styles.empty}
          >
            <Button type="primary" onClick={handleRefresh}>
              刷新
            </Button>
          </Empty>
        )}
      </Spin>
    </div>
  );
};

export default CollectionTaskList;
