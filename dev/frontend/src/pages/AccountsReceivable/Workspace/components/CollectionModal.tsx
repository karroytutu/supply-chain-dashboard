/**
 * 催收结果提交弹窗
 * PC端使用Modal，移动端使用Drawer
 * 支持从快速操作按钮直接打开特定类型
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
  Radio,
  Space,
  message,
  Spin,
  Image,
} from 'antd';
import {
  UploadOutlined,
  CameraOutlined,
  CalendarOutlined,
  SafetyCertificateOutlined,
  CheckCircleOutlined,
  RiseOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
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
  /** 初始操作类型（从快速操作按钮传入） */
  initialAction?: 'customer_delay' | 'guarantee' | 'paidOff' | 'escalate';
}

type ResultType = 'customer_delay' | 'guarantee_delay' | 'paid_off' | 'escalate';

// 快捷日期选项
const QUICK_DATE_OPTIONS = [
  { label: '明天', days: 1 },
  { label: '3天后', days: 3 },
  { label: '7天后', days: 7 },
];

// 升级催收常用理由
const ESCALATE_REASONS = [
  '客户失联，无法联系',
  '客户拒绝付款',
  '客户经营困难，无力偿还',
  '其他原因',
];

// 结果类型配置
const RESULT_TYPE_OPTIONS: Array<{
  value: ResultType;
  label: string;
  icon: React.ReactNode;
  description: string;
  recommended?: boolean;
}> = [
  {
    value: 'customer_delay',
    label: '客户确认延期',
    icon: <CalendarOutlined />,
    description: '客户同意延期付款',
    recommended: true,
  },
  {
    value: 'guarantee_delay',
    label: '营销担保延期',
    icon: <SafetyCertificateOutlined />,
    description: '需要手写签名担保',
  },
  {
    value: 'paid_off',
    label: '已回款/核销',
    icon: <CheckCircleOutlined />,
    description: '确认收到款项',
  },
  {
    value: 'escalate',
    label: '升级催收',
    icon: <RiseOutlined />,
    description: '需要上级介入处理',
  },
];

// localStorage key for remembering last result type
const LAST_RESULT_TYPE_KEY = 'ar_last_result_type';

