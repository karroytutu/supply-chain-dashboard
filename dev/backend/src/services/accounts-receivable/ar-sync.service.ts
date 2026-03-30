/**
 * 应收账款ERP数据同步服务
 * 从ERP系统(xinshutong数据库)同步客户欠款明细到应用数据库(xly_dashboard)
 */

import { query } from '../../db/pool';
import { appQuery, getAppClient } from '../../db/appPool';
import type { ArSyncResult } from './ar.types';

/** ERP欠款明细记录（字段类型与ERP表一致） */
interface ErpDebtRecord {
  billId: string;
  bizStr: string | null; // 结算单号
  bizOrderStr: string | null; // 订单号
  consumerName: string;
  consumerCode: string | null;
  traderId: number | null; // 客户档案ID，用于关联客户档案表
  leftAmount: string; // ERP中为varchar
  totalAmount: string; // ERP中为varchar
  expireDay: number | null; // ERP中为numeric（天数，非日期）
  lastPayDay: string | null; // ERP中为varchar
  salesmanName: string | null;
  deptName: string | null;
  managerUsers: string | null;
  billOrderTime: Date | null;
  workTime: Date | null; // 欠单日期（欠款确认日期）
  collectState: string;
}

/** 客户档案结算信息 */
interface CustomerSettleInfo {
  settleMethod: number | null;
  maxDebtDays: number | null;
}

/**
 * 从ERP查询客户欠款明细
 * @returns ERP欠款记录列表
 */
async function fetchErpDebtRecords(): Promise<ErpDebtRecord[]> {
  const sql = `
    SELECT
      "billId",
      "bizStr",
      "bizOrderStr",
      "consumerName",
      "consumerCode",
      "traderId",
      "leftAmount",
      "totalAmount",
      "expireDay",
      "lastPayDay",
      "salesmanName",
      "deptName",
      "managerUsers",
      "billOrderTime",
      "workTime",
      "collectState"
    FROM "客户欠款明细"
  `;

  const result = await query<ErpDebtRecord>(sql);
  return result.rows;
}

/**
 * 查询客户结算方式信息
 * @param traderId 客户档案ID（来自客户欠款明细的traderId字段）
 * @returns 结算方式信息
 */
async function fetchCustomerSettleInfo(
  traderId: number | null
): Promise<CustomerSettleInfo> {
  if (!traderId) {
    return { settleMethod: null, maxDebtDays: null };
  }

  try {
    const sql = `
      SELECT "settleMethod", "maxDebtDays"
      FROM "客户档案表"
      WHERE "id" = $1
      LIMIT 1
    `;

    const result = await query<CustomerSettleInfo>(sql, [traderId]);
    return result.rows[0] || { settleMethod: null, maxDebtDays: null };
  } catch (error) {
    // 客户档案表查询失败，记录日志并返回默认值
    console.error('[AR Sync] 查询客户档案失败:', error);
    return { settleMethod: null, maxDebtDays: null };
  }
}

/**
 * 计算到期日
 * 基于欠款确认日期(workTime)计算，若workTime为空则回退到单据日期(billOrderTime)
 * @param workTime 欠款确认日期（送达确认后产生欠款的时间）
 * @param billOrderTime 单据日期（下单时间）
 * @param settleMethod 结算方式: 1=现结, 2=挂账
 * @param maxDebtDays 最大欠款天数
 * @returns 计算的到期日
 */
function calculateDueDate(
  workTime: Date | null,
  billOrderTime: Date | null,
  settleMethod: number | null,
  maxDebtDays: number | null
): Date | null {
  // 优先使用 workTime（欠款确认日期），若为空则回退到 billOrderTime
  const baseDate = workTime || billOrderTime;
  if (!baseDate) {
    return null;
  }

  // 计算实际欠款天数
  // 现结(settleMethod=1): 默认7天
  // 挂账(settleMethod=2): 使用客户档案的maxDebtDays，若为空则默认7天
  // 其他情况: 默认7天
  let debtDays = 7; // 默认值
  
  // 确保 maxDebtDays 是数字类型
  const maxDays = typeof maxDebtDays === 'number' ? maxDebtDays : parseInt(String(maxDebtDays), 10);
  
  // 确保 settleMethod 是数字类型（数据库返回的可能是字符串）
  const settleMethodNum = typeof settleMethod === 'number' ? settleMethod : parseInt(String(settleMethod), 10);
  
  if (settleMethodNum === 2 && maxDays && !isNaN(maxDays)) {
    debtDays = maxDays;
  }

  const dueDate = new Date(baseDate);
  dueDate.setDate(dueDate.getDate() + debtDays);
  return dueDate;
}

/**
 * 同步应收账款数据
 * 从ERP数据库同步客户欠款明细到应用数据库
 * @returns 同步结果统计
 */
