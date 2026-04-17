import React from 'react';
import { Form, Input, InputNumber, Select, DatePicker, Upload, Button } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { FormField } from '@/types/oa-approval';
import { numberToChineseUpper } from '@/utils/number';
import styles from '../index.less';

const { TextArea } = Input;

interface FormFieldConfigProps {
  field: FormField;
  formData: Record<string, unknown>;
}

/** 表单字段渲染组件 */
const FormFieldConfig: React.FC<FormFieldConfigProps> = ({ field, formData }) => {
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
        <Upload multiple maxCount={maxCount} beforeUpload={() => false}>
          <Button icon={<UploadOutlined />}>上传附件</Button>
          {maxCount && <span className={styles.uploadTip}>（最多 {maxCount} 个文件）</span>}
        </Upload>
      );

    case 'photo':
      return (
        <Upload listType="picture-card" multiple maxCount={maxCount} beforeUpload={() => false}>
          <div>上传图片</div>
        </Upload>
      );

    default:
      return <Input placeholder={placeholder || `请输入${field.label}`} />;
  }
};

export default FormFieldConfig;
