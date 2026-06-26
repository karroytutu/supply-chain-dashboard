import React from 'react';
import { Input, InputNumber, Select, DatePicker } from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { FormField, FormSchema } from '@/types/oa';
import { numberToChineseUpper } from '@/utils/number';
import { getFieldLinkUrl } from '@/utils/oa';
import ErpFieldRenderer, { type CustomerLicenseInfo } from './ErpFieldRenderer';
import TableFieldRenderer from './TableFieldRenderer';
import PhotoFieldRenderer from './PhotoFieldRenderer';
import SignatureFieldControl from '@/components/Oa/fields/SignatureFieldControl';
import UploadFieldRenderer from './UploadFieldRenderer';
import ModalSelectControl from '@/components/Oa/fields/ModalSelectControl';
import TreeSelectModalControl from '@/components/Oa/fields/TreeSelectModalControl';
import BankAccountSelector, { type BankAccountValue } from '@/components/Oa/BankAccountSelector';
import styles from '../index.less';

const { TextArea } = Input;

interface FormFieldConfigProps {
  field: FormField;
  formData: Record<string, unknown>;
  form?: {
    setFieldsValue: (values: Record<string, unknown>) => void;
    getFieldValue: (name: string) => unknown;
  };
  /** Form.Item 注入的 value（由 Ant Design 表单自动传递） */
  value?: unknown;
  /** Form.Item 注入的 onChange（由 Ant Design 表单自动传递） */
  onChange?: (value: unknown) => void;
  /** 客户已有执照信息 */
  customerLicenseInfo?: CustomerLicenseInfo | null;
  /** 执照信息是否正在异步加载中 */
  licenseLoading?: boolean;
  /** 客户选中时回调 */
  onCustomerSelect?: (licenseInfo: CustomerLicenseInfo | null) => void;
  /** 客户搜索是否包含所有状态（客户档案修改场景传 true） */
  includeAllStates?: boolean;
  /** 表单 Schema（传递给 ErpFieldRenderer 用于级联扫描） */
  formSchema?: FormSchema;
}

/** 判断是否为 ERP 字段类型 */
function isErpFieldType(type: FormField['type']): boolean {
  return ['asset_search', 'erp_department', 'erp_staff', 'erp_payment_account', 'erp_asset_category', 'erp_customer', 'erp_settlement_order', 'erp_grade', 'erp_group', 'erp_area', 'erp_supplier', 'erp_purchase_order'].includes(type);
}

