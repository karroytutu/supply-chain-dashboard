-- 仓储退货凭证上传功能迁移
-- 数据库: xly_dashboard

-- ============================================
-- 1. 添加仓储凭证字段
-- ============================================
ALTER TABLE expiring_return_orders 
ADD COLUMN IF NOT EXISTS warehouse_evidence_url VARCHAR(500);

COMMENT ON COLUMN expiring_return_orders.warehouse_evidence_url IS '仓储退货凭证图片URL';

-- ============================================
-- 说明
-- ============================================
-- 仓储执行退货时，改为上传凭证图片而非填写实际退货数量
-- 原 warehouse_return_quantity 字段保留用于历史数据
-- 新的 warehouse_evidence_url 字段存储凭证图片URL
