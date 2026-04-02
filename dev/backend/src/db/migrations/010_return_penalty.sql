-- 临过期退货考核功能数据库迁移
-- 数据库: xly_dashboard

-- ============================================
-- 1. 新增仓储执行相关角色
-- ============================================
INSERT INTO roles (code, name, description, is_system) VALUES
  ('warehouse_keeper', '库管员', '负责仓储日常管理和退货执行', TRUE),
  ('logistics_manager', '物流主管', '负责物流调度和退货运输', TRUE)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- 2. 考核记录表
-- ============================================
CREATE TABLE IF NOT EXISTS return_penalty_records (
  id SERIAL PRIMARY KEY,
  return_order_id INTEGER NOT NULL REFERENCES expiring_return_orders(id) ON DELETE CASCADE,
  penalty_type VARCHAR(30) NOT NULL,          -- 考核类型: procurement_confirm_timeout / marketing_sale_timeout / return_expire_insufficient / erp_fill_timeout / warehouse_execute_timeout
  penalty_user_id INTEGER NOT NULL REFERENCES users(id),
  penalty_user_name VARCHAR(100),              -- 被考核人姓名(冗余存储)
  penalty_role VARCHAR(30),                    -- 被考核人角色: procurement_manager / marketing_manager / warehouse_manager / warehouse_keeper / logistics_manager
  base_amount DECIMAL(15,2),                   -- 考核基数金额(商品进价)
  penalty_rate DECIMAL(10,2),                  -- 每天考核金额(如10元)
  overdue_days INTEGER DEFAULT 0,              -- 超时天数
  penalty_amount DECIMAL(15,2) NOT NULL,       -- 最终考核金额
  status VARCHAR(20) DEFAULT 'pending',        -- 状态: pending/confirmed/appealed/cancelled
  penalty_rule_snapshot JSONB,                 -- 考核规则快照
  calculated_at TIMESTAMP,                     -- 考核计算时间
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
  -- 注意：唯一约束通过下面的ALTER语句添加，支持同一退货单同一类型多人考核
);

-- 考核记录表索引
CREATE INDEX IF NOT EXISTS idx_return_penalty_records_return_order_id ON return_penalty_records(return_order_id);
CREATE INDEX IF NOT EXISTS idx_return_penalty_records_penalty_user_id ON return_penalty_records(penalty_user_id);
CREATE INDEX IF NOT EXISTS idx_return_penalty_records_penalty_type ON return_penalty_records(penalty_type);
CREATE INDEX IF NOT EXISTS idx_return_penalty_records_status ON return_penalty_records(status);

-- 为表添加更新时间触发器
DROP TRIGGER IF EXISTS update_return_penalty_records_updated_at ON return_penalty_records;
CREATE TRIGGER update_return_penalty_records_updated_at
    BEFORE UPDATE ON return_penalty_records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 修改唯一约束：支持同一退货单同一类型多人考核
-- ============================================
-- 删除旧约束（如果存在）
ALTER TABLE return_penalty_records
DROP CONSTRAINT IF EXISTS return_penalty_records_return_order_id_penalty_type_key;

-- 添加新约束（包含用户ID）
ALTER TABLE return_penalty_records
ADD CONSTRAINT return_penalty_records_unique_user_penalty
UNIQUE(return_order_id, penalty_type, penalty_user_id);

-- ============================================
-- 3. 修改退货单表：新增字段
-- ============================================
ALTER TABLE expiring_return_orders
ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(15,2);          -- 商品进价

ALTER TABLE expiring_return_orders
ADD COLUMN IF NOT EXISTS rule_confirmed_at TIMESTAMP;           -- 规则确认时间

ALTER TABLE expiring_return_orders
ADD COLUMN IF NOT EXISTS rule_confirmed_by INTEGER;             -- 规则确认人ID

-- 添加字段注释
COMMENT ON COLUMN expiring_return_orders.purchase_price IS '商品进价(用于考核计算)';
COMMENT ON COLUMN expiring_return_orders.rule_confirmed_at IS '规则确认时间(用于计算ERP录入超时)';
COMMENT ON COLUMN expiring_return_orders.rule_confirmed_by IS '规则确认人ID';

-- ============================================
-- 3. 权限定义
-- ============================================
INSERT INTO permissions (code, name, resource_type, resource_key, action)
VALUES
  ('return:penalty:read', '查看退货考核', 'menu', '/procurement/return/penalty', 'read'),
  ('return:penalty:write', '管理退货考核', 'api', '/api/return-penalty', 'write')
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- 4. 角色权限分配
-- ============================================
-- 为 admin, procurement_manager, marketing_supervisor, warehouse_manager, warehouse_keeper, logistics_manager 分配查看权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code IN ('admin', 'procurement_manager', 'marketing_supervisor', 'warehouse_manager', 'warehouse_keeper', 'logistics_manager')
  AND p.code = 'return:penalty:read'
ON CONFLICT DO NOTHING;

-- 为 admin, procurement_manager 分配管理权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code IN ('admin', 'procurement_manager')
  AND p.code = 'return:penalty:write'
ON CONFLICT DO NOTHING;

-- ============================================
-- 5. 钉钉消息模板
-- ============================================
INSERT INTO dingtalk_msg_templates (
  template_code,
  template_name,
  template_content,
  push_target,
  push_timing,
  is_active
) VALUES
  (
    'return_penalty_notify',
    '退货考核通知',
    '### 退货考核通知\n\n{{user_name}}：\n\n您有以下退货考核记录：\n\n| 考核类型 | 退货单号 | 商品名称 | 超时天数 | 考核金额 |\n|----------|----------|----------|----------|----------|\n{{penalty_rows}}\n\n请及时处理相关退货任务，避免更多考核。\n\n---\n推送时间：{{timestamp}}',
    'procurement_manager,marketing_manager,warehouse_manager,warehouse_keeper,logistics_manager',
    '考核生成时',
    TRUE
  )
ON CONFLICT (template_code) DO NOTHING;
