/**
 * 仓储执行弹窗组件
 * 支持上传多张凭证图片（最多9张）
 */
import React, { useEffect, useState } from 'react';
import { Modal, Form, Upload, Input, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { warehouseExecute } from '@/services/api/procurement-return';
import type { ReturnOrder } from '@/types/procurement-return';
import { useEvidenceUpload } from './useEvidenceUpload';

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
  const {
    fileList,
    evidenceUrls,
    uploading,
    handleBeforeUpload,
    handleRemove,
    reset,
    maxCount,
  } = useEvidenceUpload();

  // 弹窗打开时重置
  useEffect(() => {
    if (visible && record) {
      form.resetFields();
      reset();
    }
  }, [visible, record, form, reset]);

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
    } catch {
      message.error('执行失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 弹窗关闭
  const handleCancel = () => {
    form.resetFields();
    reset();
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
      width={560}
    >
      {record && (
        <div style={{ marginBottom: 24 }}>
          <p><strong>退货单号：</strong>{record.returnNo}</p>
          <p><strong>商品名称：</strong>{record.goodsName}</p>
          <p><strong>ERP退货单号：</strong>{record.erpReturnNo || '-'}</p>
        </div>
      )}

      <Form form={form} layout="vertical" autoComplete="off">
        <Form.Item
          label={
            <span>
              上传退货凭证
              <span style={{ color: '#999', fontSize: 12, marginLeft: 8 }}>
                （最多 {maxCount} 张，支持 jpg/jpeg/png，单张不超过 5MB）
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
            {fileList.length >= maxCount ? null : (
              <div>
                <PlusOutlined />
                <div style={{ marginTop: 8 }}>上传凭证</div>
              </div>
            )}
          </Upload>
        </Form.Item>

        <Form.Item
          name="comment"
          label="备注"
          rules={[{ max: 500, message: '备注最多500个字符' }]}
        >
          <Input.TextArea placeholder="请输入备注信息（可选）" rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export { WarehouseExecuteModal };
export default WarehouseExecuteModal;
