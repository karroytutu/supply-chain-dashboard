/**
 * 客户欠款分析表组件
 * 支持状态Tab筛选、搜索筛选、PC端表格/移动端卡片视图
 * 优化PC端和移动端响应式布局
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Card,
  Tag,
  Input,
  Select,
  Button,
  Space,
  Row,
  Col,
  InputNumber,
  Pagination,
  Badge,
} from 'antd';
import { SearchOutlined, EyeOutlined } from '@ant-design/icons';
import type { ArReceivable, ArStatus, ArQueryParams } from '@/types/accounts-receivable';
import { getArList } from '@/services/api/accounts-receivable';
import dayjs from 'dayjs';
import styles from '../index.less';

const { Option } = Select;

// 状态标签颜色映射
const statusColorMap: Record<string, string> = {
  synced: 'green',
  pre_warning_5: 'gold',
  pre_warning_2: 'orange',
  overdue: 'volcano',
  collecting: 'red',
  escalated: 'magenta',
  resolved: 'default',
  written_off: 'default',
};

// 状态显示文本
const statusLabelMap: Record<string, string> = {
  synced: '正常',
  pre_warning_5: '预警(5天)',
  pre_warning_2: '预警(2天)',
  overdue: '逾期',
  collecting: '催收中',
  escalated: '已升级',
  resolved: '已解决',
  written_off: '已核销',
};

// 推送状态映射
const notificationStatusMap: Record<string, { icon: string; color: string; label: string }> = {
  none: { icon: '—', color: '#d9d9d9', label: '未到期' },
  pre_warn_5_sent: { icon: '✅', color: '#52c41a', label: '已推送' },
  pre_warn_2_sent: { icon: '✅', color: '#52c41a', label: '已推送' },
  overdue_sent: { icon: '✅', color: '#52c41a', label: '已推送' },
  escalate_sent: { icon: '✅', color: '#52c41a', label: '已推送' },
};

// 状态Tab配置
const statusTabs = [
  { key: 'all', label: '全部' },
  { key: 'synced', label: '正常' },
  { key: 'pre_warning', label: '预警' },
  { key: 'overdue', label: '逾期' },
  { key: 'collecting', label: '催收中' },
  { key: 'resolved', label: '已解决' },
];

// 格式化金额
const formatAmount = (value: number): string => {
  return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// 计算逾期天数
const calculateOverdueDays = (record: ArReceivable): number => {
  if (record.due_date) {
    const due = dayjs(record.due_date);
    const today = dayjs();
    return today.diff(due, 'day');
  }
  return record.overdue_days || 0;
};

// 逾期天数样式
const getOverdueDaysClass = (days: number): string => {
  if (days > 60) return styles.danger;
  if (days > 30) return styles.warning;
  if (days > 0) return styles.caution;
  return styles.normal;
};

const CustomerDebtTable: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ArReceivable[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [activeTab, setActiveTab] = useState('all');
  const [isMobile, setIsMobile] = useState(false);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});

  // 筛选条件
  const [filters, setFilters] = useState<ArQueryParams>({
    keyword: '',
    status: undefined,
    overdueDaysMin: undefined,
    overdueDaysMax: undefined,
    amountMin: undefined,
    amountMax: undefined,
  });

  // 监听窗口大小变化
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: ArQueryParams = {
        page: currentPage,
        pageSize,
        keyword: filters.keyword || undefined,
        status: filters.status,
        overdueDaysMin: filters.overdueDaysMin,
        overdueDaysMax: filters.overdueDaysMax,
        amountMin: filters.amountMin,
        amountMax: filters.amountMax,
      };

      const result = await getArList(params);
      setData(result.list);
      setTotal(result.total);

      // 更新状态统计
      const counts: Record<string, number> = { all: result.total };
      result.list.forEach((item) => {
        const status = item.ar_status;
        counts[status] = (counts[status] || 0) + 1;
        // 预警统计
        if (status.startsWith('pre_warning')) {
          counts.pre_warning = (counts.pre_warning || 0) + 1;
        }
      });
      setStatusCounts(counts);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Tab切换
  const handleTabChange = (key: string) => {
    setActiveTab(key);
    setCurrentPage(1);
    if (key === 'all') {
      setFilters((prev) => ({ ...prev, status: undefined }));
    } else if (key === 'pre_warning') {
      // 预警状态特殊处理
      setFilters((prev) => ({ ...prev, status: undefined }));
    } else {
      setFilters((prev) => ({ ...prev, status: key as ArStatus }));
    }
  };

  // 表格列定义
  const columns = [
    {
      title: '客户名称',
      dataIndex: 'consumer_name',
      key: 'consumer_name',
      ellipsis: true,
    },
    {
      title: '欠款金额',
      dataIndex: 'left_amount',
      key: 'left_amount',
      render: (value: number) => (
        <span className={`${styles.amountHighlight} ${value > 50000 ? styles.large : ''}`}>
          {formatAmount(value)}
        </span>
      ),
      sorter: true,
    },
    {
      title: '逾期天数',
      key: 'overdue_days',
      render: (_: unknown, record: ArReceivable) => {
        const days = calculateOverdueDays(record);
        return <span className={getOverdueDaysClass(days)}>{days > 0 ? `${days}天` : '未逾期'}</span>;
      },
      sorter: true,
    },
    {
      title: '状态',
      dataIndex: 'ar_status',
      key: 'ar_status',
      render: (status: string) => (
        <Tag color={statusColorMap[status]} className={styles.statusTag}>
          {statusLabelMap[status] || status}
        </Tag>
      ),
    },
    {
      title: '所属营销',
      dataIndex: 'manager_users',
      key: 'manager_users',
      ellipsis: true,
    },
    {
      title: '推送状态',
      dataIndex: 'notification_status',
      key: 'notification_status',
      render: (status: string) => {
        const config = notificationStatusMap[status] || notificationStatusMap.none;
        return (
          <span style={{ color: config.color }}>
            {config.icon} {config.label}
          </span>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      render: () => (
        <Button type="link" size="small" icon={<EyeOutlined />}>
          查看
        </Button>
      ),
    },
  ];

  // 移动端卡片视图
  const MobileCardView: React.FC = () => (
    <div>
      {data.map((record) => {
        const overdueDays = calculateOverdueDays(record);
        const notifyConfig = notificationStatusMap[record.notification_status] || notificationStatusMap.none;
        return (
          <Card key={record.id} className={styles.mobileCard} size="small">
            <div className={styles.mobileCardHeader}>
              <strong>{record.consumer_name}</strong>
              <Tag color={statusColorMap[record.ar_status]}>{statusLabelMap[record.ar_status]}</Tag>
            </div>
            <div className={styles.mobileCardRow}>
              <span className={styles.mobileCardLabel}>欠款金额</span>
              <span className={`${styles.mobileCardValue} ${styles.amountHighlight}`}>
                {formatAmount(record.left_amount)}
              </span>
            </div>
            <div className={styles.mobileCardRow}>
              <span className={styles.mobileCardLabel}>逾期天数</span>
              <span className={getOverdueDaysClass(overdueDays)}>
                {overdueDays > 0 ? `${overdueDays}天` : '未逾期'}
              </span>
            </div>
            <div className={styles.mobileCardRow}>
              <span className={styles.mobileCardLabel}>所属营销</span>
              <span className={styles.mobileCardValue}>{record.manager_users || '-'}</span>
            </div>
            <div className={styles.mobileCardRow}>
              <span className={styles.mobileCardLabel}>推送状态</span>
              <span style={{ color: notifyConfig.color }}>{notifyConfig.label}</span>
            </div>
          </Card>
        );
      })}
    </div>
  );

  // 筛选区域 - 移动端垂直堆叠，PC端水平排列
  const FilterSection = () => (
    <div className={styles.filterSection}>
      <Row gutter={[16, isMobile ? 12 : 16]}>
        {/* 关键词搜索 */}
        <Col xs={24} sm={12} md={6}>
          <Input
            placeholder="客户名称搜索"
            prefix={<SearchOutlined />}
            value={filters.keyword}
            onChange={(e) => setFilters((prev) => ({ ...prev, keyword: e.target.value }))}
            allowClear
          />
        </Col>

        {/* 状态选择 */}
        <Col xs={24} sm={12} md={6}>
          <Select
            placeholder="选择状态"
            style={{ width: '100%' }}
            value={filters.status}
            onChange={(value) => setFilters((prev) => ({ ...prev, status: value }))}
            allowClear
          >
            <Option value="synced">正常</Option>
            <Option value="pre_warning_5">预警(5天)</Option>
            <Option value="pre_warning_2">预警(2天)</Option>
            <Option value="overdue">逾期</Option>
            <Option value="collecting">催收中</Option>
            <Option value="resolved">已解决</Option>
          </Select>
        </Col>

        {/* 逾期天数范围 - 移动端垂直排列 */}
        <Col xs={24} sm={12} md={6}>
          {isMobile ? (
            <div className={styles.filterRangeGroup}>
              <InputNumber
                className={styles.filterRangeInput}
                placeholder="最小逾期天数"
                value={filters.overdueDaysMin}
                onChange={(value) => setFilters((prev) => ({ ...prev, overdueDaysMin: value || undefined }))}
              />
              <InputNumber
                className={styles.filterRangeInput}
                placeholder="最大逾期天数"
                value={filters.overdueDaysMax}
                onChange={(value) => setFilters((prev) => ({ ...prev, overdueDaysMax: value || undefined }))}
              />
            </div>
          ) : (
            <Space>
              <InputNumber
                placeholder="最小逾期天数"
                style={{ width: 110 }}
                value={filters.overdueDaysMin}
                onChange={(value) => setFilters((prev) => ({ ...prev, overdueDaysMin: value || undefined }))}
              />
              <span>-</span>
              <InputNumber
                placeholder="最大逾期天数"
                style={{ width: 110 }}
                value={filters.overdueDaysMax}
                onChange={(value) => setFilters((prev) => ({ ...prev, overdueDaysMax: value || undefined }))}
              />
            </Space>
          )}
        </Col>

        {/* 金额范围 - 移动端垂直排列 */}
        <Col xs={24} sm={12} md={6}>
          {isMobile ? (
            <div className={styles.filterRangeGroup}>
              <InputNumber
                className={styles.filterRangeInput}
                placeholder="最小金额"
                value={filters.amountMin}
                onChange={(value) => setFilters((prev) => ({ ...prev, amountMin: value || undefined }))}
              />
              <InputNumber
                className={styles.filterRangeInput}
                placeholder="最大金额"
                value={filters.amountMax}
                onChange={(value) => setFilters((prev) => ({ ...prev, amountMax: value || undefined }))}
              />
            </div>
          ) : (
            <Space>
              <InputNumber
                placeholder="最小金额"
                style={{ width: 110 }}
                value={filters.amountMin}
                onChange={(value) => setFilters((prev) => ({ ...prev, amountMin: value || undefined }))}
              />
              <span>-</span>
              <InputNumber
                placeholder="最大金额"
                style={{ width: 110 }}
                value={filters.amountMax}
                onChange={(value) => setFilters((prev) => ({ ...prev, amountMax: value || undefined }))}
              />
            </Space>
          )}
        </Col>
      </Row>

      {/* 按钮区域 */}
      <div className={styles.filterActions}>
        <Button type="primary" onClick={loadData}>
          查询
        </Button>
        <Button
          style={{ marginLeft: isMobile ? 0 : 8 }}
          onClick={() => {
            setFilters({});
            setCurrentPage(1);
          }}
        >
          重置
        </Button>
      </div>
    </div>
  );

  return (
    <Card className={styles.tableCard} bordered={false}>
      {/* 状态Tab */}
      <div className={styles.statusTabs}>
        <Space size={isMobile ? 'middle' : 'large'}>
          {statusTabs.map((tab) => (
            <span
              key={tab.key}
              className={activeTab === tab.key ? 'active' : ''}
              onClick={() => handleTabChange(tab.key)}
            >
              {tab.label}
              <Badge
                count={statusCounts[tab.key] || 0}
                showZero
                style={{ marginLeft: 4, backgroundColor: activeTab === tab.key ? '#1890ff' : '#d9d9d9' }}
              />
            </span>
          ))}
        </Space>
      </div>

      {/* 筛选区 */}
      <FilterSection />

      {/* 表格/移动端卡片 */}
      {isMobile ? (
        <MobileCardView />
      ) : (
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={false}
          scroll={{ x: 1000 }}
        />
      )}

      {/* 分页 */}
      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <Pagination
          current={currentPage}
          pageSize={pageSize}
          total={total}
          showSizeChanger
          showTotal={(t) => `共 ${t} 条`}
          onChange={(page, size) => {
            setCurrentPage(page);
            setPageSize(size);
          }}
        />
      </div>
    </Card>
  );
};

export default CustomerDebtTable;
