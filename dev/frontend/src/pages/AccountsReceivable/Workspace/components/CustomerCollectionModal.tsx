/**
 * 客户催收结果提交弹窗
 * 支持统一操作和混合操作
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
  Radio,
  Space,
  message,
  Spin,
  Image,
  Table,
  Select,
  Tabs,
} from 'antd';
import type { TabsProps } from 'antd';
import {
  UploadOutlined,
  CameraOutlined,
  CalendarOutlined,
  SafetyCertificateOutlined,
  CheckCircleOutlined,
  RiseOutlined,
  EditOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { ArCustomerCollectionTask, CustomerTaskBill, ArUserSignature } from '@/types/accounts-receivable';
import {
  getCustomerTaskDetail,
  submitCustomerCollectResult,
  submitCustomerMixedResult,
  escalateCustomerTask,
  uploadEvidence,
  getSignatures,
  saveSignature,
} from '@/services/api/accounts-receivable';
import SignaturePad from '@/components/SignaturePad';
import styles from './CustomerCollectionModal.less';

interface CustomerCollectionModalProps {
  task: ArCustomerCollectionTask | null;
  visible: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  isMobile?: boolean;
  /** 初始操作类型（从快速操作按钮传入） */
  initialAction?: 'guarantee' | 'paidOff' | 'escalate';
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
}> = [
  {
    value: 'customer_delay',
    label: '客户确认延期',
    icon: <CalendarOutlined />,
    description: '客户同意延期付款',
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

// localStorage key
const LAST_RESULT_TYPE_KEY = 'ar_last_result_type';

const CustomerCollectionModal: React.FC<CustomerCollectionModalProps> = ({
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
  const [bills, setBills] = useState<CustomerTaskBill[]>([]);
  const [operationMode, setOperationMode] = useState<'unified' | 'mixed'>('unified');
  const [resultType, setResultType] = useState<ResultType>('customer_delay');
  const [signatures, setSignatures] = useState<ArUserSignature[]>([]);
  const [signatureData, setSignatureData] = useState<string>('');
  const [evidenceUrl, setEvidenceUrl] = useState<string>('');
  const [uploadLoading, setUploadLoading] = useState(false);

  // 混合操作状态：每个单据的结果
  const [billResults, setBillResults] = useState<Record<number, { resultType: ResultType; latestPayDate?: string }>>({});

  // 获取初始结果类型
  const getInitialResultType = useCallback((): ResultType => {
    if (initialAction === 'guarantee') return 'guarantee_delay';
    if (initialAction === 'paidOff') return 'paid_off';
    if (initialAction === 'escalate') return 'escalate';
    const lastType = localStorage.getItem(LAST_RESULT_TYPE_KEY) as ResultType | null;
    if (lastType && ['customer_delay', 'guarantee_delay', 'paid_off', 'escalate'].includes(lastType)) {
      return lastType;
    }
    return 'customer_delay';
  }, [initialAction]);

  // 加载任务单据明细
  const loadTaskBills = useCallback(async () => {
    if (!task) return;
    setLoading(true);
    try {
      const response = await getCustomerTaskDetail(task.id);
      const detail = response.data || response;
      setBills(detail.bills || []);
    } catch (error) {
      console.error('加载单据明细失败:', error);
    } finally {
      setLoading(false);
    }
  }, [task]);

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
    if (visible && task) {
      loadTaskBills();
      loadSignatures();
      form.resetFields();
      const initialType = getInitialResultType();
      setResultType(initialType);
      setSignatureData('');
      setEvidenceUrl('');
      setBillResults({});
      setOperationMode('unified');
    }
  }, [visible, task, form, loadTaskBills, loadSignatures, getInitialResultType]);

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
    return false;
  };

  // 快捷日期选择
  const handleQuickDate = (days: number) => {
    form.setFieldValue('latestPayDate', dayjs().add(days, 'day'));
  };

  // 快捷理由选择
  const handleQuickReason = (reason: string) => {
    form.setFieldValue('escalateReason', reason);
  };

  // 格式化金额
  const formatAmount = (amount?: number): string => {
    if (amount === undefined || amount === null) return '¥0.00';
    return `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;
  };

  // 提交统一操作
  const submitUnified = async (values: any) => {
    if (!task) return;

    if (resultType === 'escalate') {
      // 升级操作
      await escalateCustomerTask(task.id, {
        escalateReason: values.escalateReason,
      });
    } else {
      await submitCustomerCollectResult(task.id, {
        resultType,
        latestPayDate: values.latestPayDate?.format('YYYY-MM-DD'),
        evidenceUrl: resultType === 'customer_delay' ? evidenceUrl : undefined,
        signatureData: resultType === 'guarantee_delay' ? signatureData : undefined,
        remark: values.remark,
      });
    }
  };

  // 提交混合操作
  const submitMixed = async () => {
    if (!task) return;

    const billsData = Object.entries(billResults).map(([arId, data]) => ({
      arId: parseInt(arId, 10),
      resultType: data.resultType,
      latestPayDate: data.latestPayDate,
    }));

    if (billsData.length === 0 || billsData.length !== bills.length) {
      message.error('请为所有单据选择处理结果');
      return;
    }

    await submitCustomerMixedResult(task.id, {
      bills: billsData,
      evidenceUrl,
      signatureData,
    });
  };

  // 提交表单
  const handleSubmit = async () => {
    if (!task) return;

    try {
      setSubmitting(true);

      if (operationMode === 'unified') {
        const values = await form.validateFields();
        await submitUnified(values);

        // 保存新签名
        if (resultType === 'guarantee_delay' && signatureData && !signatures.some(s => s.signature_data === signatureData)) {
          try {
            await saveSignature({ signatureData, isDefault: false });
          } catch {}
        }

        localStorage.setItem(LAST_RESULT_TYPE_KEY, resultType);
      } else {
        await submitMixed();
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

  // 更新单据结果
  const updateBillResult = (arId: number, field: 'resultType' | 'latestPayDate', value: any) => {
    setBillResults(prev => ({
      ...prev,
      [arId]: {
        ...prev[arId],
        resultType: prev[arId]?.resultType || 'customer_delay',
        [field]: value,
      },
    }));
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
      {RESULT_TYPE_OPTIONS.filter(opt => opt.value !== 'escalate' || operationMode === 'unified').map((option) => (
        <div
          key={option.value}
          className={`${styles.typeCard} ${resultType === option.value ? styles.typeCardActive : ''}`}
          onClick={() => setResultType(option.value)}
        >
          <div className={styles.typeIcon}>{option.icon}</div>
          <div className={styles.typeContent}>
            <div className={styles.typeLabel}>{option.label}</div>
            <div className={styles.typeDesc}>{option.description}</div>
          </div>
        </div>
      ))}
    </div>
  );

  // 渲染混合操作表格
  const renderMixedTable = () => {
    const columns = [
      {
        title: '单据号',
        dataIndex: 'erp_bill_id',
        key: 'erp_bill_id',
        width: 100,
      },
      {
        title: '欠款金额',
        dataIndex: 'left_amount',
        key: 'left_amount',
        width: 90,
        render: (v: number) => formatAmount(v),
      },
      {
        title: '逾期天数',
        dataIndex: 'overdue_days',
        key: 'overdue_days',
        width: 80,
        render: (v: number) => `${v || 0}天`,
      },
      {
        title: '处理结果',
        key: 'resultType',
        width: 140,
        render: (_: any, bill: CustomerTaskBill) => (
          <Select
            size="small"
            style={{ width: '100%' }}
            placeholder="选择结果"
            value={billResults[bill.ar_id]?.resultType}
            onChange={(v) => updateBillResult(bill.ar_id, 'resultType', v)}
            options={RESULT_TYPE_OPTIONS.filter(opt => opt.value !== 'escalate').map(opt => ({
              value: opt.value,
              label: opt.label,
            }))}
          />
        ),
      },
      {
        title: '延期日期',
        key: 'latestPayDate',
        width: 120,
        render: (_: any, bill: CustomerTaskBill) => {
          const resultType = billResults[bill.ar_id]?.resultType;
          if (resultType !== 'customer_delay' && resultType !== 'guarantee_delay') return '-';
          return (
            <DatePicker
              size="small"
              style={{ width: '100%' }}
              placeholder="选择日期"
              disabledDate={(current) => {
                const today = dayjs().startOf('day');
                const maxDate = today.add(30, 'day');
                return current ? (current < today || current > maxDate) : false;
              }}
              onChange={(date) => updateBillResult(bill.ar_id, 'latestPayDate', date?.format('YYYY-MM-DD'))}
            />
          );
        },
      },
    ];

    return (
      <Table
        columns={columns}
        dataSource={bills}
        rowKey="ar_id"
        pagination={false}
        size="small"
        scroll={{ x: 530 }}
      />
    );
  };

  // 渲染统一操作表单
  const renderUnifiedForm = () => (
    <>
      {/* 任务信息摘要 */}
      {task && (
        <div className={styles.taskSummary}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>客户：</span>
            <span className={styles.summaryValue}>{task.consumer_name}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>欠款总额：</span>
            <span className={styles.summaryAmount}>
              ¥{(task.total_amount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>单据数：</span>
            <span className={styles.summaryValue}>{task.bill_count} 单</span>
          </div>
        </div>
      )}

      <Form form={form} layout="vertical" className={styles.form}>
        {/* 结果类型选择 */}
        <Form.Item label="选择处理结果" required>
          {renderResultTypeSelector()}
        </Form.Item>

        {/* 客户确认延期 */}
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
              <Upload accept="image/*" beforeUpload={handleUpload} showUploadList={false}>
                <Button icon={isMobile ? <CameraOutlined /> : <UploadOutlined />} loading={uploadLoading}>
                  {isMobile ? '拍照上传' : '上传图片'}
                </Button>
              </Upload>
              {evidenceUrl && (
                <div className={styles.preview}>
                  <Image src={evidenceUrl} alt="凭证" width={120} height={80} style={{ objectFit: 'cover' }} />
                </div>
              )}
            </Form.Item>
            <Form.Item name="remark" label="备注（选填）">
              <Input.TextArea rows={2} placeholder="其他需要说明的内容" />
            </Form.Item>
          </>
        )}

        {/* 营销担保延期 */}
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
              <SignaturePad value={signatureData} onChange={setSignatureData} signatures={signatures} />
            </Form.Item>
            <Form.Item name="remark" label="备注（选填）">
              <Input.TextArea rows={2} placeholder="其他需要说明的内容" />
            </Form.Item>
          </>
        )}

        {/* 已回款/核销 */}
        {resultType === 'paid_off' && (
          <Form.Item name="remark" label="确认说明" rules={[{ required: true, message: '请填写确认说明' }]}>
            <Input.TextArea rows={4} placeholder="请填写回款/核销的详细说明" />
          </Form.Item>
        )}

        {/* 升级催收 */}
        {resultType === 'escalate' && (
          <>
            {renderQuickReasonButtons()}
            <Form.Item name="escalateReason" label="升级理由" rules={[{ required: true, message: '请填写升级理由' }]}>
              <Input.TextArea rows={4} placeholder="请详细说明升级催收的原因" />
            </Form.Item>
          </>
        )}
      </Form>
    </>
  );

  // 渲染混合操作表单
  const renderMixedForm = () => (
    <>
      {task && (
        <div className={styles.taskSummary}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>客户：</span>
            <span className={styles.summaryValue}>{task.consumer_name}</span>
          </div>
          <div className={styles.summaryTip}>
            <EditOutlined /> 为每张单据单独选择处理结果
          </div>
        </div>
      )}

      <Spin spinning={loading}>
        {renderMixedTable()}
      </Spin>

      {/* 公共凭证 */}
      <div className={styles.sharedEvidence}>
        <Form.Item label="公共凭证（选填）">
          <Upload accept="image/*" beforeUpload={handleUpload} showUploadList={false}>
            <Button icon={isMobile ? <CameraOutlined /> : <UploadOutlined />} loading={uploadLoading}>
              {isMobile ? '拍照上传' : '上传图片'}
            </Button>
          </Upload>
          {evidenceUrl && (
            <div className={styles.preview}>
              <Image src={evidenceUrl} alt="凭证" width={120} height={80} style={{ objectFit: 'cover' }} />
            </div>
          )}
        </Form.Item>
        <Form.Item label="公共签名（选填）">
          <SignaturePad value={signatureData} onChange={setSignatureData} signatures={signatures} />
        </Form.Item>
      </div>
    </>
  );

  // 渲染表单内容
  const renderFormContent = () => (
    <Spin spinning={loading}>
      {/* 操作模式切换 */}
      <div className={styles.modeSwitch}>
        <Radio.Group
          value={operationMode}
          onChange={(e) => setOperationMode(e.target.value)}
          optionType="button"
          buttonStyle="solid"
          size="small"
        >
          <Radio.Button value="unified">统一操作</Radio.Button>
          <Radio.Button value="mixed">分别处理</Radio.Button>
        </Radio.Group>
        <span className={styles.modeTip}>
          {operationMode === 'unified' ? '所有单据使用相同处理结果' : '每张单据可单独处理'}
        </span>
      </div>

      {operationMode === 'unified' ? renderUnifiedForm() : renderMixedForm()}
    </Spin>
  );

  // 渲染底部按钮
  const renderFooter = () => (
    <div className={styles.footer}>
      <Button onClick={onCancel}>取消</Button>
      <Button type="primary" onClick={handleSubmit} loading={submitting}>
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
      width={720}
      className={styles.collectionModal}
      footer={renderFooter()}
    >
      {renderFormContent()}
    </Modal>
  );
};

export default CustomerCollectionModal;
