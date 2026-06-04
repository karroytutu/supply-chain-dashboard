import React from 'react';
import { Input, InputNumber, Select, DatePicker, Upload, Button } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import type { FormField } from '@/types/oa';
import { numberToChineseUpper } from '@/utils/number';
import { getFieldLinkUrl } from '@/utils/oa';
import ErpFieldRenderer, { type CustomerLicenseInfo } from './ErpFieldRenderer';
import TableFieldRenderer from './TableFieldRenderer';
import PhotoFieldRenderer from './PhotoFieldRenderer';
import { createBeforeUpload, validateDocumentFile } from '@/utils/uploadValidation';
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
}

/** 判断是否为 ERP 字段类型 */
function isErpFieldType(type: FormField['type']): boolean {
  return ['asset_search', 'erp_department', 'erp_staff', 'erp_payment_account', 'erp_asset_category', 'erp_customer', 'erp_settlement_order', 'erp_grade', 'erp_group', 'erp_area'].includes(type);
}

/** 表单字段渲染组件 */
const FormFieldConfig: React.FC<FormFieldConfigProps> = ({
  field, formData, form, value, onChange, customerLicenseInfo, licenseLoading, onCustomerSelect, includeAllStates,
}) => {
  const { type, placeholder, required, options, maxLength, maxCount, upper } = field;

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
            formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
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
        />
      );

    case 'multi-select':
      return (
        <Select
          mode="multiple"
          value={value as string[] | undefined}
          onChange={onChange as ((value: string[]) => void) | undefined}
          placeholder={placeholder || `请选择${field.label}`}
          options={options}
          disabled={field.disabled}
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
        />
      );

    case 'date':
      return <DatePicker value={value as Dayjs | undefined} onChange={onChange as ((value: Dayjs | null) => void) | undefined} style={{ width: '100%' }} placeholder={placeholder || '请选择日期'} disabled={field.disabled} />;

    case 'date-range':
      return <DatePicker.RangePicker value={value as [Dayjs, Dayjs] | undefined} onChange={onChange as ((value: [Dayjs | null, Dayjs | null] | null) => void) | undefined} style={{ width: '100%' }} disabled={field.disabled} />;

    case 'upload':
      return (
        <Upload multiple maxCount={maxCount}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
          beforeUpload={createBeforeUpload(validateDocumentFile)}
        >
          <Button icon={<UploadOutlined />} disabled={field.disabled}>上传附件</Button>
          {maxCount && <span className={styles.uploadTip}>（最多 {maxCount} 个文件）</span>}
        </Upload>
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
      return <TableFieldRenderer field={field} value={value as Record<string, unknown>[] | undefined} onChange={onChange as ((value: Record<string, unknown>[]) => void) | undefined} />;

    default:
      return <Input value={value as string | undefined} onChange={onChange as React.ChangeEventHandler<HTMLInputElement> | undefined} placeholder={placeholder || `请输入${field.label}`} disabled={field.disabled} />;
  }
};

export default FormFieldConfig;
