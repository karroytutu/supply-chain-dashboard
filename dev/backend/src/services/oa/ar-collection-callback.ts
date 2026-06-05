/**
 * 逾期催收 - OA表单回调实现
 * @module services/oa/ar-collection-callback
 *
 * 处理催收表单的提交前校验和各操作的流转逻辑：
 * - beforeSubmit: 从ERP查询催收数据，填充只读展示字段
 * - onApproved: 根据action字段执行对应操作（核销/延期/差异/升级/发函/起诉）
 */

import { appQuery as query, getAppClient } from '../../db/appPool';
import { PoolClient } from 'pg';
import { OaInstanceRow, OaNodeRow } from './oa.types';
import { insertNodeAfter, transaction } from './mutations/shared-utils';
import { checkExistingBillIds } from '../erp-client/erp-debt.service';
import {
  AR_EXTENSION_MAX_DAYS,
  ROLE_CODES,
} from '../../utils/constants';
import {
  COLLECTION_ACTIONS,
  ESCALATION_ROLES,
} from './form-types/ar-collection';
import log from '../../utils/logger';

const MODULE = 'ar-collection-callback';

// =====================================================
// beforeSubmit: 填充只读展示字段
// =====================================================

/**
 * 提交前校验：从 formData 中读取已有数据或从 ERP 查询
 * 催落实例由定时任务创建，beforeSubmit 主要用于补充/校验数据
 */
export async function beforeSubmitArCollection(
  formData: Record<string, unknown>,
  userId: number
): Promise<Record<string, unknown>> {
  // 确保延期次数有默认值
  if (formData._extensionCount === undefined) {
    return { _extensionCount: 0 };
  }
  return {};
}

// =====================================================
// onApproved: 自动节点执行时的业务逻辑
// =====================================================

/**
 * 自动节点执行时调用：根据 formData.action 决定流转逻辑
 * 在 approve-approval.ts 的 executeAutoNodeCallback 中被调用
 */
export async function onApprovedArCollection(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  const action = formData.action as string;
  const currentLevel = (formData._currentLevel as number) || 0;

  log.info(`[${MODULE}] 执行催收操作: instanceId=${instance.id}, action=${action}, level=${currentLevel}`);

  switch (action) {
    case COLLECTION_ACTIONS.VERIFY:
      await handleVerify(instance, formData);
      break;
    case COLLECTION_ACTIONS.EXTENSION:
      await handleExtension(instance, formData, currentLevel);
      break;
    case COLLECTION_ACTIONS.DIFFERENCE:
      await handleDifference(instance, currentLevel);
      break;
    case COLLECTION_ACTIONS.ESCALATE:
      await handleEscalate(instance, formData, currentLevel);
      break;
    case COLLECTION_ACTIONS.RESOLVE_DIFF:
      await handleResolveDiff(instance);
      break;
    case COLLECTION_ACTIONS.SEND_LETTER:
      // 发函：记录信息，当前节点完成，催收继续留在L2
      log.info(`[${MODULE}] 发函完成: instanceId=${instance.id}`);
      break;
    case COLLECTION_ACTIONS.LAWSUIT:
      await handleLawsuit(instance);
      break;
    default:
      log.warn(`[${MODULE}] 未知催收操作: ${action}`);
  }
}

// =====================================================
// 各操作处理函数
// =====================================================

/**
 * 核销标记：检查ERP中账单是否已核销消失
 */
async function handleVerify(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  const billDetails = (formData.billDetails as Array<Record<string, unknown>>) || [];
  const billIds = billDetails.map(b => b.billNo as string).filter(Boolean);

  if (billIds.length === 0) {
    log.warn(`[${MODULE}] 核销标记: 无账单明细`);
    return;
  }

  const existingIds = await checkExistingBillIds(billIds);
  const disappearedIds = billIds.filter(id => !existingIds.has(id));

  if (disappearedIds.length === billIds.length) {
    // 全部消失：实例完成（由 auto 节点后续处理）
    log.info(`[${MODULE}] 核销标记: 全部${billIds.length}笔已核销，流程结束`);
  } else if (disappearedIds.length > 0) {
    // 部分消失：插入新同级节点继续操作
    log.info(`[${MODULE}] 核销标记: ${disappearedIds.length}/${billIds.length}笔已核销，插入新节点继续`);
    await insertCollectionNode(instance.id, instance.current_node_order - 1, '继续催收', 'marketer', 0);
  } else {
    log.info(`[${MODULE}] 核销标记: 暂无已核销账单`);
  }
}

