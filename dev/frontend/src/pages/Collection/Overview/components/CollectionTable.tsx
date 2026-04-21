/**
 * 催收任务列表表格组件
 * 包含状态 Tab 切换、任务列表
 * 优化：列合并（7列→4列）、移动端卡片渲染
 */
import React, { useCallback } from 'react';
import dayjs from 'dayjs';
import { Table, Tooltip, Spin } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { history } from 'umi';
import StatusCell from '../../components/StatusCell';
import TaskCard from './TaskCard';
import useMedia from '../hooks/useMedia';
import type { CollectionTask, CollectionTaskStatus, CollectionStats } from '@/types/ar-collection';
import type { StatusTab } from '../hooks/useOverview';

interface CollectionTableProps {
  tasks: CollectionTask[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  statusTab: StatusTab;
  stats: CollectionStats | null;
  onStatusTabChange: (tab: StatusTab) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

/** 状态 Tab 配置 */
const STATUS_TABS: Array<{ key: StatusTab; label: string }> = [
  { key: 'collecting', label: '催收中' },
  { key: 'extension', label: '延期中' },
  { key: 'difference_processing', label: '差异' },
  { key: 'escalated', label: '已升级' },
  { key: 'pending_verify', label: '待核销' },
  { key: 'verified', label: '已核销' },
];

const CollectionTable: React.FC<CollectionTableProps> = ({
  tasks,
  loading,
  total,
  page,
  pageSize,
  statusTab,
  stats,
  onStatusTabChange,
  onPageChange,
  onPageSizeChange,
}) => {
  /** 跳转详情页 */
  const goToDetail = useCallback((id: number) => {
    history.push(`/collection/task/${id}`);
  }, []);

  /** 表格列定义 */
  const columns = [
    {
      title: '任务信息',
      dataIndex: 'taskNo',
      key: 'taskInfo',
      width: 140,
      render: (taskNo: string, record: CollectionTask) => (
        <div className="task-info-cell">
          <a
            className="task-no task-no-link"
            onClick={(e) => {
              e.stopPropagation();
              goToDetail(record.id);
            }}
          >
            {taskNo}
          </a>
          <div className="task-created">
            {formatCreatedDate(record.createdAt)}
          </div>
        </div>
      ),
    },
    {
      title: '客户信息',
      dataIndex: 'consumerName',
      key: 'consumerInfo',
      width: 200,
      render: (name: string, record: CollectionTask) => (
        <div className="customer-cell">
          <div className="customer-name">
            <a onClick={(e) => { e.stopPropagation(); goToDetail(record.id); }}>
              {name}
            </a>
          </div>
          {record.currentHandlerName && (
            <Tooltip title="当前处理人">
              <div className="handler-info">
                <UserOutlined /> {record.currentHandlerName}
              </div>
            </Tooltip>
          )}
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'statusInfo',
      width: 120,
      render: (status: CollectionTaskStatus) => (
        <StatusCell status={status} />
      ),
    },
    {
      title: '金额/逾期',
      key: 'amountOverdue',
      width: 160,
      render: (_: unknown, record: CollectionTask) => {
        const amount = record.totalAmount ?? 0;
        const days = record.maxOverdueDays ?? 0;
        return (
          <div className="amount-cell">
            <div className="amount-value">
              <span style={{ color: '#ff4d4f', fontWeight: 600 }}>
                ¥{Number(amount).toLocaleString()}
              </span>
            </div>
            <div className="overdue-days" style={{ color: days >= 30 ? '#ff4d4f' : '#8c8c8c', fontSize: 12 }}>
              逾期 {days} 天
            </div>
          </div>
        );
      },
    },
  ];

  // 媒体查询
  const { isMobile } = useMedia();

  /** 渲染移动端卡片列表 */
  const renderMobileCards = () => (
    <div className="task-card-list">
      <Spin spinning={loading}>
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onViewDetail={goToDetail}
          />
        ))}
      </Spin>
    </div>
  );

  /** 获取 Tab 对应状态的数据条数 */
  const getTabCount = (status: string): number => {
    const dist = stats?.statusDistribution ?? [];
    const item = dist.find((d) => d.status === status);
    return item?.count ?? 0;
  };

  return (
    <div className="table-section">
      <div className="table-tabs">
        {STATUS_TABS.map((tab) => (
          <span
            key={tab.key}
            className={`table-tab ${statusTab === tab.key ? 'active' : ''}`}
            onClick={() => onStatusTabChange(tab.key)}
          >
            {tab.label}
            <span className="tab-count">({getTabCount(tab.key)})</span>
          </span>
        ))}
      </div>

      {/* 移动端卡片列表 */}
      {isMobile && renderMobileCards()}

      {/* 桌面端表格 */}
      <Table
        dataSource={tasks}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 620 }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: onPageChange,
          onShowSizeChange: (_, size) => onPageSizeChange(size),
        }}
      />
    </div>
  );
};

/** 格式化创建时间 */
function formatCreatedDate(dateStr: string): string {
  if (!dateStr) return '-';
  const date = dayjs(dateStr);
  return `${date.format('YYYY-MM-DD')} 创建`;
}

export default CollectionTable;
