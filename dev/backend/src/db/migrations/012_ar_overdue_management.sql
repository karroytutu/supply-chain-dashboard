-- 逾期应收账款管理功能
-- 包含逾期等级、流程节点、时限配置、时效分析等功能
-- 数据库: xly_dashboard

-- ============================================
-- 1. 扩展 ar_customer_collection_tasks 表
-- ============================================
ALTER TABLE ar_customer_collection_tasks
  ADD COLUMN IF NOT EXISTS overdue_level VARCHAR(20),           -- 逾期等级: light/medium/severe
  ADD COLUMN IF NOT EXISTS flow_status VARCHAR(30) DEFAULT 'initial',  -- 流程状态: initial/preprocessing/assigned/collecting/completed
  ADD COLUMN IF NOT EXISTS preprocessing_at TIMESTAMP,          -- 财务预处理时间
  ADD COLUMN IF NOT EXISTS preprocessed_by INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS preprocessing_status VARCHAR(20) DEFAULT 'pending',  -- pending/in_progress/completed/skipped
  ADD COLUMN IF NOT EXISTS assignment_at TIMESTAMP,             -- 任务分配时间
  ADD COLUMN IF NOT EXISTS assigned_by INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS node_deadlines JSONB,                -- 各节点截止时间
  ADD COLUMN IF NOT EXISTS node_statuses JSONB,                 -- 各节点状态
  ADD COLUMN IF NOT EXISTS timeout_warnings JSONB,              -- 超时预警记录
  ADD COLUMN IF NOT EXISTS performance_metrics JSONB;           -- 绩效指标

-- 新增字段索引
CREATE INDEX IF NOT EXISTS idx_cust_tasks_overdue_level ON ar_customer_collection_tasks(overdue_level);
CREATE INDEX IF NOT EXISTS idx_cust_tasks_flow_status ON ar_customer_collection_tasks(flow_status);

-- ============================================
-- 2. 扩展 ar_receivables 表
-- ============================================
ALTER TABLE ar_receivables
  ADD COLUMN IF NOT EXISTS overdue_level VARCHAR(20);  -- 逾期等级（冗余存储）

-- 新增字段索引
CREATE INDEX IF NOT EXISTS idx_ar_overdue_level ON ar_receivables(overdue_level);

-- ============================================
-- 3. 新建 ar_deadline_configs 时限配置表
-- ============================================
CREATE TABLE IF NOT EXISTS ar_deadline_configs (
  id SERIAL PRIMARY KEY,
  node_type VARCHAR(30) NOT NULL,       -- preprocessing/assignment/collection/review
  overdue_level VARCHAR(20) NOT NULL,   -- light/medium/severe
  deadline_hours INTEGER NOT NULL,      -- 时限（小时）
  warning_hours INTEGER DEFAULT 4,      -- 预警提前时间（小时）
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(node_type, overdue_level)
);

-- 时限配置表索引
CREATE INDEX IF NOT EXISTS idx_deadline_configs_node ON ar_deadline_configs(node_type);
CREATE INDEX IF NOT EXISTS idx_deadline_configs_level ON ar_deadline_configs(overdue_level);
CREATE INDEX IF NOT EXISTS idx_deadline_configs_active ON ar_deadline_configs(is_active);

-- 为时限配置表添加更新时间触发器
DROP TRIGGER IF EXISTS update_ar_deadline_configs_updated_at ON ar_deadline_configs;
CREATE TRIGGER update_ar_deadline_configs_updated_at
    BEFORE UPDATE ON ar_deadline_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 4. 新建 ar_flow_nodes 流程节点记录表
