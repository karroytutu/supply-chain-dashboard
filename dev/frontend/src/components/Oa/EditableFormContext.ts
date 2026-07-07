/**
 * OA 审批编辑区表单操作 Context
 *
 * 提供表单写入能力（setFieldsValue / getFieldValue），替代原有的 fakeForm props 链传递模式。
 *
 * - Form 发起页：value 为 Ant Design FormInstance（真实 form 实例）
 * - 审批详情页（EditableFormSection）：value 为 ref 稳定化的 EditableFormContextValue 对象
 *
 * 消费组件通过 useEditableForm() 获取，不再依赖 props 逐层传递。
 * 对齐 React Hook Form / Formik / Ant Design Form 的 Context + Hook 模式。
 */
import { createContext, useContext } from 'react';

/** Context 值接口：表单写入能力 */
export interface EditableFormContextValue {
  setFieldsValue: (values: Record<string, unknown>) => void;
  getFieldValue: (name: string) => unknown;
}

const EditableFormContext = createContext<EditableFormContextValue | null>(null);

/** Provider：由 Form 发起页或 EditableFormSection 提供 */
export const EditableFormProvider = EditableFormContext.Provider;

/**
 * 获取审批编辑区的表单操作能力
 * - Provider 内：返回 { setFieldsValue, getFieldValue }
 * - Provider 外：返回 null（消费组件应静默跳过写入操作）
 */
export function useEditableForm(): EditableFormContextValue | null {
  const ctx = useContext(EditableFormContext);
  if (process.env.NODE_ENV === 'development' && ctx === null) {
    console.debug?.('[EditableFormContext] useEditableForm called outside of EditableFormProvider');
  }
  return ctx;
}
