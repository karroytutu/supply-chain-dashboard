/**
 * 考核记录表格组件
 */
import React from 'react';
import { Table, Tag, Spin } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { ArPenaltyRecord, ArPaginatedResult } from '@/types/accounts-receivable';
import styles from '../index.less';

interface PenaltyTableProps {
  data: ArPaginatedResult<ArPenaltyRecord>;
  loading: boolean;
  pagination: { page: number; pageSize: number };
  onPaginationChange: (page: number, pageSize: number) => void;
}

// 考核级别显示配置
const penaltyLevelConfig: Record<string, { label: string; color: string }> = {
  none: { label: '无考核', color: 'default' },
  base: { label: '基础考核', color: 'green' },
  double: { label: '翻倍考核', color: 'orange' },
  full: { label: '全额考核', color: 'red' },
};

// 状态显示配置
const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: '待确认', color: 'warning' },
  confirmed: { label: '已确认', color: 'success' },
  disputed: { label: '有异议', color: 'error' },
};

// 角色显示映射
const roleMap: Record<string, string> = {
  marketing: '营销师',
  supervisor: '营销主管',
  finance: '财务',
};

const PenaltyTable: React.FC<PenaltyTableProps> = ({
  data,
  loading,
  pagination,
  onPaginationChange,
}) => {
  // 格式化金额
  const formatAmount = (amount: number | undefined) => {
    if (amount === undefined || amount === null) return '-';
    return `¥${amount.toLocaleString()}`;
  };

  // 表格列定义
  const columns: ColumnsType<ArPenaltyRecord> = [
    {
      title: '人员',
      dataIndex: 'user_name',
      key: 'user_name',
      width: 100,
    },
    {
      title: '角色',
      dataIndex: 'user_role',
      key: 'user_role',
      width: 100,
      render: (role: string) => roleMap[role] || role || '-',
    },
    {
      title: '客户',
      dataIndex: 'consumer_name',
      key: 'consumer_name',
      width: 120,
      ellipsis: true,
    },
    {
      title: '欠款金额',
      dataIndex: 'left_amount',
      key: 'left_amount',
      width: 120,
      align: 'right',
      render: (amount: number) => (
        <span style={{ color: '#cf1322', fontWeight: 500 }}>
          {formatAmount(amount)}
        </span>
      ),
    },
    {
      title: '超时天数',
      dataIndex: 'overdue_days',
      key: 'overdue_days',
      width: 100,
      align: 'center',
      render: (days: number) => {
        let className = styles.penaltyLevelTag;
        if (days > 7) {
          return <span className={`${className} full`}>{days}天</span>;
        } else if (days > 4) {
          return <span className={`${className} double`}>{days}天</span>;
        } else if (days > 3) {
          return <span className={`${className} base`}>{days}天</span>;
        }
        return <span>{days}天</span>;
      },
    },
    {
      title: '考核金额',
      dataIndex: 'penalty_amount',
      key: 'penalty_amount',
      width: 120,
      align: 'right',
      render: (amount: number, record) => {
        const level = record.penalty_level;
        const className = `${styles.penaltyAmount} ${level}`;
        return (
          <span className={className}>
            {formatAmount(amount)}
          </span>
        );
      },
    },
    {
      title: '考核级别',
      dataIndex: 'penalty_level',
      key: 'penalty_level',
      width: 100,
      render: (level: string) => {
        const config = penaltyLevelConfig[level] || penaltyLevelConfig.none;
        return (
          <Tag color={config.color} className={styles.penaltyLevelTag}>
            {config.label}
          </Tag>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const config = statusConfig[status] || statusConfig.pending;
        return (
          <Tag color={config.color} className={styles.statusTag}>
            {config.label}
          </Tag>
        );
      },
    },
  ];

  // 移动端卡片渲染
  const renderMobileCard = (record: ArPenaltyRecord) => {
    const levelConfig = penaltyLevelConfig[record.penalty_level] || penaltyLevelConfig.none;
    const statusConfigItem = statusConfig[record.status] || statusConfig.pending;

    return (
      <div key={record.id} className={styles.mobileCard}>
        <div className={styles.mobileCardHeader}>
          <span className={styles.mobileUserName}>{record.user_name || '-'}</span>
          <Tag color={statusConfigItem.color}>{statusConfigItem.label}</Tag>
        </div>
        <div className={styles.mobileCardRow}>
          <span className={styles.mobileCardLabel}>角色</span>
          <span className={styles.mobileCardValue}>
            {roleMap[record.user_role || ''] || record.user_role || '-'}
          </span>
        </div>
        <div className={styles.mobileCardRow}>
          <span className={styles.mobileCardLabel}>客户</span>
          <span className={styles.mobileCardValue}>{record.consumer_name || '-'}</span>
        </div>
        <div className={styles.mobileCardRow}>
          <span className={styles.mobileCardLabel}>欠款金额</span>
          <span className={styles.mobileCardValue} style={{ color: '#cf1322' }}>
            {formatAmount(record.left_amount)}
          </span>
        </div>
        <div className={styles.mobileCardRow}>
          <span className={styles.mobileCardLabel}>超时天数</span>
          <span className={styles.mobileCardValue}>{record.overdue_days}天</span>
        </div>
        <div className={styles.mobileCardRow}>
          <span className={styles.mobileCardLabel}>考核金额</span>
          <span className={styles.mobileCardValue} style={{ color: levelConfig.color }}>
            {formatAmount(record.penalty_amount)}
          </span>
        </div>
        <div className={styles.mobileCardRow}>
          <span className={styles.mobileCardLabel}>考核级别</span>
          <Tag color={levelConfig.color}>{levelConfig.label}</Tag>
        </div>
      </div>
    );
  };

  return (
    <Spin spinning={loading}>
      {/* 桌面端表格 */}
      <div className={styles.desktopTable}>
        <Table
          columns={columns}
          dataSource={data.list}
          rowKey="id"
          pagination={{
            current: pagination.page,
            pageSize: pagination.pageSize,
            total: data.total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: onPaginationChange,
          }}
          scroll={{ x: 960 }}
        />
      </div>

      {/* 移动端卡片列表 */}
      <div className={styles.mobileCardList}>
        {data.list.map((record) => renderMobileCard(record))}
        {data.list.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#8c8c8c' }}>
            暂无数据
          </div>
        )}
        {/* 移动端分页 */}
        {data.total > pagination.pageSize && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <span style={{ color: '#8c8c8c' }}>
              第 {pagination.page} 页 / 共 {Math.ceil(data.total / pagination.pageSize)} 页
            </span>
          </div>
        )}
      </div>
    </Spin>
  );
};

export default PenaltyTable;
