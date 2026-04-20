/**
 * OA审批模块工具函数
 * @module services/oa-approval/oa-approval-utils
 */

import { appQuery as query } from '../../db/appPool';
import { getFormTypeByCode as getCodeFormTypeByCode } from './form-types';
import {
  FormField,
  FormSchema,
  WorkflowDef,
  WorkflowNodeDef,
  FormTypeDefinition,
  ConditionDef,
  OaFormTypeRow,
  OaApprovalInstanceRow,
  OaApprovalNodeRow,
  ApprovalStatus,
  ApprovalNodeStatus,
  Urgency,
  SubmitApprovalRequest,
} from './oa-approval.types';

// =====================================================
// 编号生成
// =====================================================

/**
 * 生成审批实例编号
 * 格式：OA + YYYYMMDD + 4位序号
 */
export async function generateInstanceNo(): Promise<string> {
  const result = await query('SELECT generate_oa_instance_no() as no');
  return result.rows[0].no;
}

// =====================================================
// 金额大写转换
// =====================================================

const DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
const UNITS = ['', '拾', '佰', '仟'];
const LARGE_UNITS = ['', '万', '亿', '兆'];

/**
 * 数字转中文大写金额
 */
export function numberToChineseUpper(n: number): string {
  if (n === 0) return '零元整';
  if (n < 0) return '负' + numberToChineseUpper(-n);

  const intPart = Math.floor(n);
  const decPart = Math.round((n - intPart) * 100);

  let result = '';

  // 整数部分
  if (intPart > 0) {
    const intStr = intPart.toString();
    const len = intStr.length;
    let zeroFlag = false;

    for (let i = 0; i < len; i++) {
      const digit = parseInt(intStr[i], 10);
      const pos = len - 1 - i;
      const unitPos = pos % 4;
      const largeUnitPos = Math.floor(pos / 4);

      if (digit === 0) {
        zeroFlag = true;
        // 万、亿位置需要输出单位
        if (unitPos === 0 && largeUnitPos > 0) {
          result += LARGE_UNITS[largeUnitPos];
        }
      } else {
        if (zeroFlag) {
          result += '零';
          zeroFlag = false;
        }
        result += DIGITS[digit] + UNITS[unitPos];
        if (unitPos === 0 && largeUnitPos > 0) {
          result += LARGE_UNITS[largeUnitPos];
        }
      }
    }

    result += '元';
  }

  // 小数部分
  if (decPart > 0) {
    const jiao = Math.floor(decPart / 10);
    const fen = decPart % 10;

    if (jiao > 0) {
      result += DIGITS[jiao] + '角';
    }
    if (fen > 0) {
      result += DIGITS[fen] + '分';
    }
  } else {
    result += '整';
  }

  return result;
}

// =====================================================
// 表单校验
// =====================================================

/**
 * 校验表单数据
 * 支持 visibleWhen（条件隐藏跳过校验）和 requiredWhen（条件必填）
 * @returns 错误消息数组，空数组表示校验通过
 */
