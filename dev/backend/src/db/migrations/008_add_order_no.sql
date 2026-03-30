-- 新增 order_no 字段用于存储 ERP 的 bizStr（订单号）
ALTER TABLE ar_receivables ADD COLUMN IF NOT EXISTS order_no VARCHAR(100);
COMMENT ON COLUMN ar_receivables.order_no IS '订单号';

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_ar_receivables_order_no ON ar_receivables(order_no);
