/**
 * 统一考核管理 - 业务服务层
 * 提供考核记录查询、状态操作、申诉提交、手动触发计算、分类配置等业务逻辑
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('Assessment');

import * as repository from './assessment.repository';
import { toDTO, toDTOList, toStatsDTO } from './assessment.mapper';
import { isTransitionAllowed, getRulesByCategory } from './assessment.rules';
import { runCalculation } from './assessment-calculate';
import { sendAssessmentNotifications } from './assessment-notify';
import { submitApproval, getFormTypeByCode } from '../oa';
import { appQuery } from '../../db/appPool';
import {
  type AssessmentCategory,
  type AssessmentQueryParams,
  type AssessmentRecordDTO,
  type AssessmentStatsDTO,
  ASSESSMENT_CATEGORY_LABELS,
} from './assessment.types';

// ==================== 查询服务 ====================

/**
 * 获取考核记录列表（分页）
 * @param params 查询参数
 */
export async function getAssessmentRecords(
  params: AssessmentQueryParams
): Promise<{ list: AssessmentRecordDTO[]; total: number; page: number; pageSize: number }> {
  const { rows, total } = await repository.getRecords(params);
  return {
    list: toDTOList(rows),
    total,
    page: params.page,
    pageSize: params.page_size,
  };
}

/**
 * 获取考核统计数据
 * @param category 可选分类筛选
 */
export async function getAssessmentStats(
  category?: AssessmentCategory
): Promise<AssessmentStatsDTO> {
  const stats = await repository.getStats(category);
  return toStatsDTO(stats);
}

/**
 * 获取我的考核记录（指定用户）
 * @param userId 被考核用户 ID
 * @param params 查询参数
 */
export async function getMyAssessments(
  userId: number,
  params: AssessmentQueryParams
): Promise<{ list: AssessmentRecordDTO[]; total: number; page: number; pageSize: number }> {
  const { rows, total } = await repository.getMyRecords(userId, params);
  return {
    list: toDTOList(rows),
    total,
    page: params.page,
    pageSize: params.page_size,
  };
}

/**
 * 获取单条考核记录详情
 * @param id 记录 ID
 */
export async function getAssessmentById(id: number): Promise<AssessmentRecordDTO | null> {
  const row = await repository.getById(id);
  return row ? toDTO(row) : null;
}

// ==================== 操作服务 ====================

/**
 * 处理考核记录（确认/取消）
 * @param id 记录 ID
 * @param action 操作类型
 * @param userId 操作人 ID
 * @param remark 操作备注
 */
export async function handleAssessment(
  id: number,
  action: 'confirm' | 'cancel',
  userId: number,
  remark?: string
): Promise<AssessmentRecordDTO> {
  // 查询当前记录
  const record = await repository.getById(id);
  if (!record) {
    throw new Error('考核记录不存在');
  }

  // 确定目标状态
  const targetStatus = action === 'confirm' ? 'confirmed' : 'cancelled';

  // 校验状态转换
  const allowed = isTransitionAllowed(
    record.category,
    record.rule_type,
    record.status,
    targetStatus
  );
  if (!allowed) {
    throw new Error(`当前状态 ${record.status} 不允许执行 ${action} 操作`);
  }

  // 更新状态
  const updated = await repository.updateStatus(id, targetStatus, userId, remark);
  if (!updated) {
    throw new Error('更新考核记录失败');
  }

  return toDTO(updated);
}

// ==================== 申诉服务 ====================

/**
 * 提交考核申诉（发起 OA 审批流程）
 * @param id 考核记录 ID
 * @param userId 申诉人 ID
 * @param reason 申诉理由
 * @param documents 支持性文件
 */
