-- 压单对账：索引优化
-- status 为 VARCHAR(30)，'hoard_excluded' 无需 ALTER TABLE
-- action_type 为 VARCHAR，同理

-- 支持按 hoard_tag 查询明细（对账时扫描非 HOARD 明细）
CREATE INDEX IF NOT EXISTS idx_collection_details_hoard_tag
  ON ar_collection_details(hoard_tag) WHERE hoard_tag IS NOT NULL;
