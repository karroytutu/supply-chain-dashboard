/**
 * 考核处理弹窗 - 标记已处理/无需考核
 */
import React, { useState } from 'react';
import { Modal, Form, Radio, Input, Descriptions } from 'antd';

interface HandleModalProps {
  visible: boolean;
  record: AssessmentRecord | null;
  loading: boolean;
  onClose: () => void;
  onSubmit: (id: number, action: 'confirm' | 'cancel', remark?: string) => void;
}

const HandleModal: React.FC<HandleModalProps> = ({
  visible,
  record,
  loading,
  onClose,
  onSubmit,
}) => {
  const [form] = Form.useForm();
  const [action, setAction] = useState<'confirm' | 'cancel'>('confirm');

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      if (record) {
        onSubmit(record.id, values.action, values.remark);
      }
    } catch {
      // 表单验证失败
    }
  };

  const handleClose = () => {
    form.resetFields();
    setAction('confirm');
    onClose();
  };

  return (
    <Modal
      title="处理考核记录"
      open={visible}
      onOk={handleOk}
      onCancel={handleClose}
      confirmLoading={loading}
      destroyOnClose
    >
      {record && (
        <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="被考核人">{record.assessmentUserName}</Descriptions.Item>
          <Descriptions.Item label="考核金额">
            <span style={{ color: '#f5222d' }}>¥{record.penaltyAmount?.toFixed(2)}</span>
          </Descriptions.Item>
          <Descriptions.Item label="规则类型">{record.ruleType}</Descriptions.Item>
        </Descriptions>
      )}
      <Form form={form} layout="vertical" initialValues={{ action: 'confirm' }}>
        <Form.Item name="action" label="处理方式" rules={[{ required: true }]}>
          <Radio.Group onChange={(e) => setAction(e.target.value)}>
            <Radio value="confirm">已处理</Radio>
            <Radio value="cancel">无需考核</Radio>
          </Radio.Group>
        </Form.Item>
        <Form.Item
          name="remark"
          label="处理备注"
          rules={[{ required: action === 'cancel', message: '选择"无需考核"时必须填写备注' }]}
        >
          <Input.TextArea
            rows={3}
            placeholder={action === 'cancel' ? '请填写无需考核的原因（必填）' : '请填写处理备注（选填）'}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default HandleModal;
