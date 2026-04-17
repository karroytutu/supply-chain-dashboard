/**
 * 延期申请弹窗
 * 支持延期至指定日期，上传客户确认凭证
 */
import React, { useState } from 'react';
import { Modal, Form, Input, DatePicker, Upload, Alert, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { applyExtension, uploadEvidence } from '@/services/api/ar-collection';
import type { CollectionTask, CollectionDetail } from '@/types/ar-collection';
import type { UploadFile } from 'antd/es/upload/interface';
import styles from './ModalMobile.less';

interface ExtensionModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  task: CollectionTask;
  selectedDetails: CollectionDetail[];
}

const ExtensionModal: React.FC<ExtensionModalProps> = ({
  visible,
  onClose,
  onSuccess,
  task,
  selectedDetails,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  const selectedCount = selectedDetails.length;
  const selectedAmount = selectedDetails.reduce((sum, d) => sum + d.leftAmount, 0);

  /** 最长延期30天 */
  const maxDate = dayjs().add(30, 'day');

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      // 上传凭证文件
      let evidenceFileId: number | undefined;
      if (fileList.length > 0 && fileList[0].originFileObj) {
        const uploadRes = await uploadEvidence(fileList[0].originFileObj);
        evidenceFileId = uploadRes.fileId;
      }

      const extensionDate = values.extensionDate as dayjs.Dayjs;
      const extensionDays = extensionDate.diff(dayjs(), 'day');

      await applyExtension(task.id, {
        extensionDays,
        detailIds: selectedDetails.map((d) => d.id),
        evidenceFileId,
        reason: values.reason,
      });

      message.success('延期申请已提交');
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

  /** 文件上传前校验 */
  const beforeUpload = (file: File) => {
    const isImage = file.type === 'image/jpeg' || file.type === 'image/png';
    if (!isImage) {
      message.error('仅支持 jpg/png 格式图片');
      return false;
    }
    const isLt5M = file.size / 1024 / 1024 < 5;
    if (!isLt5M) {
      message.error('图片大小不能超过 5MB');
      return false;
    }
    return false; // 手动上传
  };

  return (
    <Modal
      title="申请延期"
      open={visible}
      onCancel={handleClose}
      onOk={handleSubmit}
      okText="确认申请"
      cancelText="取消"
      confirmLoading={loading}
      destroyOnClose
      className={styles['collection-modal-mobile']}
    >
      {selectedCount > 0 && (
        <div style={{ marginBottom: 12 }}>
          已选择 <strong>{selectedCount}</strong> 条欠款明细，合计{' '}
          <strong>¥{(selectedAmount ?? 0).toLocaleString()}</strong>
        </div>
      )}

      <Alert
        type="warning"
        showIcon
        message="注意：每个任务仅允许一次延期，延期到期后不允许再次延期"
        style={{ marginBottom: 16 }}
      />

      <Form form={form} layout="vertical">
        <Form.Item
          name="extensionDate"
          label="延期至日期"
          rules={[{ required: true, message: '请选择延期日期' }]}
        >
          <DatePicker
            style={{ width: '100%' }}
            disabledDate={(current) =>
              current && (current < dayjs().endOf('day') || current > maxDate)
            }
            placeholder="请选择日期（最长延期30天）"
          />
        </Form.Item>

        <Form.Item
          name="reason"
          label="延期原因"
          rules={[
            { required: true, message: '请输入延期原因' },
            { max: 200, message: '最多200字' },
          ]}
        >
          <Input.TextArea
            rows={3}
            placeholder="请输入延期原因"
            maxLength={200}
            showCount
          />
        </Form.Item>

        <Form.Item label="客户确认凭证（可选）">
          <Upload
            listType="picture-card"
            fileList={fileList}
            onChange={({ fileList: newList }) => setFileList(newList.slice(0, 3))}
            beforeUpload={beforeUpload}
            accept=".jpg,.jpeg,.png"
            maxCount={3}
          >
            {fileList.length < 3 && (
              <div>
                <PlusOutlined />
                <div style={{ marginTop: 8 }}>上传凭证</div>
              </div>
            )}
          </Upload>
          <div style={{ color: '#999', fontSize: 12 }}>
            支持 jpg/png 格式，单张不超过 5MB，最多3张
          </div>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ExtensionModal;
