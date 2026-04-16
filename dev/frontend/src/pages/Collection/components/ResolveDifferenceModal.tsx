/**
 * 处理差异弹窗（财务/往来会计使用）
 * 财务人员处理营销师标记的差异
 */
import React, { useState } from 'react';
import { Modal, Form, Input, Radio, message } from 'antd';
import { resolveDifference } from '@/services/api/ar-collection';
import type { CollectionTask, CollectionDetail } from '@/types/ar-collection';
import styles from './ModalMobile.less';

interface ResolveDifferenceModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  task: CollectionTask;
  selectedDetails: CollectionDetail[];
}

const ResolveDifferenceModal: React.FC<ResolveDifferenceModalProps> = ({
  visible,
  onClose,
  onSuccess,
  task,
  selectedDetails,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await resolveDifference(task.id, {
        resolution: values.resolution,
        remark: values.remark,
      });
      message.success('差异处理结果已提交');
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
      title="处理差异"
      open={visible}
      onCancel={handleClose}
      onOk={handleSubmit}
      okText="确认提交"
      cancelText="取消"
      confirmLoading={loading}
      destroyOnClose
      className={styles['collection-modal-mobile']}
    >
      <div style={{ marginBottom: 16, color: '#666' }}>
        客户：{task.consumerName}，欠款总额：¥{task.totalAmount.toLocaleString()}
      </div>

      <Form form={form} layout="vertical">
        <Form.Item
          name="resolution"
          label="处理结果"
          rules={[{ required: true, message: '请选择处理结果' }]}
        >
          <Radio.Group>
            <Radio.Button value="resolved">差异已解决</Radio.Button>
            <Radio.Button value="adjusted">调整金额</Radio.Button>
            <Radio.Button value="returned">退回营销师</Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          name="remark"
          label="处理说明"
          rules={[
            { required: true, message: '请输入处理说明' },
            { max: 500, message: '最多500字' },
          ]}
        >
          <Input.TextArea
            rows={4}
            placeholder="请详细说明处理情况..."
            maxLength={500}
            showCount
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ResolveDifferenceModal;
