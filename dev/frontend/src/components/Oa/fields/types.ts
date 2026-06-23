/**
 * 统一字段控件共享 Props
 * 每个字段类型一个组件，通过 mode 切换只读/编辑
 */
import type { FormField } from '@/types/oa';
import type { ErpResolvedMap } from '../hooks/useErpFieldResolve';

export type FieldControlMode = 'readonly' | 'editable';

export interface FieldControlProps {
  /** 渲染模式 */
  mode: FieldControlMode;
  /** 字段定义 */
  field: FormField;
  /** 当前值 */
  value: unknown;
  /** 值变更回调（仅 editable 模式使用） */
  onChange?: (value: unknown) => void;
  /** 完整表单数据（用于 ERP 关联、linkUrl、visibleWhen 等） */
  formData?: Record<string, unknown>;
  /** ERP ID 批量预解析结果 */
  resolvedMap?: ErpResolvedMap;
  /** ERP 客户执照图片 URL */
  erpLicenseUrls?: string[];
  /** select 类型的可选项过滤（fieldOptionFilter） */
  allowedOptionValues?: string[];
  /**
   * 模拟 Form 对象，供 ERP 字段的 autoFill / nameField 写入使用
   * 仅 editable 模式下由 EditableFormSection 传入
   */
  fakeForm?: {
    setFieldsValue: (values: Record<string, unknown>) => void;
    getFieldValue: (name: string) => unknown;
  };
  /** 字段权限配置（含表格子字段权限如 feeLines.feeUnitPrice） */
  fieldPermissions?: Record<string, import('@/types/oa').FieldPermission>;
}
