import React from 'react';
import { Form, Input, InputNumber, Select, DatePicker, Upload, Button } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { FormField } from '@/types/oa-approval';
import { numberToChineseUpper } from '@/utils/number';
import ErpFieldRenderer from './ErpFieldRenderer';
import TableFieldRenderer from './TableFieldRenderer';
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
}

/** 判断是否为 ERP 字段类型 */
function isErpFieldType(type: FormField['type']): boolean {
  return ['asset_search', 'erp_department', 'erp_staff', 'erp_payment_account', 'erp_asset_category'].includes(type);
}

/** 表单字段渲染组件 */
const FormFieldConfig: React.FC<FormFieldConfigProps> = ({ field, formData, form, value, onChange }) => {
  const { type, placeholder, required, options, maxLength, maxCount, upper } = field;

  // ERP 字段类型统一走 ErpFieldRenderer
  if (isErpFieldType(type)) {
    // 获取级联父字段值
    const cascadeValue = field.cascadeFrom ? formData[field.cascadeFrom] : undefined;
    return (
      <ErpFieldRenderer
        field={field}
        cascadeValue={cascadeValue}
        form={form}
      />
    );
  }

  switch (type) {
    case 'text':
      return (
        <Input
          placeholder={placeholder || `请输入${field.label}`}
          maxLength={maxLength}
          showCount={!!maxLength}
          disabled={field.disabled}
        />
      );

    case 'textarea':
      return (
        <TextArea
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
          style={{ width: '100%' }}
          placeholder={placeholder || `请输入${field.label}`}
          min={field.min}
          max={field.max}
          precision={field.precision}
          addonAfter={field.suffix || field.unit}
          disabled={field.disabled}
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
            disabled={field.disabled}
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
          disabled={field.disabled}
        />
      );

    case 'multi-select':
      return (
        <Select
          mode="multiple"
          placeholder={placeholder || `请选择${field.label}`}
          options={options}
          disabled={field.disabled}
        />
      );

    case 'radio':
      return (
        <Select
          placeholder={placeholder || `请选择${field.label}`}
          options={options}
          disabled={field.disabled}
        />
      );

    case 'date':
      return <DatePicker style={{ width: '100%' }} placeholder={placeholder || '请选择日期'} disabled={field.disabled} />;

    case 'date-range':
      return <DatePicker.RangePicker style={{ width: '100%' }} disabled={field.disabled} />;

    case 'upload':
      return (
        <Upload multiple maxCount={maxCount} beforeUpload={() => false}>
          <Button icon={<UploadOutlined />} disabled={field.disabled}>上传附件</Button>
          {maxCount && <span className={styles.uploadTip}>（最多 {maxCount} 个文件）</span>}
        </Upload>
      );

    case 'photo':
      return (
        <Upload listType="picture-card" multiple maxCount={maxCount} beforeUpload={() => false}>
          <div>上传图片</div>
        </Upload>
      );

    case 'table':
      return <TableFieldRenderer field={field} value={value as Record<string, unknown>[] | undefined} onChange={onChange as ((value: Record<string, unknown>[]) => void) | undefined} />;

    default:
      return <Input placeholder={placeholder || `请输入${field.label}`} disabled={field.disabled} />;
  }
};

export default FormFieldConfig;
