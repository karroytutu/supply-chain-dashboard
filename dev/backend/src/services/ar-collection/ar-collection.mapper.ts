/**
 * 催收管理 DTO 映射器
 * 负责数据库实体(snake_case) ↔ API DTO(camelCase) 的双向转换
 */

import { toCamelKeys, toSnakeKeys } from '../../utils/keyConvert';
import type {
  CollectionTask,
  CollectionDetail,
  CollectionAction,
  LegalProgress,
  ExtensionParams,
  DifferenceParams,
  EscalateParams,
  ResolveDifferenceParams,
  RollbackParams,
  EscalationLevel,
} from './ar-collection.types';
import type {
  CollectionTaskDTO,
  CollectionDetailDTO,
  CollectionActionDTO,
  LegalProgressDTO,
  CreateExtensionDTO,
  MarkDifferenceDTO,
  EscalateDTO,
  ResolveDifferenceDTO,
  RollbackDTO,
} from './ar-collection.dto';
import type { AssessmentRecord } from '../ar-assessment/ar-assessment.types';
import { STATUS_NAMES, ROLE_NAMES } from '../ar-assessment/ar-assessment.types';

// ==================== 实体 → DTO（用于响应） ====================

/**
 * 任务实体 → DTO
 * 使用 toCamelKeys 做键名转换，额外处理数值精度和关联字段
 */
export function toTaskDTO(task: CollectionTask | null): CollectionTaskDTO | null {
  if (!task) return task;
  // toCamelKeys 返回 snake_case 键名类型的对象，与 camelCase DTO 类型不兼容，
  // 需通过 unknown 中转断言（运行时 toCamelKeys 已正确转换键名）
  const base = toCamelKeys(task) as unknown as CollectionTaskDTO;
  return {
    ...base,
    totalAmount: Number(task.total_amount) || 0,
    // 关联字段映射（SQL 查询中的别名，已在类型中声明为可选扩展字段）
    currentHandlerName: task.handler_name ?? null,
    managerName: task.manager_name ?? null,
    pendingRole: task.pending_role ?? null,
    assessmentStartTime: task.assessment_start_time ?? null,
    assessmentTiers: task.assessment_tiers ?? [],
    entryReasons: task.entry_reasons ?? [],
    entryRuleSnapshot: task.entry_rule_snapshot ?? null,
    preEscalationStatus: task.pre_escalation_status ?? null,
  };
}

/**
 * 明细实体 → DTO
 */
export function toDetailDTO(detail: CollectionDetail | null): CollectionDetailDTO | null {
  if (!detail) return detail;
  const base = toCamelKeys(detail) as unknown as CollectionDetailDTO;
  return {
    ...base,
    totalAmount: Number(detail.total_amount) || 0,
    leftAmount: Number(detail.left_amount) || 0,
    processAmount: Number(detail.process_amount) || 0,
    processedByName: detail.processed_by_name ?? null,
    hoardTag: detail.hoard_tag ?? null,
  };
}

/**
 * 操作日志实体 → DTO
 */
export function toActionDTO(action: CollectionAction | null): CollectionActionDTO | null {
  if (!action) return action;
  return toCamelKeys(action) as unknown as CollectionActionDTO;
}

/**
 * 法律进展实体 → DTO
 */
export function toLegalProgressDTO(progress: LegalProgress | null): LegalProgressDTO | null {
  if (!progress) return progress;
  return toCamelKeys(progress) as unknown as LegalProgressDTO;
}

/**
 * 考核记录 → 操作日志 DTO
 * 将考核记录转换为统一的操作日志格式，用于合并显示
 */
export function assessmentToActionDTO(record: AssessmentRecord): CollectionActionDTO {
  return {
    id: 1000000 + record.id,
    taskId: record.taskId,
    detailIds: null,
    actionType: `assessment_${record.assessmentTier}` as CollectionActionDTO['actionType'],
    actionResult: STATUS_NAMES[record.status] as unknown as CollectionActionDTO['actionResult'],
    remark: `${record.assessmentUserName}(${ROLE_NAMES[record.assessmentRole]})`,
    attachmentUrl: null,
    operatorId: 0,
    operatorName: '系统',
    operatorRole: '系统',
    createdAt: record.calculatedAt instanceof Date
      ? record.calculatedAt.toISOString()
      : record.calculatedAt,
  };
}

// ==================== DTO → 实体参数（用于请求） ====================

/**
 * 延期请求 DTO → 服务层参数
 */
export function fromExtensionDTO(
  dto: CreateExtensionDTO,
  taskId: number,
  operatorId: number,
  operatorName: string,
): ExtensionParams {
  return {
    task_id: taskId,
    detail_ids: dto.detailIds,
    extension_days: dto.extensionDays,
    evidence_file_id: dto.evidenceFileId,
    signature_url: dto.signatureData,
    remark: dto.reason,
    operator_id: operatorId,
    operator_name: operatorName,
  };
}

/**
 * 标记差异请求 DTO → 服务层参数
 */
export function fromDifferenceDTO(
  dto: MarkDifferenceDTO,
  taskId: number,
  operatorId: number,
  operatorName: string,
): DifferenceParams {
  return {
    task_id: taskId,
    detail_ids: dto.detailIds,
    remark: dto.remark,
    operator_id: operatorId,
    operator_name: operatorName,
  };
}

/**
 * 升级请求 DTO → 服务层参数
 */
export function fromEscalateDTO(
  dto: EscalateDTO,
  taskId: number,
  operatorId: number,
  operatorName: string,
): EscalateParams {
  return {
    task_id: taskId,
    detail_ids: [],
    target_level: dto.targetLevel as EscalationLevel | undefined,
    reason: dto.reason,
    operator_id: operatorId,
    operator_name: operatorName,
  };
}

/**
 * 差异解决请求 DTO → 服务层参数
 */
export function fromResolveDifferenceDTO(
  dto: ResolveDifferenceDTO,
  taskId: number,
  operatorId: number,
  operatorName: string,
): ResolveDifferenceParams {
  return {
    task_id: taskId,
    detail_ids: dto.detailIds,
    remark: dto.remark,
    operator_id: operatorId,
    operator_name: operatorName,
  };
}

/**
 * 退回升级请求 DTO → 服务层参数
 */
export function fromRollbackDTO(
  dto: RollbackDTO,
  taskId: number,
  operatorId: number,
  operatorName: string,
): RollbackParams {
  return {
    task_id: taskId,
    reason: dto.reason,
    operator_id: operatorId,
    operator_name: operatorName,
  };
}
