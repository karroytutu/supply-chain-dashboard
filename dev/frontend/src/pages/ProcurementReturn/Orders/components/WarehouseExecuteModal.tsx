/**
 * 仓储执行弹窗组件
 * 改为上传凭证图片
 */
import React, { useEffect, useState } from 'react';
import { Modal, Form, Upload, Input, Button, Image, message } from 'antd';
import { UploadOutlined, CameraOutlined } from '@ant-design/icons';
import { warehouseExecute, uploadReturnEvidence } from '@/services/api/procurement-return';
import type { ReturnOrder } from '@/types/procurement-return';

interface WarehouseExecuteModalProps {
  visible: boolean;
  record: ReturnOrder | null;
  onClose: () => void;
  onSuccess: () => void;
}

const WarehouseExecuteModal: React.FC<WarehouseExecuteModalProps> = ({
  visible,
  record,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [evidenceUrl, setEvidenceUrl] = useState<string>('');
  const [uploadLoading, setUploadLoading] = useState(false);

  // 弹窗打开时重置表单
  useEffect(() => {
    if (visible && record) {
      form.resetFields();
      setEvidenceUrl('');
    }
  }, [visible, record, form]);

  // 处理文件上传
  const handleUpload = async (file: File) => {
    setUploadLoading(true);
    try {
      const result = await uploadReturnEvidence(file);
      setEvidenceUrl(result.url);
      message.success('上传成功');
    } catch (error) {
      message.error('上传失败');
    } finally {
      setUploadLoading(false);
    }
    return false; // 阻止默认上传行为
  };

  // 提交表单
  const handleSubmit = async () => {
    if (!record) return;

    if (!evidenceUrl) {
      message.error('请先上传退货凭证图片');
      return;
    }

    try {
      const values = await form.validateFields();
      setLoading(true);

      await warehouseExecute(record.id, {
        evidenceUrl,
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
    setEvidenceUrl('');
    onClose();
  };

  return (
    <Modal
      title="仓储退货执行"
      open={visible}
      onOk={handleSubmit}
      onCancel={handleCancel}
      confirmLoading={loading}
      okText="确认执行"
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
        <Form.Item label="上传退货凭证" required>
          <Upload
            accept="image/*"
            beforeUpload={handleUpload}
            showUploadList={false}
          >
            <Button icon={<UploadOutlined />} loading={uploadLoading}>
              上传图片
            </Button>
          </Upload>
          {evidenceUrl && (
            <div style={{ marginTop: 12 }}>
              <Image
                src={evidenceUrl}
                alt="退货凭证"
                width={200}
                style={{ borderRadius: 4 }}
              />
            </div>
          )}
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
