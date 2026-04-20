-- 036: 删除 asset_applications 表及相关对象
-- 所有固定资产审批数据已迁移到 oa_approval_instances + erp_meta

-- 删除 asset_applications 表
DROP TABLE IF EXISTS asset_applications CASCADE;

-- 删除相关的数据库函数
DROP FUNCTION IF EXISTS generate_asset_application_no() CASCADE;

-- 删除 asset 相关权限（已在 033 中创建）
DELETE FROM role_permissions WHERE permission_id IN (
  SELECT id FROM permissions WHERE code IN (
    'asset:read',
    'asset:write',
    'asset:data_input',
    'asset:purchase:write',
    'asset:transfer:write',
    'asset:maintenance:write',
    'asset:disposal:write'
  )
);

DELETE FROM permissions WHERE code IN (
  'asset:read',
  'asset:write',
  'asset:data_input',
  'asset:purchase:write',
  'asset:transfer:write',
  'asset:maintenance:write',
  'asset:disposal:write'
);
