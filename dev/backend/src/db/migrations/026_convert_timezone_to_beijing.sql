-- ============================================
-- 时区数据迁移脚本
-- 将所有 UTC 时间转换为北京时间（+8小时）
-- 执行时间：2026-04-14
-- ============================================

-- AR 催收管理模块
UPDATE ar_collection_actions SET created_at = created_at + INTERVAL '8 hours';
UPDATE ar_collection_tasks SET created_at = created_at + INTERVAL '8 hours';
UPDATE ar_collection_tasks SET updated_at = updated_at + INTERVAL '8 hours';
UPDATE ar_collection_tasks SET last_escalated_at = last_escalated_at + INTERVAL '8 hours' WHERE last_escalated_at IS NOT NULL;
UPDATE ar_collection_tasks SET last_collection_at = last_collection_at + INTERVAL '8 hours' WHERE last_collection_at IS NOT NULL;
UPDATE ar_collection_details SET created_at = created_at + INTERVAL '8 hours';
UPDATE ar_collection_details SET process_at = process_at + INTERVAL '8 hours' WHERE process_at IS NOT NULL;
UPDATE ar_collection_details SET bill_order_time = bill_order_time + INTERVAL '8 hours' WHERE bill_order_time IS NOT NULL;
UPDATE ar_collection_details SET expire_time = expire_time + INTERVAL '8 hours' WHERE expire_time IS NOT NULL;
UPDATE ar_legal_progress SET created_at = created_at + INTERVAL '8 hours';
UPDATE ar_warning_reminders SET created_at = created_at + INTERVAL '8 hours';
UPDATE ar_extension_records SET created_at = created_at + INTERVAL '8 hours';
UPDATE ar_extension_records SET expired_at = expired_at + INTERVAL '8 hours' WHERE expired_at IS NOT NULL;
UPDATE ar_notification_records SET created_at = created_at + INTERVAL '8 hours';
UPDATE ar_notification_records SET sent_at = sent_at + INTERVAL '8 hours' WHERE sent_at IS NOT NULL;

-- AR 应收账款模块
UPDATE ar_receivables SET created_at = created_at + INTERVAL '8 hours';
UPDATE ar_receivables SET updated_at = updated_at + INTERVAL '8 hours';
UPDATE ar_receivables SET work_time = work_time + INTERVAL '8 hours' WHERE work_time IS NOT NULL;
UPDATE ar_receivables SET bill_order_time = bill_order_time + INTERVAL '8 hours' WHERE bill_order_time IS NOT NULL;
UPDATE ar_receivables SET due_date = due_date + INTERVAL '8 hours' WHERE due_date IS NOT NULL;
UPDATE ar_receivables SET last_pay_day = last_pay_day + INTERVAL '8 hours' WHERE last_pay_day IS NOT NULL;
UPDATE ar_receivables SET last_synced_at = last_synced_at + INTERVAL '8 hours' WHERE last_synced_at IS NOT NULL;
UPDATE ar_receivables SET last_notified_at = last_notified_at + INTERVAL '8 hours' WHERE last_notified_at IS NOT NULL;
UPDATE ar_action_logs SET created_at = created_at + INTERVAL '8 hours';
UPDATE ar_bill_results SET created_at = created_at + INTERVAL '8 hours';
UPDATE ar_bill_results SET updated_at = updated_at + INTERVAL '8 hours';
UPDATE ar_bill_results SET latest_pay_date = latest_pay_date + INTERVAL '8 hours' WHERE latest_pay_date IS NOT NULL;
UPDATE ar_penalty_records SET created_at = created_at + INTERVAL '8 hours';
UPDATE ar_bill_voucher_marks SET created_at = created_at + INTERVAL '8 hours';
UPDATE ar_bill_voucher_marks SET updated_at = updated_at + INTERVAL '8 hours';
UPDATE ar_bill_voucher_marks SET voucher_marked_at = voucher_marked_at + INTERVAL '8 hours' WHERE voucher_marked_at IS NOT NULL;
UPDATE ar_daily_stats SET created_at = created_at + INTERVAL '8 hours';
UPDATE ar_overdue_stats SET created_at = created_at + INTERVAL '8 hours';
UPDATE ar_overdue_stats SET updated_at = updated_at + INTERVAL '8 hours';
UPDATE ar_time_efficiency SET created_at = created_at + INTERVAL '8 hours';
UPDATE ar_time_efficiency SET updated_at = updated_at + INTERVAL '8 hours';
UPDATE ar_user_signatures SET created_at = created_at + INTERVAL '8 hours';
UPDATE ar_deadline_configs SET created_at = created_at + INTERVAL '8 hours';
UPDATE ar_deadline_configs SET updated_at = updated_at + INTERVAL '8 hours';
UPDATE ar_flow_nodes SET created_at = created_at + INTERVAL '8 hours';
UPDATE ar_flow_nodes SET updated_at = updated_at + INTERVAL '8 hours';
UPDATE ar_flow_nodes SET started_at = started_at + INTERVAL '8 hours' WHERE started_at IS NOT NULL;
UPDATE ar_flow_nodes SET completed_at = completed_at + INTERVAL '8 hours' WHERE completed_at IS NOT NULL;
UPDATE ar_flow_nodes SET deadline_at = deadline_at + INTERVAL '8 hours' WHERE deadline_at IS NOT NULL;
UPDATE ar_evidence_files SET uploaded_at = uploaded_at + INTERVAL '8 hours';

