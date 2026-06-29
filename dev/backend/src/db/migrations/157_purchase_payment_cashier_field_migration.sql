-- =====================================================
-- 157: 采购付款申请单出纳环节字段权限调整
--
-- 背景：
-- 出纳支付环节(node 3)的银行转账字段从旧的单字段模式
-- (paymentSubjectId + actualAmount) 迁移到新的多行表格模式
-- (paymentLines)。
--
-- 变更：
-- node 3: paymentSubjectId = hidden（旧字段，由 paymentLines 替代）
-- node 3: actualAmount = hidden（旧字段，由 paymentLines 替代）
--
-- 注意：旧字段保留在 formSchema 中以兼容历史实例数据，
-- 仅通过 field_permissions 隐藏。ERP 回调中仍有降级逻辑
-- 处理旧实例的 paymentSubjectId + actualAmount 数据。
-- =====================================================

UPDATE oa_form_types
SET field_permissions =
  jsonb_set(
    jsonb_set(
      field_permissions,
      '{nodes,3,paymentSubjectId}', '"hidden"'
    ),
    '{nodes,3,actualAmount}', '"hidden"'
  )
WHERE code = 'purchase_payment';
