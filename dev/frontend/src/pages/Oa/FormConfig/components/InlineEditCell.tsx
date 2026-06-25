/**
 * 内联编辑单元格组件
 * @module pages/Oa/FormConfig/components/InlineEditCell
 *
 * 支持常驻编辑图标、点击进入编辑态的通用单元格。
 * 编辑类型支持：文本、单选、多选、岗位+人员混合选择。
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Input, Select, Spin, Typography, Button, message } from 'antd';
import { EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';

const { Text } = Typography;

type EditType = 'text' | 'select' | 'multi-select' | 'role-user';

interface InlineEditCellProps {
  /** 只读态展示内容 */
  value: ReactNode;
  /** 编辑控件类型 */
  editType: EditType;
  /** 编辑控件配置（根据 editType 传入不同 props） */
  editProps?: {
    options?: Array<{ value: string | number; label: string }>;
    placeholder?: string;
    /** role-user 类型时的角色列表 */
    roles?: Array<{ code: string; name: string }>;
    /** role-user 类型时的已选岗位 */
    selectedRoles?: string[];
    /** role-user 类型时的已选用户 */
    selectedUsers?: number[];
    /** role-user 类型时的子组件（RoleUserSelect） */
    renderEditor?: (onSave: (val: unknown) => void) => ReactNode;
  };
  /** 保存回调 */
  onSave: (newValue: unknown) => Promise<void>;
  /** 禁用编辑 */
  disabled?: boolean;
  /** 自定义样式 */
  style?: React.CSSProperties;
  /** 父组件传入的 CSS Modules styles（用于编辑图标样式） */
  styles?: Record<string, string>;
  /** 编辑态初始值（当 value 为 ReactNode 时必须提供原始值） */
  editInitialValue?: string | number;
}

const InlineEditCell: React.FC<InlineEditCellProps> = ({
  value,
  editType,
  editProps,
  onSave,
  disabled = false,
  style,
  styles,
  editInitialValue,
}) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [textValue, setTextValue] = useState('');
  const [selectValue, setSelectValue] = useState<unknown>(undefined);
  const [multiValue, setMultiValue] = useState<unknown[]>([]);
  const [roleUserValue, setRoleUserValue] = useState<unknown>(undefined);
  const inputRef = useRef<any>(null);

  const startEditing = useCallback(() => {
    if (disabled || saving) return;
    setEditing(true);
    if (editType === 'text') {
      setTextValue(editInitialValue ?? (typeof value === 'string' ? value : ''));
    } else if (editType === 'select') {
      setSelectValue(editInitialValue);
    } else if (editType === 'multi-select') {
      setMultiValue([]);
    } else if (editType === 'role-user') {
      setRoleUserValue(undefined);
    }
  }, [disabled, saving, editType, value, editInitialValue]);

  useEffect(() => {
    if (editing && editType === 'text' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing, editType]);

  const handleSave = useCallback(async (newValue: unknown) => {
    setSaving(true);
    try {
      await onSave(newValue);
      setEditing(false);
    } catch (error: any) {
      message.error(error?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  }, [onSave]);

  const handleCancel = useCallback(() => {
    setEditing(false);
  }, []);

  /** 确认/取消按钮组 */
  const renderActionButtons = (onConfirm: () => void) => (
    <span style={{ display: 'inline-flex', gap: 2, marginLeft: 4, flexShrink: 0 }}>
      <Button
        size="small" type="text" icon={<CheckOutlined style={{ color: '#52c41a' }} />}
        onClick={onConfirm} disabled={saving}
      />
      <Button
        size="small" type="text" icon={<CloseOutlined style={{ color: '#ff4d4f' }} />}
        onClick={handleCancel} disabled={saving}
      />
      {saving && <Spin size="small" />}
    </span>
  );

  if (editing) {
    if (editType === 'text') {
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, ...style }}>
          <Input
            ref={inputRef}
            size="small"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') handleCancel(); }}
            style={{ width: 'auto', minWidth: 120 }}
            disabled={saving}
          />
          {renderActionButtons(() => handleSave(textValue))}
        </div>
      );
    }

    if (editType === 'select') {
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, ...style }}>
          <Select
            size="small"
            autoFocus
            defaultOpen
            value={selectValue}
            options={editProps?.options}
            placeholder={editProps?.placeholder}
            onChange={(val) => setSelectValue(val)}
            style={{ minWidth: 120 }}
            disabled={saving}
          />
          {renderActionButtons(() => handleSave(selectValue))}
        </div>
      );
    }

    if (editType === 'multi-select') {
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, ...style }}>
          <Select
            size="small"
            mode="multiple"
            autoFocus
            defaultOpen
            value={multiValue}
            options={editProps?.options}
            placeholder={editProps?.placeholder}
            onChange={(vals) => setMultiValue(vals)}
            style={{ minWidth: 200 }}
            disabled={saving}
          />
          {renderActionButtons(() => handleSave(multiValue))}
        </div>
      );
    }

    if (editType === 'role-user' && editProps?.renderEditor) {
      return (
        <div style={{ display: 'inline-block', minWidth: 200, ...style }}>
          {editProps.renderEditor((val) => setRoleUserValue(val))}
          <div style={{ marginTop: 4 }}>
            {renderActionButtons(() => handleSave(roleUserValue))}
          </div>
        </div>
      );
    }
  }

  // 只读态
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        cursor: disabled ? 'default' : 'pointer',
        position: 'relative',
        ...style,
      }}
    >
      <span>{value}</span>
      {!disabled && (
        <EditOutlined
          className={styles?.inlineEditIcon}
          onClick={(e) => {
            e.stopPropagation();
            startEditing();
          }}
        />
      )}
      {saving && <Spin size="small" />}
    </span>
  );
};

export default InlineEditCell;
