/**
 * 逾期前预警数据组件（管理员视角）
 * 分区块展示逾期前2天和5天的预警数据
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Table, Badge, Empty, Spin, Button, Tag } from 'antd';
import { BellOutlined, WarningOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { ArReceivable, ArStatus, NotificationStatus } from '@/types/accounts-receivable';
import { getPreWarningData } from '@/services/api/accounts-receivable';
import styles from './PreWarningList.less';

interface PreWarningListProps {
  onViewDetail: (arId: number) => void;
}

const PreWarningList: React.FC<PreWarningListProps> = ({ onViewDetail }) => {
  const [loading, setLoading] = useState(false);
  const [preWarn2, setPreWarn2] = useState<ArReceivable[]>([]);
  const [preWarn5, setPreWarn5] = useState<ArReceivable[]>([]);

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getPreWarningData();
      setPreWarn2(result.preWarn2 || []);
      setPreWarn5(result.preWarn5 || []);
    } catch (error) {
      console.error('加载逾期前预警数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 格式化金额
  const formatAmount = (amount?: number): string => {
    if (amount === undefined || amount === null) return '¥0.00';
    return `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;
  };

  // 格式化日期
  const formatDate = (date?: string | Date): string => {
    if (!date) return '-';
    const d = new Date(date);
    return d.toISOString().split('T')[0];
  };

  // 应收状态映射
  const arStatusMap: Record<ArStatus, { text: string; color: string }> = {
    'synced': { text: '已同步', color: 'blue' },
    'pre_warning_5': { text: '预警(5天)', color: 'gold' },
    'pre_warning_2': { text: '预警(2天)', color: 'orange' },
    'overdue': { text: '已逾期', color: 'red' },
    'collecting': { text: '催收中', color: 'purple' },
    'escalated': { text: '已升级', color: 'magenta' },
    'resolved': { text: '已解决', color: 'green' },
    'written_off': { text: '已核销', color: 'cyan' },
  };

  // 推送状态映射
  const notificationStatusMap: Record<NotificationStatus, { text: string; color: string }> = {
    'none': { text: '未推送', color: 'default' },
    'pre_warn_5_sent': { text: '已预警(5天)', color: 'orange' },
    'pre_warn_2_sent': { text: '已预警(2天)', color: 'volcano' },
    'overdue_sent': { text: '已通知逾期', color: 'red' },
    'escalate_sent': { text: '已升级', color: 'magenta' },
  };

  // 表格列定义
  const columns: ColumnsType<ArReceivable> = [
    {
      title: '客户名称',
      dataIndex: 'consumer_name',
      key: 'consumer_name',
      width: 160,
      fixed: 'left',
      render: (text: string, record) => (
        <a onClick={() => onViewDetail(record.id)}>{text}</a>
      ),
    },
    {
      title: '订单号',
      dataIndex: 'order_no',
      key: 'order_no',
      width: 120,
      render: (text: string) => text || '-',
    },
    {
      title: '单据日期',
      dataIndex: 'bill_order_time',
      key: 'bill_order_time',
      width: 100,
      align: 'center',
      render: (date: string) => formatDate(date),
    },
    {
      title: '欠款金额',
      dataIndex: 'left_amount',
      key: 'left_amount',
      width: 120,
      align: 'right',
      render: (amount: number) => (
        <span className={styles.amount}>{formatAmount(amount)}</span>
      ),
    },
    {
      title: '最大欠款天数',
      dataIndex: 'max_debt_days',
      key: 'max_debt_days',
      width: 100,
      align: 'center',
      render: (days: number) => (days ? `${days}天` : '-'),
    },
    {
      title: '账龄',
      dataIndex: 'aging_days',
      key: 'aging_days',
      width: 80,
      align: 'center',
      render: (days: number) => (days != null ? `${days}天` : '-'),
    },
    {
      title: '到期日',
      dataIndex: 'due_date',
      key: 'due_date',
      width: 100,
      align: 'center',
      render: (date: string) => formatDate(date),
    },
    {
      title: '当前状态',
      dataIndex: 'ar_status',
      key: 'ar_status',
      width: 100,
      align: 'center',
      render: (status: ArStatus) => {
        const map = arStatusMap[status] || { text: status, color: 'default' };
        return <Tag color={map.color}>{map.text}</Tag>;
      },
    },
    {
      title: '推送状态',
      dataIndex: 'notification_status',
      key: 'notification_status',
      width: 100,
      align: 'center',
      render: (status: NotificationStatus) => {
        const map = notificationStatusMap[status] || { text: status || '未推送', color: 'default' };
        return <Tag color={map.color}>{map.text}</Tag>;
      },
    },
    {
      title: '营销师',
      dataIndex: 'salesman_name',
      key: 'salesman_name',
      width: 100,
      render: (name: string) => <span className={styles.collectorTag}>{name || '-'}</span>,
    },
    {
      title: '操作',
      key: 'action',
      width: 60,
      align: 'center',
      fixed: 'right',
      render: (_: any, record) => (
        <Button type="link" size="small" onClick={() => onViewDetail(record.id)}>
          详情
        </Button>
      ),
    },
  ];

  return (
    <div className={styles.preWarningList}>
      <Spin spinning={loading}>
        {/* 逾期前2天紧急预警 */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>
              <BellOutlined className={styles.preWarn2Icon} />
              逾期前2天紧急预警
              <Badge count={preWarn2.length} className={styles.badge} />
            </h3>
          </div>
          {preWarn2.length > 0 ? (
            <Table
              columns={columns}
              dataSource={preWarn2}
              rowKey="id"
              pagination={false}
              size="small"
              scroll={{ x: 1200 }}
            />
          ) : (
            <Empty description="暂无逾期前2天预警数据" className={styles.empty} />
          )}
        </div>

        {/* 逾期前5天预警 */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>
              <WarningOutlined className={styles.preWarn5Icon} />
              逾期前5天预警
              <Badge count={preWarn5.length} className={styles.badgeInfo} />
            </h3>
          </div>
          {preWarn5.length > 0 ? (
            <Table
              columns={columns}
              dataSource={preWarn5}
              rowKey="id"
              pagination={false}
              size="small"
              scroll={{ x: 1200 }}
            />
          ) : (
            <Empty description="暂无逾期前5天预警数据" className={styles.empty} />
          )}
        </div>
      </Spin>
    </div>
  );
};

export default PreWarningList;
