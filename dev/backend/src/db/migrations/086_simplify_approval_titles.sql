-- 086: 简化审批标题 — 移除 "表单类型名 - 字段值" 后缀
-- 背景：generateTitle 函数改为直接使用表单类型名称，历史数据需同步
-- 幂等：已迁移记录（title 已等于 ft.name）不会被重复影响

UPDATE oa_approval_instances i
SET title = ft.name
FROM oa_form_types ft
WHERE i.form_type_id = ft.id
  AND i.title LIKE ft.name || ' - %';
