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
} from './ar-collection.dto';

// ==================== 实体 → DTO（用于响应） ====================

/**
 * 任务实体 → DTO
 * 使用 toCamelKeys 做键名转换，额外处理数值精度和关联字段
 */
export function toTaskDTO(task: CollectionTask | null): CollectionTaskDTO | null {
  if (!task) return task;
  const base = toCamelKeys<any>(task);
  return {
    ...base,
    totalAmount: Number(task.total_amount) || 0,
    // 关联字段映射（SQL 查询中的别名）
    currentHandlerName: (task as any).handler_name ?? null,
    managerName: (task as any).manager_name ?? null,
    pendingRole: (task as any).pending_role ?? null,
    assessmentStartTime: (task as any).assessment_start_time ?? null,
    assessmentTiers: (task as any).assessment_tiers ?? [],
  };
}

/**
 * 明细实体 → DTO
 */
export function toDetailDTO(detail: CollectionDetail | null): CollectionDetailDTO | null {
  if (!detail) return detail;
  const base = toCamelKeys<any>(detail);
  return {
    ...base,
    totalAmount: Number(detail.total_amount) || 0,
    leftAmount: Number(detail.left_amount) || 0,
    processAmount: Number(detail.process_amount) || 0,
    processedByName: (detail as any).processed_by_name ?? null,
  };
}

/**
 * 操作日志实体 → DTO
 */
export function toActionDTO(action: CollectionAction | null): CollectionActionDTO | null {
  if (!action) return action;
  return toCamelKeys<any>(action) as CollectionActionDTO;
}

/**
 * 法律进展实体 → DTO
 */
export function toLegalProgressDTO(progress: LegalProgress | null): LegalProgressDTO | null {
  if (!progress) return progress;
  return toCamelKeys<any>(progress) as LegalProgressDTO;
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
