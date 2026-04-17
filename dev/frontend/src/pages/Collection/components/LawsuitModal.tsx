/**
 * 提起诉讼弹窗（财务使用）
 * 记录诉讼进展，上传附件
 */
import React, { useState } from 'react';
import { Modal, Form, Input, Upload, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { fileLawsuit, uploadEvidence } from '@/services/api/ar-collection';
import type { CollectionTask, CollectionDetail } from '@/types/ar-collection';
import type { UploadFile } from 'antd/es/upload/interface';
import styles from './ModalMobile.less';

interface LawsuitModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  task: CollectionTask;
  selectedDetails: CollectionDetail[];
}

const LawsuitModal: React.FC<LawsuitModalProps> = ({
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
      const values = await form.validateFields();
      setLoading(true);

      let attachmentFileId: number | undefined;
      if (fileList.length > 0 && fileList[0].originFileObj) {
        const uploadRes = await uploadEvidence(fileList[0].originFileObj);
        attachmentFileId = uploadRes.fileId;
      }

      await fileLawsuit(task.id, {
        description: values.description,
        attachmentFileId,
      });

      message.success('诉讼记录已提交');
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
      title="提起诉讼"
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
        客户：{task.consumerName}，欠款总额：¥{(task.totalAmount ?? 0).toLocaleString()}
      </div>

      <Form form={form} layout="vertical">
        <Form.Item
          name="description"
          label="诉讼进展说明"
          rules={[
            { required: true, message: '请输入诉讼进展说明' },
            { max: 500, message: '最多500字' },
          ]}
        >
          <Input.TextArea
            rows={4}
            placeholder="请输入诉讼进展说明..."
            maxLength={500}
            showCount
          />
        </Form.Item>

        <Form.Item label="上传附件（可选）">
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
      </Form>
    </Modal>
  );
};

export default LawsuitModal;
