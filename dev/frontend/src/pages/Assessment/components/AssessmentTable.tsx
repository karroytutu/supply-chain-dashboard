/**
 * 统一考核表格组件
 * 根据考核分类动态切换列定义，支持分页和操作按钮
 */
import React, { useMemo } from 'react';
import { Table, Button, Space, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { Authorized } from '@/components/Authorized';
import { PERMISSIONS } from '@/constants/permissions';
import { getReturnOrderColumns, STATUS_MAP } from './columns/returnOrderColumns';
import AppealStatusTag from './AppealStatusTag';

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
  /** 通用列定义（授信考核、OA节点超时等非退货分类） */
  const genericColumns: ColumnsType<AssessmentRecord> = useMemo(() => [
    {
      title: '业务编号',
      dataIndex: 'sourceNo',
      width: 150,
      render: (text: string) => (
        <span style={{ color: '#1890ff', cursor: 'pointer' }}>{text || '-'}</span>
      ),
    },
    {
      title: '业务名称',
      dataIndex: 'sourceName',
      width: 180,
      ellipsis: true,
    },
    {
      title: '被考核人',
      dataIndex: 'assessmentUserName',
      width: 100,
    },
    {
      title: '考核类型',
      dataIndex: 'ruleType',
      width: 140,
      render: (type: string) => <Tag color="blue">{type}</Tag>,
    },
    {
      title: '考核金额',
      dataIndex: 'penaltyAmount',
      width: 110,
      align: 'right',
      render: (n: number) => (
        <span style={{ color: '#f5222d' }}>¥{n?.toFixed(2)}</span>
      ),
    },
    {
      title: '处理状态',
      dataIndex: 'status',
      width: 100,
      render: (status: string, record: AssessmentRecord) => {
        if (status === 'appealed') {
          return <AppealStatusTag record={record} />;
        }
        const config = STATUS_MAP[status];
        return config ? <Tag color={config.color}>{config.text}</Tag> : status;
      },
    },
    {
      title: '计算时间',
      dataIndex: 'calculatedAt',
      width: 160,
      render: (t: string) => t ? dayjs(t).format('YYYY-MM-DD HH:mm') : '-',
    },
  ], []);

  /** 根据分类获取基础列 */
  const baseColumns = useMemo<ColumnsType<AssessmentRecord>>(() => {
    if (category === 'return_order') {
      return getReturnOrderColumns();
    }
    return genericColumns;
  }, [category, genericColumns]);

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
