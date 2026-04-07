/**
 * 超时预警列表
 * 展示超时的催收任务列表
 */
import React, { useState, useEffect } from 'react';
import {
  Table,
  Input,
  Tag,
  message,
  Row,
  Col,
  Badge,
} from 'antd';
import { SearchOutlined, WarningOutlined } from '@ant-design/icons';
import type { TimeoutWarningItem, OverdueLevel, FlowNodeType } from '@/types/accounts-receivable';
import { getTimeoutWarnings } from '@/services/api/accounts-receivable';
import styles from '../index.less';

interface TimeoutWarningListProps {
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

const nodeLabels: Record<FlowNodeType, string> = {
  preprocessing: '财务预处理',
  assignment: '营销主管分配',
  collection: '催收中',
  review: '待审核',
};

const TimeoutWarningList: React.FC<TimeoutWarningListProps> = () => {
  const [data, setData] = useState<TimeoutWarningItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await getTimeoutWarnings({
        page,
        pageSize,
      });
      setData(result.list);
      setTotal(result.total);
    } catch (error) {
      message.error('获取超时预警列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, pageSize, keyword]);

  const formatOverdueHours = (hours: number) => {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    if (days > 0) {
      return `${days}天${remainingHours}小时`;
    }
    return `${hours}小时`;
  };

  const columns = [
    {
      title: '任务编号',
      dataIndex: 'taskNo',
      key: 'taskNo',
      width: 140,
    },
    {
      title: '客户名称',
      dataIndex: 'consumerName',
      key: 'consumerName',
      width: 180,
    },
    {
      title: '逾期等级',
      dataIndex: 'overdueLevel',
      key: 'overdueLevel',
      width: 100,
      render: (level: OverdueLevel) => (
        <Tag color={levelColors[level]}>{levelLabels[level]}</Tag>
      ),
    },
    {
      title: '超时节点',
      dataIndex: 'currentNode',
      key: 'currentNode',
      width: 120,
      render: (node: FlowNodeType) => (
        <Badge
          status="error"
          text={nodeLabels[node]}
        />
      ),
    },
    {
      title: '截止时间',
      dataIndex: 'deadlineAt',
      key: 'deadlineAt',
      width: 160,
    },
    {
      title: '催收人',
      dataIndex: 'collectorName',
      key: 'collectorName',
      width: 120,
      render: (name: string | null) => name || '-',
    },
    {
      title: '超时时长',
      dataIndex: 'overdueSinceHours',
      key: 'overdueSinceHours',
      width: 120,
      render: (hours: number) => (
        <span className={styles.timeoutHighlight}>
          <WarningOutlined style={{ marginRight: 4 }} />
          {formatOverdueHours(hours)}
        </span>
      ),
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
          <Col xs={24} sm={12} md={16} style={{ textAlign: 'right' }}>
            <Tag color="red" icon={<WarningOutlined />}>
              共 {total} 条超时预警
            </Tag>
          </Col>
        </Row>
      </div>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="customerTaskId"
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

export default TimeoutWarningList;
