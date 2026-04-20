-- 034: 为工作流参与角色分配 OA 审批权限
-- 迁移030仅给 admin/manager/viewer 分配了 OA 权限，
-- 但工作流中以下角色作为审批人需要 OA 权限：
-- - admin_staff: 采购流程节点3(询价)/6(采购)/7(入库)、调拨流程节点1、维修流程节点2(询价)
-- - cashier: 采购流程节点5(支付)、维修流程节点4(支付)
-- - current_accountant: 其他付款流程节点2(财务审核)
-- - operations_manager: 需要发起和审批操作
-- - warehouse_operator/warehouse_manager: 可能需要审批调拨

-- 为工作流参与角色分配 OA 审批读写权限
-- 注：current_accountant 已在此条获得 read+write 权限，无需单独分配只读权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code IN ('admin_staff', 'cashier', 'current_accountant', 'operations_manager', 'warehouse_operator', 'warehouse_manager')
AND p.code IN ('oa:approval:read', 'oa:approval:write')
ON CONFLICT DO NOTHING;
