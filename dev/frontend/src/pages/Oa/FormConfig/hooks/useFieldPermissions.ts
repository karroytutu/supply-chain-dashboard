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

/** 权限状态循环：默认(不写入) → editable → readonly → hidden → 默认 */
const PERMISSION_CYCLE: (FieldPermission | null)[] = [null, 'editable', 'readonly', 'hidden'];

export function useFieldPermissions(
  code: string,
  initialPermissions?: FieldPermissionsOverride
) {
  const [permissions, setPermissions] = useState<FieldPermissionsOverride>(
    initialPermissions || {}
  );
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);

  /** 切换某个字段在某个环节的权限状态 */
  const togglePermission = useCallback((
    section: 'initiation' | 'nodes',
    sectionKey: string,
    fieldKey: string
  ) => {
    setPermissions(prev => {
      const next = { ...prev };
      if (section === 'initiation') {
        const current = next.initiation?.[fieldKey] || null;
        const currentIdx = PERMISSION_CYCLE.indexOf(current);
        const nextPerm = PERMISSION_CYCLE[(currentIdx + 1) % PERMISSION_CYCLE.length];
        next.initiation = { ...next.initiation };
        if (nextPerm === null) {
          delete next.initiation[fieldKey];
        } else {
          next.initiation[fieldKey] = nextPerm;
        }
        // 清理空对象
        if (Object.keys(next.initiation).length === 0) delete next.initiation;
      } else {
        const nodeKey = sectionKey;
        const current = next.nodes?.[nodeKey]?.[fieldKey] || null;
        const currentIdx = PERMISSION_CYCLE.indexOf(current);
        const nextPerm = PERMISSION_CYCLE[(currentIdx + 1) % PERMISSION_CYCLE.length];
        next.nodes = { ...next.nodes };
        next.nodes[nodeKey] = { ...next.nodes[nodeKey] };
        if (nextPerm === null) {
          delete next.nodes[nodeKey][fieldKey];
        } else {
          next.nodes[nodeKey][fieldKey] = nextPerm;
        }
        // 清理空对象
        if (Object.keys(next.nodes[nodeKey]).length === 0) delete next.nodes[nodeKey];
        if (Object.keys(next.nodes).length === 0) delete next.nodes;
      }
      dirtyRef.current = true;
      return next;
    });
  }, []);

  /** 获取某个字段在某个环节的当前权限 */
  const getPermission = useCallback((
    section: 'initiation' | 'nodes',
    sectionKey: string,
    fieldKey: string
  ): FieldPermission | null => {
    if (section === 'initiation') {
      return permissions.initiation?.[fieldKey] || null;
    }
    return permissions.nodes?.[sectionKey]?.[fieldKey] || null;
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

/** 权限状态显示标签 */
export const PERMISSION_LABELS: Record<string, { label: string; color: string }> = {
  default: { label: '默认', color: 'default' },
  editable: { label: '可编辑', color: 'blue' },
  readonly: { label: '只读', color: 'gold' },
  hidden: { label: '隐藏', color: 'red' },
};

export { PERMISSION_CYCLE };
