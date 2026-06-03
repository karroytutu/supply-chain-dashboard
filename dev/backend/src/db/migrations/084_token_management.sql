-- 084: Token 管理模块
-- 三系统 (ERP/WMS/B2B) Token 持久化存储 + 操作审计日志

-- ============================================
-- 1. erp_tokens 表（每系统一行，存储 Token 及状态）
-- ============================================
CREATE TABLE IF NOT EXISTS erp_tokens (
    id SERIAL PRIMARY KEY,
    system VARCHAR(20) NOT NULL UNIQUE,         -- 'erp', 'wms', 'b2b'
    token_value TEXT NOT NULL,                  -- 主 Token 值
    token_secondary TEXT,                       -- 辅助值（WMS device_token, B2B refresh_token）
    token_meta JSONB,                           -- 元数据（B2B token_info 等）
    login_status VARCHAR(20) DEFAULT 'none',    -- none/success/failed/expired/pending_sms
    needs_sms BOOLEAN DEFAULT FALSE,            -- 是否等待短信验证码（WMS）
    expires_at TIMESTAMPTZ,                     -- 过期时间
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE erp_tokens IS '三系统认证 Token 持久化存储（每系统一行）';

-- 更新时间触发器
DROP TRIGGER IF EXISTS update_erp_tokens_updated_at ON erp_tokens;
CREATE TRIGGER update_erp_tokens_updated_at
    BEFORE UPDATE ON erp_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 2. token_operation_logs 表（操作审计日志）
-- ============================================
CREATE TABLE IF NOT EXISTS token_operation_logs (
    id SERIAL PRIMARY KEY,
    system VARCHAR(10) NOT NULL,                -- erp / wms / b2b
    operation VARCHAR(30) NOT NULL,             -- login / exchange / verify / refresh / invalidate
    status VARCHAR(20) NOT NULL,                -- success / failed / pending
    operator_id INTEGER REFERENCES users(id),   -- 操作人（系统自动时为 NULL）
    detail JSONB,                               -- 操作详情（错误信息、耗时等）
    duration_ms INTEGER,                        -- 操作耗时
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_token_logs_system ON token_operation_logs(system);
CREATE INDEX idx_token_logs_created ON token_operation_logs(created_at DESC);

COMMENT ON TABLE token_operation_logs IS 'Token 操作审计日志';

-- ============================================
-- 3. 权限种子数据
-- ============================================
INSERT INTO permissions (code, name, resource_type, resource_key, action, sort_order)
VALUES
    ('system:token:read', 'Token状态查看', 'menu', '/system/token-manager', 'read', 130),
    ('system:token:write', 'Token操作管理', 'api', '/api/token-admin', 'write', 131)
ON CONFLICT (code) DO NOTHING;

-- 为 admin 角色分配 Token 管理权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.code = 'admin'
  AND p.code IN ('system:token:read', 'system:token:write')
ON CONFLICT DO NOTHING;
