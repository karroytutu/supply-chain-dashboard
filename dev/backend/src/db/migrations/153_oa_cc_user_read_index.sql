-- =====================================================
-- 153: 抄送表添加 (user_id, read_at) 组合索引
--
-- 背景：
-- 抄送列表支持按"未读优先"排序（ORDER BY cc_read_at NULLS FIRST），
-- 原有 (user_id) 单列索引无法覆盖排序需求，数据量增长后导致全表扫描。
-- =====================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_oa_cc_user_read
ON oa_approval_cc(user_id, read_at);
