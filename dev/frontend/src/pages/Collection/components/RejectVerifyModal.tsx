/**
 * 驳回核销弹窗
 * 出纳驳回核销申请，需填写驳回原因
 */
import React, { useState } from 'react';
import { Modal, Form, Input, Descriptions, message } from 'antd';
import { confirmVerify } from '@/services/api/ar-collection';
import type { CollectionTask } from '@/types/ar-collection';
import styles from './ModalMobile.less';

interface RejectVerifyModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  task: CollectionTask;
}

const RejectVerifyModal: React.FC<RejectVerifyModalProps> = ({
  visible,
  onClose,
  onSuccess,
  task,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await confirmVerify(task.id, {
        confirmed: false,
        remark: values.remark,
      });
      message.success('已驳回核销申请');
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

  return (
    <Modal
      title="驳回核销"
      open={visible}
      onCancel={handleClose}
      onOk={handleSubmit}
      okText="提交驳回"
      okButtonProps={{ danger: true }}
      cancelText="取消"
      confirmLoading={loading}
      destroyOnClose
      className={styles['collection-modal-mobile']}
    >
      <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
        <Descriptions.Item label="客户">{task.consumerName}</Descriptions.Item>
        <Descriptions.Item label="申请核销金额">
          ¥{(task.totalAmount ?? 0).toLocaleString()}
        </Descriptions.Item>
        <Descriptions.Item label="责任人">{task.managerUserName}</Descriptions.Item>
      </Descriptions>

      <Form form={form} layout="vertical">
        <Form.Item
          name="remark"
          label="驳回原因"
          rules={[{ required: true, message: '请填写驳回原因' }]}
        >
          <Input.TextArea
            rows={3}
            placeholder="请填写驳回原因（必填）"
            maxLength={200}
            showCount
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default RejectVerifyModal;
