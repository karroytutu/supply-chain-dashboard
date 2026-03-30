/**
 * 催收任务列表组件
 * 桌面端：表格布局
 * 移动端：卡片视图 + 无限滚动
 */
import React, { useState, useEffect, useCallback, useRef, useContext } from 'react';
import { Table, Button, Empty, Spin, Tag, Tooltip, Dropdown, message } from 'antd';
import type { MenuProps } from 'antd';
import {
  ExclamationCircleFilled,
  ClockCircleOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { ArCollectionTask } from '@/types/accounts-receivable';
import { getMyTasks, submitCollectionResult } from '@/services/api/accounts-receivable';
import { WorkspaceContext } from '../index';
import styles from './CollectionTaskList.less';

interface CollectionTaskListProps {
  onTaskClick: (task: ArCollectionTask, action?: 'guarantee' | 'paidOff' | 'escalate') => void;
  onViewDetail: (arId: number) => void;
  onRefresh?: () => void;
}

// 快捷日期选项配置
const QUICK_DATE_OPTIONS = [
  { label: '明天', days: 1 },
  { label: '3天后', days: 3 },
  { label: '7天后', days: 7 },
];

const CollectionTaskList: React.FC<CollectionTaskListProps> = ({
  onTaskClick,
  onViewDetail,
  onRefresh,
}) => {
  const { isMobile } = useContext(WorkspaceContext);
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<ArCollectionTask[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  
  // 无限滚动相关状态
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // 加载任务数据
  const loadTasks = useCallback(async (pageNum: number = page, append: boolean = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    
    try {
      const result = await getMyTasks({ page: pageNum, pageSize });
      const newTasks = result.list || [];
      
      if (append) {
        setTasks(prev => [...prev, ...newTasks]);
      } else {
        setTasks(newTasks);
      }
      
      setTotal(result.total || 0);
      setHasMore(newTasks.length === pageSize && (pageNum * pageSize) < (result.total || 0));
    } catch (error) {
      console.error('加载催收任务失败:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [page, pageSize]);

  // 加载更多
  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    loadTasks(nextPage, true);
  }, [hasMore, loadingMore, page, loadTasks]);

  // 无限滚动检测
  useEffect(() => {
    if (!isMobile || !loadMoreRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          handleLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [isMobile, hasMore, loadingMore, handleLoadMore]);

  useEffect(() => {
    loadTasks();
  }, []);

  // 格式化金额
  const formatAmount = (amount?: number): string => {
    if (amount === undefined || amount === null) return '¥0.00';
    return `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;
  };

  // 判断是否已超时
  const isTimeout = (task: ArCollectionTask): boolean => {
    return (task.timeout_days || 0) > 0 || (task.remaining_hours || 0) <= 0;
  };

  // 获取剩余时间显示
  const getRemainingTimeDisplay = (task: ArCollectionTask): { text: string; isWarning: boolean } => {
    const timeoutDays = task.timeout_days || 0;
    const remainingHours = task.remaining_hours || 0;

    if (timeoutDays > 0 || remainingHours <= 0) {
      return { text: `超时 ${timeoutDays} 天`, isWarning: true };
    }

    if (remainingHours < 24) {
      return { text: `剩余 ${remainingHours} 小时`, isWarning: true };
    }

    const days = Math.floor(remainingHours / 24);
    return { text: `剩余 ${days} 天`, isWarning: false };
  };

  // 计算快捷日期
  const getQuickDate = (days: number): string => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  };

  // 格式化日期显示
  const formatDateDisplay = (dateStr: string): string => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  // 快速提交客户延期
  const handleQuickDelay = async (task: ArCollectionTask, days: number) => {
    const payDate = getQuickDate(days);
    setSubmittingId(task.id);

    try {
      await submitCollectionResult(task.ar_id, {
        resultType: 'customer_delay',
        latestPayDate: payDate,
      });
      message.success(`已提交延期至 ${formatDateDisplay(payDate)}`);
      // 刷新列表
      loadTasks();
      onRefresh?.();
    } catch (error) {
      console.error('提交延期失败:', error);
      message.error('提交失败，请重试');
    } finally {
      setSubmittingId(null);
    }
  };

  // 状态映射
  const statusMap: Record<string, { text: string; color: string }> = {
    pending: { text: '待处理', color: 'blue' },
    in_progress: { text: '处理中', color: 'orange' },
    completed: { text: '已完成', color: 'green' },
    timeout: { text: '已超时', color: 'red' },
    escalated: { text: '已升级', color: 'purple' },
  };

  // 获取延期下拉菜单项
  const getDelayMenuItems = (task: ArCollectionTask): MenuProps['items'] => {
    const quickDateItems = QUICK_DATE_OPTIONS.map((option) => ({
      key: `quick-${option.days}`,
      label: (
        <div className={styles.menuItem}>
          <span>{option.label}</span>
          <span className={styles.menuItemDate}>{formatDateDisplay(getQuickDate(option.days))}</span>
        </div>
      ),
      onClick: () => handleQuickDelay(task, option.days),
    }));

    return [
      {
        type: 'group',
        label: '客户确认延期',
        children: quickDateItems,
      },
      {
        key: 'custom',
        label: '自定义日期...',
        onClick: () => onTaskClick(task),
      },
      { type: 'divider' },
      {
        key: 'guarantee',
        label: (
          <div className={styles.menuItem}>
            <SafetyCertificateOutlined style={{ marginRight: 8 }} />
            营销担保延期
          </div>
        ),
        onClick: () => onTaskClick(task, 'guarantee'),
      },
    ];
  };

  // 表格列定义
  const columns: ColumnsType<ArCollectionTask> = [
    {
      title: '客户名称',
      dataIndex: 'consumer_name',
      key: 'consumer_name',
      width: 140,
      fixed: 'left',
      ellipsis: true,
      render: (text: string, record) => {
        const timeout = isTimeout(record);
        return (
          <span className={`${styles.consumerName} ${timeout ? styles.timeoutText : ''}`}>
            {timeout && (
              <Tooltip title="已超时">
                <ExclamationCircleFilled className={styles.timeoutIcon} />
              </Tooltip>
            )}
            <a onClick={() => onViewDetail(record.ar_id)}>{text}</a>
          </span>
        );
      },
    },
    {
      title: '订单号',
      dataIndex: 'order_no',
      key: 'order_no',
      width: 130,
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={text}>
          <span className={styles.orderNo}>{text || '-'}</span>
        </Tooltip>
      ),
    },
    {
      title: '欠款金额',
      dataIndex: 'owed_amount',
      key: 'owed_amount',
      width: 110,
      align: 'right',
      render: (amount: number) => (
        <span className={styles.amount}>{formatAmount(amount)}</span>
      ),
    },
    {
      title: '逾期天数',
      dataIndex: 'overdue_days',
      key: 'overdue_days',
      width: 90,
      align: 'center',
      render: (days: number, record) => {
        const timeout = isTimeout(record);
        return (
          <span className={timeout ? styles.overdue : ''}>
            {days || 0} 天
          </span>
        );
      },
    },
    {
      title: '催收状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      align: 'center',
      render: (status: string) => {
        const config = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '剩余时间',
      key: 'remaining_time',
      width: 100,
      render: (_: unknown, record) => {
        const { text, isWarning } = getRemainingTimeDisplay(record);
        return (
          <span className={isWarning ? styles.warningText : ''}>
            <ClockCircleOutlined style={{ marginRight: 4 }} />
            {text}
          </span>
        );
      },
    },
    {
      title: '快速操作',
      key: 'quick_action',
      width: 180,
      fixed: 'right',
      render: (_: unknown, record) => {
        const isSubmitting = submittingId === record.id;

        return (
          <div className={styles.quickActions}>
            <Dropdown
              menu={{ items: getDelayMenuItems(record) }}
              trigger={['click']}
              disabled={isSubmitting}
            >
              <Button
                type="primary"
                size="small"
                loading={isSubmitting}
                className={styles.delayBtn}
              >
                延期 <span className={styles.dropdownArrow}>▾</span>
              </Button>
            </Dropdown>
            <Button
              size="small"
              className={styles.paidOffBtn}
              onClick={() => onTaskClick(record, 'paidOff')}
            >
              已回款
            </Button>
            <Button
              size="small"
              className={styles.escalateBtn}
              onClick={() => onTaskClick(record, 'escalate')}
            >
              升级
            </Button>
          </div>
        );
      },
    },
  ];

  // 渲染移动端卡片
  const renderMobileCard = (task: ArCollectionTask) => {
    const timeout = isTimeout(task);
    const { text: timeText, isWarning } = getRemainingTimeDisplay(task);
    const statusConfig = statusMap[task.status] || { text: task.status, color: 'default' };
    const isSubmitting = submittingId === task.id;

    return (
      <div
        key={task.id}
        className={`${styles.mobileCard} ${timeout ? styles.mobileCardTimeout : ''}`}
        onClick={() => onViewDetail(task.ar_id)}
      >
        <div className={styles.mobileCardHeader}>
          <div className={styles.mobileCardTitle}>
            {timeout && <ExclamationCircleFilled className={styles.timeoutIcon} />}
            <span>{task.consumer_name}</span>
          </div>
          <Tag color={statusConfig.color}>{statusConfig.text}</Tag>
        </div>
        
        <div className={styles.mobileCardInfo}>
          <div className={styles.mobileInfoItem}>
            <span className={styles.mobileInfoLabel}>欠款金额</span>
            <span className={styles.mobileInfoValueAmount}>{formatAmount(task.owed_amount)}</span>
          </div>
          <div className={styles.mobileInfoItem}>
            <span className={styles.mobileInfoLabel}>逾期/剩余</span>
            <span className={`${styles.mobileInfoValue} ${isWarning ? styles.warningText : ''}`}>
              {task.overdue_days || 0}天 / {timeText}
            </span>
          </div>
        </div>

        <div className={styles.mobileCardActions} onClick={(e) => e.stopPropagation()}>
          <Dropdown
            menu={{ items: getDelayMenuItems(task) }}
            trigger={['click']}
            disabled={isSubmitting}
          >
            <Button type="primary" loading={isSubmitting} className={styles.mobileActionBtn}>
              延期 ▾
            </Button>
          </Dropdown>
          <Button
            className={styles.mobileActionBtn}
            onClick={() => onTaskClick(task, 'paidOff')}
          >
            已回款
          </Button>
          <Button
            className={styles.mobileActionBtn}
            onClick={() => onTaskClick(task, 'escalate')}
          >
            升级
          </Button>
        </div>
      </div>
    );
  };

  // 渲染移动端视图
  if (isMobile) {
    return (
      <div className={styles.collectionTaskList}>
        <div className={styles.mobileContainer}>
          <Spin spinning={loading && tasks.length === 0}>
            {tasks.length > 0 ? (
              <>
                {tasks.map(renderMobileCard)}
                <div ref={loadMoreRef} className={styles.loadMoreTrigger}>
                  {loadingMore && <Spin size="small" />}
                  {!hasMore && tasks.length > 0 && (
                    <span className={styles.noMore}>已加载全部 {total} 条记录</span>
                  )}
                </div>
              </>
            ) : (
              !loading && (
                <Empty description="暂无催收任务" className={styles.empty}>
                  <Button type="primary" onClick={() => loadTasks()}>
                    刷新
                  </Button>
                </Empty>
              )
            )}
          </Spin>
        </div>
      </div>
    );
  }

  // 渲染桌面端表格视图
  return (
    <div className={styles.collectionTaskList}>
      <div className={styles.tableContainer}>
        <Spin spinning={loading}>
          {tasks.length > 0 ? (
            <Table
              columns={columns}
              dataSource={tasks}
              rowKey="id"
              pagination={{
                current: page,
                pageSize,
                total,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (t) => `共 ${t} 条记录`,
                onChange: (p) => {
                  setPage(p);
                  loadTasks(p, false);
                },
              }}
              rowClassName={(record) =>
                isTimeout(record) ? styles.timeoutRow : ''
              }
              scroll={{ x: 850 }}
              size="small"
            />
          ) : (
            <Empty
              description="暂无催收任务"
              className={styles.empty}
            >
              <Button type="primary" onClick={() => loadTasks()}>
                刷新
              </Button>
            </Empty>
          )}
        </Spin>
      </div>
    </div>
  );
};

export default CollectionTaskList;
