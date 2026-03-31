/**
 * 客户催收任务列表组件
 * 桌面端：可展开表格布局
 * 移动端：卡片视图 + 展开
 */
import React, { useState, useEffect, useCallback, useRef, useContext } from 'react';
import { Table, Button, Empty, Spin, Tag, Tooltip, Dropdown, message, Collapse } from 'antd';
import type { MenuProps } from 'antd';
import {
  ExclamationCircleFilled,
  ClockCircleOutlined,
  SafetyCertificateOutlined,
  DownOutlined,
  RightOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { ArCustomerCollectionTask, CustomerTaskBill } from '@/types/accounts-receivable';
import {
  getCustomerTasks,
  getCustomerTaskDetail,
  submitCustomerCollectResult,
  quickDelayCustomerTask,
} from '@/services/api/accounts-receivable';
import { WorkspaceContext } from '../index';
import styles from './CustomerTaskList.less';

interface CustomerTaskListProps {
  onTaskClick: (task: ArCustomerCollectionTask, action?: 'guarantee' | 'paidOff' | 'escalate') => void;
  onViewDetail: (arId: number) => void;
  onRefresh?: () => void;
}

// 快捷日期选项配置
const QUICK_DATE_OPTIONS = [
  { label: '明天', days: 1 },
  { label: '3天后', days: 3 },
  { label: '7天后', days: 7 },
];

const CustomerTaskList: React.FC<CustomerTaskListProps> = ({
  onTaskClick,
  onViewDetail,
  onRefresh,
}) => {
  const { isMobile } = useContext(WorkspaceContext);
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<ArCustomerCollectionTask[]>([]);
  const [expandedRowKeys, setExpandedRowKeys] = useState<number[]>([]);
  const [taskBills, setTaskBills] = useState<Record<number, CustomerTaskBill[]>>({});
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
      const response = await getCustomerTasks({ page: pageNum, pageSize });
      const result = response.data || response;
      const newTasks = result.list || [];

      if (append) {
        setTasks(prev => [...prev, ...newTasks]);
      } else {
        setTasks(newTasks);
      }

      setTotal(result.total || 0);
      setHasMore(newTasks.length === pageSize && (pageNum * pageSize) < (result.total || 0));
    } catch (error) {
      console.error('加载客户催收任务失败:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [page, pageSize]);

  // 加载任务单据明细
  const loadTaskBills = async (taskId: number) => {
    if (taskBills[taskId]) return; // 已缓存

    try {
      const response = await getCustomerTaskDetail(taskId);
      const detail = response.data || response;
      setTaskBills(prev => ({ ...prev, [taskId]: detail.bills || [] }));
    } catch (error) {
      console.error('加载任务单据明细失败:', error);
    }
  };

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
  const isTimeout = (task: ArCustomerCollectionTask): boolean => {
    return (task.timeout_days || 0) > 0 || (task.remaining_hours || 0) <= 0;
  };

  // 获取剩余时间显示
  const getRemainingTimeDisplay = (task: ArCustomerCollectionTask): { text: string; isWarning: boolean } => {
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

  // 快速提交延期
  const handleQuickDelay = async (task: ArCustomerCollectionTask, days: number) => {
    setSubmittingId(task.id);

    try {
      await quickDelayCustomerTask(task.id, { days });
      message.success(`已延期至 ${formatDateDisplay(getQuickDate(days))}`);
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
  const getDelayMenuItems = (task: ArCustomerCollectionTask): MenuProps['items'] => {
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

  // 表格展开行配置
  const expandableConfig = {
    expandedRowKeys,
    onExpand: async (expanded: boolean, record: ArCustomerCollectionTask) => {
      if (expanded) {
        setExpandedRowKeys([record.id]);
        await loadTaskBills(record.id);
      } else {
        setExpandedRowKeys([]);
      }
    },
    expandedRowRender: (record: ArCustomerCollectionTask) => {
      const bills = taskBills[record.id] || [];
      if (bills.length === 0) return <Spin size="small" />;

      const billColumns: ColumnsType<CustomerTaskBill> = [
        {
          title: '单据号',
          dataIndex: 'erp_bill_id',
          key: 'erp_bill_id',
          width: 130,
          render: (text: string, bill) => (
            <a onClick={() => onViewDetail(bill.ar_id)}>{text}</a>
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
          title: '欠款金额',
          dataIndex: 'left_amount',
          key: 'left_amount',
          width: 100,
          align: 'right' as const,
          render: (v: number) => formatAmount(v),
        },
        {
          title: '逾期天数',
          dataIndex: 'overdue_days',
          key: 'overdue_days',
          width: 80,
          align: 'center' as const,
          render: (v: number) => `${v || 0} 天`,
        },
        {
          title: '到期日',
          dataIndex: 'due_date',
          key: 'due_date',
          width: 100,
          render: (v: string) => v?.substring(0, 10) || '-',
        },
      ];

      return (
        <Table
          columns={billColumns}
          dataSource={bills}
          rowKey="ar_id"
          pagination={false}
          size="small"
          className={styles.billsTable}
        />
      );
    },
    expandIcon: ({ expanded, onExpand, record }) => (
      <Button
        type="text"
        size="small"
        className={styles.expandBtn}
        onClick={(e) => onExpand(record, e)}
      >
        {expanded ? <DownOutlined /> : <RightOutlined />}
        <span className={styles.billCount}>{record.bill_count}单</span>
      </Button>
    ),
  };

  // 表格列定义
  const columns: ColumnsType<ArCustomerCollectionTask> = [
    {
      title: '客户名称',
      dataIndex: 'consumer_name',
      key: 'consumer_name',
      width: 160,
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
            {text}
          </span>
        );
      },
    },
    {
      title: '欠款总额',
      dataIndex: 'total_amount',
      key: 'total_amount',
      width: 120,
      align: 'right',
      render: (amount: number) => (
        <span className={styles.amount}>{formatAmount(amount)}</span>
      ),
    },
    {
      title: '单据数',
      dataIndex: 'bill_count',
      key: 'bill_count',
      width: 80,
      align: 'center',
      render: (count: number) => <Tag>{count} 单</Tag>,
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
      width: 200,
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
  const renderMobileCard = (task: ArCustomerCollectionTask) => {
    const timeout = isTimeout(task);
    const { text: timeText, isWarning } = getRemainingTimeDisplay(task);
    const statusConfig = statusMap[task.status] || { text: task.status, color: 'default' };
    const isSubmitting = submittingId === task.id;
    const isExpanded = expandedRowKeys.includes(task.id);
    const bills = taskBills[task.id] || [];

    return (
      <div
        key={task.id}
        className={`${styles.mobileCard} ${timeout ? styles.mobileCardTimeout : ''}`}
      >
        <div
          className={styles.mobileCardHeader}
          onClick={async () => {
            if (isExpanded) {
              setExpandedRowKeys([]);
            } else {
              setExpandedRowKeys([task.id]);
              await loadTaskBills(task.id);
            }
          }}
        >
          <div className={styles.mobileCardTitle}>
            {timeout && <ExclamationCircleFilled className={styles.timeoutIcon} />}
            <span>{task.consumer_name}</span>
            <Tag color="blue" className={styles.billTag}>{task.bill_count}单</Tag>
          </div>
          <Tag color={statusConfig.color}>{statusConfig.text}</Tag>
        </div>

        <div className={styles.mobileCardInfo}>
          <div className={styles.mobileInfoItem}>
            <span className={styles.mobileInfoLabel}>欠款总额</span>
            <span className={styles.mobileInfoValueAmount}>{formatAmount(task.total_amount)}</span>
          </div>
          <div className={styles.mobileInfoItem}>
            <span className={styles.mobileInfoLabel}>剩余时间</span>
            <span className={`${styles.mobileInfoValue} ${isWarning ? styles.warningText : ''}`}>
              {timeText}
            </span>
          </div>
        </div>

        {/* 展开的单据列表 */}
        {isExpanded && bills.length > 0 && (
          <div className={styles.mobileBillsList}>
            {bills.map((bill) => (
              <div
                key={bill.ar_id}
                className={styles.mobileBillItem}
                onClick={() => onViewDetail(bill.ar_id)}
              >
                <div className={styles.mobileBillHeader}>
                  <span className={styles.mobileBillNo}>{bill.erp_bill_id}</span>
                  <span className={styles.mobileBillAmount}>{formatAmount(bill.left_amount)}</span>
                </div>
                <div className={styles.mobileBillMeta}>
                  <span>逾期 {bill.overdue_days || 0} 天</span>
                  <span>{bill.due_date?.substring(0, 10)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

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
      <div className={styles.customerTaskList}>
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
    <div className={styles.customerTaskList}>
      <div className={styles.tableContainer}>
        <Spin spinning={loading}>
          {tasks.length > 0 ? (
            <Table
              columns={columns}
              dataSource={tasks}
              rowKey="id"
              expandable={expandableConfig}
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
              scroll={{ x: 900 }}
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

export default CustomerTaskList;
