-- 仓储退货凭证多图上传功能迁移
-- 数据库: xly_dashboard

-- ============================================
-- 1. 修改 warehouse_evidence_url 字段类型
-- ============================================
-- 将 VARCHAR(500) 改为 TEXT，支持存储 JSON 数组格式的多个URL
-- JSON 数组格式: ["url1", "url2", ...]
ALTER TABLE expiring_return_orders
ALTER COLUMN warehouse_evidence_url TYPE TEXT;

COMMENT ON COLUMN expiring_return_orders.warehouse_evidence_url
IS '仓储退货凭证图片URL列表（JSON数组格式，最多9张）';

-- ============================================
-- 说明
-- ============================================
-- 仓储执行退货时，支持上传最多9张凭证图片
-- warehouse_evidence_url 字段存储 JSON 数组格式的 URL 列表
-- 单张图片大小限制 5MB，仅支持 jpg/jpeg/png 格式
