-- 退货单去重：清理重复数据 + 添加唯一约束
-- 问题：同步任务可能在同一天被多次触发，导致同一 source_bill_no + goods_id + unit 的记录被重复插入
-- 修复：1) 清理已有重复数据 2) 添加唯一约束防止未来重复

-- 步骤1：删除重复记录，保留每组中 id 最小的那条（最早创建的）
DELETE FROM expiring_return_orders
WHERE id NOT IN (
  SELECT MIN(id)
  FROM expiring_return_orders
  GROUP BY source_bill_no, goods_id, unit
);

-- 步骤2：清理重复记录关联的操作日志（或phaned actions）
-- 这些 action 记录的 order_id 指向已被删除的重复退货单
DELETE FROM expiring_return_actions
WHERE order_id NOT IN (
  SELECT id FROM expiring_return_orders
);

-- 步骤3：添加唯一约束
-- 业务语义：同一个源单号 + 同一商品 + 同一单位，只应存在一条退货记录
ALTER TABLE expiring_return_orders
  ADD CONSTRAINT uq_return_orders_source_goods_unit
  UNIQUE (source_bill_no, goods_id, unit);
