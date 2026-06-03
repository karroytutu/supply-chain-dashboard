-- 083: 清理已废弃的站内消息表和Token快速操作表
--
-- 背景：站内消息功能已被钉钉流程中心待办替代，Token快速操作已被流程中心原生审批替代。
-- 所有读写这两张表的代码已在应用层移除，此处清理数据库残留。
--
-- 原始创建位置：
--   oa_in_app_messages  → 030_oa_approval.sql
--   oa_action_tokens    → 053_oa_dingtalk_integration.sql

DROP INDEX IF EXISTS idx_oa_messages_user;
DROP INDEX IF EXISTS idx_oa_messages_time;
DROP INDEX IF EXISTS idx_oa_action_tokens_token;
DROP INDEX IF EXISTS idx_oa_action_tokens_instance;
DROP INDEX IF EXISTS idx_oa_action_tokens_status;

DROP TABLE IF EXISTS oa_in_app_messages;
DROP TABLE IF EXISTS oa_action_tokens;
