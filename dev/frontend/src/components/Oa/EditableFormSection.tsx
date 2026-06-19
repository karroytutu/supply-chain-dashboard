/**
 * OA 审批 - 可编辑表单区组件
 * 操作型节点（interactionType='operation'）专用：
 * 根据 fieldPermissions 决定每个字段只读/可编辑/隐藏，
 * 根据 fieldOptionFilter 过滤 select 选项，
 * 支持 visibleWhen 条件联动，通过 ref 暴露 getEditedValues/validate
 */
import React, { useState, useImperativeHandle, forwardRef, useEffect, useCallback, useMemo } from 'react';
import { Input, InputNumber, Select, Upload, Button, Card, Descriptions } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { FormField, FormSchema, FieldPermission } from '@/types/oa';
import { FormFieldRenderer, SignaturePad } from '@/components/Oa';
import { checkCondition } from '@/pages/Oa/Form/components/ConditionalFieldWrapper';
import styles from './ApprovalDetailContent.less';

const { TextArea } = Input;

// =====================================================
// 对外暴露的 Ref 接口
// =====================================================

export interface EditableFormSectionRef {
  /** 返回用户编辑过的字段（仅变更且当前可见的部分） */
  getEditedValues: () => Record<string, unknown>;
  /** 校验可编辑字段的必填规则，返回错误信息数组（空数组=通过） */
  validate: () => string[];
}

// =====================================================
// Props
// =====================================================

export interface EditableFormSectionProps {
  formSchema: FormSchema;
  formData: Record<string, unknown>;
  fieldPermissions: Record<string, FieldPermission>;
  fieldOptionFilter?: Record<string, string[]>;
  resolvedMap: Record<string, string>;
  erpLicenseUrls: string[];
  layout: 'list' | 'descriptions';
}

// =====================================================
// 组件
// =====================================================

