import { useState, useEffect, useRef } from 'react';
import { oaApi } from '@/services/api/oa';
import type { PreviewApprover } from '@/services/api/oa';
import type { WorkflowNodeDef } from '@/types/oa';

interface WorkflowPreviewResult {
  visibleNodes: WorkflowNodeDef[];
  approvers: PreviewApprover[];
}

/**
 * 动态流程预览 Hook
 * 根据 formTypeCode 和 formData 实时获取可见节点和审批人
 * - 300ms 防抖避免频繁请求
 * - fetchIdRef 防止竞态：仅最新一次请求的结果生效
 */
export function useWorkflowPreview(
  formTypeCode: string | undefined,
  formData: Record<string, unknown> | undefined
) {
  const [result, setResult] = useState<WorkflowPreviewResult>({
    visibleNodes: [],
    approvers: [],
  });
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const fetchIdRef = useRef(0);

  useEffect(() => {
    if (!formTypeCode) return;

    clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      const currentFetchId = ++fetchIdRef.current;
      setLoading(true);

      oaApi
        .previewWorkflow(formTypeCode, formData || {})
        .then((res) => {
          if (fetchIdRef.current === currentFetchId) {
            setResult({
              visibleNodes: res.visibleNodes || [],
              approvers: res.approvers || [],
            });
          }
        })
        .catch(() => {
          // 预览请求失败时保留上一次结果，不阻断用户操作
        })
        .finally(() => {
          if (fetchIdRef.current === currentFetchId) {
            setLoading(false);
          }
        });
    }, 300);

    return () => clearTimeout(timerRef.current);
  }, [formTypeCode, formData]);

  return { ...result, loading };
}
