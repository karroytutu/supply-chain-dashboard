/**
 * 表单填写页面
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { history, useParams, useAccess } from 'umi';
import { Button, Spin, Form, message, Alert } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { oaApprovalApi } from '@/services/api/oa-approval';
import type { FormTypeDefinition } from '@/types/oa-approval';
import { useFormData } from './hooks/useFormData';
import FormFieldConfig from './components/FormFieldConfig';
import ConditionalFieldWrapper, { checkCondition } from './components/ConditionalFieldWrapper';
import { ApprovalFlow } from '@/components/OaApproval';
import { initDingtalkViewportHeight } from '@/utils/dingtalk/utils';
import styles from './index.less';

const FormPage: React.FC = () => {
  const { typeCode } = useParams<{ typeCode: string }>();
  const access = useAccess();
  const [form] = Form.useForm();

  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  const { loading, formType, customerLicenseInfo, licenseLoading, loadFormType, handleCustomerSelect: handleCustomerSelectBase } =
    useFormData(form, formData, setFormData);

  // 包装客户选中回调：autoFill 通过 form.setFieldsValue 设置隐藏字段（_storefrontPhotoUrl 等），
  // 但隐藏字段没有 Form.Item 注册，不会触发 onValuesChange，需手动同步到 formData
  const handleCustomerSelect = useCallback((licenseInfo: any) => {
    handleCustomerSelectBase(licenseInfo);
    setFormData(prev => ({
      ...prev,
      _storefrontPhotoUrl: form.getFieldValue('_storefrontPhotoUrl'),
    }));
  }, [handleCustomerSelectBase, form]);

  // 钉钉 WebView 视口高度修正
  useEffect(() => {
    return initDingtalkViewportHeight();
  }, []);

  // 加载表单类型
  useEffect(() => {
    if (typeCode) {
      loadFormType(typeCode);
    }
  }, [typeCode]);

  /** 从 formSchema 计算字段 key→label 映射，用于流程预览条件人性化 */
  const fieldLabels = useMemo(() => {
    if (!formType) return {};
    const map: Record<string, string> = {};
    formType.formSchema.fields.forEach((f) => { map[f.key] = f.label; });
    return map;
  }, [formType]);

  // 监听表单值变化
  // allValues 不包含没有 Form.Item 注册的隐藏字段（如 _customerName、_storefrontPhotoUrl），
  // 因此必须保留 formData 中已有的 _ 前缀隐藏字段，避免用户编辑可见字段时将其覆盖丢失
  const handleValuesChange = (changedValues: any, allValues: any) => {
    setFormData(prev => {
      // 保留 autoFill 产生的隐藏字段（_ 前缀，onValuesChange 不返回）
      const hiddenFields: Record<string, unknown> = {};
      for (const key of Object.keys(prev)) {
        if (key.startsWith('_')) hiddenFields[key] = prev[key];
      }
      return { ...hiddenFields, ...allValues };
    });
  };

  // ===== 客户档案修改：欠款即时加载与停用校验 =====
  const [debtAmount, setDebtAmount] = useState<number | null>(null);
  const [debtLoading, setDebtLoading] = useState(false);

  const loadCustomerDebt = useCallback(async (customerId: number) => {
    setDebtLoading(true);
    try {
      const result = await oaApprovalApi.getCustomerDebt(customerId);
      const amount = result?.debtAmount ?? null;
      setDebtAmount(amount);
    } catch {
      setDebtAmount(null);
    } finally {
      setDebtLoading(false);
    }
  }, []);

  // 监听 customer 字段变化，加载欠款
  useEffect(() => {
    if (typeCode === 'customer_modify' && formData.customer) {
      loadCustomerDebt(Number(formData.customer));
    }
  }, [typeCode, formData.customer, loadCustomerDebt]);

  // 客户档案修改：状态字段的动态选项（有欠款时禁用停用）
  const customerStateOptions = useMemo(() => {
    if (typeCode !== 'customer_modify') return undefined;
    const hasDebt = debtAmount !== null && debtAmount > 0;
    return [
      { value: 1, label: '启用' },
      { value: 2, label: '待确认' },
      {
        value: 0,
        label: hasDebt ? `停用（有欠款 ¥${debtAmount.toFixed(2)}，不可停用）` : '停用',
        disabled: hasDebt,
      },
    ];
  }, [typeCode, debtAmount]);

  /** 判断字段是否在当前条件下必填 */
  const isFieldRequired = (field: FormTypeDefinition['formSchema']['fields'][0]): boolean => {
    if (field.required) return true;
    if (field.requiredWhen) {
      return checkCondition(field.requiredWhen, formData);
    }
    return false;
  };

  // 生成审批标题
  const generateTitle = (ft: FormTypeDefinition, data: Record<string, unknown>): string => {
    const textField = ft.formSchema.fields.find((f) => f.type === 'text' || f.type === 'textarea');
    const mainFieldValue = textField ? data[textField.key] : '';
    return `${ft.name} - ${mainFieldValue || '新申请'}`;
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (!formType) return;

      // 注入隐藏字段到提交数据（用于后端 requiredWhen 校验）
      if (formData._hasExistingLicense) {
        values._hasExistingLicense = formData._hasExistingLicense;
      }

      // 上传照片文件：将 UploadFile[] 中的原始 File 对象上传到服务器，
      // 获取 URL 后替换为 { url } 对象数组，确保后端可正确读取照片地址
      const photoFields = formType.formSchema.fields.filter(f => f.type === 'photo');
      for (const field of photoFields) {
        const photoValue = values[field.key];
        if (Array.isArray(photoValue) && photoValue.length > 0) {
          const filesToUpload = photoValue
            .filter((item: any) => item.originFileObj instanceof File)
            .map((item: any) => item.originFileObj as File);

          if (filesToUpload.length > 0) {
            const urls = await oaApprovalApi.uploadLicenseFiles(filesToUpload);
            // 替换为包含服务器 URL 的对象数组
            values[field.key] = urls.map((url: string) => ({ url }));
          } else {
            // 无新上传文件（可能只有已存在的 ERP 执照，不需要上传）
            values[field.key] = [];
          }
        }
      }

      const title = generateTitle(formType, values);

      setSubmitting(true);
      const result = await oaApprovalApi.submitApproval({
        formTypeCode: formType.code,
        formData: values,
        title,
      });

      message.success('提交成功');
      // 有详情页权限则跳转详情，否则跳转审批中心
      if (access['oa:approval:read']) {
        history.push(`/oa/detail/${result.data.instanceId}`);
      } else {
        history.push('/oa/center');
      }
    } catch (error: any) {
      if (error.errorFields) {
        message.error('请填写必填项');
      } else {
        message.error(error.message || '提交失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Spin size="large" />
      </div>
    );
  }

  if (!formType) {
    return null;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => history.back()}>
            返回
          </Button>
          <span className={styles.divider} />
          <span className={styles.formTitle}>{formType.name}</span>
          <span className={styles.version}>V{formType.version}</span>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.formSection}>
          <Form form={form} layout="vertical" onValuesChange={handleValuesChange} className={styles.form}>
            {formType.formSchema.fields
              .filter((field) => !field.key.startsWith('_'))
              .map((field) => {
              // 客户档案修改：为状态字段注入动态选项（有欠款时禁用停用）
              const fieldWithOptions = (field.key === 'customerState' && customerStateOptions)
                ? { ...field, options: customerStateOptions }
                : field;
              return (
              <ConditionalFieldWrapper key={field.key} field={field} formData={formData}>
                <Form.Item
                  name={field.key}
                  label={field.label}
                  rules={[{ required: isFieldRequired(field), message: `请输入${field.label}` }]}
                >
                  <FormFieldConfig field={fieldWithOptions} formData={formData} form={form}
                    customerLicenseInfo={customerLicenseInfo}
                    licenseLoading={licenseLoading}
                    onCustomerSelect={handleCustomerSelect}
                    includeAllStates={typeCode === 'customer_modify'}
                  />
                </Form.Item>
              </ConditionalFieldWrapper>
              );
            })}
          </Form>
        </div>

        <div className={styles.sidebar}>
          <ApprovalFlow mode="preview" workflowNodes={formType.workflowDef.nodes} formTypeCode={formType.code} fieldLabels={fieldLabels} formData={formData} />
        </div>
      </div>

      <div className={styles.footer}>
        <Button onClick={() => history.back()}>取消</Button>
        <Button type="primary" loading={submitting} onClick={handleSubmit}>
          提交
        </Button>
      </div>
    </div>
  );
};

export default FormPage;
