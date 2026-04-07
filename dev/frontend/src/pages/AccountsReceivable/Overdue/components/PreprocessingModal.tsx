/**
 * 预处理弹窗
 * 开始预处理和完成预处理的确认弹窗
 */
import React, { useState } from 'react';
import { Modal, Button, Input, Form, message } from 'antd';
import { PlayCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { OverdueTaskItem } from '@/types/accounts-receivable';
import { startPreprocessing, completePreprocessing } from '@/services/api/accounts-receivable';

interface PreprocessingModalProps {
  visible: boolean;
  task: OverdueTaskItem | null;
  mode: 'start' | 'complete';
  onCancel: () => void;
  onSuccess: () => void;
}

const PreprocessingModal: React.FC<PreprocessingModalProps> = ({
  visible,
  task,
  mode,
  onCancel,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleOk = async () => {
    if (!task) return;

    const values = await form.validateFields();
    setLoading(true);

    try {
      if (mode === 'start') {
        await startPreprocessing({ customerTaskId: task.id });
        message.success('已开始预处理');
      } else {
        await completePreprocessing({
          customerTaskId: task.id,
          remark: values.remark,
        });
        message.success('已完成预处理');
      }
      form.resetFields();
      onSuccess();
    } catch (error) {
      message.error(mode === 'start' ? '开始预处理失败' : '完成预处理失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onCancel();
  };

  const title = mode === 'start' ? '开始预处理' : '完成预处理';
  const icon = mode === 'start' ? <PlayCircleOutlined /> : <CheckCircleOutlined />;
  const okText = mode === 'start' ? '确认开始' : '确认完成';

  return (
    <Modal
      title={
        <span>
          {icon} {title}
        </span>
      }
      open={visible}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={loading}
      okText={okText}
      cancelText="取消"
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item label="任务编号">
          <span className="ant-form-text">{task?.taskNo}</span>
        </Form.Item>
        <Form.Item label="客户名称">
          <span className="ant-form-text">{task?.consumerName}</span>
        </Form.Item>
        <Form.Item label="总金额">
          <span className="ant-form-text">
            {task?.totalAmount ? `¥${task.totalAmount.toLocaleString()}` : '-'}
          </span>
        </Form.Item>
        {mode === 'complete' && (
          <Form.Item
            name="remark"
            label="备注"
            rules={[{ required: false, max: 500, message: '备注最多500字' }]}
          >
            <Input.TextArea
              rows={4}
              placeholder="请输入预处理备注（可选）"
              maxLength={500}
              showCount
            />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
};

export default PreprocessingModal;
