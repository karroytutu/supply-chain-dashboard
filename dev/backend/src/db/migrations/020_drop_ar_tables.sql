-- 020: 删除应收账款管理模块相关表
-- 执行时间: 2026-04-08
-- 说明: 完全清理财务管理模块，删除所有 ar_ 前缀的表

-- 删除顺序：按依赖关系从子表到主表

-- 1. 删除有外键依赖的子表
DROP TABLE IF EXISTS ar_data_exceptions CASCADE;
DROP TABLE IF EXISTS ar_bill_voucher_marks CASCADE;
DROP TABLE IF EXISTS ar_time_efficiency CASCADE;
DROP TABLE IF EXISTS ar_overdue_stats CASCADE;
DROP TABLE IF EXISTS ar_flow_nodes CASCADE;
DROP TABLE IF EXISTS ar_bill_results CASCADE;
DROP TABLE IF EXISTS ar_customer_collection_tasks CASCADE;
DROP TABLE IF EXISTS ar_collection_tasks CASCADE;

-- 2. 删除日志和记录表
DROP TABLE IF EXISTS ar_notification_records CASCADE;
DROP TABLE IF EXISTS ar_action_logs CASCADE;
DROP TABLE IF EXISTS ar_penalty_records CASCADE;

-- 3. 删除配置和辅助表
DROP TABLE IF EXISTS ar_deadline_configs CASCADE;
DROP TABLE IF EXISTS ar_user_signatures CASCADE;
DROP TABLE IF EXISTS ar_daily_stats CASCADE;

-- 4. 删除主表
DROP TABLE IF EXISTS ar_receivables CASCADE;

-- 5. 删除权限记录
DELETE FROM role_permissions WHERE permission_id IN (
  SELECT id FROM permissions WHERE code LIKE 'finance:ar:%'
);
DELETE FROM permissions WHERE code LIKE 'finance:ar:%';

-- 注意：不删除 finance_staff, cashier, marketing_supervisor 角色
-- 这些角色可能被其他功能使用
