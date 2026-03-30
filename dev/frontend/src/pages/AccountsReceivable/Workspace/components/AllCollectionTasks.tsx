/**
 * 所有催收任务列表组件（管理员视角）
 * 表格布局，支持筛选和分页
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Input, Select, Space, Tag, Empty, Spin } from 'antd';
import { SearchOutlined, ExportOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { ArCollectionTask } from '@/types/accounts-receivable';
import { getAllTasks } from '@/services/api/accounts-receivable';
import styles from './AllCollectionTasks.less';

interface AllCollectionTasksProps {
  onViewDetail: (arId: number) => void;
}

const AllCollectionTasks: React.FC<AllCollectionTasksProps> = ({
  onViewDetail,
}) => {
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<ArCollectionTask[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 筛选条件
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAllTasks({
        page,
        pageSize,
        status: statusFilter,
        keyword,
      });
      setDataSource(result.list || []);
      setTotal(result.total || 0);
    } catch (error) {
      console.error('加载所有催收任务失败:', error);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, keyword]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 格式化金额
  const formatAmount = (amount?: number): string => {
    if (amount === undefined || amount === null) return '¥0.00';
    return `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;
  };

  // 判断是否超时
  const isTimeout = (record: ArCollectionTask): boolean => {
    const deadline = record.deadline_at ? new Date(record.deadline_at) : null;
    return deadline ? deadline.getTime() < Date.now() : false;
  };

  // 计算剩余时间
  const getRemainingTime = (record: ArCollectionTask): string => {
    const deadline = record.deadline_at ? new Date(record.deadline_at) : null;
    if (!deadline) return '-';

    const now = Date.now();
    const diff = deadline.getTime() - now;

    if (diff <= 0) {
      const overdueDays = Math.floor(Math.abs(diff) / (1000 * 60 * 60 * 24));
      return `超时 ${overdueDays} 天`;
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 24) {
      return `剩余 ${hours} 小时`;
    }

    const days = Math.floor(hours / 24);
    return `剩余 ${days} 天`;
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

  // 表格列定义
  const columns: ColumnsType<ArCollectionTask> = [
    {
      title: '客户名称',
      dataIndex: 'consumer_name',
      key: 'consumer_name',
      width: 200,
      render: (text: string, record) => (
        <span
          className={`${styles.consumerName} ${isTimeout(record) ? styles.timeoutRow : ''}`}
          onClick={() => onViewDetail(record.ar_id)}
        >
          {isTimeout(record) && <span className={styles.timeoutIcon}>⚠️</span>}
          <a>{text}</a>
        </span>
      ),
    },
    {
      title: '欠款金额',
      dataIndex: 'owed_amount',
      key: 'owed_amount',
      width: 130,
      align: 'right',
      render: (amount: number) => (
        <span className={styles.amount}>{formatAmount(amount)}</span>
      ),
    },
    {
      title: '逾期天数',
      dataIndex: 'overdue_days',
      key: 'overdue_days',
      width: 100,
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
      title: '催收状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      align: 'center',
      render: (status: string) => {
        const config = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '剩余时间',
      key: 'remaining_time',
      width: 150,
      render: (_: any, record) => {
        const timeout = isTimeout(record);
        return (
          <span className={timeout ? styles.warningText : ''}>
            ⏰ {getRemainingTime(record)}
          </span>
        );
      },
    },
    {
      title: '催收人',
      key: 'collector',
      width: 150,
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
      width: 80,
      align: 'center',
      render: (_: any, record) => (
        <Button
          type="link"
          onClick={() => onViewDetail(record.ar_id)}
        >
          详情
        </Button>
      ),
    },
  ];

  return (
    <div className={styles.allTasksList}>
      {/* 工具栏 */}
      <div className={styles.toolbar}>
        <Space>
          <Select
            placeholder="全部状态"
            allowClear
            style={{ width: 120 }}
            value={statusFilter}
            onChange={setStatusFilter}
          >
            <Select.Option value="pending">待处理</Select.Option>
            <Select.Option value="in_progress">处理中</Select.Option>
            <Select.Option value="timeout">已超时</Select.Option>
            <Select.Option value="completed">已完成</Select.Option>
          </Select>
          <Input
            placeholder="搜索客户名称"
            prefix={<SearchOutlined />}
            style={{ width: 200 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={() => setPage(1)}
            allowClear
          />
        </Space>
        <Button icon={<ExportOutlined />}>导出数据</Button>
      </div>

      {/* 表格 */}
      <Spin spinning={loading}>
        {dataSource.length > 0 ? (
          <Table
            columns={columns}
            dataSource={dataSource}
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
            scroll={{ x: 1000 }}
          />
        ) : (
          <Empty description="暂无催收任务" className={styles.empty} />
        )}
      </Spin>
    </div>
  );
};

export default AllCollectionTasks;
