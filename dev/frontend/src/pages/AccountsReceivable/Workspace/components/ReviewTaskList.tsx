/**
 * 审核任务列表组件
 * 包含财务审核和出纳核实两个子Tab
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Tabs,
  Button,
  Empty,
  Spin,
  Tag,
  Image,
  Modal,
  Input,
  message,
} from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  FileImageOutlined,
  EditOutlined,
} from '@ant-design/icons';
import type { ArCollectionTask } from '@/types/accounts-receivable';
import { getReviewTasks, reviewTask } from '@/services/api/accounts-receivable';
import styles from './ReviewTaskList.less';

interface ReviewTaskListProps {
  onViewDetail: (arId: number) => void;
}

type ReviewType = 'finance_review' | 'cashier_verify';

const ReviewTaskList: React.FC<ReviewTaskListProps> = ({ onViewDetail }) => {
  const [activeTab, setActiveTab] = useState<ReviewType>('finance_review');
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<ArCollectionTask[]>([]);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [currentTask, setCurrentTask] = useState<ArCollectionTask | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 加载审核任务
  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getReviewTasks({
        reviewType: activeTab,
        page: 1,
        pageSize: 50,
      });
      setTasks(result.list);
    } catch (error) {
      console.error('加载审核任务失败:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // 处理审核通过
  const handleApprove = async (task: ArCollectionTask) => {
    setSubmitting(true);
    try {
      await reviewTask(task.ar_id, {
        taskId: task.id,
        action: 'approve',
      });
      message.success('审核通过');
      loadTasks();
    } catch (error) {
      message.error('操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 打开拒绝弹窗
  const openRejectModal = (task: ArCollectionTask) => {
    setCurrentTask(task);
    setRejectReason('');
    setRejectModalVisible(true);
  };

  // 处理审核拒绝
  const handleReject = async () => {
    if (!currentTask) return;
    if (!rejectReason.trim()) {
      message.warning('请填写拒绝理由');
      return;
    }

    setSubmitting(true);
    try {
      await reviewTask(currentTask.ar_id, {
        taskId: currentTask.id,
        action: 'reject',
        comment: rejectReason,
      });
      message.success('已拒绝');
      setRejectModalVisible(false);
      loadTasks();
    } catch (error) {
      message.error('操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 格式化金额
  const formatAmount = (amount?: number): string => {
    if (amount === undefined) return '¥0.00';
    return `¥${amount.toFixed(2)}`;
  };

  // 渲染审核卡片
  const renderTaskCard = (task: ArCollectionTask) => (
    <Card
      key={task.id}
      className={styles.reviewCard}
      hoverable
      onClick={() => onViewDetail(task.ar_id)}
    >
      {/* 卡片头部 */}
      <div className={styles.cardHeader}>
        <div className={styles.consumerName}>{task.consumer_name}</div>
        <Tag color={activeTab === 'finance_review' ? 'blue' : 'green'}>
          {activeTab === 'finance_review' ? '财务审核' : '出纳核实'}
        </Tag>
      </div>

      {/* 欠款信息 */}
      <div className={styles.infoSection}>
        <div className={styles.infoItem}>
          <span className={styles.label}>欠款金额</span>
          <span className={`${styles.value} ${styles.amount}`}>
            {formatAmount(task.left_amount)}
          </span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.label}>提交人</span>
          <span className={styles.value}>{task.collector_name}</span>
        </div>
      </div>

      {/* 延期信息 */}
      {task.latest_pay_date && (
        <div className={styles.delayInfo}>
          <div className={styles.delayItem}>
            <span className={styles.label}>约定付款日</span>
            <span className={styles.value}>{task.latest_pay_date}</span>
          </div>
        </div>
      )}

      {/* 凭证/签名预览 */}
      {(task.evidence_url || task.signature_data) && (
        <div className={styles.evidenceSection}>
          {task.evidence_url && (
            <div className={styles.evidenceItem}>
              <span className={styles.label}>
                <FileImageOutlined /> 凭证
              </span>
              <Image
                src={task.evidence_url}
                alt="凭证"
                width={80}
                height={60}
                style={{ objectFit: 'cover', borderRadius: 4 }}
              />
            </div>
          )}
          {task.signature_data && (
            <div className={styles.evidenceItem}>
              <span className={styles.label}>
                <EditOutlined /> 签名
              </span>
              <Image
                src={task.signature_data}
                alt="签名"
                width={80}
                height={60}
                style={{ objectFit: 'contain', borderRadius: 4 }}
              />
            </div>
          )}
        </div>
      )}

      {/* 操作按钮 */}
      <div className={styles.actions}>
        <Button
          danger
          icon={<CloseOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            openRejectModal(task);
          }}
          loading={submitting}
        >
          拒绝
        </Button>
        <Button
          type="primary"
          icon={<CheckOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            handleApprove(task);
          }}
          loading={submitting}
        >
          通过
        </Button>
      </div>
    </Card>
  );

  return (
    <div className={styles.reviewTaskList}>
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as ReviewType)}
        className={styles.tabs}
      >
        <Tabs.TabPane tab="财务审核" key="finance_review" />
        <Tabs.TabPane tab="出纳核实" key="cashier_verify" />
      </Tabs>

      <Spin spinning={loading}>
        {tasks.length > 0 ? (
          <div className={styles.taskGrid}>
            {tasks.map(renderTaskCard)}
          </div>
        ) : (
          <Empty
            description={`暂无${activeTab === 'finance_review' ? '财务审核' : '出纳核实'}任务`}
            className={styles.empty}
          />
        )}
      </Spin>

      {/* 拒绝理由弹窗 */}
      <Modal
        title="填写拒绝理由"
        open={rejectModalVisible}
        onOk={handleReject}
        onCancel={() => setRejectModalVisible(false)}
        confirmLoading={submitting}
      >
        <Input.TextArea
          rows={4}
          placeholder="请填写拒绝理由"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
        />
      </Modal>
    </div>
  );
};

export default ReviewTaskList;
