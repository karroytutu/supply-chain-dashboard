/**
 * 订单明细 Modal 组件
 * 用于展示预处理任务关联的订单明细及催收历史
 */
import React, { useState, useEffect } from 'react';
import {
  Modal,
  Descriptions,
  List,
  Timeline,
  Tag,
  Spin,
  Empty,
  Typography,
} from 'antd';
import {
  BellOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { PreprocessingTaskBillsResponse, ArActionLog } from '@/types/accounts-receivable';
import { getPreprocessingTaskBills } from '@/services/api/accounts-receivable';

const { Text } = Typography;

interface OrderDetailModalProps {
  visible: boolean;
  taskId: number | null;
  onCancel: () => void;
}

// 操作类型标签映射
const actionTypeMap: Record<string, { text: string; color: string; icon: React.ReactNode }> = {
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
  'sync': { text: '数据同步', color: 'default', icon: <FileTextOutlined /> },
  'preprocessing_start': { text: '开始预处理', color: 'blue', icon: <FileTextOutlined /> },
  'preprocessing_complete': { text: '完成预处理', color: 'green', icon: <CheckCircleOutlined /> },
  'task_assigned': { text: '任务分配', color: 'blue', icon: <UserOutlined /> },
  // 通知推送类型
  'pre_warn_5': { text: '逾期前5天预警', color: 'orange', icon: <BellOutlined /> },
  'pre_warn_2': { text: '逾期前2天预警', color: 'volcano', icon: <BellOutlined /> },
  'overdue_notify': { text: '逾期催收通知', color: 'red', icon: <ExclamationCircleOutlined /> },
  'overdue_collect': { text: '逾期催收通知', color: 'red', icon: <ExclamationCircleOutlined /> },
  'timeout_penalty': { text: '超时考核通知', color: 'magenta', icon: <ExclamationCircleOutlined /> },
  'auto_escalate': { text: '自动升级通知', color: 'purple', icon: <ExclamationCircleOutlined /> },
  'pending_review': { text: '待审核通知', color: 'blue', icon: <BellOutlined /> },
  'review_result': { text: '审核结果通知', color: 'cyan', icon: <BellOutlined /> },
  'payment_confirmed': { text: '回款确认通知', color: 'green', icon: <CheckCircleOutlined /> },
  'guarantee_notify': { text: '担保延期通知', color: 'purple', icon: <BellOutlined /> },
  'daily_summary': { text: '每日汇总', color: 'geekblue', icon: <BellOutlined /> },
  'pre_warn_aggregated': { text: '聚合预警', color: 'orange', icon: <BellOutlined /> },
  'escalate_notify': { text: '升级通知', color: 'red', icon: <ExclamationCircleOutlined /> },
};

// 逾期等级标签
const overdueLevelMap: Record<string, { text: string; color: string }> = {
  'normal': { text: '正常', color: 'default' },
  'medium': { text: '中度逾期', color: 'orange' },
  'severe': { text: '严重逾期', color: 'red' },
};

// 结算方式
const settleMethodMap: Record<number, string> = {
  1: '现金',
  2: '挂账',
};

const OrderDetailModal: React.FC<OrderDetailModalProps> = ({ visible, taskId, onCancel }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PreprocessingTaskBillsResponse | null>(null);
  const [selectedBillIndex, setSelectedBillIndex] = useState(0);

  // 获取订单明细
  useEffect(() => {
    if (!visible || !taskId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const result = await getPreprocessingTaskBills(taskId);
        setData(result);
        setSelectedBillIndex(0);
      } catch (error) {
        console.error('获取订单明细失败:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [visible, taskId]);

  // 格式化金额
  const formatAmount = (amount: number | string): string => {
    const numAmount = Number(amount);
    if (isNaN(numAmount)) return '¥0.00';
    return `¥${numAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;
  };

  // 格式化日期
  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN');
  };

  // 动态计算逾期天数（优先使用数据库值，异常时动态计算）
  const calculateOverdueDays = (dueDate: string | null, storedDays: number | null): number => {
    if (storedDays && storedDays > 0) return storedDays;
    if (!dueDate) return 0;
    const due = new Date(dueDate);
    const today = new Date();
    const diff = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  };

  // 格式化日期
  const formatDateTime = (dateStr: string | null): string => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN');
  };

  // 获取操作类型标签
  const getActionTag = (actionType: string, source?: string) => {
    const action = actionTypeMap[actionType] || { text: actionType, color: 'default', icon: null };
    return (
      <Tag color={action.color} icon={action.icon}>
        {action.text}
        {source === 'notification' && ' (推送)'}
      </Tag>
    );
  };

  // 渲染催收历史时间线
  const renderActionTimeline = (actionLogs: ArActionLog[]) => {
    if (!actionLogs || actionLogs.length === 0) {
      return <Empty description="暂无催收记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    }

    return (
      <Timeline mode="left">
        {actionLogs.map((log) => (
          <Timeline.Item key={log.id}>
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                {getActionTag(log.action_type, log.source)}
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {formatDateTime(log.created_at)}
                </Text>
              </div>
              <div style={{ fontSize: 13 }}>
                <Text type="secondary">
                  {log.source === 'notification' ? '接收人' : '操作人'}: {log.operator_name || '系统'}
                </Text>
                {log.details && (
                  <div style={{ marginTop: 4 }}>
                    {log.source === 'notification' && (
                      <>
                        {log.details.status && (
                          <Text type="secondary" style={{ display: 'block' }}>
                            状态: {log.details.status === 'sent' ? '已发送' : log.details.status}
                          </Text>
                        )}
                        {log.details.bill_count && (
                          <Text type="secondary" style={{ display: 'block' }}>
                            涉及单据: {log.details.bill_count} 张
                          </Text>
                        )}
                        {log.details.messageContent && (
                          <Text type="secondary" style={{ display: 'block' }}>
                            内容: {log.details.messageContent}
                          </Text>
                        )}
                      </>
                    )}
                    {log.source !== 'notification' && log.details.remark && (
                      <Text type="secondary" style={{ display: 'block' }}>
                        备注: {log.details.remark}
                      </Text>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Timeline.Item>
        ))}
      </Timeline>
    );
  };

  // 重置状态
  const handleCancel = () => {
    setData(null);
    setSelectedBillIndex(0);
    onCancel();
  };

  const selectedBill = data?.bills[selectedBillIndex];

  return (
    <Modal
      title="订单明细"
      open={visible}
      onCancel={handleCancel}
      width={960}
      footer={null}
      destroyOnClose
    >
      <Spin spinning={loading}>
        {data && (
          <>
            {/* 任务摘要 */}
            <Descriptions
              bordered
              size="small"
              column={3}
              style={{ marginBottom: 16 }}
            >
              <Descriptions.Item label="任务编号">{data.taskInfo.taskNo}</Descriptions.Item>
              <Descriptions.Item label="客户名称">{data.taskInfo.consumerName}</Descriptions.Item>
              <Descriptions.Item label="逾期等级">
                {overdueLevelMap[data.taskInfo.overdueLevel] && (
                  <Tag color={overdueLevelMap[data.taskInfo.overdueLevel].color}>
                    {overdueLevelMap[data.taskInfo.overdueLevel].text}
                  </Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="单据数">{data.taskInfo.billCount}</Descriptions.Item>
              <Descriptions.Item label="总金额">{formatAmount(data.taskInfo.totalAmount)}</Descriptions.Item>
            </Descriptions>

            {/* 主体：左右分栏 */}
            <div style={{ display: 'flex', gap: 16, maxHeight: '60vh', overflow: 'hidden' }}>
              {/* 左侧：订单列表 */}
              <div style={{ width: 300, borderRight: '1px solid #f0f0f0', paddingRight: 16 }}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>
                  订单列表
                </Text>
                <List
                  dataSource={data.bills}
                  renderItem={(bill, index) => (
                    <List.Item
                      onClick={() => setSelectedBillIndex(index)}
                      style={{
                        cursor: 'pointer',
                        padding: '8px 12px',
                        borderRadius: 4,
                        backgroundColor: index === selectedBillIndex ? '#e6f7ff' : 'transparent',
                        border: index === selectedBillIndex ? '1px solid #91d5ff' : '1px solid transparent',
                        marginBottom: 4,
                      }}
                    >
                      <div style={{ width: '100%' }}>
                        <Text strong style={{ fontSize: 13 }}>
                          {bill.receivable.erp_bill_id}
                        </Text>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {formatAmount(bill.receivable.left_amount)}
                          </Text>
                          <Text type="danger" style={{ fontSize: 12 }}>
                            逾期 {calculateOverdueDays(bill.receivable.due_date, bill.receivable.overdue_days)} 天
                          </Text>
                        </div>
                      </div>
                    </List.Item>
                  )}
                />
              </div>

              {/* 右侧：订单详情 + 催收历史 */}
              <div style={{ flex: 1, overflow: 'auto' }}>
                {selectedBill ? (
                  <>
                    {/* 订单基础信息 */}
                    <Descriptions
                      bordered
                      size="small"
                      column={2}
                      title={<Text strong>订单详情</Text>}
                      style={{ marginBottom: 16 }}
                    >
                      <Descriptions.Item label="ERP单据号">
                        {selectedBill.receivable.erp_bill_id}
                      </Descriptions.Item>
                      <Descriptions.Item label="订单号">
                        {selectedBill.receivable.order_no || '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="客户名称">
                        {selectedBill.receivable.consumer_name}
                      </Descriptions.Item>
                      <Descriptions.Item label="结算方式">
                        {selectedBill.receivable.settle_method
                          ? settleMethodMap[selectedBill.receivable.settle_method] || '-'
                          : '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="开票日期">
                        {formatDate(selectedBill.receivable.bill_order_time)}
                      </Descriptions.Item>
                      <Descriptions.Item label="到期日期">
                        {formatDate(selectedBill.receivable.due_date)}
                      </Descriptions.Item>
                      <Descriptions.Item label="欠款金额">
                        <Text type="danger">
                          {formatAmount(selectedBill.receivable.left_amount)}
                        </Text>
                      </Descriptions.Item>
                      <Descriptions.Item label="逾期天数">
                        <Text type="danger">
                          {calculateOverdueDays(selectedBill.receivable.due_date, selectedBill.receivable.overdue_days)} 天
                        </Text>
                      </Descriptions.Item>
                      <Descriptions.Item label="业务员">
                        {selectedBill.receivable.salesman_name || '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="部门">
                        {selectedBill.receivable.dept_name || '-'}
                      </Descriptions.Item>
                    </Descriptions>

                    {/* 催收历史 */}
                    <div style={{ marginTop: 16 }}>
                      <Text strong style={{ display: 'block', marginBottom: 8 }}>
                        催收历史
                      </Text>
                      {renderActionTimeline(selectedBill.actionLogs)}
                    </div>
                  </>
                ) : (
                  <Empty description="请选择订单" />
                )}
              </div>
            </div>
          </>
        )}

        {!loading && !data && taskId && (
          <Empty description="暂无订单数据" />
        )}
      </Spin>
    </Modal>
  );
};

export default OrderDetailModal;
