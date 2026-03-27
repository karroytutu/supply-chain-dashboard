-- 临期退货处理流程数据库迁移
-- 数据库: xly_dashboard

-- ============================================
-- 1. 商品退货规则表
-- ============================================
CREATE TABLE IF NOT EXISTS goods_return_rules (
  id SERIAL PRIMARY KEY,
  goods_id VARCHAR(64) NOT NULL,                    -- 商品ID
  goods_name VARCHAR(200) NOT NULL,                 -- 商品名称
  can_return_to_supplier BOOLEAN NOT NULL,          -- 是否可以采购退货
  confirmed_by INTEGER REFERENCES users(id),        -- 确认人
  confirmed_at TIMESTAMP,                           -- 确认时间
  comment TEXT,                                     -- 备注说明
  is_active BOOLEAN DEFAULT TRUE,                   -- 是否生效
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(goods_id, is_active)                       -- 每个商品只有一个生效规则
);

-- 商品退货规则表索引
CREATE INDEX IF NOT EXISTS idx_goods_return_rules_goods_id ON goods_return_rules(goods_id);

-- 为表添加更新时间触发器
DROP TRIGGER IF EXISTS update_goods_return_rules_updated_at ON goods_return_rules;
CREATE TRIGGER update_goods_return_rules_updated_at
    BEFORE UPDATE ON goods_return_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 2. 临期退货单主表
