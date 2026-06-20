-- 110: form_schema 改为代码唯一来源，DB 列废弃
-- 背景：form_schema 已由代码定义（form-types/*.ts）完全管理，运行时不读取。
-- 新增表单类型时无需在迁移脚本中提供 form_schema JSONB。

-- 1. 移除 NOT NULL 约束（允许新记录使用默认值）
ALTER TABLE oa_form_types ALTER COLUMN form_schema DROP NOT NULL;

-- 2. 设置默认值（新增表单类型时可省略 form_schema 字段）
ALTER TABLE oa_form_types ALTER COLUMN form_schema SET DEFAULT '{"fields":[]}'::jsonb;

-- 3. 清空现有数据（代码定义已是唯一权威来源）
UPDATE oa_form_types SET form_schema = '{"fields":[]}'::jsonb;

-- 4. 标记废弃
COMMENT ON COLUMN oa_form_types.form_schema IS
  '[DEPRECATED] form_schema 由代码定义管理（form-types/*.ts），此列不再读取。新增表单类型时无需提供。';
