/**
 * 表单填写页面
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { history, useParams, useAccess } from 'umi';
import { Button, Spin, Form, message } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { oaApprovalApi } from '@/services/api/oa-approval';
import { FormTypeDefinition, ConditionDef } from '@/types/oa-approval';
import { useRecentForms } from '../hooks/useRecentForms';
import FormFieldConfig from './components/FormFieldConfig';
import ConditionalFieldWrapper, { checkCondition } from './components/ConditionalFieldWrapper';
import { ApprovalFlow } from '@/components/OaApproval';
import type { CustomerLicenseInfo } from './components/ErpFieldRenderer';
import styles from './index.less';

const FormPage: React.FC = () => {
  const { typeCode } = useParams<{ typeCode: string }>();
  const access = useAccess();
  const [form] = Form.useForm();
  const { recordUsage } = useRecentForms();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formType, setFormType] = useState<FormTypeDefinition | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  /** 客户已有执照信息（从 ERP 搜索结果提取） */
  const [customerLicenseInfo, setCustomerLicenseInfo] = useState<CustomerLicenseInfo | null>(null);
  /** 执照信息加载中（异步获取 ERP 详情中的图片 URL） */
  const [licenseLoading, setLicenseLoading] = useState(false);
  /** 防止快速切换客户时产生竞态条件 */
  const fetchIdRef = useRef(0);

  /** 客户选中时提取执照信息，同步更新隐藏字段 _hasExistingLicense，并异步获取图片 URL */
  const handleCustomerSelect = (licenseInfo: CustomerLicenseInfo | null) => {
    const licenseValue = licenseInfo?.hasLicense ? 'yes' : 'no';
    setCustomerLicenseInfo(licenseInfo);
    // 同步更新 formData 用于前端条件校验
    setFormData(prev => ({ ...prev, _hasExistingLicense: licenseValue }));
    // 同步更新 form store，确保提交时包含此字段
    form.setFieldsValue({ _hasExistingLicense: licenseValue });

    if (!licenseInfo) {
      // 客户取消选择
      setLicenseLoading(false);
      return;
    }

    // 搜索 API 可能不返回 attachedPicUrls，需异步从详情 API 获取
    if (licenseInfo.hasLicense && licenseInfo.attachedPicUrls.length === 0) {
      const customerId = form.getFieldValue('customer');
      if (!customerId) return;

      fetchIdRef.current++;
      const currentFetchId = fetchIdRef.current;
      setLicenseLoading(true);

      oaApprovalApi.getCustomerLicenseInfo(Number(customerId))
        .then((fullInfo) => {
          if (fetchIdRef.current === currentFetchId) {
            setCustomerLicenseInfo(fullInfo);
            // 如果详情 API 返回 hasLicense 与搜索结果不一致，以详情为准
            if (!fullInfo.hasLicense) {
              setFormData(prev => ({ ...prev, _hasExistingLicense: 'no' }));
              form.setFieldsValue({ _hasExistingLicense: 'no' });
            }
          }
        })
        .catch((err) => {
          console.warn('[FormPage] 获取客户执照信息失败:', err);
          // 保留搜索结果的部分信息，用户仍可手动上传
        })
        .finally(() => {
          if (fetchIdRef.current === currentFetchId) {
            setLicenseLoading(false);
          }
        });
    } else {
      setLicenseLoading(false);
    }
  };

  // 加载表单类型
  useEffect(() => {
    if (typeCode) {
      loadFormType(typeCode);
    }
  }, [typeCode]);

  const loadFormType = async (code: string) => {
    setLoading(true);
    try {
      const res = await oaApprovalApi.getFormType(code);
      setFormType(res.data);
    } catch (error) {
      message.error('加载表单类型失败');
      history.back();
    } finally {
      setLoading(false);
    }
  };

  /** 从 formSchema 计算字段 key→label 映射，用于流程预览条件人性化 */
  const fieldLabels = useMemo(() => {
    if (!formType) return {};
    const map: Record<string, string> = {};
    formType.formSchema.fields.forEach((f) => { map[f.key] = f.label; });
    return map;
  }, [formType]);

  // 监听表单值变化
  const handleValuesChange = (changedValues: any, allValues: any) => {
    setFormData(allValues);
  };

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

      // 裁剪 photo/upload 类型字段：移除 base64 数据，只保留服务端 URL
      formType.formSchema.fields.forEach(field => {
        if ((field.type === 'photo' || field.type === 'upload') && Array.isArray(values[field.key])) {
          const files = values[field.key];
          // 检查是否有文件仍在上传中
          const hasUploading = files.some((f: UploadFile) => f.status === 'uploading');
          if (hasUploading) {
            message.warning('请等待图片上传完成');
            throw new Error('UPLOADING');
          }
          // 只保留必要字段，移除 thumbUrl（base64）和 originFileObj（File 对象）
          values[field.key] = files.map((f: UploadFile) => ({
            uid: f.uid,
            name: f.name,
            url: f.url || (f.response as { url?: string })?.url,
            status: f.status,
          }));
        }
      });

      // 注入隐藏字段到提交数据（用于后端 requiredWhen 校验）
      if (formData._hasExistingLicense) {
        values._hasExistingLicense = formData._hasExistingLicense;
      }

      const title = generateTitle(formType, values);

      setSubmitting(true);
      const result = await oaApprovalApi.submitApproval({
        formTypeCode: formType.code,
        formData: values,
        title,
        urgency: 'normal',
      });

      recordUsage(formType);
      message.success('提交成功');
      // 有详情页权限则跳转详情，否则跳转审批中心
      if (access['oa:approval:read']) {
        history.push(`/oa/detail/${result.data.instanceId}`);
      } else {
        history.push('/oa/center');
      }
    } catch (error: any) {
      if (error.message === 'UPLOADING') return;
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
            {formType.formSchema.fields.map((field) => (
              <ConditionalFieldWrapper key={field.key} field={field} formData={formData}>
                <Form.Item
                  name={field.key}
                  label={field.label}
                  rules={[{ required: isFieldRequired(field), message: `请输入${field.label}` }]}
                >
                  <FormFieldConfig field={field} formData={formData} form={form}
                    customerLicenseInfo={customerLicenseInfo}
                    licenseLoading={licenseLoading}
                    onCustomerSelect={handleCustomerSelect}
                  />
                </Form.Item>
              </ConditionalFieldWrapper>
            ))}
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
