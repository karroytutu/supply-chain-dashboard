-- OA 异步任务表：用于失败补偿与削峰
-- 创建壳实例、发送通知、自动环节回调、完成/取消钉钉待办等操作可先写入任务表，再由 worker 消费
CREATE TABLE IF NOT EXISTS oa_async_tasks (
  id BIGSERIAL PRIMARY KEY,
  type VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  retries INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  error TEXT,
  dedup_key VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 去重索引：同一实例 + 事件类型 + 节点序号 只保留一条 pending 任务
CREATE UNIQUE INDEX IF NOT EXISTS idx_oa_async_tasks_dedup_pending
  ON oa_async_tasks (dedup_key)
  WHERE status = 'pending';

-- 消费索引：按下次重试时间排序，快速拉取待处理任务
CREATE INDEX IF NOT EXISTS idx_oa_async_tasks_pending_retry
  ON oa_async_tasks (status, next_retry_at, retries)
  WHERE status = 'pending';

-- 状态枚举说明：pending / processing / completed / failed / dead_letter
