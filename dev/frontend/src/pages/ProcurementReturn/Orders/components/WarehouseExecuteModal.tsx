/**
 * 仓储执行弹窗组件
 * 支持上传多张凭证图片（最多9张）
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Modal, Form, Upload, Input, message } from 'antd';
import type { UploadFile, UploadProps } from 'antd/es/upload/interface';
import { PlusOutlined } from '@ant-design/icons';
import { warehouseExecute, uploadReturnEvidence } from '@/services/api/procurement-return';
import type { ReturnOrder } from '@/types/procurement-return';

interface WarehouseExecuteModalProps {
  visible: boolean;
  record: ReturnOrder | null;
  onClose: () => void;
  onSuccess: () => void;
}

const MAX_COUNT = 9;

const WarehouseExecuteModal: React.FC<WarehouseExecuteModalProps> = ({
  visible,
  record,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const pendingFilesRef = useRef<File[]>([]);
  const uploadTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 弹窗打开时重置表单
  useEffect(() => {
    if (visible && record) {
      form.resetFields();
      setFileList([]);
      setEvidenceUrls([]);
      pendingFilesRef.current = [];
      if (uploadTimerRef.current) {
        clearTimeout(uploadTimerRef.current);
        uploadTimerRef.current = null;
      }
    }
  }, [visible, record, form]);

  // 执行批量上传
  const doUpload = useCallback(async () => {
    const filesToUpload = [...pendingFilesRef.current];
    pendingFilesRef.current = [];

    if (filesToUpload.length === 0) return;

    // 检查总数量限制
    const availableSlots = MAX_COUNT - fileList.length;
    const actualFiles = filesToUpload.slice(0, availableSlots);

    if (actualFiles.length === 0) {
      message.warning(`最多上传 ${MAX_COUNT} 张图片`);
      return;
    }

    setUploading(true);
    try {
      const result = await uploadReturnEvidence(actualFiles);
      if (result.success && result.urls) {
        // 创建文件列表项
        const newFiles: UploadFile[] = result.urls.map((url, index) => ({
          uid: `${Date.now()}-${index}-${Math.random()}`,
          name: actualFiles[index]?.name || `image-${index}`,
          status: 'done' as const,
          url,
        }));

        setFileList(prev => [...prev, ...newFiles]);
        setEvidenceUrls(prev => [...prev, ...result.urls]);
        message.success(`成功上传 ${result.urls.length} 张图片`);
      }
    } catch (error) {
      message.error('上传失败');
    } finally {
      setUploading(false);
    }
  }, [fileList.length]);

  // 处理文件选择前的验证
  const handleBeforeUpload = (file: File): false => {
    // 检查文件格式
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      message.error('只支持 jpg/jpeg/png 格式的图片');
      return false;
    }

    // 检查文件大小
    const isLt5M = file.size / 1024 / 1024 < 5;
    if (!isLt5M) {
      message.error('图片大小不能超过 5MB');
      return false;
    }

    // 检查数量限制
    const currentCount = fileList.length + pendingFilesRef.current.length;
    if (currentCount >= MAX_COUNT) {
      message.warning(`最多上传 ${MAX_COUNT} 张图片`);
      return false;
    }

    // 收集待上传文件
    pendingFilesRef.current.push(file);

    // 使用防抖机制，确保所有文件收集完成后再上传
    if (uploadTimerRef.current) {
      clearTimeout(uploadTimerRef.current);
    }
    uploadTimerRef.current = setTimeout(() => {
      doUpload();
      uploadTimerRef.current = null;
    }, 200);

    return false; // 阻止自动上传
  };

  // 删除图片
  const handleRemove = (file: UploadFile) => {
    const index = fileList.findIndex(f => f.uid === file.uid);
    if (index > -1) {
      const newFileList = fileList.filter(f => f.uid !== file.uid);
      const newUrls = evidenceUrls.filter((_, i) => i !== index);
      setFileList(newFileList);
      setEvidenceUrls(newUrls);
    }
  };

  // 提交表单
  const handleSubmit = async () => {
    if (!record) return;

    if (evidenceUrls.length === 0) {
      message.error('请至少上传一张退货凭证图片');
      return;
    }

    try {
      const values = await form.validateFields();
      setLoading(true);

      await warehouseExecute(record.id, {
        evidenceUrls,
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
    setFileList([]);
    setEvidenceUrls([]);
    pendingFilesRef.current = [];
    if (uploadTimerRef.current) {
      clearTimeout(uploadTimerRef.current);
      uploadTimerRef.current = null;
    }
    onClose();
  };

  // 上传按钮
  const uploadButton = (
    <div>
      <PlusOutlined />
      <div style={{ marginTop: 8 }}>上传凭证</div>
    </div>
  );

  return (
    <Modal
      title="仓储退货执行"
      open={visible}
      onOk={handleSubmit}
      onCancel={handleCancel}
      confirmLoading={loading}
      okText="确认执行"
      cancelText="取消"
      width={560}
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
          label={
            <span>
              上传退货凭证
              <span style={{ color: '#999', fontSize: 12, marginLeft: 8 }}>
                （最多 {MAX_COUNT} 张，支持 jpg/jpeg/png，单张不超过 5MB）
              </span>
            </span>
          }
          required
        >
          <Upload
            multiple
            accept="image/jpeg,image/jpg,image/png"
            fileList={fileList}
            beforeUpload={handleBeforeUpload}
            onRemove={handleRemove}
            listType="picture-card"
            disabled={uploading}
          >
            {fileList.length >= MAX_COUNT ? null : uploadButton}
          </Upload>
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
