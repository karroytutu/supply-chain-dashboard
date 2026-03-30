-- 新增订单号字段
-- 订单号来自ERP客户欠款明细的bizStr字段

-- 新增order_no字段
ALTER TABLE ar_receivables ADD COLUMN IF NOT EXISTS order_no VARCHAR(100);

-- 添加字段注释
COMMENT ON COLUMN ar_receivables.order_no IS '订单号(ERP bizStr)';

-- 创建索引（用于搜索）
CREATE INDEX IF NOT EXISTS idx_ar_receivables_order_no ON ar_receivables(order_no);
