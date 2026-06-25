/**
 * 权限配置抽屉 Hook
 * @module pages/Oa/FormConfig/hooks/usePermissionDrawer
 *
 * 管理权限配置抽屉的显隐状态、当前编辑记录和保存逻辑。
 */
import { useState, useCallback } from 'react';
import { message } from 'antd';
import type { FormTypeDefinition } from '@/types/oa';
import { updateAdminFormType } from '@/services/api/oa';

interface PermissionData {
  allowedRoles?: string[];
  allowedUsers?: number[];
  dataReadRoles?: string[];
  dataReadUsers?: number[];
  dataExportRoles?: string[];
  dataExportUsers?: number[];
}

export function usePermissionDrawer(onSaveSuccess: () => void) {
  const [visible, setVisible] = useState(false);
  const [record, setRecord] = useState<FormTypeDefinition | null>(null);

  const openDrawer = useCallback((r: FormTypeDefinition) => {
    setRecord(r);
    setVisible(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setVisible(false);
    setRecord(null);
  }, []);

  const handleSave = useCallback(async (code: string, data: PermissionData) => {
    try {
      await updateAdminFormType(code, data);
      message.success('权限配置已保存');
      onSaveSuccess();
      closeDrawer();
    } catch (error: any) {
      if (error?.status === 409) {
        message.error('数据已被其他用户修改，已自动刷新');
        onSaveSuccess();
      } else {
        message.error(error?.message || '保存失败');
      }
      throw error;
    }
  }, [onSaveSuccess, closeDrawer]);

  return {
    drawerVisible: visible,
    currentRecord: record,
    openDrawer,
    closeDrawer,
    handleSave,
  };
}
