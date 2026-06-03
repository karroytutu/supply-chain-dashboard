/**
 * WMS 短信验证码输入 Modal
 */
import { Modal, Form, Input, message } from 'antd';
import { useState } from 'react';
import { submitWmsSmsCode } from '@/services/api/token-manager';

interface WmsSmsModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function WmsSmsModal({ visible, onClose, onSuccess }: WmsSmsModalProps) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    try {
      const { code } = await form.validateFields();
      setLoading(true);
      await submitWmsSmsCode(code);
      message.success('WMS 登录成功');
      form.resetFields();
      onSuccess();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error?.message || '验证码提交失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="WMS 短信验证码"
      open={visible}
      onCancel={() => { form.resetFields(); onClose(); }}
      onOk={handleSubmit}
      confirmLoading={loading}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="code"
          label="短信验证码"
          rules={[{ required: true, message: '请输入短信验证码' }]}
        >
          <Input placeholder="请输入收到的短信验证码" maxLength={6} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
