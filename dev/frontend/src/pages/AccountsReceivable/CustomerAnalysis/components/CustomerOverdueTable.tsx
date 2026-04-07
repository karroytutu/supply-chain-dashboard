/**
 * 客户逾期明细表组件
 * 展示客户逾期明细列表，支持搜索和筛选
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Table, Input, Select, Button, Tag, Space, message } from 'antd';
import { SearchOutlined, EyeOutlined } from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { CustomerOverdueItem, OverdueLevel } from '@/types/accounts-receivable';
import { getCustomerOverdueList } from '@/services/api/accounts-receivable';
import styles from '../index.less';

// 逾期等级颜色映射
const OVERDUE_LEVEL_COLORS: Record<OverdueLevel, string> = {
  light: '#52c41a',
  medium: '#fa8c16',
  severe: '#cf1322',
};

// 逾期等级标签映射
const OVERDUE_LEVEL_LABELS: Record<OverdueLevel, string> = {
  light: '轻度',
  medium: '中度',
  severe: '严重',
};

// 流程状态标签映射
const FLOW_STATUS_LABELS: Record<string, string> = {
  initial: '初始',
  preprocessing: '预处理中',
  assigned: '已分配',
  collecting: '催收中',
  completed: '已完成',
};

const CustomerOverdueTable: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<CustomerOverdueItem[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [keyword, setKeyword] = useState('');
  const [overdueLevel, setOverdueLevel] = useState<OverdueLevel | undefined>();

  // 加载数据
  const loadData = useCallback(async (page = 1, pageSize = 10) => {
    setLoading(true);
    try {
      const result = await getCustomerOverdueList({
        page,
        pageSize,
        keyword: keyword || undefined,
        overdueLevel,
      });
      setDataSource(result.list);
      setPagination(prev => ({ ...prev, current: page, pageSize, total: result.total }));
    } catch (error) {
      message.error('数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, overdueLevel]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 查看详情
  const handleViewDetail = (record: CustomerOverdueItem) => {
    message.info('功能开发中');
  };

  // 表格分页变化
  const handleTableChange = (paginationConfig: TablePaginationConfig) => {
    loadData(paginationConfig.current, paginationConfig.pageSize);
  };

  // 列定义
  const columns: ColumnsType<CustomerOverdueItem> = [
    {
      title: '客户名称',
      dataIndex: 'consumerName',
      key: 'consumerName',
      width: 180,
      fixed: 'left',
    },
    {
      title: '逾期单据数',
      dataIndex: 'billCount',
      key: 'billCount',
      width: 100,
      align: 'center',
    },
    {
      title: '逾期总额',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 140,
      align: 'right',
      render: (value: number) => (
        <span className={styles.amountHighlight}>
          ¥{value?.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) ?? '0.00'}
        </span>
      ),
    },
    {
      title: '最高逾期等级',
      dataIndex: 'maxOverdueLevel',
      key: 'maxOverdueLevel',
      width: 120,
      align: 'center',
      render: (level: OverdueLevel) => (
        <Tag color={OVERDUE_LEVEL_COLORS[level]}>
          {OVERDUE_LEVEL_LABELS[level]}
        </Tag>
      ),
    },
    {
      title: '最长逾期天数',
      dataIndex: 'maxOverdueDays',
      key: 'maxOverdueDays',
      width: 120,
      align: 'center',
      render: (days: number) => (
        <span className={days > 60 ? styles.daysDanger : days > 30 ? styles.daysWarning : ''}>
          {days}天
        </span>
      ),
    },
    {
      title: '催收人',
      dataIndex: 'collectorName',
      key: 'collectorName',
      width: 100,
      render: (name: string | null) => name || '-',
    },
    {
      title: '流程状态',
      dataIndex: 'flowStatus',
      key: 'flowStatus',
      width: 100,
      align: 'center',
      render: (status: string) => FLOW_STATUS_LABELS[status] || status,
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Button type="link" icon={<EyeOutlined />} onClick={() => handleViewDetail(record)}>
          查看详情
        </Button>
      ),
    },
  ];

  return (
    <div className={styles.tableSection}>
      {/* 筛选区域 */}
      <div className={styles.filterSection}>
        <Space wrap size="middle">
          <Input.Search
            placeholder="搜索客户名称"
            allowClear
            style={{ width: 220 }}
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onSearch={() => loadData(1, pagination.pageSize)}
            enterButton={<SearchOutlined />}
          />
          <Select
            placeholder="逾期等级筛选"
            allowClear
            style={{ width: 140 }}
            value={overdueLevel}
            onChange={value => setOverdueLevel(value)}
            options={[
              { value: 'light', label: '轻度' },
              { value: 'medium', label: '中度' },
              { value: 'severe', label: '严重' },
            ]}
          />
        </Space>
      </div>

      {/* 表格 */}
      <div className={styles.tableWrapper}>
        <Table
          columns={columns}
          dataSource={dataSource}
          rowKey={record => record.consumerName}
          loading={loading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: total => `共 ${total} 条`,
          }}
          onChange={handleTableChange}
          scroll={{ x: 1000 }}
          size="middle"
        />
      </div>
    </div>
  );
};

export default CustomerOverdueTable;
