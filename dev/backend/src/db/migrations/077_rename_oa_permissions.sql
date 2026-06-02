-- OA系统重命名：更新权限编码
-- 将 oa:approval:read -> oa:read, oa:approval:write -> oa:write
-- oa:data:read 和 oa:data:export 保持不变

-- 重命名权限编码
UPDATE permissions SET code = 'oa:read', name = '查看OA系统' WHERE code = 'oa:approval:read';
UPDATE permissions SET code = 'oa:write', name = '操作OA系统' WHERE code = 'oa:approval:write';

-- 更新 resource_key 中的 API 路径
UPDATE permissions SET resource_key = '/api/oa' WHERE code = 'oa:write';
UPDATE permissions SET resource_key = '/api/oa/data/export' WHERE code = 'oa:data:export';

-- role_permissions 通过 permission_id 外键关联，code 更新后自动生效，无需额外操作
