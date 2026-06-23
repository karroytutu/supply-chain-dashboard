/**
 * 字段权限配置 Hook
 * @module pages/Oa/FormConfig/hooks/useFieldPermissions
 *
 * 管理字段权限的加载、编辑、保存状态。
 * 通过 PATCH /api/oa/admin/form-types/:code/field-permissions 持久化配置。
 */
import { useState, useCallback, useRef } from 'react';
import { message } from 'antd';
import { updateAdminFieldPermissions } from '@/services/api/oa';
import type { FieldPermission, FieldPermissionsOverride } from '@/types/oa';

/** 权限状态循环：editable → readonly → hidden → editable（无"默认"状态，每格必须配置） */
const PERMISSION_CYCLE: FieldPermission[] = ['editable', 'readonly', 'hidden'];

export function useFieldPermissions(
  code: string,
  initialPermissions?: FieldPermissionsOverride
) {
  const [permissions, setPermissions] = useState<FieldPermissionsOverride>(
    initialPermissions || { nodes: {} }
  );
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);

  /** 切换某个字段在某个环节的权限状态 */
  const togglePermission = useCallback((
    nodeOrder: string,
    fieldKey: string
  ) => {
    setPermissions(prev => {
      const next = { ...prev };
      next.nodes = { ...next.nodes };
      next.nodes[nodeOrder] = { ...next.nodes[nodeOrder] };
      const current = next.nodes[nodeOrder][fieldKey] || 'hidden';
      const currentIdx = PERMISSION_CYCLE.indexOf(current);
      const nextPerm = PERMISSION_CYCLE[(currentIdx + 1) % PERMISSION_CYCLE.length];
      next.nodes[nodeOrder][fieldKey] = nextPerm;
      dirtyRef.current = true;
      return next;
    });
  }, []);

  /** 获取某个字段在某个环节的当前权限 */
  const getPermission = useCallback((
    nodeOrder: string,
    fieldKey: string
  ): FieldPermission | null => {
    return permissions.nodes?.[nodeOrder]?.[fieldKey] || null;
  }, [permissions]);

  /** 保存字段权限到数据库 */
  const savePermissions = useCallback(async () => {
    setSaving(true);
    try {
      const payload = Object.keys(permissions).length > 0 ? permissions : null;
      await updateAdminFieldPermissions(code, payload as Record<string, unknown> | null);
      message.success('字段权限已保存');
      dirtyRef.current = false;
    } catch (error: any) {
      message.error(error?.message || '保存字段权限失败');
    } finally {
      setSaving(false);
    }
  }, [code, permissions]);

  return {
    permissions,
    saving,
    isDirty: dirtyRef.current,
    togglePermission,
    getPermission,
    savePermissions,
  };
}

/** 权限状态显示标签（无"默认"状态） */
export const PERMISSION_LABELS: Record<string, { label: string; color: string }> = {
  editable: { label: '可编辑', color: 'blue' },
  readonly: { label: '只读', color: 'gold' },
  hidden: { label: '隐藏', color: 'red' },
};

export { PERMISSION_CYCLE };
