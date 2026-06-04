/**
 * 统一考核表格组件
 * 根据考核分类动态切换列定义，支持分页和操作按钮
 */
import React, { useMemo } from 'react';
import { Table, Button, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Authorized } from '@/components/Authorized';
import { PERMISSIONS } from '@/constants/permissions';
import { getArCollectionColumns } from './columns/arCollectionColumns';
import { getReturnOrderColumns } from './columns/returnOrderColumns';

interface AssessmentTableProps {
  category: AssessmentCategory;
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
  category,
  records,
  total,
  page,
  pageSize,
  loading,
  onPageChange,
  onHandle,
  onAppeal,
}) => {
  /** 根据分类获取基础列 */
  const baseColumns = useMemo<ColumnsType<AssessmentRecord>>(() => {
    return category === 'ar_collection'
      ? getArCollectionColumns()
      : getReturnOrderColumns();
  }, [category]);

  /** 操作列 */
  const actionColumn: ColumnsType<AssessmentRecord> = [
    {
      title: '操作',
      key: 'action',
      width: 160,
      fixed: 'right',
      render: (_: unknown, record: AssessmentRecord) => (
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
    },
  ];

  // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖稳定无需重复触发
  const columns = useMemo(() => [...baseColumns, ...actionColumn], [baseColumns]);

  return (
    <Table<AssessmentRecord>
      rowKey="id"
      columns={columns}
      dataSource={records}
      loading={loading}
      scroll={{ x: 1200 }}
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
  );
};

export default AssessmentTable;
