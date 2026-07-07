/**
 * 统一字段控件共享 Props
 * 每个字段类型一个组件，通过 mode 切换只读/编辑
 */
import type { FormField, FormSchema } from '@/types/oa';
import type { ErpResolvedMap } from '../hooks/useErpFieldResolve';
import type { CustomerLicenseInfo } from '@/services/api/oa';

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
   * 表单写入能力覆盖（仅表格行内 CellInput 场景使用）
   * 表格行内的 ERP 字段 autoFill 需写入行数据而非表单状态，
   * 通过此 prop 覆盖 Context 提供的表单级别写入能力。
   * 普通场景下无需传入，组件自动从 EditableFormContext 获取。
   */
  form?: {
    setFieldsValue: (values: Record<string, unknown>) => void;
    getFieldValue: (name: string) => unknown;
  };
  /** 字段权限配置（含表格子字段权限如 feeLines.feeUnitPrice） */
  fieldPermissions?: Record<string, import('@/types/oa').FieldPermission>;
  /** 客户选中时回调（仅 erp_customers 类型使用） */
  onCustomerSelect?: (licenseInfo: CustomerLicenseInfo | null) => void;
  /** 表单 Schema（用于 bank_account_selector cascadeFrom 级联填充） */
  formSchema?: FormSchema;
  /** 客户搜索是否包含所有状态（客户档案修改场景传 true） */
  includeAllStates?: boolean;
  /** 单元格失焦回调（表格列宽动态计算用） */
  onBlur?: () => void;
  /** 级联父字段值（表格上下文中从同行数据取值） */
  cascadeValue?: unknown;
}
