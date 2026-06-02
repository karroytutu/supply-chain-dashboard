import { useEffect, useState } from 'react';
import { oaApi, PreviewApprover } from '@/services/api/oa';

/**
 * 预解析审批人 hook
 * 根据 formTypeCode 异步获取各节点的预计审批人
 */
export function usePreviewApprovers(formTypeCode?: string) {
  const [approvers, setApprovers] = useState<PreviewApprover[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!formTypeCode) return;
    let cancelled = false;
    setLoading(true);
    oaApi.previewApprovers(formTypeCode)
      .then(res => {
        if (!cancelled) setApprovers(res.data);
      })
      .catch(() => {
        // 预解析失败不影响流程预览展示
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [formTypeCode]);

  return { approvers, loading };
}
