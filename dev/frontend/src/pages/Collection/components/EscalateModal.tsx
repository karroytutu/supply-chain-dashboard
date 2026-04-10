/**
 * 升级处理弹窗
 * 根据当前升级层级显示不同内容，支持升级至营销主管或财务
 */
import React, { useState } from 'react';
import { Modal, Form, Input, Radio, Alert, Descriptions, message } from 'antd';
import { escalateTask } from '@/services/api/ar-collection';
import type { CollectionTask, CollectionDetail, EscalationLevel } from '@/types/ar-collection';

interface EscalateModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  task: CollectionTask;
  selectedDetails: CollectionDetail[];
}

const EscalateModal: React.FC<EscalateModalProps> = ({
  visible,
  onClose,
  onSuccess,
  task,
  selectedDetails,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const currentLevel = task.escalationLevel;

  /** 根据当前层级确定可升级目标 */
  const getTargetOptions = () => {
    if (currentLevel === 0) {
      return [{ value: 1, label: '营销主管' }];
    }
    if (currentLevel === 1) {
      return [{ value: 2, label: '财务人员（发送催收函/起诉）' }];
    }
    return [];
  };

  const targetOptions = getTargetOptions();

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await escalateTask(task.id, {
        targetLevel: values.targetLevel as EscalationLevel,
        reason: values.reason,
      });
      message.success('升级申请已提交');
      form.resetFields();
      onSuccess();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error?.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    form.resetFields();
    onClose();
  };

  const targetLabel = currentLevel === 0 ? '升级至营销主管' : '升级至财务';

  return (
    <Modal
      title="升级处理"
      open={visible}
      onCancel={handleClose}
      onOk={handleSubmit}
      okText="确认升级"
      cancelText="取消"
      confirmLoading={loading}
      destroyOnClose
    >
      <Alert
        type="info"
        showIcon
        message={`当前任务已逾期 ${task.maxOverdueDays} 天，可申请${targetLabel}`}
        style={{ marginBottom: 16 }}
      />

      <Form form={form} layout="vertical" initialValues={{ targetLevel: targetOptions[0]?.value }}>
        <Form.Item
          name="targetLevel"
          label="升级对象"
          rules={[{ required: true, message: '请选择升级对象' }]}
        >
          <Radio.Group>
            {targetOptions.map((opt) => (
              <Radio key={opt.value} value={opt.value}>
                {opt.label}
              </Radio>
            ))}
          </Radio.Group>
        </Form.Item>

        <Form.Item
          name="reason"
          label="升级原因"
          rules={[
            { required: true, message: '请输入升级原因' },
            { max: 500, message: '最多500字' },
          ]}
        >
          <Input.TextArea
            rows={3}
            placeholder="请说明升级原因..."
            maxLength={500}
            showCount
          />
        </Form.Item>
      </Form>

      <Descriptions column={2} size="small" style={{ marginTop: 8 }}>
        <Descriptions.Item label="已催收次数">
          {task.collectionCount} 次
        </Descriptions.Item>
        <Descriptions.Item label="已延期次数">
          {task.extensionCount} 次
        </Descriptions.Item>
      </Descriptions>
    </Modal>
  );
};

export default EscalateModal;
