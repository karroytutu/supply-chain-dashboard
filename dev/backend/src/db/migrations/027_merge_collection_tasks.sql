-- 迁移脚本：将历史批次的催收任务合并为每个客户一个任务
-- 背景：historical 批次的任务是系统初始化时批量生成的，每个客户有多个任务
-- 需求：每个客户只保留一个任务，所有欠款明细合并到该任务

-- ============================================
-- 第一步：找出每个客户的主任务（保留最新的）
-- ============================================

-- 创建临时表存储每个客户的主任务
CREATE TEMP TABLE main_tasks AS
SELECT DISTINCT ON (consumer_name)
  id as main_task_id,
  consumer_name
FROM ar_collection_tasks
WHERE status = 'collecting'
ORDER BY consumer_name, created_at DESC;

-- 创建临时表存储需要合并的任务
CREATE TEMP TABLE tasks_to_merge AS
SELECT t.id, t.consumer_name, m.main_task_id
FROM ar_collection_tasks t
JOIN main_tasks m ON m.consumer_name = t.consumer_name
WHERE t.status = 'collecting'
  AND t.id != m.main_task_id;

-- 查看需要合并的任务数量
SELECT COUNT(*) as tasks_to_merge_count FROM tasks_to_merge;

-- ============================================
-- 第二步：迁移明细到主任务
-- ============================================

-- 更新明细的 task_id 指向主任务
UPDATE ar_collection_details d
SET task_id = m.main_task_id
FROM tasks_to_merge m
WHERE d.task_id = m.id;

-- ============================================
-- 第三步：删除已合并的任务
-- ============================================

-- 删除空任务的操作日志
DELETE FROM ar_collection_actions
WHERE task_id IN (SELECT id FROM tasks_to_merge);

-- 删除空任务
DELETE FROM ar_collection_tasks
WHERE id IN (SELECT id FROM tasks_to_merge);

-- ============================================
-- 第四步：更新主任务的汇总字段
-- ============================================

UPDATE ar_collection_tasks t
SET
  total_amount = sub.total,
  bill_count = sub.cnt,
  max_overdue_days = sub.max_overdue,
  first_overdue_date = sub.min_expire_date,
  batch_date = sub.min_expire_date,
  priority = CASE
    WHEN sub.max_overdue >= 30 THEN 'critical'
    WHEN sub.max_overdue >= 15 THEN 'high'
    WHEN sub.max_overdue >= 7 THEN 'medium'
    ELSE 'low'
  END
FROM (
  SELECT
    task_id,
    SUM(left_amount) as total,
    COUNT(*) as cnt,
    MAX(overdue_days) as max_overdue,
    MIN(DATE(expire_time)) as min_expire_date
  FROM ar_collection_details
  GROUP BY task_id
) sub
WHERE t.id = sub.task_id
  AND t.status = 'collecting';

-- ============================================
-- 验证查询
-- ============================================

-- 检查每个客户是否只有一个任务（预期返回空）
SELECT consumer_name, COUNT(*) as task_count
FROM ar_collection_tasks
WHERE status = 'collecting'
GROUP BY consumer_name
HAVING COUNT(*) > 1
ORDER BY task_count DESC
LIMIT 10;

-- 清理临时表
DROP TABLE IF EXISTS main_tasks;
DROP TABLE IF EXISTS tasks_to_merge;
