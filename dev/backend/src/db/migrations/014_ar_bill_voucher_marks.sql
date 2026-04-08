-- 预处理单据凭证标记表
-- 用于财务预处理阶段标记每个单据的签收单凭证状态
-- 创建时间: 2026-04-08

CREATE TABLE IF NOT EXISTS ar_bill_voucher_marks (
  id SERIAL PRIMARY KEY,
  customer_task_id INTEGER NOT NULL REFERENCES ar_customer_collection_tasks(id),
  ar_id INTEGER NOT NULL REFERENCES ar_receivables(id),
  voucher_status VARCHAR(30) NOT NULL,           -- has_voucher / no_voucher / voucher_unqualified
  voucher_marked_at TIMESTAMP NOT NULL DEFAULT NOW(),
  voucher_marked_by INTEGER NOT NULL REFERENCES users(id),
  voucher_remark TEXT,                           -- 凭证不合格原因或其他备注
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(customer_task_id, ar_id)               -- 每个任务中的每张单据只能标记一次
);

-- 索引
CREATE INDEX idx_voucher_marks_task ON ar_bill_voucher_marks(customer_task_id);
CREATE INDEX idx_voucher_marks_ar ON ar_bill_voucher_marks(ar_id);
CREATE INDEX idx_voucher_marks_status ON ar_bill_voucher_marks(voucher_status);
CREATE INDEX idx_voucher_marks_marked_by ON ar_bill_voucher_marks(voucher_marked_by);

-- 更新时间触发器
DROP TRIGGER IF EXISTS update_ar_bill_voucher_marks_updated_at ON ar_bill_voucher_marks;
CREATE TRIGGER update_ar_bill_voucher_marks_updated_at
    BEFORE UPDATE ON ar_bill_voucher_marks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