export function validateFormData(
  formSchema: FormSchema,
  formData: Record<string, unknown>
): string[] {
  const errors: string[] = [];

  for (const field of formSchema.fields) {
    // visibleWhen 条件不满足时跳过该校验
    if (field.visibleWhen && !checkCondition(field.visibleWhen, formData)) {
      continue;
    }

    const value = formData[field.key];

    // 判断是否必填：静态 required 或 requiredWhen 条件满足
    const isRequired = field.required ||
      (field.requiredWhen ? checkCondition(field.requiredWhen, formData) : false);

    // 必填校验
    if (isRequired) {
      if (value === undefined || value === null || value === '') {
        errors.push(`${field.label}不能为空`);
        continue;
      }
      if (Array.isArray(value) && value.length === 0) {
        errors.push(`${field.label}不能为空`);
        continue;
      }
    }

    // 跳过空值的可选字段
    if (value === undefined || value === null || value === '') {
      continue;
    }

    // 类型校验
    switch (field.type) {
      case 'text':
      case 'textarea':
        if (field.maxLength && typeof value === 'string' && value.length > field.maxLength) {
          errors.push(`${field.label}不能超过${field.maxLength}个字符`);
        }
        break;

      case 'number':
      case 'money':
        const numValue = Number(value);
        if (isNaN(numValue)) {
          errors.push(`${field.label}必须是数字`);
        } else {
          if (field.min !== undefined && numValue < field.min) {
            errors.push(`${field.label}不能小于${field.min}`);
          }
          if (field.max !== undefined && numValue > field.max) {
            errors.push(`${field.label}不能大于${field.max}`);
          }
        }
        break;

      case 'select':
      case 'multi-select':
        if (field.options && field.options.length > 0) {
          const validValues = field.options.map((o) => o.value);
          if (field.type === 'select') {
            if (!validValues.includes(value as string)) {
              errors.push(`${field.label}的值无效`);
            }
          } else if (Array.isArray(value)) {
            for (const v of value) {
              if (!validValues.includes(v)) {
                errors.push(`${field.label}包含无效选项`);
                break;
              }
            }
          }
        }
        break;

      case 'upload':
      case 'photo':
        if (field.maxCount && Array.isArray(value) && value.length > field.maxCount) {
          errors.push(`${field.label}最多上传${field.maxCount}个文件`);
        }
        break;

      case 'table':
        if (field.children && Array.isArray(value)) {
          for (let i = 0; i < value.length; i++) {
            const rowErrors = validateFormData(
              { fields: field.children },
              value[i] as Record<string, unknown>
            );
            for (const err of rowErrors) {
              errors.push(`${field.label}(第${i + 1}行): ${err}`);
            }
          }
        }
        break;
    }
  }

  return errors;
}

// =====================================================
// 条件解析
// =====================================================

/**
 * 检查条件是否满足（支持单个条件或AND条件数组）
 */
export function checkCondition(
  condition: ConditionDef | ConditionDef[],
  formData: Record<string, unknown>
): boolean {
  if (Array.isArray(condition)) {
    return condition.every((c) => checkSingleCondition(c, formData));
  }
  return checkSingleCondition(condition, formData);
}

/**
 * 检查单个条件是否满足
 */
function checkSingleCondition(
  condition: ConditionDef,
  formData: Record<string, unknown>
): boolean {
  const value = formData[condition.field];
  const compareValue = condition.value;

  if (value === undefined || value === null) {
    return false;
  }

  const numValue = Number(value);
  const numCompare = Number(compareValue);

  switch (condition.operator) {
    case '>':
      return numValue > numCompare;
    case '<':
      return numValue < numCompare;
    case '>=':
      return numValue >= numCompare;
    case '<=':
      return numValue <= numCompare;
    case '==':
      return value === compareValue || numValue === numCompare;
    default:
      return false;
  }
}

/**
 * 根据条件过滤审批节点
 * 返回实际需要创建的节点列表
 */
export function filterNodesByCondition(
  nodes: WorkflowNodeDef[],
  formData: Record<string, unknown>
): WorkflowNodeDef[] {
  return nodes.filter((node) => {
    // 无条件节点始终创建
    if (!node.condition) {
      return true;
    }
    // 条件节点：检查条件是否满足
    return checkCondition(node.condition, formData);
  });
}

// =====================================================
// 用户解析
// =====================================================

/**
 * 根据节点定义解析实际审批人ID
 * @param node 节点定义
 * @param applicantId 申请人ID
 * @returns 审批人ID，解析失败返回 null
 */
