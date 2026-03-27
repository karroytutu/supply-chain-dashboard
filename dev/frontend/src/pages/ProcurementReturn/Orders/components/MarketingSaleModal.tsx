/**
 * 营销销售完成确认弹窗组件
 */
import React, { useEffect } from 'react';
import { Modal, Form, Input, message } from 'antd';
import { marketingSaleComplete } from '@/services/api/procurement-return';
import type { ReturnOrder } from '@/types/procurement-return';

interface MarketingSaleModalProps {
  visible: boolean;
  record: ReturnOrder | null;
  onClose: () => void;
  onSuccess: () => void;
}

const MarketingSaleModal: React.FC<MarketingSaleModalProps> = ({
  visible,
  record,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = React.useState(false);

  // 弹窗打开时重置表单
  useEffect(() => {
    if (visible && record) {
      form.resetFields();
    }
  }, [visible, record, form]);

  // 提交表单
  const handleSubmit = async () => {
    if (!record) return;

    try {
      const values = await form.validateFields();
      setLoading(true);

      await marketingSaleComplete(record.id, {
        comment: values.comment,
      });

      message.success('营销销售完成确认成功');
      onSuccess();
      onClose();
    } catch (error) {
      message.error('确认失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 弹窗关闭
  const handleCancel = () => {
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      title="确认营销销售完成"
      open={visible}
      onOk={handleSubmit}
      onCancel={handleCancel}
      confirmLoading={loading}
      okText="确认完成"
      cancelText="取消"
      width={480}
    >
      {record && (
        <div style={{ marginBottom: 24 }}>
          <p>
            <strong>退货单号：</strong>
            {record.returnNo}
          </p>
          <p>
            <strong>商品名称：</strong>
            {record.goodsName}
          </p>
          <p>
            <strong>数量：</strong>
            {record.quantity} {record.unit || '件'}
          </p>
          <p>
            <strong>剩余保质期：</strong>
            {record.daysToExpire !== null ? `${record.daysToExpire}天` : '-'}
          </p>
        </div>
      )}

      <Form
        form={form}
        layout="vertical"
        autoComplete="off"
      >
        <Form.Item
          name="comment"
          label="备注说明"
          rules={[{ max: 500, message: '备注最多500个字符' }]}
        >
          <Input.TextArea
            placeholder="请填写销售情况说明"
            rows={4}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export { MarketingSaleModal };
export default MarketingSaleModal;
