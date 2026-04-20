/**
 * 表单填写页面
 */
import React, { useState, useEffect } from 'react';
import { history, useParams } from 'umi';
import { Button, Spin, Form, message } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { oaApprovalApi } from '@/services/api/oa-approval';
import { FormTypeDefinition, ConditionDef } from '@/types/oa-approval';
import FormFieldConfig from './components/FormFieldConfig';
import ConditionalFieldWrapper, { checkCondition } from './components/ConditionalFieldWrapper';
import FormPreview from './components/FormPreview';
import styles from './index.less';

const FormPage: React.FC = () => {
  const { typeCode } = useParams<{ typeCode: string }>();
  const [form] = Form.useForm();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formType, setFormType] = useState<FormTypeDefinition | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});

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

      const title = generateTitle(formType, values);

      setSubmitting(true);
      const result = await oaApprovalApi.submitApproval({
        formTypeCode: formType.code,
        formData: values,
        title,
        urgency: 'normal',
      });

      message.success('提交成功');
      history.push(`/oa/detail/${result.data.instanceId}`);
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
            {formType.formSchema.fields.map((field) => (
              <ConditionalFieldWrapper key={field.key} field={field} formData={formData}>
                <Form.Item
                  name={field.key}
                  label={
                    <span className={styles.fieldLabel}>
                      {isFieldRequired(field) && <span className={styles.required}>*</span>}
                      {field.label}
                    </span>
                  }
                  rules={[{ required: isFieldRequired(field), message: `请输入${field.label}` }]}
                >
                  <FormFieldConfig field={field} formData={formData} form={form} />
                </Form.Item>
              </ConditionalFieldWrapper>
            ))}
          </Form>
        </div>

        <div className={styles.sidebar}>
          <FormPreview nodes={formType.workflowDef.nodes} />
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
