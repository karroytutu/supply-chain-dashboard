/**
 * 催收任务列表组件
 * 表格布局，支持分页
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Empty, Spin, Tag, Tooltip } from 'antd';
import { ExclamationCircleFilled, ClockCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { ArCollectionTask } from '@/types/accounts-receivable';
import { getMyTasks } from '@/services/api/accounts-receivable';
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
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 加载任务数据
  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getMyTasks({ page, pageSize });
      setTasks(result.list || []);
      setTotal(result.total || 0);
    } catch (error) {
      console.error('加载催收任务失败:', error);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // 格式化金额
  const formatAmount = (amount?: number): string => {
    if (amount === undefined || amount === null) return '¥0.00';
    return `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;
  };

  // 判断是否已超时
  const isTimeout = (task: ArCollectionTask): boolean => {
    return (task.timeout_days || 0) > 0 || (task.remaining_hours || 0) <= 0;
  };

  // 获取剩余时间显示
  const getRemainingTimeDisplay = (task: ArCollectionTask): { text: string; isWarning: boolean } => {
    const timeoutDays = task.timeout_days || 0;
    const remainingHours = task.remaining_hours || 0;

    if (timeoutDays > 0 || remainingHours <= 0) {
      return { text: `超时 ${timeoutDays} 天`, isWarning: true };
    }

    if (remainingHours < 24) {
      return { text: `剩余 ${remainingHours} 小时`, isWarning: true };
    }

    const days = Math.floor(remainingHours / 24);
    return { text: `剩余 ${days} 天`, isWarning: false };
  };

  // 状态映射
  const statusMap: Record<string, { text: string; color: string }> = {
    pending: { text: '待处理', color: 'blue' },
    in_progress: { text: '处理中', color: 'orange' },
    completed: { text: '已完成', color: 'green' },
    timeout: { text: '已超时', color: 'red' },
    escalated: { text: '已升级', color: 'purple' },
  };

  // 角色映射
  const roleMap: Record<string, string> = {
    marketing: '营销师',
    supervisor: '主管',
    finance: '财务',
  };

  // 结算方式映射
  const settleMethodMap: Record<number, string> = {
    1: '现结',
    2: '挂账',
  };

  // 格式化日期
  const formatDate = (date?: string): string => {
    if (!date) return '-';
    return new Date(date).toISOString().split('T')[0];
  };

  // 表格列定义
  const columns: ColumnsType<ArCollectionTask> = [
    {
      title: '客户名称',
      dataIndex: 'consumer_name',
      key: 'consumer_name',
      width: 160,
      fixed: 'left',
      render: (text: string, record) => {
        const timeout = isTimeout(record);
        return (
          <span className={`${styles.consumerName} ${timeout ? styles.timeoutText : ''}`}>
            {timeout && (
              <Tooltip title="已超时">
                <ExclamationCircleFilled className={styles.timeoutIcon} />
              </Tooltip>
            )}
            <a onClick={() => onViewDetail(record.ar_id)}>{text}</a>
          </span>
        );
      },
    },
    {
      title: '订单号',
      dataIndex: 'order_no',
      key: 'order_no',
      width: 120,
      render: (text: string) => text || '-',
    },
    {
      title: '单据日期',
      dataIndex: 'bill_order_time',
      key: 'bill_order_time',
      width: 100,
      align: 'center',
      render: (date: string) => formatDate(date),
    },
    {
      title: '结算方式',
      dataIndex: 'settle_method',
      key: 'settle_method',
      width: 80,
      align: 'center',
      render: (method: number) => settleMethodMap[method] || '-',
    },
    {
      title: '欠款金额',
      dataIndex: 'owed_amount',
      key: 'owed_amount',
      width: 120,
      align: 'right',
      render: (amount: number) => (
        <span className={styles.amount}>{formatAmount(amount)}</span>
      ),
    },
    {
      title: '逾期天数',
      dataIndex: 'overdue_days',
      key: 'overdue_days',
      width: 90,
      align: 'center',
      render: (days: number, record) => {
        const timeout = isTimeout(record);
        return (
          <span className={timeout ? styles.overdue : ''}>
            {days || 0} 天
          </span>
        );
      },
    },
    {
      title: '最大欠款天数',
      dataIndex: 'max_debt_days',
      key: 'max_debt_days',
      width: 110,
      align: 'center',
      render: (days: number) => `${days || 0} 天`,
    },
    {
      title: '账龄',
      dataIndex: 'aging_days',
      key: 'aging_days',
      width: 80,
      align: 'center',
      render: (days: number) => `${days || 0} 天`,
    },
    {
      title: '催收状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      align: 'center',
      render: (status: string) => {
        const config = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '剩余时间',
      key: 'remaining_time',
      width: 120,
      render: (_: any, record) => {
        const { text, isWarning } = getRemainingTimeDisplay(record);
        return (
          <span className={isWarning ? styles.warningText : ''}>
            <ClockCircleOutlined style={{ marginRight: 4 }} />
            {text}
          </span>
        );
      },
    },
    {
      title: '催收人',
      key: 'collector',
      width: 130,
      render: (_: any, record) => (
        <span>
          <Tag color="blue">{record.collector_name || '-'}</Tag>
          <span className={styles.roleTag}>
            {roleMap[record.collector_role] || record.collector_role}
          </span>
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 90,
      align: 'center',
      fixed: 'right',
      render: (_: any, record) => (
        <Button
          type="primary"
          size="small"
          onClick={() => onTaskClick(record)}
        >
          立即处理
        </Button>
      ),
    },
  ];

  return (
    <div className={styles.collectionTaskList}>
      <Spin spinning={loading}>
        {tasks.length > 0 ? (
          <Table
            columns={columns}
            dataSource={tasks}
            rowKey="id"
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (t) => `共 ${t} 条记录`,
              onChange: (p, ps) => {
                setPage(p);
                setPageSize(ps);
              },
            }}
            rowClassName={(record) =>
              isTimeout(record) ? styles.timeoutRow : ''
            }
            scroll={{ x: 1400 }}
          />
        ) : (
          <Empty
            description="暂无催收任务"
            className={styles.empty}
          >
            <Button type="primary" onClick={loadTasks}>
              刷新
            </Button>
          </Empty>
        )}
      </Spin>
    </div>
  );
};

export default CollectionTaskList;
