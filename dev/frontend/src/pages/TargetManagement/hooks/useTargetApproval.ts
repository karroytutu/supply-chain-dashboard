/**
 * 目标管理 - 审批操作 Hook
 * 管理目标审批提交流程（含电子签名）
 */
import { useCallback, useState, useRef } from 'react';
import { message } from 'antd';
import { submitTargetForApproval } from '@/services/api/sales-target';

export function useTargetApproval(
  loadTargetData: () => void,
) {
  const [submitLoading, setSubmitLoading] = useState(false);
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);
  const submitLoadingRef = useRef(false);

  /** 提交审批：先保存目标，返回 targetId 供签名确认使用 */
  const handleSubmitApproval = useCallback(async (
    saveAndReturnId: () => Promise<{ success: boolean; targetId: number | null }>,
  ): Promise<number | null> => {
    if (submitLoadingRef.current) return null;

    submitLoadingRef.current = true;
    setSubmitLoading(true);
    try {
      const result = await saveAndReturnId();
      if (!result.success || !result.targetId) {
        submitLoadingRef.current = false;
        setSubmitLoading(false);
        return null;
      }
      // 保持 submitLoading = true，直到签名确认完成或取消
      setSignatureModalVisible(true);
      return result.targetId;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '提交审批失败';
      message.error(errMsg);
      submitLoadingRef.current = false;
      setSubmitLoading(false);
      return null;
    }
  }, []);

  /** 签名确认后完成审批提交（使用传入的 targetId，避免闭包过时） */
  const confirmSignature = useCallback(async (signatureData: string, targetId: number) => {
    setSignatureModalVisible(false);
    setSubmitLoading(true);
    try {
      await submitTargetForApproval(targetId, signatureData);
      message.success('目标已提交审批');
      loadTargetData();
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '提交审批失败';
      message.error(errMsg);
    } finally {
      submitLoadingRef.current = false;
      setSubmitLoading(false);
    }
  }, [loadTargetData]);

  /** 取消签名时重置加载状态 */
  const cancelSignature = useCallback(() => {
    setSignatureModalVisible(false);
    submitLoadingRef.current = false;
    setSubmitLoading(false);
  }, []);

  return {
    handleSubmitApproval,
    confirmSignature,
    cancelSignature,
    submitLoading,
    signatureModalVisible,
    setSignatureModalVisible,
  };
}
