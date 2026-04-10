-- 逾期预警提醒记录表
-- 用于存储逾期前发送的提醒记录（区别于 ar_collection_actions 表，后者只记录任务相关操作）

-- 创建预警提醒记录表
CREATE TABLE IF NOT EXISTS ar_warning_reminders (
  id SERIAL PRIMARY KEY,
  
  -- ERP欠款标识
  erp_bill_id VARCHAR(64) NOT NULL,              -- ERP单据ID
  consumer_name VARCHAR(200),                     -- 客户名称
  manager_user_name VARCHAR(100),                 -- 责任人姓名
  manager_user_id INTEGER REFERENCES users(id),   -- 责任人ID
  
  -- 欠款信息
  left_amount DECIMAL(15,2),                      -- 剩余未收金额
  expire_date DATE,                               -- 到期日期
  days_to_expire INTEGER,                         -- 距离到期天数
  
  -- 提醒信息
  reminder_type VARCHAR(20) NOT NULL,             -- 提醒类型: pre_5d(5天前)/pre_2d(2天前)/pre_1d(1天前)
  reminder_channel VARCHAR(20) DEFAULT 'dingtalk', -- 提醒渠道
  reminder_status VARCHAR(20) DEFAULT 'sent',     -- 状态: sent/failed
  
  -- 接收信息
  receiver_user_id INTEGER REFERENCES users(id),  -- 接收人ID
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_warning_reminders_bill ON ar_warning_reminders(erp_bill_id);
CREATE INDEX IF NOT EXISTS idx_warning_reminders_expire ON ar_warning_reminders(expire_date);
CREATE INDEX IF NOT EXISTS idx_warning_reminders_type ON ar_warning_reminders(reminder_type);
CREATE INDEX IF NOT EXISTS idx_warning_reminders_manager ON ar_warning_reminders(manager_user_id);
CREATE INDEX IF NOT EXISTS idx_warning_reminders_created ON ar_warning_reminders(created_at);

-- 注释
COMMENT ON TABLE ar_warning_reminders IS '逾期预警提醒记录表';
COMMENT ON COLUMN ar_warning_reminders.erp_bill_id IS 'ERP单据ID';
COMMENT ON COLUMN ar_warning_reminders.consumer_name IS '客户名称';
COMMENT ON COLUMN ar_warning_reminders.manager_user_name IS '责任人姓名';
COMMENT ON COLUMN ar_warning_reminders.manager_user_id IS '责任人用户ID';
COMMENT ON COLUMN ar_warning_reminders.left_amount IS '剩余未收金额';
COMMENT ON COLUMN ar_warning_reminders.expire_date IS '到期日期';
COMMENT ON COLUMN ar_warning_reminders.days_to_expire IS '距离到期天数';
COMMENT ON COLUMN ar_warning_reminders.reminder_type IS '提醒类型: pre_5d/pre_2d/pre_1d';
COMMENT ON COLUMN ar_warning_reminders.reminder_channel IS '提醒渠道: dingtalk';
COMMENT ON COLUMN ar_warning_reminders.reminder_status IS '提醒状态: sent/failed';
COMMENT ON COLUMN ar_warning_reminders.receiver_user_id IS '接收人用户ID';
