-- 155: 清理催收专项考核历史数据
-- 催收 OA 节点考核已统一迁移至通用 OA 节点超时考核（oa_node_timeout），
-- 原 oa_collection 分类的考核记录不再需要，清理以保持数据整洁

-- 1. 删除 oa_collection 分类的所有考核记录
DELETE FROM assessment_records WHERE category = 'oa_collection';
