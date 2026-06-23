-- 124: 用户银行账户历史表
-- 用于物流装卸费用申请OA流程，按申请人隔离存储历史银行账户信息
-- =====================================================

CREATE TABLE IF NOT EXISTS user_bank_accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_name VARCHAR(100) NOT NULL,
  account_number VARCHAR(50) NOT NULL,
  bank_name VARCHAR(100) NOT NULL,
  branch_name VARCHAR(200),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, account_number)
);
