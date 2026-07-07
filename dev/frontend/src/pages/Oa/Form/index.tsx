/**
 * 表单填写页面
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { history, useParams, useAccess } from 'umi';
import { Button, Spin, Form, message, Alert } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { oaApi } from '@/services/api/oa';
import type { FormTypeDefinition } from '@/types/oa';
import { useFormData } from './hooks/useFormData';
import { useCustomerDebt } from './hooks/useCustomerDebt';
import FormFieldConfig from './components/FormFieldConfig';
import ConditionalFieldWrapper, { checkCondition } from './components/ConditionalFieldWrapper';
import { ApprovalFlow } from '@/components/Oa';
import { evaluateFormula, detectCycles, topologicalSort } from '@/utils/formula-evaluator';
import { EditableFormProvider } from '@/components/Oa/EditableFormContext';
import { initDingtalkViewportHeight } from '@/utils/dingtalk/utils';
import styles from './index.less';
import { getErrorMessage } from '../../../utils/errorUtils';
import { computeFeeTotals } from './computeFeeTotals';
import { recalcRowFormulas } from './components/TableFieldRenderer';

/**
 * 空值载体控件：用于 hidden Form.Item，向 Ant Design Form 注册字段但不渲染任何 DOM。
 * 替代 <Input /> 以避免 string/number 类型约束与实际值类型（object、boolean 等）不匹配。
 */
const NullField: React.FC = () => null;

