/**
 * 同步日志表格组件
 * 展示同步日志列表，支持筛选和分页
 */

import { Table, Tag, Select, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { SyncLogRecord } from '@/services/api/dingtalk-sync';

interface SyncLogTableProps {
  dataSource: SyncLogRecord[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  statusFilter?: string;
  typeFilter?: string;
  onPageChange: (page: number, pageSize: number) => void;
  onStatusFilterChange: (status: string | undefined) => void;
  onTypeFilterChange: (type: string | undefined) => void;
  onRowClick: (record: SyncLogRecord) => void;
}

const syncTypeMap: Record<string, string> = {
  full: '全量同步',
  department: '部门同步',
  incremental: '增量同步',
};

const triggerTypeMap: Record<string, string> = {
  scheduled: '定时触发',
  manual: '手动触发',
};

function formatDuration(ms?: number): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(time?: string): string {
  if (!time) return '-';
  return new Date(time).toLocaleString('zh-CN');
}

const columns: ColumnsType<SyncLogRecord> = [
  {
    title: '同步类型',
    dataIndex: 'sync_type',
    width: 100,
    render: (v: string) => syncTypeMap[v] || v,
  },
  {
    title: '触发方式',
    dataIndex: 'trigger_type',
    width: 100,
    render: (v: string) => triggerTypeMap[v] || v,
  },
  {
    title: '状态',
    dataIndex: 'status',
    width: 90,
    render: (v: string) => {
      const colorMap: Record<string, string> = {
        running: 'processing',
        completed: 'success',
        failed: 'error',
      };
      const labelMap: Record<string, string> = {
        running: '运行中',
        completed: '已完成',
        failed: '失败',
      };
      return <Tag color={colorMap[v]}>{labelMap[v] || v}</Tag>;
    },
  },
  {
    title: '新增',
    dataIndex: 'users_created',
    width: 70,
    align: 'center',
  },
  {
    title: '更新',
    dataIndex: 'users_updated',
    width: 70,
    align: 'center',
  },
  {
    title: '禁用',
    dataIndex: 'users_disabled',
    width: 70,
    align: 'center',
  },
  {
    title: '耗时',
    dataIndex: 'duration_ms',
    width: 80,
    render: (v: number) => formatDuration(v),
  },
  {
    title: '开始时间',
    dataIndex: 'started_at',
    width: 170,
    render: (v: string) => formatTime(v),
  },
];

export function SyncLogTable({
  dataSource,
  total,
  page,
  pageSize,
  loading,
  statusFilter,
  typeFilter,
  onPageChange,
  onStatusFilterChange,
  onTypeFilterChange,
  onRowClick,
}: SyncLogTableProps) {
  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <span>筛选:</span>
        <Select
          placeholder="同步状态"
          allowClear
          style={{ width: 120 }}
          value={statusFilter}
          onChange={onStatusFilterChange}
          options={[
            { label: '运行中', value: 'running' },
            { label: '已完成', value: 'completed' },
            { label: '失败', value: 'failed' },
          ]}
        />
        <Select
          placeholder="同步类型"
          allowClear
          style={{ width: 120 }}
          value={typeFilter}
          onChange={onTypeFilterChange}
          options={[
            { label: '全量同步', value: 'full' },
            { label: '部门同步', value: 'department' },
            { label: '增量同步', value: 'incremental' },
          ]}
        />
      </Space>

      <Table<SyncLogRecord>
        columns={columns}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: onPageChange,
        }}
        onRow={(record) => ({
          onClick: () => onRowClick(record),
          style: { cursor: 'pointer' },
        })}
        size="small"
      />
    </div>
  );
}
