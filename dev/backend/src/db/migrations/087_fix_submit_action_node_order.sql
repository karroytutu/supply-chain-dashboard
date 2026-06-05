-- 修复历史 submit 操作的 node_order
-- 原硬编码 node_order=1 导致提交动作错误地显示在第一个审批节点下
-- 改为 NULL 使其不再归属于任何审批节点，由前端在"发起申请"起始节点下显示
UPDATE oa_approval_actions
SET node_order = NULL
WHERE action_type = 'submit' AND node_order IS NOT NULL;