const FormPage: React.FC = () => {
  const { typeCode } = useParams<{ typeCode: string }>();
  const access = useAccess();
  const [form] = Form.useForm();

  const [submitting, setSubmitting] = useState(false);

  // 订阅 form store 全部变更（含 setFieldsValue 编程式写入）
  const watchedValues = Form.useWatch([], form);

  const formData = watchedValues || {};

  const { loading, formType, customerLicenseInfo, licenseLoading, loadFormType, handleCustomerSelect } =
    useFormData(form);

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

  // 监听表单值变化，处理副作用（公式计算、费用联动）
  // formData 已由 useWatch 自动派生，不再需要手动同步状态
  const handleValuesChange = (changedValues: any, allValues: any) => {
    // 自动重算公式字段
    // 放在 updater 外部避免违反 React 纯函数规则
    if (formType) {
      // 第一步：预计算隐藏的中间值公式（_ 前缀字段，如 _comboRevenue、_comboCost）
      // 结果写入计算上下文，供第二步的展示公式引用
      const hiddenFormulas = formType.formSchema.fields.filter(
        f => f.type === 'formula' && f.formula && f.key.startsWith('_')
      );
      const currentValues = form.getFieldsValue();
      const merged: Record<string, unknown> = { ...currentValues };

      // 第零步：预计算所有表格行内公式字段（解决跨表依赖断裂）
      // 用最新 merged 上下文重算每行的 _stepMinMargin 等公式列，
      // 使顶层 minProfitMargin 引用时始终拿到基于当前数据的值
      for (const tf of formType.formSchema.fields) {
        if (tf.type !== 'table' || !tf.children) continue;
        const rows = merged[tf.key] as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(rows) || rows.length === 0) continue;
        const hasRowFormulas = tf.children.some(c => c.type === 'formula' && c.formula);
        if (!hasRowFormulas) continue;
        merged[tf.key] = rows.map(row => recalcRowFormulas(row, tf.children!, merged));
      }

      for (const hf of hiddenFormulas) {
        const result = evaluateFormula(hf.formula!, merged);
        const precision = hf.formulaPrecision ?? 2;
        const rounded = Number(result.toFixed(precision));
        merged[hf.key] = rounded;
      }
      // 将隐藏公式字段批量写回 form store，加脏检查防止 onValuesChange 无限循环
      const hiddenUpdates: Record<string, unknown> = {};
      for (const hf of hiddenFormulas) {
        const currentVal = form.getFieldValue(hf.key);
        if (currentVal !== merged[hf.key]) {
          hiddenUpdates[hf.key] = merged[hf.key];
        }
      }
      if (Object.keys(hiddenUpdates).length > 0) {
        form.setFieldsValue(hiddenUpdates);
      }

      // 第二步：计算展示公式字段（按拓扑序，确保公式间依赖正确处理）
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

    // 物流装卸费用：费用明细表格联动计算
    if (typeCode === 'logistics_fee' && changedValues.feeLines) {
      const feeLines = allValues.feeLines as Array<Record<string, unknown>> | undefined;
      if (feeLines) {
        const { total, updatedLines } = computeFeeTotals(feeLines);
        if (updatedLines) {
          form.setFieldsValue({ feeLines: updatedLines, feeTotalAmount: total });
        }
      }
    }

  };

  // ===== 客户档案修改：欠款与状态选项 =====
  const { customerStateOptions, debtLoading } = useCustomerDebt(typeCode, formData);

  // ===== 物流装卸费用：结算单选中后自动填充费用明细表 =====
  const prevSettlementIdsRef = useRef<string[]>([]);

  useEffect(() => {
    if (typeCode !== 'logistics_fee') return;
    const settlementIds = (formData.settlementIds as string[]) || [];

    // 仅当选中结算单发生变化时触发
    const prevIds = prevSettlementIdsRef.current;
    const idsChanged = settlementIds.length !== prevIds.length ||
      settlementIds.some((id, i) => id !== prevIds[i]);
    if (!idsChanged || settlementIds.length === 0) {
      prevSettlementIdsRef.current = settlementIds;
      if (settlementIds.length === 0) {
        form.setFieldsValue({ feeLines: [] });
      }
      return;
    }
    prevSettlementIdsRef.current = settlementIds;

    // 异步获取可分摊采购明细，填充费用明细表
    (async () => {
      try {
        const allLines: Array<Record<string, unknown>> = [];
        for (const billStr of settlementIds) {
          const result = await oaApi.getAllocatablePurchaseDetails({ billStr });
          const records = (result?.records || []) as Array<Record<string, unknown>>;
          for (const r of records) {
            allLines.push({
              billOrderStr: r.billOrderStr as string,
              settlementBillStr: r.billStr as string,
              goodsName: r.goodsName as string,
              quantity: r.quantity as number,
              currUnitName: r.currUnitName as string,
              settleAmount: r.amount as string,
              feeUnitPrice: null,
              feeAmount: null,
            });
          }
        }
        if (allLines.length > 0) {
          form.setFieldsValue({ feeLines: allLines });
        } else {
          form.setFieldsValue({ feeLines: [] });
        }
      } catch {
        message.error('获取结算单明细失败');
      }
    })();
  }, [formData.settlementIds, typeCode, form]);


  // ===== 后端实时预览计算：监听 previewTrigger 字段变化，调 computePreview 回填 =====
  const prevTriggerValuesRef = useRef<Record<string, unknown>>({});
  useEffect(() => {
    if (!formType?.formSchema?.fields) return;

    // 收集所有 previewTrigger 字段
    const triggerFields = new Set<string>();
    formType.formSchema.fields.forEach(f => {
      if (f.previewTrigger) f.previewTrigger.forEach(t => triggerFields.add(t));
    });
    if (triggerFields.size === 0) return;

    // 检查 trigger 字段是否变化
    const current: Record<string, unknown> = {};
    let changed = false;
    for (const field of triggerFields) {
      current[field] = formData[field];
      if (formData[field] !== prevTriggerValuesRef.current[field]) changed = true;
    }
    if (!changed) return;
    prevTriggerValuesRef.current = current;

    // 任一 trigger 字段为空时不触发
    const allEmpty = Array.from(triggerFields).every(f => formData[f] == null || formData[f] === '');
    if (allEmpty) return;

    // 防抖调用 computePreview
    const timer = setTimeout(async () => {
      try {
        const result = await oaApi.computePreview(formType.code, formData);
        if (result && typeof result === 'object') {
          form.setFieldsValue(result);
        }
      } catch {
        // 静默失败，不影响表单操作
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [formData, formType, form]);

  // 费用金额自动计算：委托 computeFeeTotals 工具函数

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

      // 合并所有已注册字段（含 hidden Form.Item），确保内部字段和 nameField/autoFill 目标值完整
      const allValues = form.getFieldsValue();
      for (const key of Object.keys(allValues)) {
        if (values[key] === undefined && allValues[key] !== undefined && allValues[key] !== null) {
          values[key] = allValues[key];
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

      // upload 类型字段：检查是否有未完成的上传，避免脏数据入库
      const uploadFields = formType.formSchema.fields.filter(f => f.type === 'upload');
      for (const field of uploadFields) {
        const uploadValue = values[field.key];
        if (Array.isArray(uploadValue) && uploadValue.some((item: any) => item.status === 'uploading')) {
          message.warning(`「${field.label}」文件正在上传中，请稍候再提交`);
          return;
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
    <div className={`page-full ${styles.container}`}>
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
          <EditableFormProvider value={form}>
          <Form form={form} layout="vertical" onValuesChange={handleValuesChange} className={styles.form}>
            {formType.formSchema.fields
              .filter((field) => {
                if (field.key.startsWith('_') || field.hidden) return false;
                // 应用发起节点（order=0）的字段权限
                const nodeZeroPerms = formType.fieldPermissions?.nodes?.['0'];
                if (nodeZeroPerms?.[field.key] === 'hidden') return false;
                return true;
              })
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
                  <FormFieldConfig field={fieldWithOptions} formData={formData}
                    formSchema={formType.formSchema}
                    customerLicenseInfo={customerLicenseInfo}
                    licenseLoading={licenseLoading}
                    onCustomerSelect={handleCustomerSelect}
                    includeAllStates={typeCode === 'customer_modify'}
                  />
                </Form.Item>
              </ConditionalFieldWrapper>
              );
            })}
            {/* 内部辅助字段注册到 form store，useWatch 自动捕获 */}
            <Form.Item name="_details" hidden><NullField /></Form.Item>
            <Form.Item name="_hasExistingLicense" hidden><NullField /></Form.Item>
            {formType.formSchema.internalFields?.map(f =>
              <Form.Item key={f.key} name={f.key} hidden><NullField /></Form.Item>
            )}
            {formType.formSchema.fields
              .filter(f => f.type === 'formula' && f.key.startsWith('_'))
              .map(f => <Form.Item key={f.key} name={f.key} hidden><NullField /></Form.Item>)}
            {/* nameField / autoFill 目标字段注册到 form store，确保提交时 getFieldsValue 可获取 */}
            {formType.formSchema.fields
              .filter(f => f.type !== 'table')
              .flatMap(f => {
                const targets: string[] = [];
                if (f.nameField) targets.push(f.nameField);
                if (f.autoFill) Object.keys(f.autoFill).forEach(k => targets.push(k));
                return targets;
              })
              .filter((key, i, arr) => arr.indexOf(key) === i)
              // 排除已作为可见字段渲染的 key，避免 Form.Item 重复注册
              .filter(key => !formType.formSchema.fields.some(f => f.key === key))
              .map(key => <Form.Item key={key} name={key} hidden><NullField /></Form.Item>)}
          </Form>
          </EditableFormProvider>
        </div>

        <div className={styles.sidebar}>
          <ApprovalFlow mode="preview" workflowNodes={formType.workflowDef.nodes} formTypeCode={formType.code} fieldLabels={fieldLabels} formData={formData} />
        </div>
      </div>

      {typeCode === 'logistics_fee' && formData.paymentAmount != null && formData.feeTotalAmount != null &&
        Math.abs(parseFloat(String(formData.paymentAmount)) - parseFloat(String(formData.feeTotalAmount))) > 0.01 && (
        <div style={{ padding: '0 24px', marginBottom: 8 }}>
          <Alert
            type="warning"
            showIcon
            message={`实付金额（${formData.paymentAmount}）与费用合计（${formData.feeTotalAmount}）不一致`}
          />
        </div>
      )}

      {typeCode === 'purchase_payment' && (() => {
        const paymentType = formData.paymentType as string;
        // 后付款模式：从 _details.debtIds 各行本次付款求和；预付款模式：用预付款金额字段
        let expected: number;
        if (paymentType === 'prepay') {
          expected = parseFloat(String(formData.prepayAmount || 0));
        } else {
          const details = (formData._details as Record<string, unknown> | undefined)?.debtIds as Array<{ paymentAmount?: string }> | undefined;
          expected = (details || []).reduce((sum, d) => sum + (parseFloat(String(d.paymentAmount || 0))), 0);
        }
        // 后付款模式：从 paymentLines 汇总实付金额；预付款模式：用旧字段 actualAmount
        let actual: number;
        if (paymentType === 'prepay') {
          actual = parseFloat(String(formData.actualAmount || 0));
        } else {
          const lines = formData.paymentLines as Array<{ amount?: string }> | undefined;
          actual = (lines || []).reduce((sum, line) => sum + (parseFloat(String(line.amount || 0))), 0);
        }
        if (expected > 0 && actual > 0 && Math.abs(actual - expected) > 0.01) {
          const expectedLabel = paymentType === 'prepay' ? '预付金额' : '本次付款合计';
          const actualLabel = paymentType === 'prepay' ? '实付金额' : '银行转账合计';
          return (
            <div style={{ padding: '0 24px', marginBottom: 8 }}>
              <Alert
                type="warning"
                showIcon
                message={`${actualLabel}（¥${actual.toFixed(2)}）与${expectedLabel}（¥${expected.toFixed(2)}）不一致`}
              />
            </div>
          );
        }
        return null;
      })()}

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
