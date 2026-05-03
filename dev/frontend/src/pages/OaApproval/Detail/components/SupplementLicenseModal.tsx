/**
 * 营业执照补交弹窗
 * 遵循 ActionFormModal 模式
 */
import React, { useState } from 'react';
import { Modal, Upload, Button, message, Alert } from 'antd';
import { UploadOutlined, InboxOutlined } from '@ant-design/icons';
import type { UploadFile, RcFile } from 'antd/es/upload/interface';
import { supplementLicense } from '@/services/api/oa-approval';

const { Dragger } = Upload;

interface SupplementLicenseModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  instanceId: number;
  customerId: number;
}

const SupplementLicenseModal: React.FC<SupplementLicenseModalProps> = ({
  visible,
  onClose,
  onSuccess,
  instanceId,
  customerId,
}) => {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (fileList.length === 0) {
      message.warning('请上传营业执照图片');
      return;
    }

    const files = fileList
      .map(f => f.originFileObj)
      .filter((f): f is RcFile => !!f);

    if (files.length === 0) {
      message.warning('请选择有效的图片文件');
      return;
    }

    setLoading(true);
    try {
      await supplementLicense(instanceId, files, customerId);
      message.success('营业执照补交成功');
      setFileList([]);
      onSuccess();
    } catch (err: any) {
      message.error(err?.message || '营业执照补交失败');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFileList([]);
    onClose();
  };

  return (
    <Modal
      title="补交营业执照"
      open={visible}
      onCancel={handleClose}
      destroyOnClose
      footer={[
        <Button key="cancel" onClick={handleClose}>
          取消
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={loading}
          onClick={handleSubmit}
          disabled={fileList.length === 0}
        >
          确认补交
        </Button>,
      ]}
    >
      <Alert
        message="请上传客户营业执照图片"
        description="支持 JPG/PNG 格式，单文件不超过 5MB，最多 3 张。补交后考核将自动停止。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Dragger
        accept="image/jpeg,image/jpg,image/png"
        multiple
        maxCount={3}
        fileList={fileList}
        beforeUpload={(file) => {
          // 文件大小校验
          if (file.size / 1024 / 1024 >= 5) {
            message.error('图片大小不能超过 5MB');
            return Upload.LIST_IGNORE;
          }
          return false; // 不自动上传，手动提交
        }}
        onChange={({ fileList: newList }) => setFileList(newList)}
        onRemove={(file) => {
          const index = fileList.indexOf(file);
          const newFileList = fileList.slice();
          newFileList.splice(index, 1);
          setFileList(newFileList);
        }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">点击或拖拽图片到此区域上传</p>
        <p className="ant-upload-hint">支持 JPG/PNG，单文件不超过 5MB</p>
      </Dragger>
    </Modal>
  );
};

export default SupplementLicenseModal;
