/**
 * 催收任务列表表格组件
 * 包含状态 Tab 切换、任务列表、操作下拉菜单
 * 优化：列合并（7列→4列）、批量选择支持、移动端卡片渲染
 */
import React, { useCallback } from 'react';
import dayjs from 'dayjs';
import { Table, Dropdown, Button, Menu, Tooltip, Space, Spin } from 'antd';
import {
  DollarOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  ArrowUpOutlined,
  DownOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { history } from 'umi';
import StatusCell from '../../components/StatusCell';
import TaskCard from './TaskCard';
import useMedia from '../hooks/useMedia';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSIONS } from '@/constants/permissions';
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
  selectedRowKeys?: number[];
  onStatusTabChange: (tab: StatusTab) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onAction: (action: string, task: CollectionTask) => void;
  onSelectionChange?: (selectedRowKeys: number[], selectedRows: CollectionTask[]) => void;
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
  selectedRowKeys = [],
  onStatusTabChange,
  onPageChange,
  onPageSizeChange,
  onAction,
  onSelectionChange,
}) => {
  const { hasPermission, hasRole } = usePermission();

  // 权限检查
  const canWrite = hasPermission(PERMISSIONS.AR.COLLECTION.WRITE);
  const canEscalate = hasPermission(PERMISSIONS.AR.COLLECTION.ESCALATE);
  const canVerify = hasPermission(PERMISSIONS.AR.COLLECTION.VERIFY);
  const isAdmin = hasRole('admin');

  /** 跳转详情页 */
  const goToDetail = useCallback((id: number) => {
    history.push(`/collection/task/${id}`);
  }, []);

  /** 判断任务是否可以进行写操作 */
  const canTaskWrite = useCallback((task: CollectionTask) => {
    // 已核销和已关闭状态不能操作
    if (['verified', 'closed'].includes(task.status)) {
      return false;
    }
    return canWrite || isAdmin;
  }, [canWrite, isAdmin]);

  /** 判断任务是否可以升级 */
  const canTaskEscalate = useCallback((task: CollectionTask) => {
    // 已核销和已关闭状态不能操作
    if (['verified', 'closed'].includes(task.status)) {
      return false;
    }
    // 已升级到最高级不能再升级
    if (task.status === 'escalated' && task.escalationLevel === 2) {
      return false;
    }
    return canEscalate || isAdmin;
  }, [canEscalate, isAdmin]);

  /** 判断任务是否可以核销确认（出纳专属） */
  const canTaskConfirm = useCallback((task: CollectionTask) => {
    return task.status === 'pending_verify' && (canVerify || isAdmin);
  }, [canVerify, isAdmin]);

  /** 操作菜单（根据权限过滤） */
  const getActionMenu = useCallback(
    (task: CollectionTask) => {
      const menuItems: React.ReactNode[] = [];

      // 核销确认 - 仅出纳在待核销状态可见
      if (canTaskConfirm(task)) {
        menuItems.push(
          <Menu.Item
            key="confirmVerify"
            icon={<DollarOutlined />}
            onClick={() => onAction('confirmVerify', task)}
          >
            确认核销
          </Menu.Item>
        );
      }

      // 核销回款 - 需要 write 权限且任务状态允许
      if (canTaskWrite(task) && task.status !== 'pending_verify') {
        menuItems.push(
          <Menu.Item key="verify" icon={<DollarOutlined />} onClick={() => onAction('verify', task)}>
            核销回款
          </Menu.Item>
        );
      }

      // 申请延期 - 需要 write 权限且任务状态允许
      if (canTaskWrite(task) && task.status !== 'pending_verify' && task.canExtend !== false) {
        menuItems.push(
          <Menu.Item
            key="extension"
            icon={<ClockCircleOutlined />}
            onClick={() => onAction('extension', task)}
          >
            申请延期
          </Menu.Item>
        );
      }

      // 标记差异 - 需要 write 权限且任务状态允许
      if (canTaskWrite(task) && task.status !== 'pending_verify') {
        menuItems.push(
          <Menu.Item
            key="difference"
            icon={<ExclamationCircleOutlined />}
            onClick={() => onAction('difference', task)}
          >
            标记差异
          </Menu.Item>
        );
      }

      // 升级处理 - 需要 escalate 权限且任务状态允许
      if (canTaskEscalate(task) && task.status !== 'pending_verify') {
        menuItems.push(
          <Menu.Item
            key="escalate"
            icon={<ArrowUpOutlined />}
            onClick={() => onAction('escalate', task)}
            danger
          >
            升级处理
          </Menu.Item>
        );
      }

      return <Menu>{menuItems}</Menu>;
    },
    [onAction, canTaskWrite, canTaskEscalate, canTaskConfirm],
  );

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
      render: (status: CollectionTaskStatus, record: CollectionTask) => (
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
    {
      title: '操作',
      key: 'action',
      width: 90,
      fixed: 'right' as const,
      render: (_: unknown, record: CollectionTask) => (
        <Dropdown overlay={getActionMenu(record)} trigger={['click']}>
          <Button size="small" type="link" onClick={(e) => e.stopPropagation()}>
            操作 <DownOutlined />
          </Button>
        </Dropdown>
      ),
    },
  ];

  /** 多选配置 */
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[], rows: CollectionTask[]) => {
      onSelectionChange?.(keys as number[], rows);
    },
    selections: [Table.SELECTION_ALL, Table.SELECTION_INVERT, Table.SELECTION_NONE],
    columnWidth: 50,
  };

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
            onAction={onAction}
            onViewDetail={goToDetail}
            canWrite={canWrite || isAdmin}
            canEscalate={canEscalate || isAdmin}
            canVerify={canVerify || isAdmin}
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
        rowSelection={rowSelection}
        scroll={{ x: 740 }}
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
