-- =====================================================
-- 158: 采购付款申请单支持纯预付款核销免审
--
-- 背景：
-- 纯预付款核销（预付款核销合计 == 需付款金额，无银行转账部分）
-- 属于零资金流出的账务对冲行为，跳过财务审批、总经理审批和出纳支付，
-- 直接进入 ERP 自动节点创建付款单。
--
-- 改动：
-- 1. version 递增为 3（formSchema 新增 _isPurePrepayWriteOff 内部字段，
--    workflowDef 财务审批/总经理审批/出纳支付新增条件）
-- 2. _isPurePrepayWriteOff 为 internalField，无需配置 field_permissions
-- =====================================================

UPDATE oa_form_types
SET version = 3, updated_at = NOW()
WHERE code = 'purchase_payment' AND version < 3;
