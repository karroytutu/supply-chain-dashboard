/**
 * 催收任务列表表格组件
 * 包含状态 Tab 切换、任务列表、移动端卡片渲染
 */
import React, { useCallback } from 'react';
import { Table, Spin } from 'antd';
import { history } from 'umi';
import TaskCard from './TaskCard';
import useMedia from '../hooks/useMedia';
import { useColumns } from './CollectionTable/useColumns';
import type { CollectionTask, CollectionStats } from '@/types/ar-collection';
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
  { key: 'escalated_l1', label: '待主管处理' },
  { key: 'escalated_l2', label: '待财务处理' },
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
  const columns = useColumns({ goToDetail });

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
        scroll={{ x: 860 }}
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

export default CollectionTable;
