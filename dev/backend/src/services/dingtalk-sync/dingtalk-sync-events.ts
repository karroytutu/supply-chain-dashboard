/**
 * 钉钉同步模块 - 事件处理器
 * 监听钉钉 Stream 事件总线，处理组织架构变更相关的同步逻辑
 *
 * 注册事件：
 * - user_leave_org: 用户离职 → 禁用本地账户
 * - user_add_org: 用户加入 → 记录日志（依赖定期同步创建）
 * - user_modify_org: 用户变更 → 记录日志（依赖定期同步更新）
 * - org_dept_create/modify/remove: 部门变更 → 触发部门同步（带防抖）
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('DingtalkSync');

import { dingtalkEvents } from '../dingtalk-stream.service';
import { appQuery } from '../../db/appPool';
import { invalidateUserPermissionCache } from '../permission-cache.service';
import { syncDepartments } from './dingtalk-sync.mutation';
import { getErrorMessage } from '../../utils/errorUtils';

// ==================== 幂等保护 ====================

let registered = false;

/**
 * 包装 async handler，确保未捕获的 Promise rejection 不会导致进程崩溃
 * Node.js EventEmitter.emit() 不处理 async 函数的 rejection，需手动捕获
 */
function wrapAsyncHandler(
  name: string,
  handler: (data: any) => Promise<void>
): (data: any) => void {
  return (data: any) => {
    handler(data).catch((err: any) => {
      log.error(`${name} 异步处理失败:`, getErrorMessage(err));
    });
  };
}

/**
 * 注册同步模块的事件处理器
 * 应在 startDingtalkStream() 之后调用
 * 幂等：重复调用不会叠加注册
 */
export function registerSyncEventHandlers(): void {
  if (registered) {
    log.warn('事件处理器已注册，跳过重复调用');
    return;
  }
  registered = true;

  dingtalkEvents.on('user_leave_org', wrapAsyncHandler('user_leave_org', handleUserLeave));
  dingtalkEvents.on('user_add_org', wrapAsyncHandler('user_add_org', handleUserAdd));
  dingtalkEvents.on('user_modify_org', wrapAsyncHandler('user_modify_org', handleUserModify));
  dingtalkEvents.on('org_dept_create', wrapAsyncHandler('org_dept_create', handleDeptChange));
  dingtalkEvents.on('org_dept_modify', wrapAsyncHandler('org_dept_modify', handleDeptChange));
  dingtalkEvents.on('org_dept_remove', wrapAsyncHandler('org_dept_remove', handleDeptChange));

  log.info('已注册 6 个事件处理器: user_leave/add/modify_org, org_dept_create/modify/remove');
}

// ==================== 部门同步防抖 ====================

/** 防抖定时器 */
let deptSyncTimer: ReturnType<typeof setTimeout> | null = null;
/** 互斥锁：防止上一次同步未完成时再次触发 */
let deptSyncInProgress = false;

// ==================== 事件处理函数 ====================

/**
 * 用户离职事件
 * 钉钉推送 userid 列表，批量禁用对应本地用户
 */
async function handleUserLeave(data: any): Promise<void> {
  if (!data || !data.userid) {
    log.warn('user_leave_org 事件无 userid');
    return;
  }

  const userIds: string[] = Array.isArray(data.userid) ? data.userid : [data.userid];

  if (userIds.length === 0) {
    log.warn('user_leave_org 事件 userid 为空数组');
    return;
  }

  log.info(`用户离职: ${userIds.length} 人, IDs=[${userIds.join(',')}]`);

  try {
    // 批量禁用：使用 ANY($1) 替代循环逐条 UPDATE，避免 N+1 问题
    const result = await appQuery(
      `UPDATE users SET status = 0, updated_at = NOW()
       WHERE dingtalk_user_id = ANY($1) AND status = 1
       RETURNING id, name, dingtalk_user_id`,
      [userIds]
    );

    for (const row of result.rows) {
      invalidateUserPermissionCache(row.id);
      log.info(`✅ 已禁用离职用户: ${row.name}(id=${row.id}, dingtalk_id=${row.dingtalk_user_id})`);
    }

    const disabledCount = result.rows.length;
    const skippedCount = userIds.length - disabledCount;
    if (skippedCount > 0) {
      log.info(`离职处理: 禁用${disabledCount}人, 跳过${skippedCount}人(不存在或已禁用)`);
    }
  } catch (error) {
    log.error(`批量禁用离职用户失败:`, getErrorMessage(error));
  }
}

/**
 * 用户加入事件
 * 记录日志，实际创建由定期同步完成
 */
async function handleUserAdd(data: any): Promise<void> {
  const userIds: string[] = Array.isArray(data?.userid)
    ? data.userid
    : data?.userid
      ? [data.userid]
      : [];
  log.info(`新用户加入: ${userIds.length} 人, IDs=[${userIds.join(',')}]（将由下次定期同步创建）`);
}

/**
 * 用户信息变更事件
 * 记录日志，实际更新由定期同步完成
 */
async function handleUserModify(data: any): Promise<void> {
  const userIds: string[] = Array.isArray(data?.userid)
    ? data.userid
    : data?.userid
      ? [data.userid]
      : [];
  log.info(`用户信息变更: ${userIds.length} 人（将由下次定期同步更新）`);
}

/**
 * 部门变更事件
 * 带 2 秒防抖窗口 + 互斥锁，避免短时间内多个部门事件并发触发全量同步
 */
async function handleDeptChange(data: any): Promise<void> {
  log.info(`部门变更: dept_id=${data?.deptId || 'unknown'}，2s 后触发同步`);

  // debounce: 取消前一个定时器
  if (deptSyncTimer) clearTimeout(deptSyncTimer);

  deptSyncTimer = setTimeout(async () => {
    // 互斥锁：如果上一次同步还在进行，跳过
    if (deptSyncInProgress) {
      log.warn('部门同步正在进行中，跳过本次触发');
      return;
    }
    deptSyncInProgress = true;
    try {
      await syncDepartments();
      log.info('✅ 部门同步完成');
    } catch (error) {
      log.error('部门同步失败:', getErrorMessage(error));
    } finally {
      deptSyncInProgress = false;
      deptSyncTimer = null;
    }
  }, 2000);
}
