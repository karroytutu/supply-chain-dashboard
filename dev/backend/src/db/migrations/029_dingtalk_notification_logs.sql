-- 钉钉工作通知推送记录表
-- 用于记录所有工作通知的发送状态，支持重试机制

CREATE TABLE IF NOT EXISTS dingtalk_notification_logs (
  id SERIAL PRIMARY KEY,
  -- 业务标识
  business_type VARCHAR(50) NOT NULL,           -- 业务类型: collection, return_order, return_penalty
  business_id INTEGER,                          -- 业务记录ID
  business_no VARCHAR(64),                      -- 业务编号（如任务编号、退货单号）
  
  -- 消息内容
  msg_type VARCHAR(20) NOT NULL DEFAULT 'markdown', -- 消息类型: markdown, actionCard, oa
  title VARCHAR(200) NOT NULL,                  -- 消息标题
  content TEXT,                                 -- 消息内容
  
  -- 钉钉API返回
  task_id BIGINT,                               -- 钉钉任务ID，用于查询进度/结果/撤回
  
  -- 接收者
  receiver_ids TEXT[],                          -- 接收者的钉钉用户ID列表
  
  -- 状态管理
  status VARCHAR(20) DEFAULT 'pending',         -- pending, sent, failed, recalled
  error_message TEXT,                           -- 错误信息
  
  -- 重试机制
  retry_count INTEGER DEFAULT 0,                -- 已重试次数
  max_retry INTEGER DEFAULT 3,                  -- 最大重试次数
  next_retry_at TIMESTAMP,                      -- 下次重试时间
  
  -- 审计字段
  created_by INTEGER REFERENCES users(id),      -- 创建者
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP,                            -- 发送成功时间
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_notification_logs_business 
  ON dingtalk_notification_logs(business_type, business_id);

CREATE INDEX IF NOT EXISTS idx_notification_logs_task 
  ON dingtalk_notification_logs(task_id);

CREATE INDEX IF NOT EXISTS idx_notification_logs_status 
  ON dingtalk_notification_logs(status);

CREATE INDEX IF NOT EXISTS idx_notification_logs_retry 
  ON dingtalk_notification_logs(status, next_retry_at) 
  WHERE status = 'failed' AND retry_count < max_retry;

-- 注释
COMMENT ON TABLE dingtalk_notification_logs IS '钉钉工作通知推送记录表';
COMMENT ON COLUMN dingtalk_notification_logs.business_type IS '业务类型: collection(催收), return_order(退货单), return_penalty(退货考核)';
COMMENT ON COLUMN dingtalk_notification_logs.msg_type IS '消息类型: markdown, actionCard, oa';
COMMENT ON COLUMN dingtalk_notification_logs.task_id IS '钉钉异步发送任务ID，用于查询发送进度、结果和撤回';
COMMENT ON COLUMN dingtalk_notification_logs.status IS '状态: pending(待发送), sent(已发送), failed(发送失败), recalled(已撤回)';
