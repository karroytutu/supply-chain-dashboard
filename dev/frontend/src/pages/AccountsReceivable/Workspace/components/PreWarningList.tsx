/**
 * 逾期前预警数据组件（管理员视角）
 * 使用子Tab切换展示逾期前2天和5天的预警数据
 * 移动端：卡片视图
 */
import React, { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import { Table, Badge, Empty, Spin, Button, Tag, Segmented, Select } from 'antd';
import { BellOutlined, WarningOutlined, ExclamationCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { ArReceivable, ArStatus, NotificationStatus } from '@/types/accounts-receivable';
import { getPreWarningData } from '@/services/api/accounts-receivable';
import { WorkspaceContext } from '../index';
import styles from './PreWarningList.less';

interface PreWarningListProps {
  onViewDetail: (arId: number) => void;
}

type SubTabKey = 'urgent' | 'normal';

const PreWarningList: React.FC<PreWarningListProps> = ({ onViewDetail }) => {
  const { isMobile } = useContext(WorkspaceContext);
  const [loading, setLoading] = useState(false);
  const [preWarn2, setPreWarn2] = useState<ArReceivable[]>([]);
  const [preWarn5, setPreWarn5] = useState<ArReceivable[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<SubTabKey>('urgent');

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

  // 若紧急预警为空，自动切换到一般预警
  useEffect(() => {
    if (preWarn2.length === 0 && preWarn5.length > 0) {
      setActiveSubTab('normal');
    }
  }, [preWarn2.length, preWarn5.length]);

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

  // 计算剩余天数
  const getDaysRemaining = (dueDate: string): number => {
    if (!dueDate) return 0;
    const due = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  // 渲染倒计时Tag
  const renderCountdown = (dueDate: string, isUrgent: boolean = false) => {
    const days = getDaysRemaining(dueDate);
    if (days <= 0) {
      return <Tag color="error">已逾期</Tag>;
    }
    if (days === 1) {
      return (
        <Tag 
          icon={<ExclamationCircleOutlined />} 
          color="error" 
          className={isUrgent ? styles.countdownPulse : ''}
        >
          明天到期
        </Tag>
      );
    }
    if (days === 2) {
      return (
        <Tag icon={<ClockCircleOutlined />} color="warning">
          剩余2天
        </Tag>
      );
    }
    return (
      <Tag icon={<ClockCircleOutlined />} color="gold">
        剩余{days}天
      </Tag>
    );
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
      width: 140,
      fixed: 'left',
      ellipsis: true,
      render: (text: string, record) => (
        <a onClick={() => onViewDetail(record.id)}>{text}</a>
      ),
    },
    {
      title: '订单号',
      dataIndex: 'order_no',
      key: 'order_no',
      width: 130,
      ellipsis: true,
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
      width: 110,
      align: 'right',
      render: (amount: number) => (
        <span className={styles.amount}>{formatAmount(amount)}</span>
      ),
    },
    {
      title: '账龄',
      dataIndex: 'aging_days',
      key: 'aging_days',
      width: 70,
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
      title: '倒计时',
      dataIndex: 'due_date',
      key: 'countdown',
      width: 100,
      align: 'center',
      render: (dueDate: string) => renderCountdown(dueDate),
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
      title: '营销师',
      dataIndex: 'salesman_name',
      key: 'salesman_name',
      width: 90,
      ellipsis: true,
      render: (name: string) => <span className={styles.collectorTag}>{name || '-'}</span>,
    },
    {
      title: '操作',
      key: 'action',
      width: 60,
      align: 'center',
      fixed: 'right',
      render: (_: unknown, record) => (
        <Button type="link" size="small" onClick={() => onViewDetail(record.id)}>
          详情
        </Button>
      ),
    },
  ];

  // 筛选器选项配置
  const filterOptions = useMemo(() => [
    {
      value: 'urgent' as SubTabKey,
      label: (
        <span className={styles.filterLabel}>
          <ExclamationCircleOutlined className={styles.filterIconUrgent} />
          紧急预警（2天）
          {preWarn2.length > 0 && (
            <Badge count={preWarn2.length} className={styles.filterBadgeDanger} />
          )}
        </span>
      ),
    },
    {
      value: 'normal' as SubTabKey,
      label: (
        <span className={styles.filterLabel}>
          <BellOutlined className={styles.filterIconNormal} />
          一般预警（5天）
          {preWarn5.length > 0 && (
            <Badge count={preWarn5.length} className={styles.filterBadgeWarning} />
          )}
        </span>
      ),
    },
  ], [preWarn2.length, preWarn5.length]);

  // 移动端下拉选项
  const mobileSelectOptions = [
    { value: 'urgent', label: `紧急预警（${preWarn2.length}）` },
    { value: 'normal', label: `一般预警（${preWarn5.length}）` },
  ];

  // 当前显示的数据
  const currentData = activeSubTab === 'urgent' ? preWarn2 : preWarn5;
  const emptyText = activeSubTab === 'urgent' ? '暂无紧急预警数据' : '暂无一般预警数据';
  const isUrgent = activeSubTab === 'urgent';

  // 渲染移动端卡片
  const renderMobileCard = (item: ArReceivable) => {
    const days = getDaysRemaining(item.due_date || '');
    const isCritical = days <= 1;

    return (
      <div
        key={item.id}
        className={`${styles.mobileCard} ${isCritical ? styles.mobileCardCritical : ''} ${isUrgent && !isCritical ? styles.mobileCardUrgent : ''}`}
        onClick={() => onViewDetail(item.id)}
      >
        <div className={styles.mobileCardHeader}>
          <div className={styles.mobileCardTitle}>
            {isCritical && <span className={styles.criticalIcon}>🔴</span>}
            {isUrgent && !isCritical && <span className={styles.urgentIcon}>🟡</span>}
            <span>{item.consumer_name}</span>
          </div>
          {renderCountdown(item.due_date || '', isCritical)}
        </div>

        <div className={styles.mobileCardInfo}>
          <div className={styles.mobileInfoItem}>
            <span className={styles.mobileInfoLabel}>欠款金额</span>
            <span className={styles.mobileInfoValueAmount}>{formatAmount(item.left_amount)}</span>
          </div>
          <div className={styles.mobileInfoItem}>
            <span className={styles.mobileInfoLabel}>账龄</span>
            <span className={styles.mobileInfoValue}>{item.aging_days || 0} 天</span>
          </div>
        </div>

        <div className={styles.mobileCardFooter}>
          <span className={styles.footerInfo}>
            到期日: {formatDate(item.due_date)} | 营销师: {item.salesman_name || '-'}
          </span>
          <span className={styles.viewDetail}>详情 →</span>
        </div>
      </div>
    );
  };

  // 渲染移动端视图
  if (isMobile) {
    return (
      <div className={styles.preWarningList}>
        <Spin spinning={loading}>
          {/* 移动端下拉选择器 */}
          <div className={styles.mobileFilterBar}>
            <Select
              value={activeSubTab}
              onChange={(value) => setActiveSubTab(value as SubTabKey)}
              options={mobileSelectOptions}
              className={styles.mobileSelect}
            />
          </div>

          <div className={styles.mobileContainer}>
            {currentData.length > 0 ? (
              currentData.map(renderMobileCard)
            ) : (
              !loading && <Empty description={emptyText} className={styles.empty} />
            )}
          </div>
        </Spin>
      </div>
    );
  }

  // 渲染桌面端表格视图
  return (
    <div className={styles.preWarningList}>
      <Spin spinning={loading}>
        <div className={styles.filterBar}>
          <Segmented
            value={activeSubTab}
            onChange={(value) => setActiveSubTab(value as SubTabKey)}
            options={filterOptions}
            className={styles.filterSegment}
            block
          />
        </div>
        <div className={styles.tableContainer}>
          {currentData.length > 0 ? (
            <Table
              columns={columns}
              dataSource={currentData}
              rowKey="id"
              pagination={false}
              size="small"
              scroll={{ x: 1000 }}
            />
          ) : (
            <Empty description={emptyText} className={styles.empty} />
          )}
        </div>
      </Spin>
    </div>
  );
};

export default PreWarningList;
