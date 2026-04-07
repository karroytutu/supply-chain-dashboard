/**
 * 催收中列表
 * 展示进行中的催收任务列表
 */
import React, { useState, useEffect } from 'react';
import {
  Table,
  Input,
  Select,
  Tag,
  message,
  Row,
  Col,
  Progress,
} from 'antd';
import { SearchOutlined, ClockCircleOutlined } from '@ant-design/icons';
import type { ArCustomerCollectionTask, OverdueLevel, ArPaginatedResult } from '@/types/accounts-receivable';
import { getCustomerTasks } from '@/services/api/accounts-receivable';
import styles from '../index.less';

const { Option } = Select;

interface CollectingListProps {
  onRefreshStats: () => void;
}

const levelColors: Record<OverdueLevel, string> = {
  light: 'green',
  medium: 'orange',
  severe: 'red',
};

const levelLabels: Record<OverdueLevel, string> = {
  light: '轻度',
  medium: '中度',
  severe: '重度',
};

const CollectingList: React.FC<CollectingListProps> = () => {
  const [data, setData] = useState<ArCustomerCollectionTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const [overdueLevel, setOverdueLevel] = useState<OverdueLevel | undefined>();

  const fetchData = async () => {
    setLoading(true);
    try {
      const result: { code: number; data: ArPaginatedResult<ArCustomerCollectionTask> } = await getCustomerTasks({
        status: 'in_progress',
        page,
        pageSize,
        keyword: keyword || undefined,
      });
      setData(result.data.list);
      setTotal(result.data.total);
    } catch (error) {
      message.error('获取催收中列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, pageSize, keyword, overdueLevel]);

  const getRemainingTimeColor = (hours: number | undefined) => {
    if (hours === undefined) return '#999';
    if (hours < 4) return '#ff4d4f';
    if (hours < 12) return '#faad14';
    return '#52c41a';
  };

  const getRemainingTimePercent = (hours: number | undefined) => {
    if (hours === undefined) return 0;
    const maxHours = 48;
    const percent = Math.max(0, Math.min(100, (hours / maxHours) * 100));
    return Math.round(percent);
  };

  const columns = [
    {
      title: '任务编号',
      dataIndex: 'task_no',
      key: 'task_no',
      width: 140,
    },
    {
      title: '客户名称',
      dataIndex: 'consumer_name',
      key: 'consumer_name',
      width: 180,
    },
    {
      title: '催收人',
      dataIndex: 'collector_name',
      key: 'collector_name',
      width: 120,
    },
    {
      title: '单据数',
      dataIndex: 'bill_count',
      key: 'bill_count',
      width: 80,
      align: 'center' as const,
    },
    {
      title: '总金额',
      dataIndex: 'total_amount',
      key: 'total_amount',
      width: 120,
      align: 'right' as const,
      render: (amount: number) => `¥${amount.toLocaleString()}`,
    },
    {
      title: '截止时间',
      dataIndex: 'deadline_at',
      key: 'deadline_at',
      width: 160,
    },
    {
      title: '剩余时间',
      key: 'remaining',
      width: 150,
      render: (_: any, record: ArCustomerCollectionTask) => {
        const hours = record.remaining_hours;
        const color = getRemainingTimeColor(hours);
        const percent = getRemainingTimePercent(hours);
        return (
          <div className={styles.remainingTimeCell}>
            <ClockCircleOutlined style={{ color, marginRight: 4 }} />
            <span style={{ color }}>
              {hours !== undefined ? `${Math.floor(hours)}小时` : '已超时'}
            </span>
            <Progress
              percent={percent}
              size="small"
              showInfo={false}
              strokeColor={color}
              className={styles.remainingProgress}
            />
          </div>
        );
      },
    },
  ];

  return (
    <div className={styles.listContainer}>
      <div className={styles.filterSection}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={8}>
            <Input
              placeholder="搜索客户名称/任务编号"
              prefix={<SearchOutlined />}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Select
              placeholder="逾期等级"
              allowClear
              style={{ width: '100%' }}
              value={overdueLevel}
              onChange={setOverdueLevel}
            >
              <Option value="light">轻度</Option>
              <Option value="medium">中度</Option>
              <Option value="severe">重度</Option>
            </Select>
          </Col>
        </Row>
      </div>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => {
            setPage(p);
            if (ps) setPageSize(ps);
          },
        }}
        scroll={{ x: 900 }}
      />
    </div>
  );
};

export default CollectingList;
