-- 025: 催收明细表添加单据编号字段
-- 执行时间: 2026-04-14
-- 说明: 添加 bill_no 字段用于存储订单号(单据编号)

-- 添加 bill_no 字段
ALTER TABLE ar_collection_details 
ADD COLUMN IF NOT EXISTS bill_no VARCHAR(100);

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_collection_details_bill_no ON ar_collection_details(bill_no);

-- 注释
COMMENT ON COLUMN ar_collection_details.bill_no IS '单据编号(订单号)';