-- ============================================
CREATE TABLE IF NOT EXISTS ar_flow_nodes (
  id SERIAL PRIMARY KEY,
  customer_task_id INTEGER REFERENCES ar_customer_collection_tasks(id),
  node_type VARCHAR(30) NOT NULL,       -- preprocessing/assignment/collection/review
  node_status VARCHAR(20) DEFAULT 'pending',  -- pending/in_progress/completed/skipped/timeout
  operator_id INTEGER REFERENCES users(id),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  deadline_at TIMESTAMP,
  actual_hours DECIMAL(10,2),
  is_timeout BOOLEAN DEFAULT FALSE,
  node_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 流程节点表索引
CREATE INDEX IF NOT EXISTS idx_flow_nodes_customer_task ON ar_flow_nodes(customer_task_id);
CREATE INDEX IF NOT EXISTS idx_flow_nodes_type ON ar_flow_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_flow_nodes_status ON ar_flow_nodes(node_status);
CREATE INDEX IF NOT EXISTS idx_flow_nodes_operator ON ar_flow_nodes(operator_id);
CREATE INDEX IF NOT EXISTS idx_flow_nodes_task_type ON ar_flow_nodes(customer_task_id, node_type);

-- 为流程节点表添加更新时间触发器
DROP TRIGGER IF EXISTS update_ar_flow_nodes_updated_at ON ar_flow_nodes;
CREATE TRIGGER update_ar_flow_nodes_updated_at
    BEFORE UPDATE ON ar_flow_nodes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. 新建 ar_overdue_stats 逾期统计快照表
-- ============================================
CREATE TABLE IF NOT EXISTS ar_overdue_stats (
  id SERIAL PRIMARY KEY,
  stat_date DATE NOT NULL UNIQUE,
  total_customer_count INTEGER DEFAULT 0,
  total_overdue_amount DECIMAL(15,2) DEFAULT 0,
  total_bill_count INTEGER DEFAULT 0,
  light_customer_count INTEGER DEFAULT 0,
  light_amount DECIMAL(15,2) DEFAULT 0,
  medium_customer_count INTEGER DEFAULT 0,
  medium_amount DECIMAL(15,2) DEFAULT 0,
  severe_customer_count INTEGER DEFAULT 0,
  severe_amount DECIMAL(15,2) DEFAULT 0,
  preprocessing_pending_count INTEGER DEFAULT 0,
  assignment_pending_count INTEGER DEFAULT 0,
  collection_pending_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 逾期统计表索引（stat_date 已有 UNIQUE 约束，自动创建索引）
CREATE INDEX IF NOT EXISTS idx_overdue_stats_date ON ar_overdue_stats(stat_date);

-- 为逾期统计表添加更新时间触发器
DROP TRIGGER IF EXISTS update_ar_overdue_stats_updated_at ON ar_overdue_stats;
CREATE TRIGGER update_ar_overdue_stats_updated_at
    BEFORE UPDATE ON ar_overdue_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 6. 新建 ar_time_efficiency 时效分析表
-- ============================================
CREATE TABLE IF NOT EXISTS ar_time_efficiency (
  id SERIAL PRIMARY KEY,
  customer_task_id INTEGER REFERENCES ar_customer_collection_tasks(id),
  preprocessing_hours DECIMAL(10,2),
  assignment_hours DECIMAL(10,2),
  collection_hours DECIMAL(10,2),
  total_hours DECIMAL(10,2),
  preprocessing_on_time BOOLEAN,
  assignment_on_time BOOLEAN,
  collection_on_time BOOLEAN,
  stat_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 时效分析表索引
CREATE INDEX IF NOT EXISTS idx_time_efficiency_task ON ar_time_efficiency(customer_task_id);
CREATE INDEX IF NOT EXISTS idx_time_efficiency_date ON ar_time_efficiency(stat_date);

-- 为时效分析表添加更新时间触发器
DROP TRIGGER IF EXISTS update_ar_time_efficiency_updated_at ON ar_time_efficiency;
CREATE TRIGGER update_ar_time_efficiency_updated_at
    BEFORE UPDATE ON ar_time_efficiency
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 7. 插入默认时限配置数据
-- ============================================
-- 财务预处理节点时限配置
INSERT INTO ar_deadline_configs (node_type, overdue_level, deadline_hours, warning_hours)
VALUES 
  ('preprocessing', 'light', 24, 4),
  ('preprocessing', 'medium', 16, 4),
  ('preprocessing', 'severe', 8, 2)
ON CONFLICT (node_type, overdue_level) DO NOTHING;

-- 营销主管分配节点时限配置
INSERT INTO ar_deadline_configs (node_type, overdue_level, deadline_hours, warning_hours)
VALUES 
  ('assignment', 'light', 8, 2),
  ('assignment', 'medium', 4, 2),
  ('assignment', 'severe', 2, 1)
ON CONFLICT (node_type, overdue_level) DO NOTHING;

-- 营销师催收节点时限配置
INSERT INTO ar_deadline_configs (node_type, overdue_level, deadline_hours, warning_hours)
VALUES 
  ('collection', 'light', 72, 8),
  ('collection', 'medium', 48, 8),
  ('collection', 'severe', 24, 4)
ON CONFLICT (node_type, overdue_level) DO NOTHING;

-- 财务审核节点时限配置
INSERT INTO ar_deadline_configs (node_type, overdue_level, deadline_hours, warning_hours)
VALUES 
  ('review', 'light', 24, 4),
  ('review', 'medium', 24, 4),
  ('review', 'severe', 24, 4)
ON CONFLICT (node_type, overdue_level) DO NOTHING;
