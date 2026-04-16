/**
 * 核销回款弹窗（营销师使用）
 * 提交后流转至出纳核实确认
 */
import React, { useState } from 'react';
import { Modal, Form, Input, Alert, message } from 'antd';
import { verifyTask } from '@/services/api/ar-collection';
import type { CollectionTask, CollectionDetail } from '@/types/ar-collection';
import styles from './ModalMobile.less';

interface VerifyModalProps {
  /** 是否可见 */
  visible: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 操作成功回调 */
  onSuccess: () => void;
  /** 当前催收任务 */
  task: CollectionTask;
  /** 已选明细列表 */
  selectedDetails: CollectionDetail[];
}

const VerifyModal: React.FC<VerifyModalProps> = ({
  visible,
  onClose,
  onSuccess,
  task,
  selectedDetails,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const selectedCount = selectedDetails.length;
  const selectedAmount = selectedDetails.reduce((sum, d) => sum + d.leftAmount, 0);
  const isWholeOrder = selectedCount === 0;

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await verifyTask(task.id, {
        detailIds: selectedDetails.map((d) => d.id),
        remark: values.remark || undefined,
      });
      message.success('核销申请已提交，等待出纳确认');
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
      title="核销回款"
      open={visible}
      onCancel={handleClose}
      onOk={handleSubmit}
      okText="确认提交"
      cancelText="取消"
      confirmLoading={loading}
      destroyOnClose
      className={styles['collection-modal-mobile']}
    >
      <div style={{ marginBottom: 16 }}>
        {isWholeOrder ? (
          <span>将对整单 ¥{task.totalAmount.toLocaleString()} 执行核销操作</span>
        ) : (
          <span>
            已选择 <strong>{selectedCount}</strong> 条欠款明细，合计{' '}
            <strong>¥{selectedAmount.toLocaleString()}</strong>
          </span>
        )}
      </div>

      <Form form={form} layout="vertical">
        <Form.Item
          name="remark"
          label="核销说明"
          rules={[{ max: 200, message: '最多200字' }]}
        >
          <Input.TextArea
            rows={3}
            placeholder="请输入核销说明（非必填）"
            maxLength={200}
            showCount
          />
        </Form.Item>
      </Form>

      <Alert
        type="warning"
        showIcon
        message="提交后将流转至出纳核实确认"
        style={{ marginTop: 8 }}
      />
    </Modal>
  );
};

export default VerifyModal;
