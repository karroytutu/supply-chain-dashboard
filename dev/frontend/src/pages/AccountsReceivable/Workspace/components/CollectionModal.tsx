/**
 * 催收结果提交弹窗
 * PC端使用Modal，移动端使用Drawer
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  Drawer,
  Form,
  DatePicker,
  Upload,
  Input,
  Button,
  Segmented,
  message,
  Spin,
  Image,
} from 'antd';
import { UploadOutlined, CameraOutlined } from '@ant-design/icons';
import type { ArCollectionTask, ArUserSignature } from '@/types/accounts-receivable';
import {
  submitCollectionResult,
  uploadEvidence,
  getSignatures,
  saveSignature,
} from '@/services/api/accounts-receivable';
import SignaturePad from '@/components/SignaturePad';
import styles from './CollectionModal.less';

interface CollectionModalProps {
  task: ArCollectionTask | null;
  visible: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  isMobile?: boolean;
}

type ResultType = 'customer_delay' | 'guarantee_delay' | 'paid_off' | 'escalate';

const CollectionModal: React.FC<CollectionModalProps> = ({
  task,
  visible,
  onCancel,
  onSuccess,
  isMobile = false,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resultType, setResultType] = useState<ResultType>('customer_delay');
  const [signatures, setSignatures] = useState<ArUserSignature[]>([]);
  const [signatureData, setSignatureData] = useState<string>('');
  const [evidenceUrl, setEvidenceUrl] = useState<string>('');
  const [uploadLoading, setUploadLoading] = useState(false);

  // 加载历史签名
  const loadSignatures = useCallback(async () => {
    try {
      const result = await getSignatures();
      setSignatures(result);
    } catch (error) {
      console.error('加载签名失败:', error);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      loadSignatures();
      // 重置表单
      form.resetFields();
      setResultType('customer_delay');
      setSignatureData('');
      setEvidenceUrl('');
    }
  }, [visible, form, loadSignatures]);

  // 处理文件上传
  const handleUpload = async (file: File) => {
    setUploadLoading(true);
    try {
      const result = await uploadEvidence(file);
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
    if (!task) return;

    try {
      const values = await form.validateFields();
      setSubmitting(true);

      const params = {
        resultType,
        latestPayDate: values.latestPayDate?.format('YYYY-MM-DD'),
        evidenceUrl: resultType === 'customer_delay' ? evidenceUrl : undefined,
        signatureData: resultType === 'guarantee_delay' ? signatureData : undefined,
        escalateReason: resultType === 'escalate' ? values.escalateReason : undefined,
        remark: values.remark,
      };

      await submitCollectionResult(task.ar_id, params);

      // 保存新签名（如果是担保延期且是新签名）
      if (resultType === 'guarantee_delay' && signatureData && !signatures.some(s => s.signature_data === signatureData)) {
        try {
          await saveSignature({ signatureData, isDefault: false });
        } catch (e) {
          // 忽略保存签名错误
        }
      }

      message.success('提交成功');
      onSuccess();
      onCancel();
    } catch (error) {
      console.error('提交失败:', error);
      message.error('提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  // 渲染表单内容
  const renderFormContent = () => (
    <Spin spinning={loading}>
      <Form
        form={form}
        layout="vertical"
        className={styles.form}
      >
        {/* 结果类型选择 */}
        <Form.Item label="处理结果" required>
          <Segmented
            value={resultType}
            onChange={(value) => setResultType(value as ResultType)}
            block
            options={[
              { label: '客户确认延期', value: 'customer_delay' },
              { label: '营销担保延期', value: 'guarantee_delay' },
              { label: '已回款/核销', value: 'paid_off' },
              { label: '升级催收', value: 'escalate' },
            ]}
          />
        </Form.Item>

        {/* 客户确认延期：日期选择 + 图片上传 */}
        {resultType === 'customer_delay' && (
          <>
            <Form.Item
              name="latestPayDate"
              label="约定付款日期"
              rules={[{ required: true, message: '请选择约定付款日期' }]}
            >
              <DatePicker
                style={{ width: '100%' }}
                placeholder="请选择日期（30天内）"
                disabledDate={(current) => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const maxDate = new Date();
                  maxDate.setDate(today.getDate() + 30);
                  maxDate.setHours(23, 59, 59, 999);
                  return current ? (current.valueOf() < today.valueOf() || current.valueOf() > maxDate.valueOf()) : false;
                }}
              />
            </Form.Item>
            <Form.Item label="上传凭证">
              <Upload
                accept="image/*"
                beforeUpload={handleUpload}
                showUploadList={false}
              >
                <Button
                  icon={isMobile ? <CameraOutlined /> : <UploadOutlined />}
                  loading={uploadLoading}
                >
                  {isMobile ? '拍照上传' : '上传图片'}
                </Button>
              </Upload>
              {evidenceUrl && (
                <div className={styles.preview}>
                  <Image
                    src={evidenceUrl}
                    alt="凭证"
                    width={120}
                    height={80}
                    style={{ objectFit: 'cover' }}
                  />
                </div>
              )}
            </Form.Item>
          </>
        )}

        {/* 营销担保延期：日期选择 + 签名 */}
        {resultType === 'guarantee_delay' && (
          <>
            <Form.Item
              name="latestPayDate"
              label="约定付款日期"
              rules={[{ required: true, message: '请选择约定付款日期' }]}
            >
              <DatePicker
                style={{ width: '100%' }}
                placeholder="请选择日期（30天内）"
                disabledDate={(current) => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const maxDate = new Date();
                  maxDate.setDate(today.getDate() + 30);
                  maxDate.setHours(23, 59, 59, 999);
                  return current ? (current.valueOf() < today.valueOf() || current.valueOf() > maxDate.valueOf()) : false;
                }}
              />
            </Form.Item>
            <Form.Item label="手写签名" required>
              <SignaturePad
                value={signatureData}
                onChange={setSignatureData}
                signatures={signatures}
              />
            </Form.Item>
          </>
        )}

        {/* 已回款/核销：确认说明 */}
        {resultType === 'paid_off' && (
          <Form.Item
            name="remark"
            label="确认说明"
            rules={[{ required: true, message: '请填写确认说明' }]}
          >
            <Input.TextArea
              rows={4}
              placeholder="请填写回款/核销的详细说明"
            />
          </Form.Item>
        )}

        {/* 升级催收：理由（必填） */}
        {resultType === 'escalate' && (
          <Form.Item
            name="escalateReason"
            label="升级理由"
            rules={[{ required: true, message: '请填写升级理由' }]}
          >
            <Input.TextArea
              rows={4}
              placeholder="请详细说明升级催收的原因"
            />
          </Form.Item>
        )}

        {/* 通用备注 */}
        {resultType !== 'escalate' && resultType !== 'paid_off' && (
          <Form.Item name="remark" label="备注">
            <Input.TextArea
              rows={2}
              placeholder="选填：其他需要说明的内容"
            />
          </Form.Item>
        )}
      </Form>
    </Spin>
  );

  // 渲染底部按钮
  const renderFooter = () => (
    <div className={styles.footer}>
      <Button onClick={onCancel}>取消</Button>
      <Button
        type="primary"
        onClick={handleSubmit}
        loading={submitting}
      >
        提交
      </Button>
    </div>
  );

  // 移动端使用 Drawer
  if (isMobile) {
    return (
      <Drawer
        title="处理催收任务"
        placement="bottom"
        height="90%"
        onClose={onCancel}
        open={visible}
        className={styles.collectionDrawer}
        footer={renderFooter()}
      >
        {renderFormContent()}
      </Drawer>
    );
  }

  // PC端使用 Modal
  return (
    <Modal
      title="处理催收任务"
      open={visible}
      onCancel={onCancel}
      onOk={handleSubmit}
      confirmLoading={submitting}
      width={600}
      className={styles.collectionModal}
    >
      {renderFormContent()}
    </Modal>
  );
};

export default CollectionModal;
