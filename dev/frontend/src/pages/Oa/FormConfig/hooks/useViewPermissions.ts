/**
 * 查看权限配置 Hook
 * @module pages/Oa/FormConfig/hooks/useViewPermissions
 *
 * 管理查看权限的加载、编辑、保存状态。
 * 通过 PATCH /api/oa/admin/form-types/:code/view-permissions 持久化配置。
 *
 * 与 useFieldPermissions 的区别：
 * - 权限循环仅 2 态：readonly → hidden（无 editable）
 * - 保存 API 为 updateAdminViewPermissions
 */
import { useState, useCallback, useRef } from 'react';
import { message } from 'antd';
import { updateAdminViewPermissions } from '@/services/api/oa';
import type { ViewPermission, ViewPermissionsOverride } from '@/types/oa';

/** 查看权限状态循环：readonly → hidden（仅 2 态，无 editable） */
const VIEW_PERMISSION_CYCLE: ViewPermission[] = ['readonly', 'hidden'];

export function useViewPermissions(
  code: string,
  initialPermissions?: ViewPermissionsOverride
) {
  const [permissions, setPermissions] = useState<ViewPermissionsOverride>(
    initialPermissions || { nodes: {} }
  );
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);

  /** 切换某个字段在某个环节的查看权限状态（nodeOrder 为 "dataRead" 时操作 dataRead 节） */
  const togglePermission = useCallback((
    nodeOrder: string,
    fieldKey: string
  ) => {
    setPermissions(prev => {
      const next = { ...prev };
      if (nodeOrder === 'dataRead') {
        const current = (next.dataRead?.[fieldKey] || 'hidden') as ViewPermission;
        const currentIdx = VIEW_PERMISSION_CYCLE.indexOf(current);
        const nextPerm = VIEW_PERMISSION_CYCLE[(currentIdx + 1) % VIEW_PERMISSION_CYCLE.length];
        next.dataRead = { ...next.dataRead, [fieldKey]: nextPerm };
      } else {
        next.nodes = { ...next.nodes };
        next.nodes[nodeOrder] = { ...next.nodes[nodeOrder] };
        const current = next.nodes[nodeOrder][fieldKey] || 'hidden';
        const currentIdx = VIEW_PERMISSION_CYCLE.indexOf(current as ViewPermission);
        const nextPerm = VIEW_PERMISSION_CYCLE[(currentIdx + 1) % VIEW_PERMISSION_CYCLE.length];
        next.nodes[nodeOrder][fieldKey] = nextPerm;
      }
      dirtyRef.current = true;
      return next;
    });
  }, []);

  /** 获取某个字段在某个环节的当前查看权限（nodeOrder 为 "dataRead" 时读取 dataRead 节） */
  const getPermission = useCallback((
    nodeOrder: string,
    fieldKey: string
  ): ViewPermission | null => {
    if (nodeOrder === 'dataRead') {
      return (permissions.dataRead?.[fieldKey] as ViewPermission) || null;
    }
    return (permissions.nodes?.[nodeOrder]?.[fieldKey] as ViewPermission) || null;
  }, [permissions]);

  /** 批量设置某节点下所有字段的查看权限（nodeOrder 为 "dataRead" 时操作 dataRead 节） */
  const setAllFieldsPermission = useCallback((
    nodeOrder: string,
    fieldKeys: string[],
    permission: ViewPermission
  ) => {
    setPermissions(prev => {
      const next = { ...prev };
      if (nodeOrder === 'dataRead') {
        next.dataRead = { ...next.dataRead };
        for (const key of fieldKeys) {
          next.dataRead[key] = permission;
        }
      } else {
        next.nodes = { ...next.nodes };
        next.nodes[nodeOrder] = { ...next.nodes[nodeOrder] };
        for (const key of fieldKeys) {
          next.nodes[nodeOrder][key] = permission;
        }
      }
      dirtyRef.current = true;
      return next;
    });
  }, []);

  /** 保存查看权限到数据库 */
  const savePermissions = useCallback(async () => {
    setSaving(true);
    try {
      const hasNodes = Object.keys(permissions.nodes).length > 0;
      const hasDataRead = permissions.dataRead && Object.keys(permissions.dataRead).length > 0;
      const payload = (hasNodes || hasDataRead) ? permissions : null;
      await updateAdminViewPermissions(code, payload as Record<string, unknown> | null);
      message.success('查看权限已保存');
      dirtyRef.current = false;
    } catch (error: any) {
      message.error(error?.message || '保存查看权限失败');
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
    setAllFieldsPermission,
    savePermissions,
  };
}

/** 查看权限状态显示标签 */
export const VIEW_PERMISSION_LABELS: Record<string, { label: string; color: string }> = {
  readonly: { label: '只读', color: 'gold' },
  hidden: { label: '隐藏', color: 'red' },
};

export { VIEW_PERMISSION_CYCLE };
