/**
 * 表单编辑页 Hook
 * @module pages/Oa/FormConfig/hooks/useFormDetail
 *
 * 管理审批流程节点的编辑和保存。基本信息由列表页内联编辑管理。
 */
import { useState, useCallback, useEffect } from 'react';
import { message } from 'antd';
import {
  getAdminFormTypes,
  getAdminRoles,
  updateAdminWorkflowSettings,
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
  conditionDescription?: string;
  ccRoles?: string[];
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
  allowedUsers: number[] | null;
  dataReadUsers: number[] | null;
  dataExportUsers: number[] | null;
  /** 表单字段定义（供字段权限矩阵使用） */
  formSchema?: { fields: Array<{ key: string; label: string; type: string; hidden?: boolean }> };
  /** 字段权限 DB 覆盖值 */
  fieldPermissions?: {
    nodes?: Record<string, Record<string, string>>;
  };
  /** 查看权限 DB 覆盖值 */
  viewPermissions?: {
    nodes?: Record<string, Record<string, string>>;
    dataRead?: Record<string, string>;
  };
  workflowDef: {
    nodes: WorkflowNodeEdit[];
  };
}

export function useFormDetail(code: string) {
  const [formDetail, setFormDetail] = useState<FormDetailData | null>(null);
  const [roles, setRoles] = useState<Array<{ code: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
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

  /** 保存流程管理配置（仅保存管理员可编辑部分：审批人规则、签署模式、超时时限） */
  const saveWorkflow = useCallback(
    async (nodes: WorkflowNodeEdit[]) => {
      setSavingWorkflow(true);
      try {
        // 仅提取管理员可编辑字段，按节点 order 索引
        const workflowSettings: Record<number, Record<string, unknown>> = {};
        for (const node of nodes) {
          const settings: Record<string, unknown> = {};
          if (node.name !== undefined) settings.name = node.name;
          if (node.handler !== undefined) settings.handler = node.handler;
          if (node.signMode !== undefined) settings.signMode = node.signMode;
          if (node.timeout !== undefined) settings.timeout = node.timeout;
          // 仅当有配置时才存储
          if (Object.keys(settings).length > 0) {
            workflowSettings[node.order] = settings;
          }
        }
        await updateAdminWorkflowSettings(code, { nodes: workflowSettings });
        message.success('流程配置已保存');
        await loadData();
      } catch (error: any) {
        message.error(error?.message || '保存流程配置失败');
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
    savingWorkflow,
    saveWorkflow,
    reload: loadData,
  };
}
