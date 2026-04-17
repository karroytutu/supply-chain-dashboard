/**
 * 发送催收函弹窗（财务使用）
 * 上传催收函/发送凭证
 */
import React, { useState } from 'react';
import { Modal, Form, Input, Upload, Descriptions, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { sendNotice, uploadEvidence } from '@/services/api/ar-collection';
import type { CollectionTask, CollectionDetail } from '@/types/ar-collection';
import type { UploadFile } from 'antd/es/upload/interface';
import styles from './ModalMobile.less';

interface SendNoticeModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  task: CollectionTask;
  selectedDetails: CollectionDetail[];
}

const SendNoticeModal: React.FC<SendNoticeModalProps> = ({
  visible,
  onClose,
  onSuccess,
  task,
  selectedDetails,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  const handleSubmit = async () => {
    try {
      await form.validateFields();
      if (fileList.length === 0 || !fileList[0].originFileObj) {
        message.error('请上传催收函/发送凭证');
        return;
      }
      setLoading(true);

      const uploadRes = await uploadEvidence(fileList[0].originFileObj);
      await sendNotice(task.id, {
        attachmentFileId: uploadRes.fileId,
        description: form.getFieldValue('description') || undefined,
      });

      message.success('催收函已发送');
      form.resetFields();
      setFileList([]);
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
    setFileList([]);
    onClose();
  };

  return (
    <Modal
      title="发送催收函"
      open={visible}
      onCancel={handleClose}
      onOk={handleSubmit}
      okText="确认发送"
      cancelText="取消"
      confirmLoading={loading}
      destroyOnClose
      className={styles['collection-modal-mobile']}
    >
      <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
        <Descriptions.Item label="客户">{task.consumerName}</Descriptions.Item>
        <Descriptions.Item label="欠款总额">
          ¥{(task.totalAmount ?? 0).toLocaleString()}
        </Descriptions.Item>
        <Descriptions.Item label="逾期天数">
          {task.maxOverdueDays} 天
        </Descriptions.Item>
      </Descriptions>

      <Form form={form} layout="vertical">
        <Form.Item
          label="上传催收函/发送凭证"
          required
          help="请上传催收函文件或发送凭证截图"
        >
          <Upload
            fileList={fileList}
            onChange={({ fileList: newList }) => setFileList(newList.slice(0, 1))}
            beforeUpload={() => false}
            maxCount={1}
          >
            {fileList.length === 0 && (
              <span style={{ cursor: 'pointer', color: '#1890ff' }}>
                <UploadOutlined /> 点击上传
              </span>
            )}
          </Upload>
        </Form.Item>

        <Form.Item
          name="description"
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

export default SendNoticeModal;
