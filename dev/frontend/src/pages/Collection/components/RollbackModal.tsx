/**
 * 退回操作弹窗
 * 营销经理退回给营销师(L1→L0) 或 财务退回给营销经理(L2→L1)
 * 任务恢复升级前状态，通知被退回人
 */
import React, { useState } from 'react';
import { Modal, Form, Input, Alert, Descriptions, message } from 'antd';
import { RollbackOutlined } from '@ant-design/icons';
import { rollbackEscalation } from '@/services/api/ar-collection';
import type { CollectionTask } from '@/types/ar-collection';
import styles from './collection-modal-shared.less';

/**
 * 升级层级中文映射
 * 此值必须与后端 ar-collection-notify.ts 中的 ESCALATION_LEVEL_NAMES 保持一致
 */
const LEVEL_LABELS: Record<number, string> = {
  0: '营销师',
  1: '营销经理',
  2: '财务',
};

/**
 * 催收状态中文映射（退回场景使用）
 * 此值必须与后端 ar-collection-notify.ts 中 buildRollbackActionCard 的状态映射保持一致
 */
const STATUS_LABELS: Record<string, string> = {
  collecting: '催收中',
  extension: '延期中',
  difference_processing: '差异处理',
};

/** 判断是否为 Ant Design 表单校验错误 */
function isFormValidationError(error: unknown): error is { errorFields: unknown[] } {
  return !!error && typeof error === 'object' && 'errorFields' in error;
}

interface RollbackModalContentProps {
  form: ReturnType<typeof Form.useForm>[0];
  task: CollectionTask;
  targetLevel: number;
  restoredStatus: string;
}

/** 退回弹窗内容区域 */
const RollbackModalContent: React.FC<RollbackModalContentProps> = ({
  form,
  task,
  targetLevel,
  restoredStatus,
}) => (
  <>
    <Alert
      type="warning"
      showIcon
      icon={<RollbackOutlined />}
      message={`将退回至${LEVEL_LABELS[targetLevel]}，任务状态恢复为「${STATUS_LABELS[restoredStatus] || restoredStatus}」`}
      style={{ marginBottom: 16 }}
    />

    <Form form={form} layout="vertical">
      <Form.Item
        name="reason"
        label="退回原因"
        rules={[
          { required: true, message: '请输入退回原因' },
          { max: 500, message: '最多500字' },
        ]}
      >
        <Input.TextArea
          rows={3}
          placeholder="请说明退回原因..."
          maxLength={500}
          showCount
        />
      </Form.Item>
    </Form>

    <Descriptions column={2} size="small" style={{ marginTop: 8 }}>
      <Descriptions.Item label="当前层级">
        {LEVEL_LABELS[task.escalationLevel]}
      </Descriptions.Item>
      <Descriptions.Item label="退回至">
        {LEVEL_LABELS[targetLevel]}
      </Descriptions.Item>
      <Descriptions.Item label="恢复状态">
        {STATUS_LABELS[restoredStatus] || restoredStatus}
      </Descriptions.Item>
      <Descriptions.Item label="逾期天数">
        {task.maxOverdueDays} 天
      </Descriptions.Item>
    </Descriptions>
  </>
);

interface RollbackModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  task: CollectionTask;
}

const RollbackModal: React.FC<RollbackModalProps> = ({ visible, onClose, onSuccess, task }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const currentLevel = task.escalationLevel;
  // 防御性校验：无法退回至 L0 以下层级
  if (currentLevel < 1) return null;
  const targetLevel = currentLevel - 1;
  const restoredStatus = task.preEscalationStatus || 'collecting';

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await rollbackEscalation(task.id, { reason: values.reason });
      message.success(`已退回至${LEVEL_LABELS[targetLevel]}`);
      form.resetFields();
      onSuccess();
    } catch (error: unknown) {
      if (isFormValidationError(error)) return;
      const msg = error instanceof Error ? error.message : '退回操作失败';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      title="退回操作"
      open={visible}
      onCancel={handleClose}
      onOk={handleSubmit}
      okText="确认退回"
      cancelText="取消"
      confirmLoading={loading}
      destroyOnClose
      className={styles['collection-modal-mobile']}
    >
      <RollbackModalContent
        form={form}
        task={task}
        targetLevel={targetLevel}
        restoredStatus={restoredStatus}
      />
    </Modal>
  );
};

export default RollbackModal;