/**
 * 申请延期：根据次数和层级走不同流程
 */
async function handleExtension(
  instance: OaInstanceRow,
  formData: Record<string, unknown>,
  currentLevel: number
): Promise<void> {
  const extensionCount = (formData._extensionCount as number) || 0;
  const extensionDays = formData.extensionDays as number;

  if (extensionDays < 1 || extensionDays > AR_EXTENSION_MAX_DAYS) {
    throw new Error(`延期天数必须在1-${AR_EXTENSION_MAX_DAYS}天之间`);
  }

  if (currentLevel === 0 && extensionCount === 0) {
    // L0首次延期：直接生效
    log.info(`[${MODULE}] L0首次延期${extensionDays}天，直接生效`);
  } else if (currentLevel === 0 && extensionCount >= 1) {
    // L0二次+延期：需要担保签字（signature字段已在表单中，这里验证）
    if (!formData.guarantorSignature) {
      throw new Error('二次延期需要营销担保签字');
    }
    log.info(`[${MODULE}] L0第${extensionCount + 1}次延期${extensionDays}天，担保签字已验证`);
  } else if (currentLevel === 1) {
    // L1延期：插入总经理审批节点
    log.info(`[${MODULE}] L1延期${extensionDays}天，插入总经理审批节点`);
    await insertCollectionNode(
      instance.id,
      instance.current_node_order - 1,
      '总经理审批延期',
      ROLE_CODES.ADMIN,
      1, // approval type for GM
    );
  } else {
    // L2+延期：同 L1，插入总经理审批节点
    log.info(`[${MODULE}] L${currentLevel}延期${extensionDays}天，插入总经理审批节点`);
    await insertCollectionNode(
      instance.id,
      instance.current_node_order - 1,
      '总经理审批延期',
      ROLE_CODES.ADMIN,
      currentLevel,
    );
  }
}

/**
 * 存在差异：插入财务差异处理节点
 */
async function handleDifference(
  instance: OaInstanceRow,
  currentLevel: number
): Promise<void> {
  log.info(`[${MODULE}] 标记差异，插入财务差异处理节点`);
  await insertCollectionNode(
    instance.id,
    instance.current_node_order - 1,
    '财务差异处理',
    ROLE_CODES.CURRENT_ACCOUNTANT,
    currentLevel,
  );
}

/**
 * 升级处理：插入下一级催收节点
 */
async function handleEscalate(
  instance: OaInstanceRow,
  formData: Record<string, unknown>,
  currentLevel: number
): Promise<void> {
  const nextLevel = currentLevel + 1;
  const targetRole = ESCALATION_ROLES[nextLevel];
  if (!targetRole) {
    throw new Error('已达到最高升级级别，无法继续升级');
  }

  const levelNames: Record<number, string> = { 1: '营销经理', 2: '财务' };
  const nodeName = `${levelNames[nextLevel] || '上级'}催收`;

  log.info(`[${MODULE}] 升级到L${nextLevel}(${targetRole})，插入新节点`);
  await insertCollectionNode(instance.id, instance.current_node_order - 1, nodeName, targetRole, nextLevel);
}

/**
 * 差异解决：插入营销师节点继续催收
 */
async function handleResolveDiff(instance: OaInstanceRow): Promise<void> {
  log.info(`[${MODULE}] 差异解决，插入营销师催收节点`);
  await insertCollectionNode(instance.id, instance.current_node_order - 1, '营销师催收', ROLE_CODES.MARKETER, 0);
}

/**
 * 起诉：插入起诉立案节点，进入多环节流程
 */
async function handleLawsuit(instance: OaInstanceRow): Promise<void> {
  log.info(`[${MODULE}] 起诉，插入起诉立案节点`);
  await insertCollectionNode(
    instance.id,
    instance.current_node_order - 1,
    '起诉立案',
    ROLE_CODES.CURRENT_ACCOUNTANT,
    2,
  );
}

// =====================================================
// 通用节点插入辅助函数
// =====================================================

/**
 * 插入催收节点（封装 insertNodeAfter，自动配置字段权限和交互类型）
 */
async function insertCollectionNode(
  instanceId: number,
  afterOrder: number,
  nodeName: string,
  roleCode: string,
  level: number,
): Promise<OaNodeRow> {
  return transaction(async (client: PoolClient) => {
    return insertNodeAfter(client, instanceId, afterOrder, {
      name: nodeName,
      type: 'role',
      roleCode,
      assignedUserId: undefined, // 由 OA 引擎根据 roleCode 自动分配
      assignedUserName: undefined,
    });
  });
}