-- 退货管理模块
UPDATE expiring_return_orders SET created_at = created_at + INTERVAL '8 hours';
UPDATE expiring_return_orders SET updated_at = updated_at + INTERVAL '8 hours';
UPDATE expiring_return_orders SET erp_filled_at = erp_filled_at + INTERVAL '8 hours' WHERE erp_filled_at IS NOT NULL;
UPDATE expiring_return_orders SET warehouse_executed_at = warehouse_executed_at + INTERVAL '8 hours' WHERE warehouse_executed_at IS NOT NULL;
UPDATE expiring_return_orders SET marketing_completed_at = marketing_completed_at + INTERVAL '8 hours' WHERE marketing_completed_at IS NOT NULL;
UPDATE expiring_return_orders SET rule_confirmed_at = rule_confirmed_at + INTERVAL '8 hours' WHERE rule_confirmed_at IS NOT NULL;
UPDATE expiring_return_actions SET action_at = action_at + INTERVAL '8 hours';
UPDATE return_notification_records SET created_at = created_at + INTERVAL '8 hours';
UPDATE return_notification_records SET sent_at = sent_at + INTERVAL '8 hours' WHERE sent_at IS NOT NULL;
UPDATE return_penalty_records SET created_at = created_at + INTERVAL '8 hours';
UPDATE return_penalty_records SET updated_at = updated_at + INTERVAL '8 hours';
UPDATE return_penalty_records SET calculated_at = calculated_at + INTERVAL '8 hours' WHERE calculated_at IS NOT NULL;
UPDATE goods_return_rules SET created_at = created_at + INTERVAL '8 hours';
UPDATE goods_return_rules SET updated_at = updated_at + INTERVAL '8 hours';
UPDATE goods_return_rules SET confirmed_at = confirmed_at + INTERVAL '8 hours' WHERE confirmed_at IS NOT NULL;
UPDATE return_flow_configs SET created_at = created_at + INTERVAL '8 hours';
UPDATE return_flow_configs SET updated_at = updated_at + INTERVAL '8 hours';

-- 战略商品模块
UPDATE strategic_products SET created_at = created_at + INTERVAL '8 hours';
UPDATE strategic_products SET updated_at = updated_at + INTERVAL '8 hours';
UPDATE strategic_products SET procurement_confirmed_at = procurement_confirmed_at + INTERVAL '8 hours' WHERE procurement_confirmed_at IS NOT NULL;
UPDATE strategic_products SET marketing_confirmed_at = marketing_confirmed_at + INTERVAL '8 hours' WHERE marketing_confirmed_at IS NOT NULL;

-- 系统模块
UPDATE users SET created_at = created_at + INTERVAL '8 hours';
UPDATE users SET updated_at = updated_at + INTERVAL '8 hours';
UPDATE users SET last_login_at = last_login_at + INTERVAL '8 hours' WHERE last_login_at IS NOT NULL;
UPDATE roles SET created_at = created_at + INTERVAL '8 hours';
UPDATE roles SET updated_at = updated_at + INTERVAL '8 hours';
UPDATE permissions SET created_at = created_at + INTERVAL '8 hours';
UPDATE user_roles SET created_at = created_at + INTERVAL '8 hours';
UPDATE role_permissions SET created_at = created_at + INTERVAL '8 hours';
UPDATE login_logs SET login_at = login_at + INTERVAL '8 hours';
UPDATE dingtalk_msg_templates SET created_at = created_at + INTERVAL '8 hours';
UPDATE dingtalk_msg_templates SET updated_at = updated_at + INTERVAL '8 hours';

-- 注意：ar_data_exceptions 表使用的是 TIMESTAMP WITH TIME ZONE，不需要转换