export async function submitAppeal(
  id: number,
  userId: number,
  reason: string,
  documents?: string[]
): Promise<{ oaInstanceId: number; message: string }> {
  // 查询考核记录
  const record = await repository.getById(id);
  if (!record) {
    throw new Error('考核记录不存在');
  }

  // 校验状态：只有 pending 状态可以申诉
  if (record.status !== 'pending') {
    throw new Error(`当前状态 ${record.status} 不允许申诉，只有待处理状态可以申诉`);
  }

  // 获取用户信息
  const userResult = await appQuery<{ name: string; department_name: string | null }>(
    'SELECT name, department_name FROM users WHERE id = $1',
    [userId]
  );
  const user = userResult.rows[0];
  if (!user) {
    throw new Error('用户不存在');
  }

  // 获取表单类型定义
  const formType = getFormTypeByCode('assessment_appeal');
  if (!formType) {
    throw new Error('考核申诉表单类型未注册');
  }

  // 构建审批请求
  const approvalResult = await submitApproval(
    {
      formTypeCode: 'assessment_appeal',
      formData: {
        assessmentId: record.id,
        assessmentCategory: record.category,
        sourceNo: record.source_no,
        sourceName: record.source_name,
        assessmentRuleType: record.rule_type,
        assessmentUserName: record.assessment_user_name,
        penaltyAmount: parseFloat(record.penalty_amount),
        appealReason: reason,
        supportingDocuments: documents || [],
        // 来源编号跳转URL：催收任务有详情页，退货单暂无
        _sourceNoUrl:
          record.source_type === 'ar_collection_task'
            ? `/collection/task/${record.source_id}`
            : null,
      },
      title: `考核申诉 - ${record.assessment_user_name || ''}`,
    },
    formType,
    userId,
    user.name,
    user.department_name
  );

  // 更新考核记录为申诉中状态
  await repository.updateAppealStatus(id, {
    status: 'appealed',
    oa_instance_id: approvalResult.instanceId,
    appeal_reason: reason,
    appeal_submitted_at: new Date().toISOString(),
  });

  return {
    oaInstanceId: approvalResult.instanceId,
    message: '申诉提交成功，请等待审批',
  };
}

/**
 * 由 OA 审批回调更新考核申诉状态
 * @param id 考核记录 ID
 * @param data 更新数据
 */
export async function updateAssessmentStatusByAppeal(
  id: number,
  data: {
    status: string;
    oaInstanceId?: number;
    handleRemark?: string;
  }
): Promise<void> {
  const record = await repository.getById(id);
  if (!record) {
    throw new Error(`考核记录不存在: ${id}`);
  }

  await repository.updateAppealStatus(id, {
    status: data.status,
    oa_instance_id: data.oaInstanceId,
    handle_remark: data.handleRemark,
  });

  log.info(`申诉回调更新: id=${id}, status=${data.status}`);
}

// ==================== 计算触发 ====================

/**
 * 手动触发考核计算
 * @param options 可选的分类和规则类型过滤
 */
export async function triggerCalculation(options?: {
  category?: string;
  ruleType?: string;
}): Promise<{ totalRecords: number; newRecords: number }> {
  const result = await runCalculation({
    triggered_by: 'manual',
    category: options?.category as AssessmentCategory,
    rule_type: options?.ruleType,
  });

  // 有新增记录时发送通知
  if (result.newRecords > 0) {
    try {
      const pendingRecords = await repository.getRecords({
        status: 'pending' as any,
        category: options?.category as AssessmentCategory,
        page: 1,
        page_size: 1000,
      });
      await sendAssessmentNotifications(pendingRecords.rows);
    } catch (error) {
      log.error('发送通知失败:', error);
    }
  }

  return result;
}

// ==================== 配置查询 ====================

/**
 * 获取分类配置（包含各分类的规则类型列表）
 */
export async function getCategoriesConfig(): Promise<
  Array<{
    category: string;
    label: string;
    rules: Array<{ ruleType: string; name: string; description: string }>;
  }>
> {
  const categories: AssessmentCategory[] = ['return_order', 'credit_license', 'oa_node_timeout'];

  return categories.map(category => {
    const rules = getRulesByCategory(category);
    return {
      category,
      label: ASSESSMENT_CATEGORY_LABELS[category],
      rules: rules.map(r => ({
        ruleType: r.ruleType,
        name: r.name,
        description: r.description,
      })),
    };
  });
}
