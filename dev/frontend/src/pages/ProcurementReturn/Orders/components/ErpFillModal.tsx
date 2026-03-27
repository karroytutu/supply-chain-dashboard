/**
 * ERP退货单填写弹窗组件
 */
import React, { useEffect } from 'react';
import { Modal, Form, Input, message } from 'antd';
import { fillErpReturnNo } from '@/services/api/procurement-return';
import type { ReturnOrder } from '@/types/procurement-return';

interface ErpFillModalProps {
  visible: boolean;
  record: ReturnOrder | null;
  onClose: () => void;
  onSuccess: () => void;
}

const ErpFillModal: React.FC<ErpFillModalProps> = ({
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

      await fillErpReturnNo(record.id, {
        erpReturnNo: values.erpReturnNo,
      });

      message.success('ERP退货单号填写成功');
      onSuccess();
      onClose();
    } catch (error) {
      message.error('填写失败，请重试');
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
      title="填写ERP采购退货单号"
      open={visible}
      onOk={handleSubmit}
      onCancel={handleCancel}
      confirmLoading={loading}
      okText="提交"
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
        </div>
      )}

      <Form
        form={form}
        layout="vertical"
        autoComplete="off"
      >
        <Form.Item
          name="erpReturnNo"
          label="ERP退货单号"
          rules={[
            { required: true, message: '请输入ERP退货单号' },
            { max: 50, message: 'ERP退货单号最多50个字符' },
          ]}
        >
          <Input placeholder="请输入ERP系统中的退货单号" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export { ErpFillModal };
export default ErpFillModal;
