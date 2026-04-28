import React from 'react';
import { Input, InputNumber, Select, DatePicker, Upload, Button, Image, Spin, message } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { UploadOutlined, PaperClipOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import type { FormField } from '@/types/oa-approval';
import { numberToChineseUpper } from '@/utils/number';
import ErpFieldRenderer, { type CustomerLicenseInfo } from './ErpFieldRenderer';
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
  /** 客户已有执照信息 */
  customerLicenseInfo?: CustomerLicenseInfo | null;
  /** 执照信息是否正在异步加载中 */
  licenseLoading?: boolean;
  /** 客户选中时回调 */
  onCustomerSelect?: (licenseInfo: CustomerLicenseInfo | null) => void;
}

/** 判断是否为 ERP 字段类型 */
function isErpFieldType(type: FormField['type']): boolean {
  return ['asset_search', 'erp_department', 'erp_staff', 'erp_payment_account', 'erp_asset_category', 'erp_customer', 'erp_settlement_order'].includes(type);
}

/** 表单字段渲染组件 */
const FormFieldConfig: React.FC<FormFieldConfigProps> = ({
  field, formData, form, value, onChange, customerLicenseInfo, licenseLoading, onCustomerSelect,
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
        form={form}
        onCustomerSelect={field.type === 'erp_customer' ? onCustomerSelect : undefined}
      />
    );
  }

  switch (type) {
    case 'text':
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

    case 'money':
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
            parser={(v) => v!.replace(/\$\s?|(,*)/g, '') as any}
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
        <Upload multiple maxCount={maxCount} beforeUpload={() => false}>
          <Button icon={<UploadOutlined />} disabled={field.disabled}>上传附件</Button>
          {maxCount && <span className={styles.uploadTip}>（最多 {maxCount} 个文件）</span>}
        </Upload>
      );

    case 'photo':
      return (
        <div>
          {/* 正在异步获取执照图片 URL */}
          {licenseLoading && (
            <div className={styles.existingLicense}>
              <Spin size="small" />
              <span style={{ marginLeft: 8, color: '#999' }}>正在获取营业执照信息...</span>
            </div>
          )}
          {/* 客户已有营业执照且有图片 URL 时展示 */}
          {!licenseLoading && customerLicenseInfo?.hasLicense && customerLicenseInfo.attachedPicUrls.length > 0 && (
            <div className={styles.existingLicense}>
              <div className={styles.existingLicenseTip}>
                <PaperClipOutlined /> 客户档案已有营业执照（{customerLicenseInfo.imageCount} 张）
              </div>
              <div className={styles.existingLicenseImages}>
                {customerLicenseInfo.attachedPicUrls.map((url, idx) => (
                  <Image
                    key={idx}
                    src={url}
                    className={styles.licenseThumbnail}
                    width={80}
                    height={80}
                    style={{ objectFit: 'cover', borderRadius: 4 }}
                  />
                ))}
              </div>
            </div>
          )}
          {/* 有执照记录但图片 URL 获取失败 */}
          {!licenseLoading && customerLicenseInfo?.hasLicense && customerLicenseInfo.attachedPicUrls.length === 0 && (
            <div className={styles.existingLicense}>
              <div className={styles.existingLicenseTip}>
                <PaperClipOutlined /> 客户档案有营业执照记录，但图片暂不可用，请上传新照片
              </div>
            </div>
          )}
          <Upload listType="picture-card" accept="image/*" multiple maxCount={maxCount}
            fileList={(value as UploadFile[]) || []}
            beforeUpload={(file) => {
              if (file.size / 1024 / 1024 >= 5) {
                message.error('图片大小不能超过 5MB');
                return Upload.LIST_IGNORE;
              }
              return false;
            }}
            onChange={({ fileList: newList }) => onChange?.(newList)}
          >
            <div>上传图片</div>
          </Upload>
          {customerLicenseInfo?.hasLicense && !licenseLoading && (
            <div className={styles.uploadTip}>如需补充执照图片，可在上方上传（新图片将追加到已有执照中）</div>
          )}
        </div>
      );

    case 'table':
      return <TableFieldRenderer field={field} value={value as Record<string, unknown>[] | undefined} onChange={onChange as ((value: Record<string, unknown>[]) => void) | undefined} />;

    default:
      return <Input value={value as string | undefined} onChange={onChange as React.ChangeEventHandler<HTMLInputElement> | undefined} placeholder={placeholder || `请输入${field.label}`} disabled={field.disabled} />;
  }
};

export default FormFieldConfig;
