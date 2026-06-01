import React, { useMemo } from 'react';
import { Typography } from 'antd';
import type { FormField } from '@/types/oa-approval';
import FormFieldRenderer from './FormFieldRenderer';
import type { ErpResolvedMap } from './hooks/useErpFieldResolve';
import styles from './FormFieldsDiff.less';

const { Text } = Typography;

/** gradeId→gradeName, groupId→groupName, areaId→areaName 映射 */
const ERP_NAME_SUFFIX_MAP: Record<string, string> = {
  gradeId: 'gradeName',
  groupId: 'groupName',
  areaId: 'areaName',
};

interface FormFieldDiffProps {
  field: FormField;
  oldValue: unknown;
  newValue: unknown;
  formData: Record<string, unknown>;
  resolvedMap: ErpResolvedMap;
  erpLicenseUrls?: string[];
}

/** 单字段变更对比渲染器：红色删除线显示原值，绿色显示新值 */
const FormFieldDiff: React.FC<FormFieldDiffProps> = ({
  field,
  oldValue,
  newValue,
  formData,
  resolvedMap,
  erpLicenseUrls,
}) => {
  /**
   * 构造旧值渲染所需的 formData：
   * 对于有 nameField 的字段（如 consumerManagerId → _consumerManagerName），
   * 将 _original_<nameField> 映射到 nameField 位置，让 FormFieldRenderer 能查到原始名称
   */
  const oldFormData = useMemo(() => {
    if (!field.nameField) return formData;
    // nameField 可能带 _ 前缀（如 _consumerManagerName），后端存储时去掉了前缀
    const cleanNameField = field.nameField.replace(/^_/, '');
    const originalNameKey = `_original_${cleanNameField}`;
    const originalName = formData[originalNameKey];
    if (!originalName) return formData;
    return { ...formData, [field.nameField]: originalName };
  }, [field.nameField, formData]);

  /**
   * 对于无 nameField 的 ERP 字段（gradeId/groupId/areaId），
   * 检查是否有 _original_<nameVariant> 存储了解析后的名称
   */
  const oldResolvedMap = useMemo(() => {
    const nameSuffix = ERP_NAME_SUFFIX_MAP[field.key];
    if (!nameSuffix) return resolvedMap;
    const originalName = formData[`_original_${nameSuffix}`];
    if (!originalName || oldValue == null) return resolvedMap;
    // 将原始名称注入 resolvedMap，key 格式: "grades:123"
    if (!field.searchApi) return resolvedMap;
    const erpTypeMap: Record<string, string> = {
      erp_grades: 'grades',
      erp_groups: 'groups',
      erp_areas: 'areas',
    };
    const erpType = erpTypeMap[field.searchApi];
    if (!erpType) return resolvedMap;
    return { ...resolvedMap, [`${erpType}:${oldValue}`]: String(originalName) };
  }, [field.key, field.searchApi, formData, oldValue, resolvedMap]);

  const oldEmpty = oldValue === null || oldValue === undefined || oldValue === '';
  const newEmpty = newValue === null || newValue === undefined || newValue === '';

  return (
    <div className={styles.diffValue}>
      {/* 旧值 */}
      <div className={styles.diffOld}>
        {oldEmpty ? (
          <Text type="secondary">（无）</Text>
        ) : (
          <FormFieldRenderer
            field={field}
            value={oldValue}
            formData={oldFormData}
            resolvedMap={oldResolvedMap}
            erpLicenseUrls={erpLicenseUrls}
          />
        )}
      </div>
      {/* 箭头 */}
      <div className={styles.diffArrow}>↓</div>
      {/* 新值 */}
      <div className={styles.diffNew}>
        {newEmpty ? (
          <Text type="secondary">（清空）</Text>
        ) : (
          <FormFieldRenderer
            field={field}
            value={newValue}
            formData={formData}
            resolvedMap={resolvedMap}
            erpLicenseUrls={erpLicenseUrls}
          />
        )}
      </div>
    </div>
  );
};

export default FormFieldDiff;