export async function resolveApproverId(
  node: WorkflowNodeDef,
  applicantId: number
): Promise<number | null> {
  switch (node.type) {
    case 'specific_user':
      return node.userId || null;

    case 'role':
      if (!node.roleCode) return null;
      // 查找拥有该角色的用户
      const roleResult = await query(
        `SELECT u.id
         FROM users u
         JOIN user_roles ur ON u.id = ur.user_id
         JOIN roles r ON ur.role_id = r.id
         WHERE r.code = $1 AND u.status = 1
         LIMIT 1`,
        [node.roleCode]
      );
      return roleResult.rows[0]?.id || null;

    case 'dynamic_supervisor':
      // 查找申请人同部门的经理
      const supervisorResult = await query(
        `SELECT u.id
         FROM users u
         JOIN user_roles ur ON u.id = ur.user_id
         JOIN roles r ON ur.role_id = r.id
         WHERE r.code = 'manager' AND u.status = 1
           AND u.department_name = (
             SELECT department_name FROM users WHERE id = $1
           )
         LIMIT 1`,
        [applicantId]
      );
      return supervisorResult.rows[0]?.id || null;

    default:
      return null;
  }
}

/**
 * 根据角色编码查找用户ID列表
 */
export async function findUserIdsByRoleCodes(roleCodes: string[]): Promise<number[]> {
  if (roleCodes.length === 0) return [];

  const result = await query(
    `SELECT DISTINCT u.id
     FROM users u
     JOIN user_roles ur ON u.id = ur.user_id
     JOIN roles r ON ur.role_id = r.id
     WHERE r.code = ANY($1) AND u.status = 1`,
    [roleCodes]
  );

  return result.rows.map((row) => row.id);
}

// =====================================================
// 行映射工具
// =====================================================

/**
 * 将数据库行映射为表单类型对象
 */
export function mapFormTypeRow(row: OaFormTypeRow): FormTypeDefinition {
  // 从代码定义中合并函数引用（beforeSubmit/onNodeCompleted/onApproved）
  // 数据库只存储静态数据（schema、workflow），回调函数必须从代码获取
  const codeDefinition = getCodeFormTypeByCode(row.code);

  return {
    code: row.code,
    name: row.name,
    icon: row.icon || 'FileTextOutlined',
    category: row.category,
    sortOrder: row.sort_order,
    description: row.description || '',
    version: row.version,
    formSchema: row.form_schema,
    workflowDef: row.workflow_def,
    ...(codeDefinition?.beforeSubmit && { beforeSubmit: codeDefinition.beforeSubmit }),
    ...(codeDefinition?.onNodeCompleted && { onNodeCompleted: codeDefinition.onNodeCompleted }),
    ...(codeDefinition?.onApproved && { onApproved: codeDefinition.onApproved }),
  };
}

/**
 * 获取紧急程度显示文本
 */
export function getUrgencyLabel(urgency: Urgency): string {
  const labels: Record<Urgency, string> = {
    normal: '普通',
    high: '紧急',
    urgent: '非常紧急',
  };
  return labels[urgency];
}

/**
 * 获取审批状态显示文本
 */
export function getStatusLabel(status: ApprovalStatus): string {
  const labels: Record<ApprovalStatus, string> = {
    pending: '审批中',
    approved: '已通过',
    rejected: '已拒绝',
    cancelled: '已取消',
    withdrawn: '已撤回',
  };
  return labels[status];
}

/**
 * 获取节点状态显示文本
 */
export function getNodeStatusLabel(status: ApprovalNodeStatus): string {
  const labels: Record<ApprovalNodeStatus, string> = {
    pending: '待审批',
    approved: '已通过',
    rejected: '已拒绝',
    transferred: '已转交',
    skipped: '已跳过',
    cancelled: '已取消',
  };
  return labels[status];
}

// =====================================================
// 权限检查
// =====================================================

/**
 * 检查用户是否为审批实例的当前审批人
 */
export async function isCurrentApprover(
  instanceId: number,
  userId: number
): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM oa_approval_nodes
     WHERE instance_id = $1
       AND assigned_user_id = $2
       AND status = 'pending'
     LIMIT 1`,
    [instanceId, userId]
  );
  return result.rows.length > 0;
}

/**
 * 检查用户是否为审批实例的申请人
 */
export async function isApplicant(
  instanceId: number,
  userId: number
): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM oa_approval_instances
     WHERE id = $1 AND applicant_id = $2`,
    [instanceId, userId]
  );
  return result.rows.length > 0;
}
