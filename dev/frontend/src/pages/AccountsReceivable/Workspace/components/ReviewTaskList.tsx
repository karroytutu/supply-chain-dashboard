/**
 * 审核任务列表组件
 * 包含财务审核和出纳核实筛选
 * 支持批量审核操作
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Segmented,
  Button,
  Empty,
  Spin,
  Tag,
  Image,
  Modal,
  Input,
  message,
  Checkbox,
  Space,
} from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  FileImageOutlined,
  EditOutlined,
  AuditOutlined,
  DollarOutlined,
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
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [currentTask, setCurrentTask] = useState<ArCollectionTask | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [batchMode, setBatchMode] = useState(false);

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
      setSelectedIds([]);
    } catch (error) {
      console.error('加载审核任务失败:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // 切换Tab时重置选择
  useEffect(() => {
    setSelectedIds([]);
    setBatchMode(false);
  }, [activeTab]);

  // 处理单个审核通过
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
  const openRejectModal = (task: ArCollectionTask | null = null) => {
    setCurrentTask(task);
    setRejectReason('');
    setRejectModalVisible(true);
  };

  // 处理审核拒绝
  const handleReject = async () => {
    if (!rejectReason.trim()) {
      message.warning('请填写拒绝理由');
      return;
    }

    setSubmitting(true);
    try {
      if (currentTask) {
        // 单个拒绝
        await reviewTask(currentTask.ar_id, {
          taskId: currentTask.id,
          action: 'reject',
          comment: rejectReason,
        });
        message.success('已拒绝');
      } else if (selectedIds.length > 0) {
        // 批量拒绝
        const selectedTasks = tasks.filter(t => selectedIds.includes(t.id));
        await Promise.all(
          selectedTasks.map(task =>
            reviewTask(task.ar_id, {
              taskId: task.id,
              action: 'reject',
              comment: rejectReason,
            })
          )
        );
        message.success(`已拒绝 ${selectedIds.length} 个任务`);
      }
      setRejectModalVisible(false);
      setSelectedIds([]);
      loadTasks();
    } catch (error) {
      message.error('操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 批量通过
  const handleBatchApprove = async () => {
    if (selectedIds.length === 0) {
      message.warning('请选择要审核的任务');
      return;
    }

    setSubmitting(true);
    try {
      const selectedTasks = tasks.filter(t => selectedIds.includes(t.id));
      await Promise.all(
        selectedTasks.map(task =>
          reviewTask(task.ar_id, {
            taskId: task.id,
            action: 'approve',
          })
        )
      );
      message.success(`已通过 ${selectedIds.length} 个任务`);
      setSelectedIds([]);
      loadTasks();
    } catch (error) {
      message.error('操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 全选/取消全选
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(tasks.map(t => t.id));
    } else {
      setSelectedIds([]);
    }
  };

  // 选择单个任务
  const handleSelectTask = (taskId: number, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, taskId]);
    } else {
      setSelectedIds(selectedIds.filter(id => id !== taskId));
    }
  };

  // 格式化金额
  const formatAmount = (amount?: number): string => {
    if (amount === undefined) return '¥0.00';
    return `¥${amount.toFixed(2)}`;
  };

  // 渲染审核卡片
  const renderTaskCard = (task: ArCollectionTask) => {
    const isSelected = selectedIds.includes(task.id);

    return (
      <Card
        key={task.id}
        className={`${styles.reviewCard} ${isSelected ? styles.reviewCardSelected : ''}`}
        hoverable
        onClick={() => {
          if (batchMode) {
            handleSelectTask(task.id, !isSelected);
          } else {
            onViewDetail(task.ar_id);
          }
        }}
      >
        {/* 批量模式下的复选框 */}
        {batchMode && (
          <div className={styles.checkboxWrapper}>
            <Checkbox
              checked={isSelected}
              onChange={(e) => {
                e.stopPropagation();
                handleSelectTask(task.id, e.target.checked);
              }}
            />
          </div>
        )}

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
                  onClick={(e) => e.stopPropagation()}
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
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </div>
        )}

        {/* 操作按钮（非批量模式显示） */}
        {!batchMode && (
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
        )}
      </Card>
    );
  };

  return (
    <div className={styles.reviewTaskList}>
      {/* 筛选器和批量操作工具栏 */}
      <div className={styles.toolbar}>
        <Segmented
          value={activeTab}
          onChange={(value) => setActiveTab(value as ReviewType)}
          options={[
            {
              value: 'finance_review',
              label: (
                <span className={styles.filterLabel}>
                  <AuditOutlined className={styles.filterIconFinance} />
                  财务审核
                </span>
              ),
            },
            {
              value: 'cashier_verify',
              label: (
                <span className={styles.filterLabel}>
                  <DollarOutlined className={styles.filterIconCashier} />
                  出纳核实
                </span>
              ),
            },
          ]}
          className={styles.filterSegment}
        />

        {/* 批量操作工具栏 */}
        {tasks.length > 0 && (
          <div className={styles.batchToolbar}>
            {batchMode ? (
              <>
                <Checkbox
                  checked={selectedIds.length === tasks.length && tasks.length > 0}
                  indeterminate={selectedIds.length > 0 && selectedIds.length < tasks.length}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                >
                  全选 ({selectedIds.length}/{tasks.length})
                </Checkbox>
                <Space>
                  <Button
                    danger
                    disabled={selectedIds.length === 0}
                    onClick={() => openRejectModal(null)}
                    loading={submitting}
                  >
                    批量拒绝
                  </Button>
                  <Button
                    type="primary"
                    disabled={selectedIds.length === 0}
                    onClick={handleBatchApprove}
                    loading={submitting}
                  >
                    批量通过
                  </Button>
                  <Button onClick={() => {
                    setBatchMode(false);
                    setSelectedIds([]);
                  }}>
                    取消
                  </Button>
                </Space>
              </>
            ) : (
              <Button onClick={() => setBatchMode(true)}>
                批量操作
              </Button>
            )}
          </div>
        )}
      </div>

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
        title={currentTask ? '填写拒绝理由' : `批量拒绝 (${selectedIds.length} 个任务)`}
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
