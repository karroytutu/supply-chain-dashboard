/**
 * OA 审批 - 可编辑表单区组件
 * 办理型节点（handle）专用：
 * 根据 fieldPermissions 决定每个字段只读/可编辑/隐藏，
 * 根据 fieldOptionFilter 过滤 select 选项，
 * 支持 visibleWhen 条件联动，通过 ref 暴露 getEditedValues/validate
 *
 * 所有字段渲染委托 FieldControlDispatcher（统一控件 + 模式开关）
 */
import React, { useState, useImperativeHandle, forwardRef, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, Descriptions } from 'antd';
import type { FormField, FormSchema, FieldPermission } from '@/types/oa';
import FieldControlDispatcher from './fields';
import { EditableFormProvider } from './EditableFormContext';
import { checkCondition } from '@/pages/Oa/Form/components/ConditionalFieldWrapper';
import styles from './ApprovalDetailContent.less';

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
  /** 表单类型编码，用于分组权限警告 */
  formTypeCode?: string;
  /** 字段级编辑权限；未传入时所有字段默认为只读（安全降级） */
  fieldPermissions?: Record<string, FieldPermission>;
  fieldOptionFilter?: Record<string, string[]>;
  resolvedMap: Record<string, string>;
  erpLicenseUrls: string[];
  layout: 'list' | 'descriptions';
}

// =====================================================
// 辅助：获取字段权限（兼容 fieldPermissions 未传入的情况）
// =====================================================

/** 去重集合：按表单类型分组，同一字段在同一表单类型下只报告一次 */
const MAX_REPORTED_GROUPS = 50;
const reportedMissingPerms = new Map<string, Set<string>>();

function getPerm(
  fieldPermissions: Record<string, FieldPermission> | undefined,
  key: string,
  formTypeCode?: string
): FieldPermission {
  if (!fieldPermissions || !(key in fieldPermissions)) {
    if (process.env.NODE_ENV === 'development') {
      const groupKey = formTypeCode || '__default__';
      let groupSet = reportedMissingPerms.get(groupKey);
      if (!groupSet) {
        // 容量上限：防止长时间运行的 SPA 内存泄漏
        if (reportedMissingPerms.size >= MAX_REPORTED_GROUPS) {
          reportedMissingPerms.clear();
        }
        groupSet = new Set();
        reportedMissingPerms.set(groupKey, groupSet);
      }
      if (!groupSet.has(key)) {
        groupSet.add(key);
        console.warn(`[FieldPermission][${groupKey}] 字段 "${key}" 未声明权限，DB配置可能不完整。请在表单管理页配置。`);
      }
    }
    return 'readonly';
  }
  return fieldPermissions[key];
}

// =====================================================
// 组件
// =====================================================

