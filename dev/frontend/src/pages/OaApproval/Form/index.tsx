/**
 * 表单填写页面
 */
import React, { useState, useEffect, useMemo } from 'react';
import { history, useParams } from 'umi';
import { Button, Spin, Form, Input, InputNumber, Select, DatePicker, Upload, message, Typography } from 'antd';
import { ArrowLeftOutlined, UploadOutlined } from '@ant-design/icons';
import { oaApprovalApi } from '@/services/api/oa-approval';
import { FormTypeDefinition, FormField, WorkflowNodeDef } from '@/types/oa-approval';
import { numberToChineseUpper } from '@/utils/number';
import styles from './index.less';

const { TextArea } = Input;
const { Text } = Typography;

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

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (!formType) return;

      // 生成标题
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

  // 生成审批标题
  const generateTitle = (ft: FormTypeDefinition, data: Record<string, unknown>): string => {
    // 简单实现：使用表单类型名称 + 第一个文本字段的值
    const textField = ft.formSchema.fields.find((f) => f.type === 'text' || f.type === 'textarea');
    const mainFieldValue = textField ? data[textField.key] : '';
    return `${ft.name} - ${mainFieldValue || '新申请'}`;
  };

  // 渲染表单项
  const renderFormItem = (field: FormField) => {
    const { type, placeholder, required, options, maxLength, maxCount, upper } = field;

    switch (type) {
      case 'text':
        return (
          <Input
            placeholder={placeholder || `请输入${field.label}`}
            maxLength={maxLength}
            showCount={!!maxLength}
          />
        );

      case 'textarea':
        return (
          <TextArea
            placeholder={placeholder || `请输入${field.label}`}
            maxLength={maxLength}
            showCount={!!maxLength}
            autoSize={{ minRows: 3 }}
          />
        );

      case 'number':
        return (
          <InputNumber
            style={{ width: '100%' }}
            placeholder={placeholder || `请输入${field.label}`}
            min={field.min}
            max={field.max}
            precision={field.precision}
            addonAfter={field.suffix || field.unit}
          />
        );

      case 'money':
        const amount = formData[field.key];
        return (
          <div>
            <InputNumber
              style={{ width: '100%' }}
              placeholder={placeholder || `请输入${field.label}`}
              min={0}
              precision={2}
              formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(value) => value!.replace(/\$\s?|(,*)/g, '') as any}
            />
            {upper && amount != null ? (
              <div className={styles.amountUpper}>
                {`大写：${numberToChineseUpper(Number(amount))}`}
              </div>
            ) : null}
          </div>
        );

      case 'select':
        return (
          <Select
            placeholder={placeholder || `请选择${field.label}`}
            options={options}
          />
        );

      case 'multi-select':
        return (
          <Select
            mode="multiple"
            placeholder={placeholder || `请选择${field.label}`}
            options={options}
          />
        );

      case 'date':
        return <DatePicker style={{ width: '100%' }} placeholder={placeholder || '请选择日期'} />;

      case 'date-range':
        return <DatePicker.RangePicker style={{ width: '100%' }} />;

      case 'upload':
        return (
          <Upload
            multiple
            maxCount={maxCount}
            beforeUpload={() => false}
          >
            <Button icon={<UploadOutlined />}>上传附件</Button>
            {maxCount && <span className={styles.uploadTip}>（最多 {maxCount} 个文件）</span>}
          </Upload>
        );

      case 'photo':
        return (
          <Upload
            listType="picture-card"
            multiple
            maxCount={maxCount}
            beforeUpload={() => false}
          >
            <div>上传图片</div>
          </Upload>
        );

      default:
        return (
          <Input
            placeholder={placeholder || `请输入${field.label}`}
          />
        );
    }
  };

  // 渲染流程预览
  const renderWorkflowPreview = (nodes: WorkflowNodeDef[]) => {
    return (
      <div className={styles.workflowPreview}>
        <div className={styles.workflowTitle}>
          <span>流程</span>
          <span className={styles.autoDecision}>
            <span className={styles.checkIcon}>✓</span> 已启用自动决策
          </span>
        </div>
        <div className={styles.nodesList}>
          {nodes.map((node, index) => (
            <div key={node.order} className={styles.nodeItem}>
              <div className={styles.nodeOrder}>{node.order}</div>
              <div className={styles.nodeContent}>
                <div className={styles.nodeName}>{node.name}</div>
                <div className={styles.nodeType}>
                  {node.type === 'dynamic_supervisor' && '直属主管审批'}
                  {node.type === 'role' && `${node.roleCode} 审批`}
                  {node.type === 'specific_user' && '指定用户审批'}
                  {node.condition && (
                    <span className={styles.conditionLabel}>
                      (条件: {node.condition.field} {node.condition.operator} {node.condition.value})
                    </span>
                  )}
                </div>
              </div>
              {index < nodes.length - 1 && <div className={styles.nodeConnector} />}
            </div>
          ))}
        </div>
      </div>
    );
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
          <Form
            form={form}
            layout="vertical"
            onValuesChange={handleValuesChange}
            className={styles.form}
          >
            {formType.formSchema.fields.map((field) => (
              <Form.Item
                key={field.key}
                name={field.key}
                label={
                  <span className={styles.fieldLabel}>
                    {field.required && <span className={styles.required}>*</span>}
                    {field.label}
                  </span>
                }
                rules={[
                  { required: field.required, message: `请输入${field.label}` },
                ]}
              >
                {renderFormItem(field)}
              </Form.Item>
            ))}
          </Form>
        </div>

        <div className={styles.sidebar}>
          {renderWorkflowPreview(formType.workflowDef.nodes)}
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