const CollectionModal: React.FC<CollectionModalProps> = ({
  task,
  visible,
  onCancel,
  onSuccess,
  isMobile = false,
  initialAction,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resultType, setResultType] = useState<ResultType>('customer_delay');
  const [signatures, setSignatures] = useState<ArUserSignature[]>([]);
  const [signatureData, setSignatureData] = useState<string>('');
  const [evidenceUrl, setEvidenceUrl] = useState<string>('');
  const [uploadLoading, setUploadLoading] = useState(false);

  // 获取初始结果类型
  const getInitialResultType = useCallback((): ResultType => {
    if (initialAction === 'guarantee') return 'guarantee_delay';
    if (initialAction === 'paidOff') return 'paid_off';
    if (initialAction === 'escalate') return 'escalate';
    // 从 localStorage 获取上次选择
    const lastType = localStorage.getItem(LAST_RESULT_TYPE_KEY) as ResultType | null;
    if (lastType && ['customer_delay', 'guarantee_delay', 'paid_off', 'escalate'].includes(lastType)) {
      return lastType;
    }
    return 'customer_delay';
  }, [initialAction]);

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
      const initialType = getInitialResultType();
      setResultType(initialType);
      setSignatureData('');
      setEvidenceUrl('');
    }
  }, [visible, form, loadSignatures, getInitialResultType]);

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

  // 快捷日期选择
  const handleQuickDate = (days: number) => {
    const date = dayjs().add(days, 'day');
    form.setFieldValue('latestPayDate', date);
  };

  // 快捷理由选择
  const handleQuickReason = (reason: string) => {
    form.setFieldValue('escalateReason', reason);
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
        } catch {
          // 忽略保存签名错误
        }
      }

      // 记住用户选择
      localStorage.setItem(LAST_RESULT_TYPE_KEY, resultType);

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

  // 渲染快捷日期按钮
  const renderQuickDateButtons = () => (
    <div className={styles.quickButtons}>
      <span className={styles.quickLabel}>快捷选择：</span>
      <Space size="small">
        {QUICK_DATE_OPTIONS.map((option) => (
          <Button
            key={option.days}
            size="small"
            onClick={() => handleQuickDate(option.days)}
          >
            {option.label}
          </Button>
        ))}
      </Space>
    </div>
  );

  // 渲染快捷理由按钮
  const renderQuickReasonButtons = () => (
    <div className={styles.quickButtons}>
      <span className={styles.quickLabel}>常用理由：</span>
      <Space size="small" wrap>
        {ESCALATE_REASONS.map((reason) => (
          <Button
            key={reason}
            size="small"
            onClick={() => handleQuickReason(reason)}
          >
            {reason}
          </Button>
        ))}
      </Space>
    </div>
  );

  // 渲染结果类型选择器
  const renderResultTypeSelector = () => (
    <div className={styles.typeSelector}>
      {RESULT_TYPE_OPTIONS.map((option) => (
        <div
          key={option.value}
          className={`${styles.typeCard} ${resultType === option.value ? styles.typeCardActive : ''}`}
          onClick={() => setResultType(option.value)}
        >
          <div className={styles.typeIcon}>{option.icon}</div>
          <div className={styles.typeContent}>
            <div className={styles.typeLabel}>
              {option.label}
              {option.recommended && (
                <span className={styles.recommendedTag}>最常用</span>
              )}
            </div>
            <div className={styles.typeDesc}>{option.description}</div>
          </div>
        </div>
      ))}
    </div>
  );

  // 渲染表单内容
  const renderFormContent = () => (
    <Spin spinning={loading}>
      {/* 任务信息摘要 */}
      {task && (
        <div className={styles.taskSummary}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>客户：</span>
            <span className={styles.summaryValue}>{task.consumer_name}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>欠款：</span>
            <span className={styles.summaryAmount}>
              ¥{(task.owed_amount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}

      <Form
        form={form}
        layout="vertical"
        className={styles.form}
      >
        {/* 结果类型选择 */}
        <Form.Item label="选择处理结果" required>
          {renderResultTypeSelector()}
        </Form.Item>

        {/* 客户确认延期：日期选择 + 图片上传 */}
        {resultType === 'customer_delay' && (
          <>
            {renderQuickDateButtons()}
            <Form.Item
              name="latestPayDate"
              label="约定付款日期"
              rules={[{ required: true, message: '请选择约定付款日期' }]}
            >
              <DatePicker
                style={{ width: '100%' }}
                placeholder="请选择日期（30天内）"
                disabledDate={(current) => {
                  const today = dayjs().startOf('day');
                  const maxDate = today.add(30, 'day');
                  return current ? (current < today || current > maxDate) : false;
                }}
              />
            </Form.Item>
            <Form.Item label="上传凭证（选填）">
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
            <Form.Item name="remark" label="备注（选填）">
              <Input.TextArea
                rows={2}
                placeholder="其他需要说明的内容"
              />
            </Form.Item>
          </>
        )}

        {/* 营销担保延期：日期选择 + 签名 */}
        {resultType === 'guarantee_delay' && (
          <>
            {renderQuickDateButtons()}
            <Form.Item
              name="latestPayDate"
              label="约定付款日期"
              rules={[{ required: true, message: '请选择约定付款日期' }]}
            >
              <DatePicker
                style={{ width: '100%' }}
                placeholder="请选择日期（30天内）"
                disabledDate={(current) => {
                  const today = dayjs().startOf('day');
                  const maxDate = today.add(30, 'day');
                  return current ? (current < today || current > maxDate) : false;
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
            <Form.Item name="remark" label="备注（选填）">
              <Input.TextArea
                rows={2}
                placeholder="其他需要说明的内容"
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
          <>
            {renderQuickReasonButtons()}
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
          </>
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
      width={640}
      className={styles.collectionModal}
      footer={renderFooter()}
    >
      {renderFormContent()}
    </Modal>
  );
};

export default CollectionModal;