/** 表单字段渲染组件 */
const FormFieldConfig: React.FC<FormFieldConfigProps> = ({
  field, formData, form, value, onChange, customerLicenseInfo, licenseLoading, onCustomerSelect, includeAllStates, formSchema,
}) => {
  const { type, placeholder, required, options, maxLength, maxCount, upper } = field;

  // 统一弹窗多选控件
  if (type === 'modal_select') {
    return (
      <ModalSelectControl
        mode="editable"
        field={field}
        value={value}
        onChange={onChange}
        formData={formData}
        fakeForm={form}
      />
    );
  }

  // 树形弹窗选择器
  if (type === 'tree_select') {
    return (
      <TreeSelectModalControl
        mode="editable"
        field={field}
        value={value}
        onChange={onChange}
        formData={formData}
        fakeForm={form}
      />
    );
  }

  // ERP 字段类型统一走 ErpFieldRenderer
  if (isErpFieldType(type)) {
    // 获取级联父字段值
    const cascadeValue = field.cascadeFrom ? formData[field.cascadeFrom] : undefined;
    return (
      <ErpFieldRenderer
        field={field}
        value={value}
        onChange={onChange}
        cascadeValue={cascadeValue}
        includeAllStates={includeAllStates}
        form={form}
        formSchema={formSchema}
        onCustomerSelect={field.type === 'erp_customer' ? onCustomerSelect : undefined}
      />
    );
  }

  switch (type) {
    case 'text': {
      // 通用链接支持：formData 中存在安全的 _xxxUrl → 渲染为可点击链接
      const linkUrl = getFieldLinkUrl(field, formData);
      if (linkUrl) {
        return (
          <a href={linkUrl} target="_blank" rel="noopener noreferrer">
            {value as string}
          </a>
        );
      }
      return (
        <Input
          value={value as string | undefined}
          onChange={onChange as React.ChangeEventHandler<HTMLInputElement> | undefined}
          placeholder={placeholder || `请输入${field.label}`}
          maxLength={maxLength}
          showCount={!!maxLength}
          disabled={field.disabled}
        />
      );
    }

    case 'textarea':
      return (
        <TextArea
          value={value as string | undefined}
          onChange={onChange as React.ChangeEventHandler<HTMLTextAreaElement> | undefined}
          placeholder={placeholder || `请输入${field.label}`}
          maxLength={maxLength}
          showCount={!!maxLength}
          autoSize={{ minRows: 3 }}
          disabled={field.disabled}
        />
      );

    case 'number':
      return (
        <InputNumber
          value={value as number | undefined}
          onChange={onChange as ((value: number | null) => void) | undefined}
          style={{ width: '100%' }}
          placeholder={placeholder || `请输入${field.label}`}
          min={field.min}
          max={field.max}
          precision={field.precision}
          addonAfter={field.suffix || field.unit}
          disabled={field.disabled}
        />
      );

    case 'money': {
      const amount = formData[field.key];
      return (
        <div>
          <InputNumber
            value={value as number | undefined}
            onChange={onChange as ((value: number | null) => void) | undefined}
            style={{ width: '100%' }}
            placeholder={placeholder || `请输入${field.label}`}
            min={0}
            precision={2}
            formatter={(v) => {
              if (v === undefined || v === null) return '';
              return Number(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            }}
            parser={(v) => (v ?? '').replace(/\$\s?|(,*)/g, '') as any}
            disabled={field.disabled}
          />
          {upper && amount != null ? (
            <div className={styles.amountUpper}>
              {`大写：${numberToChineseUpper(Number(amount))}`}
            </div>
          ) : null}
        </div>
      );
    }

    case 'select':
      return (
        <Select
          value={value as string | undefined}
          onChange={onChange as ((value: string) => void) | undefined}
          placeholder={placeholder || `请选择${field.label}`}
          options={options}
          disabled={field.disabled}
          style={{ width: '100%' }}
        />
      );

    case 'radio':
      return (
        <Select
          value={value as string | undefined}
          onChange={onChange as ((value: string) => void) | undefined}
          placeholder={placeholder || `请选择${field.label}`}
          options={options}
          disabled={field.disabled}
          style={{ width: '100%' }}
        />
      );

    case 'date':
      return (
        <DatePicker
          value={value ? dayjs(value as string) : undefined}
          onChange={(_, dateString) => onChange?.(dateString as string)}
          style={{ width: '100%' }}
          placeholder={placeholder || '请选择日期'}
          disabled={field.disabled}
        />
      );

    case 'date-range': {
      const rangeValue = Array.isArray(value) && value.length >= 2
        ? [dayjs(value[0] as string), dayjs(value[1] as string)] as [dayjs.Dayjs, dayjs.Dayjs]
        : undefined;
      return (
        <DatePicker.RangePicker
          value={rangeValue}
          onChange={(_, dateStrings) => onChange?.(dateStrings as unknown)}
          style={{ width: '100%' }}
          disabled={field.disabled}
        />
      );
    }

    case 'upload':
      return (
        <UploadFieldRenderer
          value={value}
          onChange={onChange}
          maxCount={maxCount}
          disabled={field.disabled}
          accept={field.accept}
        />
      );

    case 'photo':
      return (
        <PhotoFieldRenderer
          value={value}
          onChange={onChange}
          maxCount={maxCount}
          photoPurpose={field.photoPurpose}
          existingPhotoUrl={field.photoPurpose === 'storefront' ? (formData._storefrontPhotoUrl as string) : undefined}
          customerLicenseInfo={field.photoPurpose !== 'storefront' ? customerLicenseInfo : undefined}
          licenseLoading={field.photoPurpose !== 'storefront' ? licenseLoading : false}
        />
      );

    case 'table':
      return <TableFieldRenderer field={field} value={value as Record<string, unknown>[] | undefined} onChange={onChange as ((value: Record<string, unknown>[]) => void) | undefined} formData={formData} />;

    case 'signature':
      return (
        <SignatureFieldControl
          mode={field.disabled ? 'readonly' : 'editable'}
          field={field}
          value={value}
          onChange={onChange as ((value: unknown) => void) | undefined}
        />
      );

    case 'bank_account_selector':
      return (
        <BankAccountSelector
          value={value as BankAccountValue | null}
          onChange={onChange as ((value: BankAccountValue | null) => void) | undefined}
          disabled={field.disabled}
        />
      );

    case 'formula':
      // 公式字段：只读展示计算结果，由 formula-evaluator 自动填充值
      return (
        <InputNumber
          value={value != null ? Number(value) : undefined}
          style={{ width: '100%' }}
          precision={field.formulaPrecision ?? 2}
          disabled
          addonAfter={field.suffix || field.unit}
          formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
        />
      );

    default:
      return <Input value={value as string | undefined} onChange={onChange as React.ChangeEventHandler<HTMLInputElement> | undefined} placeholder={placeholder || `请输入${field.label}`} disabled={field.disabled} />;
  }
};

export default FormFieldConfig;