export async function syncArReceivables(): Promise<ArSyncResult> {
  const result: ArSyncResult = {
    total: 0,
    synced: 0,
    updated: 0,
    errors: 0,
  };

  console.log('[AR Sync] 开始同步应收账款数据...');

  try {
    // 1. 从ERP获取欠款明细
    const erpRecords = await fetchErpDebtRecords();
    result.total = erpRecords.length;
    console.log(`[AR Sync] 从ERP获取到 ${erpRecords.length} 条欠款记录`);

    // 2. 逐条处理并插入/更新（每条独立事务，避免单条失败影响全部）
    for (const record of erpRecords) {
      try {
        // 获取客户结算方式信息（通过traderId关联客户档案表）
        const settleInfo = await fetchCustomerSettleInfo(record.traderId);

        // 解析 workTime（欠款确认日期）
        const workTime = record.workTime && !isNaN(new Date(record.workTime).getTime()) 
          ? new Date(record.workTime) 
          : null;

        // 计算到期日（基于 workTime）
        const dueDate = calculateDueDate(
          workTime,
          record.billOrderTime,
          settleInfo.settleMethod,
          settleInfo.maxDebtDays
        );

        // 计算金额（ERP中为varchar，需转numeric）
        const totalAmount = parseFloat(record.totalAmount) || 0;
        const leftAmount = parseFloat(record.leftAmount) || 0;
        const paidAmount = totalAmount - leftAmount;

        // 解析lastPayDay（ERP中为varchar，可能是日期字符串或空）
        const lastPayDay = record.lastPayDay ? new Date(record.lastPayDay) : null;
        const validLastPayDay = lastPayDay && !isNaN(lastPayDay.getTime()) ? lastPayDay : null;

        // 插入或更新记录
        // bill_order_time 使用 workTime（欠单日期）
        const upsertSql = `
          INSERT INTO ar_receivables (
            erp_bill_id, order_no, consumer_name, consumer_code, salesman_name, dept_name,
            manager_users, settle_method, max_debt_days, total_amount, left_amount,
            paid_amount, write_off_amount, bill_order_time, work_time, expire_day, last_pay_day,
            due_date, ar_status, last_synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'synced', NOW())
          ON CONFLICT (erp_bill_id) DO UPDATE SET
            order_no = EXCLUDED.order_no,
            consumer_name = EXCLUDED.consumer_name,
            consumer_code = EXCLUDED.consumer_code,
            salesman_name = EXCLUDED.salesman_name,
            dept_name = EXCLUDED.dept_name,
            manager_users = EXCLUDED.manager_users,
            settle_method = EXCLUDED.settle_method,
            max_debt_days = EXCLUDED.max_debt_days,
            total_amount = EXCLUDED.total_amount,
            left_amount = EXCLUDED.left_amount,
            paid_amount = EXCLUDED.paid_amount,
            bill_order_time = EXCLUDED.bill_order_time,
            work_time = EXCLUDED.work_time,
            expire_day = EXCLUDED.expire_day,
            last_pay_day = EXCLUDED.last_pay_day,
            due_date = EXCLUDED.due_date,
            last_synced_at = NOW()
          RETURNING (xmax = 0) as inserted
        `;

        const upsertResult = await appQuery<{ inserted: boolean }>(upsertSql, [
          record.billId,
          record.bizOrderStr, // order_no 存储订单号
          record.consumerName,
          record.consumerCode,
          record.salesmanName,
          record.deptName,
          record.managerUsers,
          settleInfo.settleMethod,
          settleInfo.maxDebtDays,
          totalAmount,
          leftAmount,
          paidAmount,
          0, // write_off_amount 初始为0
          workTime, // bill_order_time 使用 workTime（欠单日期）
          workTime,
          record.expireDay, // numeric天数，直接存入
          validLastPayDay,
          dueDate,
        ]);

        if (upsertResult.rows[0]?.inserted) {
          result.synced++;
        } else {
          result.updated++;
        }
      } catch (error) {
        result.errors++;
        if (result.errors <= 3) {
          console.error(`[AR Sync] 处理记录失败 billId=${record.billId}:`, error);
        }
      }
    }

    console.log(
      `[AR Sync] 同步完成: 新增 ${result.synced}, 更新 ${result.updated}, 错误 ${result.errors}`
    );

    // 3. 清理已不存在于 ERP 的记录（孤儿数据）
    await cleanupOrphanRecords(erpRecords.map(r => r.billId), result);

  } catch (error) {
    console.error('[AR Sync] 同步失败:', error);
    throw error;
  }

  return result;
}

/**
 * 清理已不存在于 ERP 的记录
 * 这些记录可能是已在 ERP 中结清或删除的数据
 */
async function cleanupOrphanRecords(
  erpBillIds: string[],
  result: ArSyncResult
): Promise<void> {
  try {
    // 获取应用数据库中所有 erp_bill_id
    const appRecordsResult = await appQuery<{ erp_bill_id: string }>(`
      SELECT erp_bill_id FROM ar_receivables
    `);

    const erpIdSet = new Set(erpBillIds);
    const orphanIds = appRecordsResult.rows
      .filter(r => !erpIdSet.has(r.erp_bill_id))
      .map(r => r.erp_bill_id);

    if (orphanIds.length === 0) {
      return;
    }

    console.log(`[AR Sync] 发现 ${orphanIds.length} 条孤儿数据，开始清理...`);

    // 删除孤儿记录（级联删除会自动处理关联表）
    const deleteResult = await appQuery(`
      DELETE FROM ar_receivables WHERE erp_bill_id = ANY($1)
    `, [orphanIds]);

    result.removed = deleteResult.rowCount || 0;
    console.log(`[AR Sync] 已清理 ${result.removed} 条孤儿数据`);
  } catch (error) {
    console.error('[AR Sync] 清理孤儿数据失败:', error);
    // 不抛出错误，仅记录日志
  }
}
