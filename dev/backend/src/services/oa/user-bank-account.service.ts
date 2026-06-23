/**
 * 用户银行账户历史服务
 * 按申请人隔离存储历史银行账户信息，供物流装卸费用申请 OA 表单快速填充
 * @module services/oa/user-bank-account.service
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('BankAccount');

import { appQuery } from '../../db/appPool';

/** 银行账户记录 */
export interface UserBankAccount {
  id: number;
  userId: number;
  accountName: string;
  accountNumber: string;
  bankName: string;
  branchName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 新增银行账户参数 */
export interface CreateBankAccountParams {
  accountName: string;
  accountNumber: string;
  bankName: string;
  branchName?: string;
}

/**
 * 获取用户的历史银行账户列表
 * 按更新时间倒序，最近使用的排在前面
 */
export async function getUserBankAccounts(userId: number): Promise<UserBankAccount[]> {
  const result = await appQuery(
    `SELECT id, user_id, account_name, account_number, bank_name, branch_name,
            created_at, updated_at
     FROM user_bank_accounts
     WHERE user_id = $1
     ORDER BY updated_at DESC`,
    [userId]
  );

  return result.rows.map((row: Record<string, unknown>) => ({
    id: row.id as number,
    userId: row.user_id as number,
    accountName: row.account_name as string,
    accountNumber: row.account_number as string,
    bankName: row.bank_name as string,
    branchName: (row.branch_name as string) || null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}

/**
 * 保存银行账户（新增或更新）
 * 使用 UPSERT：同一用户同一账号更新而非重复插入
 * 自动刷新 updated_at 使最近使用的排在前面
 */
export async function saveBankAccount(
  userId: number,
  params: CreateBankAccountParams
): Promise<UserBankAccount> {
  const { accountName, accountNumber, bankName, branchName } = params;

  if (!accountName?.trim() || !accountNumber?.trim() || !bankName?.trim()) {
    throw new Error('户名、账号、银行为必填项');
  }

  const result = await appQuery(
    `INSERT INTO user_bank_accounts (user_id, account_name, account_number, bank_name, branch_name)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, account_number)
     DO UPDATE SET
       account_name = EXCLUDED.account_name,
       bank_name = EXCLUDED.bank_name,
       branch_name = EXCLUDED.branch_name,
       updated_at = NOW()
     RETURNING id, user_id, account_name, account_number, bank_name, branch_name,
               created_at, updated_at`,
    [userId, accountName.trim(), accountNumber.trim(), bankName.trim(), branchName?.trim() || null]
  );

  const row = result.rows[0];
  log.info(`银行账户保存成功: userId=${userId}, accountNumber=${accountNumber.slice(-4)}***`);

  return {
    id: row.id as number,
    userId: row.user_id as number,
    accountName: row.account_name as string,
    accountNumber: row.account_number as string,
    bankName: row.bank_name as string,
    branchName: (row.branch_name as string) || null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * 删除用户的银行账户记录
 * 仅允许删除自己的记录
 */
export async function deleteBankAccount(id: number, userId: number): Promise<void> {
  const result = await appQuery(
    `DELETE FROM user_bank_accounts WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );

  if (result.rowCount === 0) {
    throw new Error('银行账户不存在或无权删除');
  }

  log.info(`银行账户删除成功: id=${id}, userId=${userId}`);
}