-- ============================================
CREATE TABLE IF NOT EXISTS expiring_return_orders (
  id SERIAL PRIMARY KEY,
  return_no VARCHAR(64) UNIQUE NOT NULL,            -- 退货单号
  goods_id VARCHAR(64) NOT NULL,                    -- 商品ID
  goods_name VARCHAR(200) NOT NULL,                 -- 商品名称
  quantity DECIMAL(10,2),                           -- 退货数量
  unit VARCHAR(20),                                 -- 单位
  batch_date DATE,                                  -- 生产日期/批次日期
  return_date DATE,                                 -- 退货时间
  expire_date DATE,                                 -- 过期日期
  shelf_life INTEGER,                               -- 保质期天数
  days_to_expire INTEGER,                           -- 剩余保质期天数
  status VARCHAR(30) NOT NULL DEFAULT 'pending_confirm',  -- 状态：pending_confirm/pending_erp_fill/pending_warehouse_execute/pending_marketing_sale/completed/cancelled
  source_bill_no VARCHAR(100),                      -- 来源单号
  consumer_name VARCHAR(200),                       -- 来源客户名称
  marketing_manager VARCHAR(100),                   -- 责任营销师
  erp_return_no VARCHAR(100),                       -- ERP采购退货单号
  erp_filled_by INTEGER REFERENCES users(id),       -- ERP填写人
  erp_filled_at TIMESTAMP,                          -- ERP填写时间
  warehouse_executed_by INTEGER REFERENCES users(id), -- 仓储执行人
  warehouse_executed_at TIMESTAMP,                  -- 仓储执行时间
  warehouse_return_quantity DECIMAL(10,2),          -- 实际退货数量
  warehouse_comment TEXT,                           -- 仓储退货备注
  marketing_completed_by INTEGER REFERENCES users(id), -- 营销完成人
  marketing_completed_at TIMESTAMP,                 -- 营销完成时间
  marketing_comment TEXT,                           -- 营销备注
  rule_id INTEGER REFERENCES goods_return_rules(id), -- 关联的商品规则
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 临期退货单索引
CREATE INDEX IF NOT EXISTS idx_expiring_return_orders_status ON expiring_return_orders(status);
CREATE INDEX IF NOT EXISTS idx_expiring_return_orders_goods_id ON expiring_return_orders(goods_id);
CREATE INDEX IF NOT EXISTS idx_expiring_return_orders_return_date ON expiring_return_orders(return_date);
CREATE INDEX IF NOT EXISTS idx_expiring_return_orders_source_bill_no ON expiring_return_orders(source_bill_no);

-- 为表添加更新时间触发器
DROP TRIGGER IF EXISTS update_expiring_return_orders_updated_at ON expiring_return_orders;
CREATE TRIGGER update_expiring_return_orders_updated_at
    BEFORE UPDATE ON expiring_return_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 3. 退货流程操作记录表
-- ============================================
CREATE TABLE IF NOT EXISTS expiring_return_actions (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES expiring_return_orders(id) NOT NULL,  -- 关联的退货单
  action_type VARCHAR(50) NOT NULL,                 -- 操作类型：create/confirm_rule/erp_fill/warehouse_execute/marketing_complete/cancel
  operator_id INTEGER REFERENCES users(id),         -- 操作人ID
  operator_name VARCHAR(100),                       -- 操作人姓名
  action_at TIMESTAMP DEFAULT NOW(),                -- 操作时间
  comment TEXT,                                     -- 操作备注
  details JSONB                                     -- 操作详情（灵活存储）
);

-- 操作记录表索引
CREATE INDEX IF NOT EXISTS idx_expiring_return_actions_order_id ON expiring_return_actions(order_id);

-- ============================================
-- 4. 流程配置表
-- ============================================
CREATE TABLE IF NOT EXISTS return_flow_configs (
  id SERIAL PRIMARY KEY,
  config_key VARCHAR(100) UNIQUE NOT NULL,          -- 配置键
  config_value TEXT NOT NULL,                       -- 配置值
  description TEXT,                                 -- 配置说明
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 为表添加更新时间触发器
DROP TRIGGER IF EXISTS update_return_flow_configs_updated_at ON return_flow_configs;
CREATE TRIGGER update_return_flow_configs_updated_at
    BEFORE UPDATE ON return_flow_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. 钉钉消息模板表
-- ============================================
CREATE TABLE IF NOT EXISTS dingtalk_msg_templates (
  id SERIAL PRIMARY KEY,
  template_code VARCHAR(100) UNIQUE NOT NULL,       -- 模板编码
  template_name VARCHAR(200) NOT NULL,              -- 模板名称
  template_content TEXT NOT NULL,                   -- 模板内容
  push_target VARCHAR(50),                          -- 推送对象角色
  push_timing VARCHAR(100),                         -- 推送时机描述
  is_active BOOLEAN DEFAULT TRUE,                   -- 是否启用
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 为表添加更新时间触发器
DROP TRIGGER IF EXISTS update_dingtalk_msg_templates_updated_at ON dingtalk_msg_templates;
CREATE TRIGGER update_dingtalk_msg_templates_updated_at
    BEFORE UPDATE ON dingtalk_msg_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 初始数据：钉钉消息模板
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
    'return_new_reminder',
    '新临期退货单提醒',
    '## 新临期退货单待处理\n\n**退货单号：** {{return_no}}\n**商品名称：** {{goods_name}}\n**数量：** {{quantity}}{{unit}}\n**剩余保质期：** {{days_to_expire}}天\n**来源客户：** {{consumer_name}}\n\n请及时处理：[查看详情]({{detail_url}})',
    'warehouse_manager',
    '新退货单创建时',
    TRUE
  ),
  (
    'return_pending_erp_reminder',
    'ERP待填写提醒',
    '## 临期退货单ERP信息待填写\n\n**退货单号：** {{return_no}}\n**商品名称：** {{goods_name}}\n**数量：** {{quantity}}{{unit}}\n**创建时间：** {{created_at}}\n\n请及时填写ERP采购退货单号：[处理]({{detail_url}})',
    'procurement_specialist',
    '规则确认后每日提醒',
    TRUE
  ),
  (
    'return_cannot_purchase_reminder',
    '不可采购退货提醒',
    '## 临期退货单不可采购退货\n\n**退货单号：** {{return_no}}\n**商品名称：** {{goods_name}}\n**数量：** {{quantity}}{{unit}}\n**原因：** 该商品规则设定为不可采购退货\n\n请营销部门跟进处理：[查看详情]({{detail_url}})',
    'marketing_manager',
    '规则确认为不可退货时',
    TRUE
  ),
  (
    'return_pending_warehouse_reminder',
    '仓储待执行提醒',
    '## 临期退货单待仓储执行\n\n**退货单号：** {{return_no}}\n**商品名称：** {{goods_name}}\n**ERP退货单号：** {{erp_return_no}}\n**应退数量：** {{quantity}}{{unit}}\n\n请及时执行退货操作：[处理]({{detail_url}})',
    'warehouse_manager',
    'ERP填写完成后',
    TRUE
  )
ON CONFLICT (template_code) DO NOTHING;
