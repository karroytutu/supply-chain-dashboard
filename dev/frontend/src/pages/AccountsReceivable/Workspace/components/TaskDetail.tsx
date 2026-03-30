/**
 * 催收任务详情组件
 * 显示客户欠款信息、催收历史和推送记录
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Drawer, Card, Timeline, Spin, Empty, Image, Tag, Descriptions, List } from 'antd';
import {
  UserOutlined,
  DollarOutlined,
  CalendarOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  BellOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import type { ArDetail, ArActionLog, ArNotificationRecord, NotificationType } from '@/types/accounts-receivable';
import { getArDetail, getArNotifications } from '@/services/api/accounts-receivable';
import styles from './TaskDetail.less';

interface TaskDetailProps {
  arId: number | null;
  visible: boolean;
  onClose: () => void;
}

// 推送类型映射
const notificationTypeMap: Record<string, { text: string; color: string }> = {
  'pre_warn_5': { text: '5天预警', color: 'orange' },
  'pre_warn_2': { text: '2天预警', color: 'gold' },
  'overdue_collect': { text: '逾期催收', color: 'red' },
  'timeout_penalty': { text: '超时处罚', color: 'magenta' },
  'escalate': { text: '升级通知', color: 'purple' },
  'auto_escalate': { text: '自动升级', color: 'purple' },
  'pending_review': { text: '待审核通知', color: 'blue' },
  'review_result': { text: '审核结果', color: 'green' },
  'payment_confirmed': { text: '支付确认', color: 'green' },
  'guarantee_notify': { text: '担保通知', color: 'cyan' },
  'daily_summary': { text: '日报摘要', color: 'default' },
};

// 推送状态映射
const notificationStatusMap: Record<string, { text: string; color: string }> = {
  'pending': { text: '待发送', color: 'default' },
  'sent': { text: '已发送', color: 'success' },
  'failed': { text: '发送失败', color: 'error' },
};

const TaskDetail: React.FC<TaskDetailProps> = ({
  arId,
  visible,
  onClose,
}) => {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<ArDetail | null>(null);
  const [notifications, setNotifications] = useState<ArNotificationRecord[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  // 加载详情数据
  const loadDetail = useCallback(async (id: number) => {
    setLoading(true);
    try {
      const result = await getArDetail(id);
      setDetail(result);
    } catch (error) {
      console.error('加载详情失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 加载推送记录
  const loadNotifications = useCallback(async (id: number) => {
    setNotificationsLoading(true);
    try {
      const result = await getArNotifications(id);
      setNotifications(result.data || []);
    } catch (error) {
      console.error('加载推送记录失败:', error);
      setNotifications([]);
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (arId && visible) {
      loadDetail(arId);
      loadNotifications(arId);
    }
  }, [arId, visible, loadDetail, loadNotifications]);

  // 获取操作类型标签
  const getActionTag = (actionType: string) => {
    const actionMap: Record<string, { text: string; color: string; icon: React.ReactNode }> = {
      'create': { text: '创建', color: 'default', icon: <FileTextOutlined /> },
      'assign': { text: '分配', color: 'blue', icon: <UserOutlined /> },
      'collect': { text: '催收', color: 'orange', icon: <ExclamationCircleOutlined /> },
      'customer_delay': { text: '客户延期', color: 'cyan', icon: <CalendarOutlined /> },
      'guarantee_delay': { text: '担保延期', color: 'purple', icon: <UserOutlined /> },
      'paid_off': { text: '已回款', color: 'green', icon: <CheckCircleOutlined /> },
      'escalate': { text: '升级', color: 'red', icon: <ExclamationCircleOutlined /> },
      'review_approve': { text: '审核通过', color: 'green', icon: <CheckCircleOutlined /> },
      'review_reject': { text: '审核拒绝', color: 'red', icon: <CloseCircleOutlined /> },
    };
    
    const action = actionMap[actionType] || { text: actionType, color: 'default', icon: null };
    return (
      <Tag color={action.color} icon={action.icon}>
        {action.text}
      </Tag>
    );
  };

  // 获取推送类型标签
  const getNotificationTypeTag = (type: string) => {
    const typeInfo = notificationTypeMap[type] || { text: type, color: 'default' };
    return (
      <Tag color={typeInfo.color} icon={<BellOutlined />}>
        {typeInfo.text}
      </Tag>
    );
  };

  // 获取推送状态标签
  const getNotificationStatusTag = (status: string) => {
    const statusInfo = notificationStatusMap[status] || { text: status, color: 'default' };
    return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
  };

  // 格式化金额
  const formatAmount = (amount: number | string): string => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return `¥${num.toFixed(2)}`;
  };

  // 格式化日期
  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN');
  };

  return (
    <Drawer
      title="任务详情"
      placement="right"
      width={600}
      onClose={onClose}
      open={visible}
      className={styles.taskDetail}
    >
      <Spin spinning={loading}>
        {detail ? (
          <>
            {/* 客户欠款信息卡片 */}
            <Card title="客户欠款信息" className={styles.infoCard}>
              <Descriptions column={2} size="small">
                <Descriptions.Item label="客户名称">
                  {detail.receivable.consumer_name}
                </Descriptions.Item>
                <Descriptions.Item label="客户编码">
                  {detail.receivable.consumer_code}
                </Descriptions.Item>
                <Descriptions.Item label="欠款金额">
                  <span className={styles.amount}>{formatAmount(detail.receivable.left_amount)}</span>
                </Descriptions.Item>
                <Descriptions.Item label="逾期天数">
                  <span className={detail.receivable.overdue_days && detail.receivable.overdue_days > 0 ? styles.overdue : ''}>
                    {detail.receivable.overdue_days || 0} 天
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="营销师">
                  {detail.receivable.salesman_name}
                </Descriptions.Item>
                <Descriptions.Item label="部门">
                  {detail.receivable.dept_name}
                </Descriptions.Item>
                <Descriptions.Item label="到期日">
                  {detail.receivable.due_date}
                </Descriptions.Item>
                <Descriptions.Item label="结算方式">
                  {detail.receivable.settle_method === 1 ? '现结' : '挂账'}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            {/* 催收历史时间线 */}
            <Card title="催收历史" className={styles.timelineCard}>
              {detail.actionLogs.length > 0 ? (
                <Timeline mode="left">
                  {detail.actionLogs.map((log, index) => (
                    <Timeline.Item key={index}>
                      <div className={styles.timelineItem}>
                        <div className={styles.timelineHeader}>
                          {getActionTag(log.action_type)}
                          <span className={styles.timelineTime}>
                            {formatDate(log.created_at)}
                          </span>
                        </div>
                        <div className={styles.timelineContent}>
                          <p className={styles.operator}>
                            操作人: {log.operator_name}
                          </p>
                          {log.details && (
                            <div className={styles.details}>
                              {log.details.remark && (
                                <p>备注: {log.details.remark}</p>
                              )}
                              {log.details.latest_pay_date && (
                                <p>约定付款日: {log.details.latest_pay_date}</p>
                              )}
                              {log.details.evidence_url && (
                                <div className={styles.evidence}>
                                  <p>凭证:</p>
                                  <Image
                                    src={log.details.evidence_url}
                                    alt="凭证"
                                    width={120}
                                    height={80}
                                    style={{ objectFit: 'cover' }}
                                  />
                                </div>
                              )}
                              {log.details.signature_data && (
                                <div className={styles.signature}>
                                  <p>签名:</p>
                                  <Image
                                    src={log.details.signature_data}
                                    alt="签名"
                                    width={120}
                                    height={60}
                                    style={{ objectFit: 'contain' }}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </Timeline.Item>
                  ))}
                </Timeline>
              ) : (
                <Empty description="暂无催收记录" />
              )}
            </Card>

            {/* 推送历史卡片 */}
            <Card 
              title={
                <span>
                  <BellOutlined style={{ marginRight: 8 }} />
                  推送历史
                </span>
              } 
              className={styles.notificationCard}
            >
              <Spin spinning={notificationsLoading}>
                {notifications.length > 0 ? (
                  <List
                    dataSource={notifications}
                    renderItem={(item) => (
                      <List.Item className={styles.notificationItem}>
                        <div className={styles.notificationHeader}>
                          <div className={styles.notificationTitle}>
                            {getNotificationTypeTag(item.notification_type)}
                            <span className={styles.recipientName}>
                              {item.recipient_name || '-'}
                            </span>
                          </div>
                          <span className={styles.notificationTime}>
                            <ClockCircleOutlined style={{ marginRight: 4 }} />
                            {formatDate(item.created_at)}
                          </span>
                        </div>
                        <div className={styles.notificationMeta}>
                          {getNotificationStatusTag(item.status)}
                          <span className={styles.billCount}>
                            涉及 {item.bill_count} 单
                          </span>
                        </div>
                        {item.status === 'failed' && item.error_message && (
                          <div className={styles.errorMessage}>
                            错误信息: {item.error_message}
                          </div>
                        )}
                      </List.Item>
                    )}
                  />
                ) : (
                  <Empty description="暂无推送记录" />
                )}
              </Spin>
            </Card>
          </>
        ) : (
          <Empty description="暂无数据" />
        )}
      </Spin>
    </Drawer>
  );
};

export default TaskDetail;
