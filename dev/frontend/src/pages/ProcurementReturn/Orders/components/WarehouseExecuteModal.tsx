/**
 * 仓储执行弹窗组件
 */
import React, { useEffect } from 'react';
import { Modal, Form, InputNumber, Input, message } from 'antd';
import { warehouseExecute } from '@/services/api/procurement-return';
import type { ReturnOrder } from '@/types/procurement-return';

interface WarehouseExecuteModalProps {
  visible: boolean;
  record: ReturnOrder | null;
  onClose: () => void;
  onSuccess: () => void;
}

const WarehouseExecuteModal: React.FC<WarehouseExecuteModalProps> = ({
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

      await warehouseExecute(record.id, {
        returnQuantity: values.returnQuantity,
        comment: values.comment,
      });

      message.success('仓储退货执行成功');
      onSuccess();
      onClose();
    } catch (error) {
      message.error('执行失败，请重试');
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
      title="仓储退货执行"
      open={visible}
      onOk={handleSubmit}
      onCancel={handleCancel}
      confirmLoading={loading}
      okText="确认执行"
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
            <strong>ERP退货单号：</strong>
            {record.erpReturnNo || '-'}
          </p>
        </div>
      )}

      <Form
        form={form}
        layout="vertical"
        autoComplete="off"
      >
        <Form.Item
          name="returnQuantity"
          label="实际退货数量"
          rules={[
            { required: true, message: '请输入实际退货数量' },
            { type: 'number', min: 0, message: '退货数量不能小于0' },
          ]}
        >
          <InputNumber
            style={{ width: '100%' }}
            placeholder="请输入实际退货数量"
            min={0}
            precision={0}
          />
        </Form.Item>

        <Form.Item
          name="comment"
          label="备注"
          rules={[{ max: 500, message: '备注最多500个字符' }]}
        >
          <Input.TextArea
            placeholder="请输入备注信息（可选）"
            rows={3}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export { WarehouseExecuteModal };
export default WarehouseExecuteModal;
