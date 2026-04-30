/**
 * 考核中心操作和弹窗控制 Hook
 * 负责处理考核记录、提交申诉、手动触发计算等操作
 */
import { useState, useCallback } from 'react';
import { message } from 'antd';
import {
  handleAssessmentAction,
  submitAssessmentAppeal,
  calculateAssessment,
} from '@/services/api/assessment';
import { useModalControl } from '@/hooks/useModalControl';

export function useAssessmentActions(reloadData: () => void) {
  const handleModal = useModalControl<AssessmentRecord>();
  const appealModal = useModalControl<AssessmentRecord>();
  const [actionLoading, setActionLoading] = useState(false);

  /** 处理考核记录（确认/取消） */
  const handleAction = useCallback(async (
    id: number,
    action: 'confirm' | 'cancel',
    remark?: string,
  ) => {
    setActionLoading(true);
    try {
      await handleAssessmentAction(id, { action, remark });
      message.success(action === 'confirm' ? '已标记为已处理' : '已标记为无需考核');
      handleModal.close();
      reloadData();
    } catch (error: any) {
      message.error(error?.message || '操作失败');
    } finally {
      setActionLoading(false);
    }
  }, [handleModal, reloadData]);

  /** 提交申诉 */
  const submitAppeal = useCallback(async (
    id: number,
    reason: string,
    documents?: string[],
  ) => {
    setActionLoading(true);
    try {
      await submitAssessmentAppeal(id, { reason, documents });
      message.success('申诉提交成功');
      appealModal.close();
      reloadData();
    } catch (error: any) {
      message.error(error?.message || '申诉提交失败');
    } finally {
      setActionLoading(false);
    }
  }, [appealModal, reloadData]);

  /** 手动触发考核计算 */
  const triggerCalculation = useCallback(async (category?: AssessmentCategory) => {
    try {
      const res = await calculateAssessment(category ? { category } : undefined);
      message.success(`计算完成，共 ${res?.totalRecords || 0} 条记录`);
      reloadData();
    } catch (error: any) {
      message.error(error?.message || '计算失败');
    }
  }, [reloadData]);

  return {
    handleModal,
    appealModal,
    actionLoading,
    handleAction,
    submitAppeal,
    triggerCalculation,
  };
}