const EditableFormSection = forwardRef<EditableFormSectionRef, EditableFormSectionProps>(
  ({ formSchema, formData, formTypeCode, fieldPermissions, fieldOptionFilter, resolvedMap, erpLicenseUrls, layout }, ref) => {
    // 内部编辑状态：仅跟踪可编辑字段的值（formula 字段不参与编辑状态跟踪）
    // searchApi 表格字段（模式一）：从 _details 加载完整记录数组，而非 formData 中的 ID 数组
    const [editedValues, setEditedValues] = useState<Record<string, unknown>>(() => {
      const init: Record<string, unknown> = {};
      formSchema.fields.forEach(f => {
        if (getPerm(fieldPermissions, f.key, formTypeCode) === 'editable' && f.type !== 'formula') {
          if (f.type === 'table' && f.searchApi) {
            const details = formData._details as Record<string, unknown> | undefined;
            const detailRecords = details?.[f.key];
            if (Array.isArray(detailRecords) && detailRecords.length > 0 && typeof detailRecords[0] === 'object') {
              init[f.key] = detailRecords;
            } else if (Array.isArray(formData[f.key]) && (formData[f.key] as unknown[]).length > 0 && typeof (formData[f.key] as unknown[])[0] === 'object') {
              init[f.key] = formData[f.key];
            } else {
              init[f.key] = [];
            }
          } else {
            init[f.key] = formData[f.key] ?? (f.defaultValue ?? null);
          }
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
        if (getPerm(fieldPermissions, f.key, formTypeCode) === 'editable' && f.type !== 'formula') {
          if (f.type === 'table' && f.searchApi) {
            const details = formData._details as Record<string, unknown> | undefined;
            const detailRecords = details?.[f.key];
            if (Array.isArray(detailRecords) && detailRecords.length > 0 && typeof detailRecords[0] === 'object') {
              reset[f.key] = detailRecords;
            } else if (Array.isArray(formData[f.key]) && (formData[f.key] as unknown[]).length > 0 && typeof (formData[f.key] as unknown[])[0] === 'object') {
              reset[f.key] = formData[f.key];
            } else {
              reset[f.key] = [];
            }
          } else {
            reset[f.key] = formData[f.key] ?? (f.defaultValue ?? null);
          }
        }
      });
      setEditedValues(reset);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在依赖实际变化时重置
    }, [formDataSignature, permSignature, schemaSignature]);

    // 预构建 field lookup map，避免 mergedValues 和 getEditedValues 中循环 find()
    const fieldMap = useMemo(
      () => new Map(formSchema.fields.map(f => [f.key, f])),
      [formSchema.fields]
    );

    // 合并值：只读字段取 formData，可编辑字段取 editedValues
    // searchApi 表格字段：实时同步到 _details（供 scopeFromField 等引用）
    const mergedValues = useMemo(() => {
      const merged: Record<string, unknown> = { ...formData };
      const liveDetails: Record<string, unknown> = {
        ...((formData._details as Record<string, unknown>) || {}),
        ...((editedValues._details as Record<string, unknown>) || {}),
      };
      Object.entries(editedValues).forEach(([k, v]) => {
        if (k === '_details') return; // _details 由 liveDetails 统一合并
        merged[k] = v;
        const field = fieldMap.get(k);
        if (field?.type === 'table' && field?.searchApi && Array.isArray(v)) {
          liveDetails[k] = v;
        }
      });
      merged._details = liveDetails;
      return merged;
    }, [formData, editedValues, fieldMap]);

    const handleChange = useCallback((key: string, value: unknown) => {
      setEditedValues(prev => ({ ...prev, [key]: value }));
    }, []);

    // ==================== Context 表单操作能力（ref 稳定化，引用永不变） ====================

    /** useRef 保持 editedValues 最新值，供 getFieldValue 读取 */
    const editedValuesRef = useRef(editedValues);
    editedValuesRef.current = editedValues;

    /** 稳定的 setFieldsValue：函数式更新，不依赖闭包 */
    const stableSetFieldsValue = useCallback((values: Record<string, unknown>) =>
      setEditedValues(prev => ({ ...prev, ...values })), []);

    /** 稳定的 getFieldValue：从 ref 读取最新值 */
    const stableGetFieldValue = useCallback((name: string) => editedValuesRef.current[name], []);

    /** Context value：空依赖数组，引用永不变 */
    const stableContextValue = useMemo(() => ({
      setFieldsValue: stableSetFieldsValue,
      getFieldValue: stableGetFieldValue,
    }), [stableSetFieldsValue, stableGetFieldValue]);

    // ==================== Ref 暴露 ====================

    useImperativeHandle(ref, () => ({
      getEditedValues(): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        const detailsUpdates: Record<string, unknown> = {};
        Object.entries(editedValues).forEach(([key, val]) => {
          // _ 前缀的内部数据（如 _details 自动持久化记录）直接透传
          if (key.startsWith('_')) {
            if (key === '_details' && val !== formData[key]) {
              // _details 深合并：保留原始 _details 中未被当前编辑覆盖的字段
              // 例：原始 _details 有 receivableOrderIds，编辑只改了 unreconciledOrderIds
              // 合并后两者都保留，避免后续节点编辑覆盖之前的表格选择记录
              const originalDetails = (formData._details as Record<string, unknown>) || {};
              const editedDetails = (val as Record<string, unknown>) || {};
              result._details = { ...originalDetails, ...editedDetails };
            } else if (val !== formData[key]) {
              result[key] = val;
            }
            return;
          }
          const field = fieldMap.get(key);
          if (!field) return;
          // 跳过当前不可见字段
          if (field.visibleWhen && !checkCondition(field.visibleWhen, mergedValues)) return;

          // searchApi 表格字段（模式一）：提交边界 transform
          // value 是完整记录数组 → 提取 ID 数组给后端 + 存档记录到 _details
          if (field.type === 'table' && field.searchApi && Array.isArray(val)) {
            const valueKey = field.valueKey || 'id';
            const records = val as Record<string, unknown>[];
            const ids = records.map(r => r[valueKey]);
            // 变更检测：比较提取的 ID 数组与 formData 原始值
            const originalIds = Array.isArray(formData[key]) ? formData[key] as unknown[] : [];
            const idsChanged = ids.length !== originalIds.length ||
              ids.some((id, i) => String(id) !== String(originalIds[i]));
            if (idsChanged) {
              result[key] = ids;
            }
            // _details 存档：合并 value 记录与已有 _details 中的用户编辑数据
            const editedDetails = (editedValues._details as Record<string, unknown>) || {};
            const existingDetailRecords = editedDetails[key] as Record<string, unknown>[] | undefined;
            if (field.editableAmount && existingDetailRecords) {
              // editableAmount 字段：保留用户在 EditableAmountList 中编辑的金额字段
              const editedMap = new Map(existingDetailRecords.map(r => [String(r[valueKey]), r]));
              detailsUpdates[key] = records.map(r => ({
                ...r,
                ...(editedMap.get(String(r[valueKey])) || {}),
              }));
            } else if (idsChanged) {
              detailsUpdates[key] = records;
            }
            return;
          }

          // 只返回变更过的字段（对引用类型如数组，使用引用不等判断）
          if (val !== formData[key]) {
            result[key] = val;
          }
        });
        // 合并 searchApi 记录到 _details
        if (Object.keys(detailsUpdates).length > 0) {
          const originalDetails = (formData._details as Record<string, unknown>) || {};
          const editedDetails = (result._details as Record<string, unknown>) || {};
          result._details = { ...originalDetails, ...editedDetails, ...detailsUpdates };
        }
        return result;
      },
      validate(): string[] {
        const errors: string[] = [];
        formSchema.fields.forEach(field => {
          const perm = getPerm(fieldPermissions, field.key, formTypeCode);
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
    }), [editedValues, mergedValues, formSchema.fields, fieldPermissions, formData, fieldMap]);

    // ==================== 字段过滤 ====================

    // hidden 字段已在数据层 applyFieldPermissions 中过滤，此处仅处理 _ 前缀 / schema.hidden / visibleWhen
    const visibleFields = formSchema.fields.filter(field => {
      // 跳过 _ 前缀内部字段
      if (field.key.startsWith('_')) return false;
      // 跳过 hidden 字段（如自动填充的供应商名称、采购单号等）
      if (field.hidden) return false;
      // visibleWhen 联动
      if (field.visibleWhen && !checkCondition(field.visibleWhen, mergedValues)) return false;
      return true;
    });

    // ==================== 渲染 ====================

    /** 渲染单个字段：委托 FieldControlDispatcher，通过 mode 切换只读/编辑 */
    const renderField = (field: FormField) => {
      const perm = getPerm(fieldPermissions, field.key, formTypeCode);
      const isEditable = perm === 'editable';
      return (
        <FieldControlDispatcher
          mode={isEditable ? 'editable' : 'readonly'}
          field={field}
          value={isEditable ? (editedValues[field.key] ?? null) : formData[field.key]}
          onChange={isEditable ? (v: unknown) => handleChange(field.key, v) : undefined}
          formData={mergedValues}
          resolvedMap={resolvedMap}
          erpLicenseUrls={erpLicenseUrls}
          allowedOptionValues={fieldOptionFilter?.[field.key]}
          fieldPermissions={fieldPermissions}
        />
      );
    };

    if (layout === 'descriptions') {
      return (
        <EditableFormProvider value={stableContextValue}>
        <Card title="表单内容" className={styles.card}>
          <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
            {visibleFields.map(field => (
              <Descriptions.Item key={field.key} label={field.label}>
                {renderField(field)}
              </Descriptions.Item>
            ))}
          </Descriptions>
        </Card>
        </EditableFormProvider>
      );
    }

    // list 布局
    return (
      <EditableFormProvider value={stableContextValue}>
      <div className={styles.formDataSection}>
        <h3>表单数据</h3>
        <div className={styles.formDataList}>
          {visibleFields.map(field => (
            <div key={field.key} className={styles.formDataRow}>
              <span className={styles.formLabel}>{field.label}</span>
              <span className={styles.formValue}>
                {renderField(field)}
              </span>
            </div>
          ))}
        </div>
      </div>
      </EditableFormProvider>
    );
  }
);

EditableFormSection.displayName = 'EditableFormSection';
export default EditableFormSection;
