/**
 * 统一考核表格组件
 * 使用统一列定义，支持分页和操作按钮
 */
import React, { useMemo, useCallback } from 'react';
import { Table, Button, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Authorized } from '@/components/Authorized';
import { PERMISSIONS } from '@/constants/permissions';
import { getUnifiedColumns } from './columns/unifiedColumns';

interface AssessmentTableProps {
  records: AssessmentRecord[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  onPageChange: (page: number, pageSize: number) => void;
  onHandle: (record: AssessmentRecord) => void;
  onAppeal: (record: AssessmentRecord) => void;
}

const AssessmentTable: React.FC<AssessmentTableProps> = ({
  records,
  total,
  page,
  pageSize,
  loading,
  onPageChange,
  onHandle,
  onAppeal,
}) => {
  const baseColumns = useMemo<ColumnsType<AssessmentRecord>>(() => getUnifiedColumns(), []);

  /** 操作列（通过 useCallback 稳定引用） */
  const renderActions = useCallback(
    (_: unknown, record: AssessmentRecord) => (
      <Space size="small">
        {record.status === 'pending' && (
          <Authorized permission={PERMISSIONS.ASSESSMENT.WRITE}>
            <Button type="link" size="small" onClick={() => onHandle(record)}>
              处理
            </Button>
          </Authorized>
        )}
        {record.status === 'pending' && (
          <Authorized permission={PERMISSIONS.ASSESSMENT.WRITE}>
            <Button type="link" size="small" onClick={() => onAppeal(record)}>
              申诉
            </Button>
          </Authorized>
        )}
      </Space>
    ),
    [onHandle, onAppeal],
  );

  const columns = useMemo<ColumnsType<AssessmentRecord>>(
    () => [...baseColumns, {
      title: '操作',
      key: 'action',
      width: 160,
      fixed: 'right' as const,
      render: renderActions,
    }],
    [baseColumns, renderActions],
  );

  return (
    <div className="table-container">
      <Table<AssessmentRecord>
        rowKey="id"
        columns={columns}
        dataSource={records}
        loading={loading}
        scroll={{ x: 1250, y: 'calc(100vh - 280px)' }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: onPageChange,
        }}
      />
    </div>
  );
};

export default AssessmentTable;
