/**
 * OA 审批流程语义化岗位常量
 * 为 OA 工作流节点提供语义化岗位引用，消除表单定义中的硬编码字符串
 *
 * 使用方式：在 form-types 的 workflowDef 中引用
 *   handler: { roleCode: OA_ROLE.GM }  // 比 'general_manager' 更具语义
 *
 * @usedBy form-types/*.ts, ar-collection-callback.ts
 */

import { ROLE_CODES } from '../../utils/constants';

export const OA_ROLE = {
  /** 总经理（终审决策） */
  GM: ROLE_CODES.GENERAL_MANAGER,
  /** 直属主管（部门经理级） */
  SUPERVISOR: ROLE_CODES.DEPARTMENT_MANAGER,
  /** 行政专员（采购询价、资产入库等） */
  ADMIN_STAFF: ROLE_CODES.ADMIN_STAFF,
  /** 往来会计（应收应付账款管理） */
  ACCOUNTANT: ROLE_CODES.CURRENT_ACCOUNTANT,
  /** 出纳/结算会计（回款结算确认） */
  CASHIER: ROLE_CODES.CASHIER,
  /** 营销经理（营销管理、催收管理） */
  MARKETING_MGR: ROLE_CODES.MARKETING_MANAGER,
  /** 营销师（客户催收跟进） */
  MARKETER: ROLE_CODES.MARKETER,
  /** 采购主管（战略商品采购确认） */
  PROCUREMENT_MGR: ROLE_CODES.PROCUREMENT_MANAGER,
  /** 仓储主管（仓储退货执行） */
  WAREHOUSE_MGR: ROLE_CODES.WAREHOUSE_MANAGER,
} as const;
