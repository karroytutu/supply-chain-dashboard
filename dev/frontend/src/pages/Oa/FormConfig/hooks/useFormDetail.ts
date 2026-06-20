/**
 * 表单编辑页 Hook
 * @module pages/Oa/FormConfig/hooks/useFormDetail
 */
import { useState, useCallback, useEffect } from 'react';
import { message } from 'antd';
import {
  getAdminFormTypes,
  getAdminRoles,
  updateAdminFormType,
  updateAdminFormTypeWorkflow,
} from '@/services/api/oa';

/** 工作流节点编辑视图 */
export interface WorkflowNodeEdit {
  order: number;
  name: string;
  type: string;
  handler?: {
    roleCode?: string;
    useSupervisor?: boolean;
    userId?: number;
  };
  signMode?: string;
  condition?: unknown;
  timeout?: unknown;
  interactionType?: string;
  fieldPermissions?: Record<string, string>;
  inputSchema?: unknown;
}

export interface FormDetailData {
  code: string;
  name: string;
  icon: string;
  description: string;
  category: string;
  version: number;
  allowedRoles: string[] | null;
  dataReadRoles: string[] | null;
  dataExportRoles: string[] | null;
  workflowDef: {
    nodes: WorkflowNodeEdit[];
    ccRoles?: string[];
    ccAfterNode?: number;
  };
}

export function useFormDetail(code: string) {
  const [formDetail, setFormDetail] = useState<FormDetailData | null>(null);
  const [roles, setRoles] = useState<Array<{ code: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [savingBasic, setSavingBasic] = useState(false);
  const [savingWorkflow, setSavingWorkflow] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [formTypes, rolesList] = await Promise.all([
        getAdminFormTypes(),
        getAdminRoles(),
      ]);

      const target = formTypes.find((ft: any) => ft.code === code);
      if (target) {
        setFormDetail(target as unknown as FormDetailData);
      } else {
        message.error('表单类型不存在');
      }
      setRoles(rolesList);
    } catch (error) {
      message.error('加载表单详情失败');
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /** 保存基本信息 */
  const saveBasicInfo = useCallback(
    async (data: {
      name?: string;
      description?: string;
      icon?: string;
      allowedRoles?: string[];
      dataReadRoles?: string[];
      dataExportRoles?: string[];
    }) => {
      setSavingBasic(true);
      try {
        await updateAdminFormType(code, data);
        message.success('基本信息已保存');
        await loadData();
      } catch (error: any) {
        message.error(error?.message || '保存失败');
      } finally {
        setSavingBasic(false);
      }
    },
    [code, loadData]
  );

  /** 保存流程配置（含乐观锁） */
  const saveWorkflow = useCallback(
    async (workflowDef: unknown, version: number) => {
      setSavingWorkflow(true);
      try {
        await updateAdminFormTypeWorkflow(code, workflowDef, version);
        message.success('流程配置已保存');
        await loadData();
      } catch (error: any) {
        if (error?.status === 409) {
          message.error('数据已被其他用户修改，已自动刷新');
          await loadData();
        } else {
          message.error(error?.message || '保存流程配置失败');
        }
      } finally {
        setSavingWorkflow(false);
      }
    },
    [code, loadData]
  );

  return {
    formDetail,
    roles,
    loading,
    savingBasic,
    savingWorkflow,
    saveBasicInfo,
    saveWorkflow,
    reload: loadData,
  };
}
