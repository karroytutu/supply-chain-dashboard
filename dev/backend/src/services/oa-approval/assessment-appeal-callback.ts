/**
 * 考核申诉审批回调实现
 * @module services/oa-approval/assessment-appeal-callback
 *
 * 当考核申诉审批通过/驳回时，自动更新考核记录状态。
 */

import { OaApprovalInstanceRow } from './oa-approval.types';
import { updateAssessmentStatusByAppeal } from '../assessment';

/**
 * 考核申诉审批通过回调
 * 将考核记录标记为"无需考核"(cancelled)
 */
export async function onApprovedAssessmentAppeal(
  instance: OaApprovalInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  // 兼容 camelCase 和 snake_case，OA 系统回传 formData 时可能转换键名格式
  const assessmentId = Number(formData.assessmentId || formData.assessment_id);
  if (!assessmentId) {
    console.error('[AssessmentAppeal] 回调缺少 assessmentId, formData keys:', Object.keys(formData));
    return;
  }

  try {
    await updateAssessmentStatusByAppeal(assessmentId, {
      status: 'cancelled',
      oaInstanceId: instance.id,
      handleRemark: `申诉审批通过(审批单号: ${instance.instance_no})，自动标记为无需考核`,
    });

    console.log(`[AssessmentAppeal] 审批通过, 考核记录 ${assessmentId} 已标记为无需考核`);
  } catch (error) {
    console.error(`[AssessmentAppeal] 审批通过回调执行失败, assessmentId=${assessmentId}:`, error);
  }
}

/**
 * 考核申诉审批驳回回调
 * 恢复考核记录为"待处理"(pending)
 */
export async function onRejectedAssessmentAppeal(
  instance: OaApprovalInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  // 兼容 camelCase 和 snake_case，OA 系统回传 formData 时可能转换键名格式
  const assessmentId = Number(formData.assessmentId || formData.assessment_id);
  if (!assessmentId) {
    console.error('[AssessmentAppeal] 回调缺少 assessmentId, formData keys:', Object.keys(formData));
    return;
  }

  try {
    await updateAssessmentStatusByAppeal(assessmentId, {
      status: 'pending',
      oaInstanceId: instance.id,
      handleRemark: `申诉审批驳回(审批单号: ${instance.instance_no})`,
    });

    console.log(`[AssessmentAppeal] 审批驳回, 考核记录 ${assessmentId} 已恢复待处理`);
  } catch (error) {
    console.error(`[AssessmentAppeal] 审批驳回回调执行失败, assessmentId=${assessmentId}:`, error);
  }
}