const EditableFormSection = forwardRef<EditableFormSectionRef, EditableFormSectionProps>(
  ({ formSchema, formData, fieldPermissions, fieldOptionFilter, resolvedMap, erpLicenseUrls, layout }, ref) => {
    // 内部编辑状态：仅跟踪可编辑字段的值（formula 字段不参与编辑状态跟踪）
    const [editedValues, setEditedValues] = useState<Record<string, unknown>>(() => {
      const init: Record<string, unknown> = {};
      formSchema.fields.forEach(f => {
        if (fieldPermissions[f.key] === 'editable' && f.type !== 'formula') {
          init[f.key] = formData[f.key] ?? (f.defaultValue ?? null);
        }
      });
      return init;
    });

    // 外部 formData / fieldPermissions / formSchema 变化时重置内部状态
    const formDataSignature = useMemo(() => JSON.stringify(formData), [formData]);
    const permSignature = useMemo(() => JSON.stringify(fieldPermissions), [fieldPermissions]);
    const schemaSignature = useMemo(() => JSON.stringify(formSchema.fields), [formSchema.fields]);
    useEffect(() => {
      const reset: Record<string, unknown> = {};
      formSchema.fields.forEach(f => {
        if (fieldPermissions[f.key] === 'editable' && f.type !== 'formula') {
          reset[f.key] = formData[f.key] ?? (f.defaultValue ?? null);
        }
      });
      setEditedValues(reset);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在依赖实际变化时重置
    }, [formDataSignature, permSignature, schemaSignature]);

    // 合并值：只读字段取 formData，可编辑字段取 editedValues
    const mergedValues = useMemo(() => {
      const merged: Record<string, unknown> = { ...formData };
      Object.entries(editedValues).forEach(([k, v]) => { merged[k] = v; });
      return merged;
    }, [formData, editedValues]);

    const handleChange = useCallback((key: string, value: unknown) => {
      setEditedValues(prev => ({ ...prev, [key]: value }));
    }, []);

    // ==================== Ref 暴露 ====================

    useImperativeHandle(ref, () => ({
      getEditedValues(): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        Object.entries(editedValues).forEach(([key, val]) => {
          const field = formSchema.fields.find(f => f.key === key);
          if (!field) return;
          // 跳过当前不可见字段
          if (field.visibleWhen && !checkCondition(field.visibleWhen, mergedValues)) return;
          // 只返回变更过的字段
          if (val !== formData[key]) {
            result[key] = val;
          }
        });
        return result;
      },
      validate(): string[] {
        const errors: string[] = [];
        formSchema.fields.forEach(field => {
          const perm = fieldPermissions[field.key];
          if (perm !== 'editable') return;
          // 公式字段由系统计算，跳过校验
          if (field.type === 'formula') return;
          // 跳过当前不可见字段
          if (field.visibleWhen && !checkCondition(field.visibleWhen, mergedValues)) return;
          const val = editedValues[field.key];
          const isEmpty = val === null || val === undefined || val === '' || (Array.isArray(val) && val.length === 0);
          // 检查 required
          if (field.required && isEmpty) {
            errors.push(`「${field.label}」不能为空`);
            return;
          }
          // 检查 requiredWhen（条件必填）
          if (field.requiredWhen && checkCondition(field.requiredWhen, mergedValues) && isEmpty) {
            errors.push(`「${field.label}」不能为空`);
          }
        });
        return errors;
      },
    }), [editedValues, mergedValues, formSchema.fields, fieldPermissions, formData]);

    // ==================== 字段过滤 ====================

    const visibleFields = formSchema.fields.filter(field => {
      // hidden 权限不渲染
      if (fieldPermissions[field.key] === 'hidden') return false;
      // 跳过 _ 前缀内部字段
      if (field.key.startsWith('_')) return false;
      // visibleWhen 联动
      if (field.visibleWhen && !checkCondition(field.visibleWhen, mergedValues)) return false;
      return true;
    });

    // ==================== 可编辑字段渲染 ====================

    const renderEditableField = (field: FormField) => {
      const value = editedValues[field.key] ?? null;
      const onChange = (v: unknown) => handleChange(field.key, v);

      switch (field.type) {
        case 'text':
          return (
            <Input
              value={value as string || ''}
              onChange={e => onChange(e.target.value)}
              placeholder={field.placeholder || `请输入${field.label}`}
              maxLength={field.maxLength}
              showCount={!!field.maxLength}
            />
          );
        case 'textarea':
          return (
            <TextArea
              value={value as string || ''}
              onChange={e => onChange(e.target.value)}
              placeholder={field.placeholder || `请输入${field.label}`}
              maxLength={field.maxLength}
              showCount={!!field.maxLength}
              autoSize={{ minRows: 3 }}
            />
          );
        case 'number':
          return (
            <InputNumber
              value={value as number | undefined}
              onChange={v => onChange(v)}
              style={{ width: '100%' }}
              placeholder={field.placeholder || `请输入${field.label}`}
              min={field.min}
              max={field.max}
              precision={field.precision}
              addonAfter={field.suffix || field.unit}
            />
          );
        case 'select': {
          let options = field.options || [];
          // 应用 fieldOptionFilter（按层级过滤可选项）
          const allowedValues = fieldOptionFilter?.[field.key];
          if (allowedValues) {
            options = options.filter(opt => allowedValues.includes(String(opt.value)));
          }
          return (
            <Select
              value={value as string | undefined}
              onChange={v => onChange(v)}
              placeholder={field.placeholder || `请选择${field.label}`}
              options={options}
              style={{ width: '100%' }}
            />
          );
        }
        case 'signature':
          return (
            <SignaturePad
              value={value as string | undefined}
              onChange={v => onChange(v)}
            />
          );
        case 'upload':
          return (
            <Upload
              multiple
              maxCount={field.maxCount}
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
              beforeUpload={() => false}
              fileList={(value as any[]) || []}
              onChange={({ fileList }) => onChange(fileList)}
            >
              <Button icon={<UploadOutlined />}>上传附件</Button>
              {field.maxCount && (
                <span style={{ marginLeft: 8, color: '#999', fontSize: 12 }}>
                  （最多 {field.maxCount} 个文件）
                </span>
              )}
            </Upload>
          );
        default:
          // 其他类型降级为只读渲染
          return (
            <FormFieldRenderer
              field={field}
              value={value}
              formData={mergedValues}
              resolvedMap={resolvedMap}
              erpLicenseUrls={erpLicenseUrls}
            />
          );
      }
    };

    // ==================== 渲染 ====================

    if (layout === 'descriptions') {
      return (
        <Card title="表单内容" className={styles.card}>
          <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
            {visibleFields.map(field => {
              const perm = fieldPermissions[field.key];
              const isEditable = perm === 'editable';
              return (
                <Descriptions.Item key={field.key} label={field.label}>
                  {isEditable
                    ? renderEditableField(field)
                    : (
                      <FormFieldRenderer
                        field={field}
                        value={formData[field.key]}
                        formData={mergedValues}
                        resolvedMap={resolvedMap}
                        erpLicenseUrls={erpLicenseUrls}
                      />
                    )
                  }
                </Descriptions.Item>
              );
            })}
          </Descriptions>
        </Card>
      );
    }

    // list 布局
    return (
      <div className={styles.formDataSection}>
        <h3>表单数据</h3>
        <div className={styles.formDataList}>
          {visibleFields.map(field => {
            const perm = fieldPermissions[field.key];
            const isEditable = perm === 'editable';
            return (
              <div key={field.key} className={styles.formDataRow}>
                <span className={styles.formLabel}>{field.label}</span>
                <span className={styles.formValue}>
                  {isEditable
                    ? renderEditableField(field)
                    : (
                      <FormFieldRenderer
                        field={field}
                        value={formData[field.key]}
                        formData={mergedValues}
                        resolvedMap={resolvedMap}
                        erpLicenseUrls={erpLicenseUrls}
                      />
                    )
                  }
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);

EditableFormSection.displayName = 'EditableFormSection';
export default EditableFormSection;
