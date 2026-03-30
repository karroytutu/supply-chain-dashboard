/**
 * 催收任务详情组件
 * 显示客户欠款信息和催收历史
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Drawer, Card, Timeline, Spin, Empty, Image, Tag, Descriptions } from 'antd';
import {
  UserOutlined,
  DollarOutlined,
  CalendarOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  BellOutlined,
} from '@ant-design/icons';
import type { ArDetail, ArActionLog } from '@/types/accounts-receivable';
import { getArDetail } from '@/services/api/accounts-receivable';
import styles from './TaskDetail.less';

interface TaskDetailProps {
  arId: number | null;
  visible: boolean;
  onClose: () => void;
}

const TaskDetail: React.FC<TaskDetailProps> = ({
  arId,
  visible,
  onClose,
}) => {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<ArDetail | null>(null);

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

  useEffect(() => {
    if (arId && visible) {
      loadDetail(arId);
    }
  }, [arId, visible, loadDetail]);

  // 获取操作类型标签
  const getActionTag = (actionType: string, source?: string) => {
    const actionMap: Record<string, { text: string; color: string; icon: React.ReactNode }> = {
      // 操作日志类型
      'create': { text: '创建', color: 'default', icon: <FileTextOutlined /> },
      'assign': { text: '分配', color: 'blue', icon: <UserOutlined /> },
      'collect': { text: '催收', color: 'orange', icon: <ExclamationCircleOutlined /> },
      'customer_delay': { text: '客户延期', color: 'cyan', icon: <CalendarOutlined /> },
      'guarantee_delay': { text: '担保延期', color: 'purple', icon: <UserOutlined /> },
      'paid_off': { text: '已回款', color: 'green', icon: <CheckCircleOutlined /> },
      'escalate': { text: '升级', color: 'red', icon: <ExclamationCircleOutlined /> },
      'review_approve': { text: '审核通过', color: 'green', icon: <CheckCircleOutlined /> },
      'review_reject': { text: '审核拒绝', color: 'red', icon: <CloseCircleOutlined /> },
      // 通知推送类型
      'pre_warn_5': { text: '逾期前5天预警', color: 'orange', icon: <BellOutlined /> },
      'pre_warn_2': { text: '逾期前2天预警', color: 'volcano', icon: <BellOutlined /> },
      'overdue_collect': { text: '逾期催收通知', color: 'red', icon: <ExclamationCircleOutlined /> },
      'timeout_penalty': { text: '超时考核通知', color: 'magenta', icon: <ExclamationCircleOutlined /> },
      'auto_escalate': { text: '自动升级通知', color: 'purple', icon: <ExclamationCircleOutlined /> },
      'pending_review': { text: '待审核通知', color: 'blue', icon: <BellOutlined /> },
      'review_result': { text: '审核结果通知', color: 'cyan', icon: <BellOutlined /> },
      'payment_confirmed': { text: '回款确认通知', color: 'green', icon: <CheckCircleOutlined /> },
      'guarantee_notify': { text: '担保延期通知', color: 'purple', icon: <BellOutlined /> },
      'daily_summary': { text: '每日汇总', color: 'geekblue', icon: <BellOutlined /> },
    };

    const action = actionMap[actionType] || { text: actionType, color: 'default', icon: null };
    return (
      <Tag color={action.color} icon={action.icon}>
        {action.text}
        {source === 'notification' && ' (推送)'}
      </Tag>
    );
  };

  // 格式化金额
  const formatAmount = (amount: number | string): string => {
    const numAmount = Number(amount);
    if (isNaN(numAmount)) return '¥0.00';
    return `¥${numAmount.toFixed(2)}`;
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
                    <Timeline.Item key={log.id || index}>
                      <div className={styles.timelineItem}>
                        <div className={styles.timelineHeader}>
                          {getActionTag(log.action_type, log.source)}
                          <span className={styles.timelineTime}>
                            {formatDate(log.created_at)}
                          </span>
                        </div>
                        <div className={styles.timelineContent}>
                          <p className={styles.operator}>
                            {log.source === 'notification' ? '接收人' : '操作人'}: {log.operator_name || '系统'}
                          </p>
                          {log.details && (
                            <div className={styles.details}>
                              {/* 通知记录详情 */}
                              {log.source === 'notification' && (
                                <>
                                  {log.details.status && (
                                    <p>状态: {log.details.status === 'sent' ? '已发送' : log.details.status}</p>
                                  )}
                                  {log.details.bill_count && (
                                    <p>涉及单据: {log.details.bill_count} 张</p>
                                  )}
                                </>
                              )}
                              {/* 操作记录详情 */}
                              {log.source !== 'notification' && (
                                <>
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
                                </>
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
          </>
        ) : (
          <Empty description="暂无数据" />
        )}
      </Spin>
    </Drawer>
  );
};

export default TaskDetail;
