/**
 * 标记考核处理情况弹窗
 */
import React, { useEffect } from 'react';
import { Modal, Form, Radio, Input } from 'antd';
import type { AssessmentRecord } from '@/types/ar-assessment.d';

interface HandleAssessmentModalProps {
  visible: boolean;
  record: AssessmentRecord | null;
  onCancel: () => void;
  onSubmit: (values: { status: 'handled' | 'skipped'; remark: string }) => void;
}

const HandleAssessmentModal: React.FC<HandleAssessmentModalProps> = ({
  visible, record: _record, onCancel, onSubmit,
}) => {
  const [form] = Form.useForm();

  useEffect(() => {
    if (visible) {
      form.resetFields();
    }
  }, [visible, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    onSubmit(values);
  };

  const status = Form.useWatch('status', form);

  return (
    <Modal
      title="标记处理情况"
      open={visible}
      onOk={handleOk}
      onCancel={onCancel}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="status"
          label="处理状态"
          rules={[{ required: true, message: '请选择处理状态' }]}
        >
          <Radio.Group>
            <Radio value="handled">已处理</Radio>
            <Radio value="skipped">无需处理</Radio>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          name="remark"
          label="处理备注"
          rules={[
            { required: status === 'skipped', message: '标记为"无需处理"时必须填写备注' },
          ]}
        >
          <Input.TextArea
            rows={3}
            placeholder={status === 'skipped' ? '请说明无需处理的原因' : '可选填备注'}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default HandleAssessmentModal;
