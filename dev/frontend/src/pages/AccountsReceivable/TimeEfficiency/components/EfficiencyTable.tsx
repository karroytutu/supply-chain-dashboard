/**
 * 时效明细表组件
 * 展示各任务的时效明细数据
 */
import React from 'react';
import { Table, Card, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { TimeEfficiencyItem } from '@/types/accounts-receivable';
import styles from '../index.less';

interface EfficiencyTableProps {
  data: TimeEfficiencyItem[];
  total: number;
  loading: boolean;
  pagination: {
    current: number;
    pageSize: number;
    total: number;
  };
  onPageChange: (page: number, pageSize: number) => void;
}

/**
 * 渲染耗时单元格
 * @param hours 耗时小时数
 * @param onTime 是否按时
 */
const renderHoursCell = (hours: number | null, onTime: boolean | null) => {
  if (hours === null || hours === undefined) {
    return <span style={{ color: '#bfbfbf' }}>-</span>;
  }
  const isOnTime = onTime === true;
  return (
    <span className={`${styles.hoursValue} ${isOnTime ? 'onTime' : 'timeout'}`}>
      {hours.toFixed(1)}
    </span>
  );
};

/**
 * 渲染是否超时标签
 */
const renderOnTimeTag = (record: TimeEfficiencyItem) => {
  // 检查所有节点是否按时
  const allOnTime = 
    record.preprocessingOnTime !== false &&
    record.assignmentOnTime !== false &&
    record.collectionOnTime !== false;
  
  // 如果所有节点都按时或者所有节点都为null，认为按时
  const hasTimeout = 
    record.preprocessingOnTime === false ||
    record.assignmentOnTime === false ||
    record.collectionOnTime === false;

  if (hasTimeout) {
    return <Tag color="error" className={styles.statusTag}>超时</Tag>;
  }
  return <Tag color="success" className={styles.statusTag}>按时</Tag>;
};

const EfficiencyTable: React.FC<EfficiencyTableProps> = ({
  data,
  total,
  loading,
  pagination,
  onPageChange,
}) => {
  const columns: ColumnsType<TimeEfficiencyItem> = [
    {
      title: '任务编号',
      dataIndex: 'taskNo',
      key: 'taskNo',
      width: 140,
      fixed: 'left',
      render: (text) => <span style={{ fontWeight: 500 }}>{text}</span>,
    },
    {
      title: '客户名称',
      dataIndex: 'consumerName',
      key: 'consumerName',
      width: 150,
      ellipsis: true,
    },
    {
      title: '预处理耗时',
      dataIndex: 'preprocessingHours',
      key: 'preprocessingHours',
      width: 110,
      align: 'center',
      render: (hours, record) => (
        <Tooltip title={record.preprocessingOnTime === null ? '无预处理记录' : (record.preprocessingOnTime ? '按时完成' : '超时')}>
          {renderHoursCell(hours, record.preprocessingOnTime)}
        </Tooltip>
      ),
    },
    {
      title: '分配耗时',
      dataIndex: 'assignmentHours',
      key: 'assignmentHours',
      width: 100,
      align: 'center',
      render: (hours, record) => (
        <Tooltip title={record.assignmentOnTime === null ? '无分配记录' : (record.assignmentOnTime ? '按时完成' : '超时')}>
          {renderHoursCell(hours, record.assignmentOnTime)}
        </Tooltip>
      ),
    },
    {
      title: '催收耗时',
      dataIndex: 'collectionHours',
      key: 'collectionHours',
      width: 100,
      align: 'center',
      render: (hours, record) => (
        <Tooltip title={record.collectionOnTime === null ? '无催收记录' : (record.collectionOnTime ? '按时完成' : '超时')}>
          {renderHoursCell(hours, record.collectionOnTime)}
        </Tooltip>
      ),
    },
    {
      title: '总耗时',
      dataIndex: 'totalHours',
      key: 'totalHours',
      width: 100,
      align: 'center',
      render: (hours, record) => (
        <Tooltip title="从任务创建到完成的总耗时">
          <span style={{ fontWeight: 600 }}>{hours?.toFixed(1) || '-'}</span>
        </Tooltip>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 80,
      align: 'center',
      fixed: 'right',
      render: (_, record) => renderOnTimeTag(record),
    },
  ];

  return (
    <Card className={styles.tableCard}>
      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        scroll={{ x: 900 }}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: pagination.total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 条`,
          onChange: onPageChange,
        }}
      />
    </Card>
  );
};

export default EfficiencyTable;
