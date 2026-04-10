/**
 * 出纳核销确认弹窗
 * 出纳核实回款后确认或驳回核销申请
 */
import React, { useState } from 'react';
import { Modal, Form, Input, Radio, Descriptions, message } from 'antd';
import { confirmVerify } from '@/services/api/ar-collection';
import type { CollectionTask, CollectionDetail } from '@/types/ar-collection';

interface ConfirmVerifyModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  task: CollectionTask;
  selectedDetails: CollectionDetail[];
}

const ConfirmVerifyModal: React.FC<ConfirmVerifyModalProps> = ({
  visible,
  onClose,
  onSuccess,
  task,
  selectedDetails,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const totalAmount = selectedDetails.length > 0
    ? selectedDetails.reduce((sum, d) => sum + d.leftAmount, 0)
    : task.totalAmount;

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await confirmVerify(task.id, {
        result: values.result,
        remark: values.remark || undefined,
      });
      const msg = values.result === 'approved' ? '核销确认成功' : '已驳回核销申请';
      message.success(msg);
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
      title="核销确认"
      open={visible}
      onCancel={handleClose}
      onOk={handleSubmit}
      okText="确认提交"
      cancelText="取消"
      confirmLoading={loading}
      destroyOnClose
    >
      <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
        <Descriptions.Item label="客户">{task.consumerName}</Descriptions.Item>
        <Descriptions.Item label="申请核销金额">
          ¥{totalAmount.toLocaleString()}
        </Descriptions.Item>
        <Descriptions.Item label="责任人">{task.managerUserName}</Descriptions.Item>
        <Descriptions.Item label="创建时间">{task.createdAt}</Descriptions.Item>
      </Descriptions>

      <Form form={form} layout="vertical">
        <Form.Item
          name="result"
          label="确认结果"
          rules={[{ required: true, message: '请选择确认结果' }]}
        >
          <Radio.Group>
            <Radio value="approved">确认核销</Radio>
            <Radio value="rejected">驳回</Radio>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          name="remark"
          label="备注"
          rules={[{ max: 200, message: '最多200字' }]}
        >
          <Input.TextArea
            rows={3}
            placeholder="请输入备注（非必填）"
            maxLength={200}
            showCount
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ConfirmVerifyModal;
