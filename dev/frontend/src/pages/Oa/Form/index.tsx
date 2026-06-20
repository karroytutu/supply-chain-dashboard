/**
 * 表单填写页面
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { history, useParams, useAccess } from 'umi';
import { Button, Spin, Form, message } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { oaApi } from '@/services/api/oa';
import type { FormTypeDefinition } from '@/types/oa';
import { useFormData } from './hooks/useFormData';
import { useCustomerDebt } from './hooks/useCustomerDebt';
import FormFieldConfig from './components/FormFieldConfig';
import ConditionalFieldWrapper, { checkCondition } from './components/ConditionalFieldWrapper';
import { ApprovalFlow } from '@/components/Oa';
import { evaluateFormula, detectCycles, topologicalSort } from '@/utils/formula-evaluator';
import { initDingtalkViewportHeight } from '@/utils/dingtalk/utils';
import styles from './index.less';
import { getErrorMessage } from '../../../utils/errorUtils';

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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖稳定无需重复触发
  }, [typeCode]);

  /** 从 formSchema 计算字段 key→label 映射，用于流程预览条件人性化 */
  const fieldLabels = useMemo(() => {
    if (!formType) return {};
    const map: Record<string, string> = {};
    formType.formSchema.fields.forEach((f) => { map[f.key] = f.label; });
    return map;
  }, [formType]);

  // 监听表单值变化，同时自动重算公式字段
  // allValues 不包含没有 Form.Item 注册的隐藏字段（如 _customerName、_storefrontPhotoUrl），
  // 因此必须保留 formData 中已有的 _ 前缀隐藏字段，避免用户编辑可见字段时将其覆盖丢失
  const handleValuesChange = (changedValues: any, allValues: any) => {
    // updater 只做隐藏字段合并（纯函数），公式计算在外部执行
    setFormData(prev => {
      // 保留 autoFill 产生的隐藏字段（_ 前缀，onValuesChange 不返回）
      const hiddenFields: Record<string, unknown> = {};
      for (const key of Object.keys(prev)) {
        if (key.startsWith('_')) hiddenFields[key] = prev[key];
      }
      return { ...hiddenFields, ...allValues };
    });

    // 自动重算公式字段（按拓扑序，确保公式间依赖正确处理）
    // 放在 updater 外部避免违反 React 纯函数规则
    if (formType) {
      const formulaFields = formType.formSchema.fields.filter(
        f => f.type === 'formula' && f.formula && !f.key.startsWith('_')
      );
      if (formulaFields.length > 0) {
        const cycles = detectCycles(formulaFields.map(f => ({ key: f.key, expression: f.formula! })));
        if (cycles) {
          console.warn('公式字段存在循环依赖，跳过自动计算:', cycles);
        } else {
          const sorted = topologicalSort(
            formulaFields.map(f => ({ key: f.key, expression: f.formula!, field: f }))
          );
          // 使用当前表单值 + 隐藏字段作为计算上下文
          const currentValues = form.getFieldsValue();
          const merged: Record<string, unknown> = { ...formData, ...currentValues };
          const formulaUpdates: Record<string, unknown> = {};
          for (const item of sorted) {
            const result = evaluateFormula(item.expression, merged);
            const precision = item.field.formulaPrecision ?? 2;
            const rounded = Number(result.toFixed(precision));
            formulaUpdates[item.key] = rounded;
            merged[item.key] = rounded; // 更新上下文，供后续依赖此公式的字段使用
          }
          form.setFieldsValue(formulaUpdates);
        }
      }
    }
  };

  // ===== 客户档案修改：欠款与状态选项 =====
  const { customerStateOptions, debtLoading } = useCustomerDebt(typeCode, formData);

  /** 判断字段是否在当前条件下必填 */
  const isFieldRequired = (field: FormTypeDefinition['formSchema']['fields'][0]): boolean => {
    if (field.required) return true;
    if (field.requiredWhen) {
      return checkCondition(field.requiredWhen, formData);
    }
    return false;
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (!formType) return;

      // 注入所有 _ 前缀隐藏字段到提交数据（autoFill 产生的值，无 Form.Item 注册）
      // 包括 _customerName、_storefrontPhotoUrl、_consumerManagerName 等
      for (const key of Object.keys(formData)) {
        if (key.startsWith('_') && formData[key] !== undefined && formData[key] !== null) {
          values[key] = formData[key];
        }
      }

      // 上传照片文件：将 UploadFile[] 中的原始 File 对象上传到服务器，
      // 获取 URL 后替换为 { url } 对象数组，确保后端可正确读取照片地址
      const photoFields = formType.formSchema.fields.filter(f => f.type === 'photo');
      for (const field of photoFields) {
        const photoValue = values[field.key];
        if (Array.isArray(photoValue) && photoValue.length > 0) {
          const newUploadItems = photoValue.filter((item: any) => item.originFileObj instanceof File);
          const keptItems = photoValue.filter((item: any) => !(item.originFileObj instanceof File));

          if (newUploadItems.length > 0) {
            const filesToUpload = newUploadItems.map((item: any) => item.originFileObj as File);
            const urls = await oaApi.uploadLicenseFiles(filesToUpload);
            // 仅替换新上传项为 {url}，保留已有图片对象
            values[field.key] = [...keptItems, ...urls.map((url: string) => ({ url }))];
          }
          // 无新上传文件时保留原值（已有 ERP 执照等）
        }
      }

      const title = formType.name;

      setSubmitting(true);
      const result = await oaApi.submitApproval({
        formTypeCode: formType.code,
        formData: values,
        title,
      });

      message.success('提交成功');
      // 有详情页权限则跳转详情，否则跳转流程中心
      if (access['oa:read']) {
        history.push(`/oa/detail/${result.data.instanceId}`);
      } else {
        history.push('/oa/center');
      }
    } catch (error: any) {
      if (error.errorFields) {
        message.error('请填写必填项');
      } else {
        message.error(getErrorMessage(error) || '提交失败');
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
              .filter((field) => !field.key.startsWith('_') && !field.hidden)
              .map((field) => {
              // 客户档案修改：为状态字段注入动态选项（有欠款时禁用停用）
              const fieldWithOptions = (field.key === 'customerState' && customerStateOptions)
                ? { ...field, options: customerStateOptions, disabled: debtLoading }
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
