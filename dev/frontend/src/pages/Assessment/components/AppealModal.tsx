/**
 * 考核申诉弹窗
 */
import React from 'react';
import { Modal, Form, Input, Upload, Card, Descriptions } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { createBeforeUpload, validateDocumentFile } from '@/utils/uploadValidation';

interface AppealModalProps {
  visible: boolean;
  record: AssessmentRecord | null;
  loading: boolean;
  onClose: () => void;
  onSubmit: (id: number, reason: string, documents?: string[]) => void;
}

const AppealModal: React.FC<AppealModalProps> = ({
  visible,
  record,
  loading,
  onClose,
  onSubmit,
}) => {
  const [form] = Form.useForm();

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const documents = (values.documents || []).map((f: any) => f.name || f.url || '');
      if (record) {
        onSubmit(record.id, values.reason, documents.filter(Boolean));
      }
    } catch {
      // 表单验证失败
    }
  };

  const handleClose = () => {
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      title="提交申诉"
      open={visible}
      onOk={handleOk}
      onCancel={handleClose}
      confirmLoading={loading}
      destroyOnClose
      width={560}
    >
      {record && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="被考核人">{record.assessmentUserName}</Descriptions.Item>
            <Descriptions.Item label="考核金额">
              <span style={{ color: '#f5222d' }}>¥{record.penaltyAmount?.toFixed(2)}</span>
            </Descriptions.Item>
            <Descriptions.Item label="考核规则">{record.ruleType}</Descriptions.Item>
          </Descriptions>
        </Card>
      )}
      <Form form={form} layout="vertical">
        <Form.Item
          name="reason"
          label="申诉理由"
          rules={[{ required: true, message: '请填写申诉理由' }]}
        >
          <Input.TextArea
            rows={4}
            placeholder="请详细说明申诉理由"
            maxLength={500}
            showCount
          />
        </Form.Item>
        <Form.Item
          name="documents"
          label="支持性材料（可选）"
          valuePropName="fileList"
          getValueFromEvent={(e: any) => {
            if (Array.isArray(e)) return e;
            return e?.fileList || [];
          }}
        >
          <Upload
            listType="text"
            maxCount={5}
            accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
            beforeUpload={createBeforeUpload(validateDocumentFile)}
          >
            <span style={{ color: '#1890ff', cursor: 'pointer' }}>
              <UploadOutlined /> 上传文件（最多5个）
            </span>
          </Upload>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default AppealModal;
