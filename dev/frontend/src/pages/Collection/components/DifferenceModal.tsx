/**
 * 差异标记弹窗
 * 营销师标记欠款金额差异，流转至往来会计处理
 */
import React, { useState } from 'react';
import { Modal, Form, Input, message } from 'antd';
import { markDifference } from '@/services/api/ar-collection';
import type { CollectionTask, CollectionDetail } from '@/types/ar-collection';

interface DifferenceModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  task: CollectionTask;
  selectedDetails: CollectionDetail[];
}

const DifferenceModal: React.FC<DifferenceModalProps> = ({
  visible,
  onClose,
  onSuccess,
  task,
  selectedDetails,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const selectedCount = selectedDetails.length;

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await markDifference(task.id, {
        detailIds: selectedDetails.map((d) => d.id),
        description: values.description,
      });
      message.success('差异已标记，将流转至财务处理');
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
      title="标记差异"
      open={visible}
      onCancel={handleClose}
      onOk={handleSubmit}
      okText="提交处理"
      cancelText="取消"
      confirmLoading={loading}
      destroyOnClose
    >
      {selectedCount > 0 && (
        <div style={{ marginBottom: 12 }}>
          已选择 <strong>{selectedCount}</strong> 条欠款明细
        </div>
      )}

      <Form form={form} layout="vertical">
        <Form.Item
          name="description"
          label="差异说明"
          rules={[
            { required: true, message: '请输入差异说明' },
            { max: 500, message: '最多500字' },
          ]}
        >
          <Input.TextArea
            rows={4}
            placeholder="请详细说明差异情况..."
            maxLength={500}
            showCount
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default DifferenceModal;
