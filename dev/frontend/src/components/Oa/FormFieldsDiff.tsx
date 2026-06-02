/**
 * 表单变更对比视图（通用组件）
 * 检测 formData 中的 _original_* 字段，自动展示变更对比
 * 仅显示有变更的字段，未变更字段默认隐藏
 */
import React, { useState, useMemo } from 'react';
import { Descriptions } from 'antd';
import { EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons';
import type { FormSchema, FormField } from '@/types/oa';
import FormFieldRenderer from './FormFieldRenderer';
import FormFieldDiff from './FormFieldDiff';
import type { ErpResolvedMap } from './hooks/useErpFieldResolve';
import { checkCondition } from '@/pages/Oa/Form/components/ConditionalFieldWrapper';
import { hasOriginalFields, valuesEqual, extractPhotoUrl } from './diffUtils';
import styles from './FormFieldsDiff.less';

// Re-export for backward compatibility
export { hasOriginalFields } from './diffUtils';

interface FormFieldsDiffProps {
  formSchema: FormSchema;
  formData: Record<string, unknown>;
  resolvedMap: ErpResolvedMap;
  erpLicenseUrls?: string[];
  /** list = div 行布局（流程中心/共用组件），descriptions = Ant Descriptions 布局（详情页） */
  layout?: 'list' | 'descriptions';
}

const FormFieldsDiff: React.FC<FormFieldsDiffProps> = ({
  formSchema,
  formData,
  resolvedMap,
  erpLicenseUrls,
  layout = 'list',
}) => {
  const [showAll, setShowAll] = useState(false);

  /** 分析每个字段的变更状态 */
  const fieldAnalysis = useMemo(() => {
    const fields = formSchema?.fields || [];
    let changedCount = 0;
    let unchangedCount = 0;
    const analysis: Array<{
      field: FormField;
      hasDiff: boolean;       // 是否有 _original_ 数据
      isChanged: boolean;     // 值是否有变化
      isHidden: boolean;      // 是否被条件隐藏
      oldValue?: unknown;
      newValue?: unknown;
    }> = [];

    for (const field of fields) {
      // 跳过 _ 前缀字段（隐藏字段，不在详情页展示）
      if (field.key.startsWith('_')) continue;

      // 条件隐藏
      if (field.visibleWhen && !checkCondition(field.visibleWhen, formData)) {
        analysis.push({ field, hasDiff: false, isChanged: false, isHidden: true });
        continue;
      }

      const originalKey = `_original_${field.key}`;
      let hasOriginal = originalKey in formData;
      let effectiveOriginalKey = originalKey;

      // photo 字段的原始值可能存储在 _original_<fieldKey>Url（如 _original_storefrontPhotoUrl）
      // 因为隐藏字段 _storefrontPhotoUrl 与可见字段 storefrontPhoto 键名不同
      if (!hasOriginal && field.type === 'photo') {
        const altKey = `_original_${field.key}Url`;
        if (altKey in formData) {
          effectiveOriginalKey = altKey;
          hasOriginal = true;
        }
      }

      if (!hasOriginal) {
        // 无原始数据（如 customer、remark 等字段），正常渲染
        analysis.push({ field, hasDiff: false, isChanged: false, isHidden: false });
        continue;
      }

      const oldValue = formData[effectiveOriginalKey];
      const newValue = formData[field.key];

      // photo 类型特殊处理：比较实际 URL
      const isChanged = field.type === 'photo'
        ? extractPhotoUrl(oldValue) !== extractPhotoUrl(newValue)
        : !valuesEqual(oldValue, newValue);

      if (isChanged) changedCount++;
      else unchangedCount++;

      analysis.push({
        field,
        hasDiff: true,
        isChanged,
        isHidden: false,
        oldValue,
        newValue,
      });
    }

    return { analysis, changedCount, unchangedCount };
  }, [formSchema, formData]);

  const { analysis, changedCount, unchangedCount } = fieldAnalysis;

  /** 渲染单个字段行 */
  const renderField = (item: typeof analysis[number]) => {
    const { field, hasDiff, isChanged, oldValue, newValue } = item;
    const value = formData[field.key];

    // 有 diff 数据且值有变化
    if (hasDiff && isChanged) {
      // 区分“新增”与“修改”
      const oldIsEmpty = oldValue === null || oldValue === undefined || oldValue === '';
      const badgeClass = oldIsEmpty ? `${styles.diffBadge} ${styles.diffBadgeNew}` : `${styles.diffBadge} ${styles.diffBadgeChanged}`;
      const badgeText = oldIsEmpty ? '新增' : '修改';

      const diffContent = (
        <FormFieldDiff
          field={field}
          oldValue={oldValue}
          newValue={newValue}
          formData={formData}
          resolvedMap={resolvedMap}
          erpLicenseUrls={erpLicenseUrls}
        />
      );

      if (layout === 'descriptions') {
        return (
          <Descriptions.Item key={field.key} label={field.label} className={styles.descriptionsDiffValue}>
            {diffContent}
          </Descriptions.Item>
        );
      }
      return (
        <div key={field.key} className={styles.formDataRow}>
          <span className={styles.formLabel}>
            {field.label}
            <span className={badgeClass}>{badgeText}</span>
          </span>
          <span className={styles.formValue}>{diffContent}</span>
        </div>
      );
    }

    // 有 diff 数据但值未变化 → 默认隐藏，切换后显示
    if (hasDiff && !isChanged) {
      if (!showAll) return null;

      const normalContent = (
        <FormFieldRenderer
          field={field}
          value={value}
          formData={formData}
          resolvedMap={resolvedMap}
          erpLicenseUrls={erpLicenseUrls}
        />
      );

      if (layout === 'descriptions') {
        return (
          <Descriptions.Item key={field.key} label={field.label}>
            <span className={styles.unchangedRow}>{normalContent}</span>
          </Descriptions.Item>
        );
      }
      return (
        <div key={field.key} className={`${styles.formDataRow} ${styles.unchangedRow}`}>
          <span className={styles.formLabel}>{field.label}</span>
          <span className={styles.formValue}>{normalContent}</span>
        </div>
      );
    }

    // 无 diff 数据（如 customer、remark）→ 正常渲染
    const normalContent = (
      <FormFieldRenderer
        field={field}
        value={value}
        formData={formData}
        resolvedMap={resolvedMap}
        erpLicenseUrls={erpLicenseUrls}
      />
    );

    if (layout === 'descriptions') {
      return (
        <Descriptions.Item key={field.key} label={field.label}>
          {normalContent}
        </Descriptions.Item>
      );
    }
    return (
      <div key={field.key} className={styles.formDataRow}>
        <span className={styles.formLabel}>{field.label}</span>
        <span className={styles.formValue}>{normalContent}</span>
      </div>
    );
  };

  return (
    <>
      {/* 变更统计 */}
      {changedCount > 0 && (
        <div className={styles.diffSummary}>
          共 {changedCount} 项变更{unchangedCount > 0 && `，${unchangedCount} 项未变`}
        </div>
      )}
      {changedCount === 0 && hasOriginalFields(formData) && (
        <div className={styles.diffSummary}>未修改任何字段</div>
      )}

      {/* 字段列表 */}
      {analysis.map(renderField)}

      {/* 切换按钮 */}
      {unchangedCount > 0 && (
        <button
          type="button"
          className={styles.toggleLink}
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? <EyeInvisibleOutlined /> : <EyeOutlined />}
          {showAll ? '仅显示变更' : `显示全部字段 (${unchangedCount} 项未变)`}
        </button>
      )}
    </>
  );
};

export default FormFieldsDiff;
