/**
 * 表单编辑页 Hook
 * @module pages/Oa/FormConfig/hooks/useFormDetail
 */
import { useState, useCallback, useEffect } from 'react';
import { message } from 'antd';
import type { ConditionDef } from '@/types/oa';
import {
  getAdminFormTypes,
  getAdminRoles,
  updateAdminFormType,
  updateAdminFormTypeWorkflow,
} from '@/services/api/oa';

const OPERATOR_LABELS: Record<string, string> = {
  '>': '大于', '<': '小于', '>=': '大于等于', '<=': '小于等于', '==': '等于',
};

/**
 * 将条件定义转为业务可读文本
 * @param condition 条件（单个或数组）
 * @param fields 表单字段列表，用于将 field key 映射为中文标签
 */
export function formatCondition(
  condition: ConditionDef | ConditionDef[] | unknown,
  fields?: Array<{ key: string; label: string }>
): string {
  if (!condition) return '';
  const list = Array.isArray(condition) ? condition : [condition];
  return list.map((c: ConditionDef) => {
    const label = fields?.find(f => f.key === c.field)?.label || c.field;
    const op = OPERATOR_LABELS[c.operator] || c.operator;
    return `${label} ${op} ${c.value}`;
  }).join('，且 ');
}

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
  /** 表单字段定义（供字段权限矩阵使用） */
  formSchema?: { fields: Array<{ key: string; label: string; type: string; hidden?: boolean }> };
  /** 字段权限 DB 覆盖值 */
  fieldPermissions?: {
    initiation?: Record<string, string>;
    nodes?: Record<string, Record<string, string>>;
  };
  workflowDef: {
    nodes: WorkflowNodeEdit[];
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
