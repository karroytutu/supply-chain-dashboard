/**
 * 表单填写页面
 */
import React, { useState, useEffect, useMemo } from 'react';
import { history, useParams, useAccess } from 'umi';
import { Button, Spin, Form, message } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { oaApprovalApi } from '@/services/api/oa-approval';
import type { FormTypeDefinition } from '@/types/oa-approval';
import { useRecentForms } from '../hooks/useRecentForms';
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
  const { recordUsage } = useRecentForms();

  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  const { loading, formType, customerLicenseInfo, licenseLoading, loadFormType, handleCustomerSelect } =
    useFormData(form, formData, setFormData);

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
  // allValues 不包含没有 Form.Item 注册的隐藏字段（如 _hasExistingLicense），
  // 所以必须与现有 formData 合并，避免隐藏字段丢失导致条件校验失效
  const handleValuesChange = (changedValues: any, allValues: any) => {
    setFormData(prev => ({ ...prev, ...allValues }));
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

      recordUsage(formType);
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
              .map((field) => (
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
