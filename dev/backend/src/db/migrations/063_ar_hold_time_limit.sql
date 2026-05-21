-- ============================================
-- 063_ar_hold_time_limit.sql
-- 压单时限控制：历史数据清理 + 新增 hold 字段
-- 需求：压单分为长期压单和期限压单，长期压单不需设置天数，期限压单需设置天数
-- 清理：之前已提交的压单申请全部清理，后续按新规则重新提交
-- ============================================

-- ============================================
-- Step 0.1: 清理 ar_collection_details 压单标记
-- 将所有 HOARD 明细恢复为 pending 状态
-- ============================================
UPDATE ar_collection_details
SET hoard_tag = NULL,
    status = 'pending',
    remark = COALESCE(remark, '') || ' [压单标记已清理，等待按新规则重新申请]'
WHERE hoard_tag = 'HOARD';

-- ============================================
-- Step 0.2: 重算受影响任务的指标
-- 恢复被排除的明细后，重新计算 total_amount、bill_count、max_overdue_days
-- ============================================
WITH task_stats AS (
  SELECT
    task_id,
    COALESCE(SUM(d.left_amount), 0) AS calc_total_amount,
    COUNT(*) AS calc_bill_count,
    COALESCE(MAX(d.overdue_days), 0) AS calc_max_overdue_days
  FROM ar_collection_details d
  WHERE d.status <> 'hoard_excluded'
  GROUP BY d.task_id
)
UPDATE ar_collection_tasks t
SET
  total_amount = ts.calc_total_amount,
  bill_count = ts.calc_bill_count,
  max_overdue_days = ts.calc_max_overdue_days,
  updated_at = CURRENT_TIMESTAMP
FROM task_stats ts
WHERE t.id = ts.task_id
  AND (t.total_amount <> ts.calc_total_amount
    OR t.bill_count <> ts.calc_bill_count
    OR COALESCE(t.max_overdue_days, 0) <> ts.calc_max_overdue_days);

-- ============================================
-- Step 0.3: 恢复被级联关闭的任务
-- 若任务因所有明细被排除而关闭，且现在已有待处理明细 → 重新打开
-- ============================================
WITH reopen_tasks AS (
  SELECT DISTINCT t.id
  FROM ar_collection_tasks t
  JOIN ar_collection_details d ON d.task_id = t.id
  WHERE t.status = 'closed'
    AND d.status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM ar_collection_details d2
      WHERE d2.task_id = t.id AND d2.status = 'hoard_excluded'
    )
)
UPDATE ar_collection_tasks t
SET
  status = 'collecting',
  updated_at = CURRENT_TIMESTAMP
FROM reopen_tasks rt
WHERE t.id = rt.id;

-- ============================================
-- Step 0.4: 撤销 hold_order 类型的 OA 审批实例
-- 将所有已批准的压单审批变更为已撤回状态
-- 对应 TS 常量: form_type code='customer_credit' (customer-credit.ts)
-- ============================================
UPDATE oa_approval_instances
SET status = 'withdrawn',
    updated_at = CURRENT_TIMESTAMP
WHERE form_type_id = (SELECT id FROM oa_form_types WHERE code = 'customer_credit')
  AND status = 'approved'
  AND form_data @> '{"creditType": "hold_order"}'
  AND EXISTS (
    SELECT 1 FROM oa_approval_nodes n
    WHERE n.instance_id = oa_approval_instances.id
  );

-- 同时撤回仍在审批流程中的压单申请
UPDATE oa_approval_instances
SET status = 'withdrawn',
    updated_at = CURRENT_TIMESTAMP
WHERE form_type_id = (SELECT id FROM oa_form_types WHERE code = 'customer_credit')
  AND status = 'pending'
  AND form_data @> '{"creditType": "hold_order"}';

-- 将相关审批节点标记为 cancelled
UPDATE oa_approval_nodes n
SET status = 'cancelled',
    updated_at = CURRENT_TIMESTAMP
FROM oa_approval_instances i
WHERE n.instance_id = i.id
  AND i.form_type_id = (SELECT id FROM oa_form_types WHERE code = 'customer_credit')
  AND i.form_data @> '{"creditType": "hold_order"}'
  AND i.status = 'withdrawn'
  AND n.status IN ('pending', 'active');

-- ============================================
-- Step 0.5: 插入操作日志（审计追踪）
-- ============================================
INSERT INTO ar_collection_actions (task_id, detail_ids, action_type, action_result, remark, operator_id, operator_name, operator_role, created_at)
SELECT
  d.task_id,
  ARRAY_AGG(d.id),
  'hoard_excluded',
  'success',
  '历史压单标记清理：所有HOARD标记已清除，任务指标已重算。等待按新规则重新申请压单。',
  NULL,
  'SYSTEM',
  'admin',
  CURRENT_TIMESTAMP
FROM ar_collection_details d
-- 依赖 Step 0.1 写入的 remark 文本，不可修改此匹配字符串
WHERE d.remark LIKE '%压单标记已清理%'
GROUP BY d.task_id;

-- ============================================
-- Step 1: 新增 hold 字段
-- ============================================

ALTER TABLE ar_collection_details ADD COLUMN IF NOT EXISTS hold_type VARCHAR(20);
ALTER TABLE ar_collection_details ADD COLUMN IF NOT EXISTS hold_days INTEGER;
ALTER TABLE ar_collection_details ADD COLUMN IF NOT EXISTS hold_until DATE;

-- 部分索引：支持定时任务高效扫描到期压单
-- hold_type='time_limited' 对应 TS 常量 AR_HOLD_TYPE_TIME_LIMITED (constants.ts)
CREATE INDEX IF NOT EXISTS idx_details_hold_until
  ON ar_collection_details(hold_until, status)
  WHERE hold_type = 'time_limited' AND hoard_tag = 'HOARD' AND status = 'hoard_excluded';

COMMENT ON COLUMN ar_collection_details.hold_type IS '压单类型: long_term=长期压单, time_limited=期限压单';
COMMENT ON COLUMN ar_collection_details.hold_days IS '期限压单天数（仅 time_limited 有效）';
COMMENT ON COLUMN ar_collection_details.hold_until IS '期限压单到期日（审批日期 + hold_days）';

-- ============================================
-- Step 2: 同步更新 oa_form_types 的 form_schema 和 version
-- 在 hoardSettlementOrders 后新增 hoardType 和 holdDays 字段
-- ============================================
UPDATE oa_form_types
SET version = 4,
    form_schema = '{"fields":[{"key":"customer","label":"客户","type":"erp_customer","required":true,"searchApi":"erp_customers","nameField":"customerName","autoFill":{"contactName":"contactName","contactTel":"contactTel","customerName":"name"}},{"key":"contactName","label":"联系人","type":"text","required":false,"disabled":true},{"key":"contactTel","label":"联系电话","type":"text","required":false,"disabled":true},{"key":"creditType","label":"授信类型","type":"select","required":true,"options":[{"value":"payment_period","label":"账期"},{"value":"rolling_order","label":"滚单"},{"value":"hold_order","label":"压单"}]},{"key":"maxOverdueDays","label":"最大欠款天数","type":"number","required":true,"min":1,"suffix":"天","visibleWhen":{"field":"creditType","operator":"==","value":"payment_period"},"requiredWhen":{"field":"creditType","operator":"==","value":"payment_period"}},{"key":"rollingMaxOverdueDays","label":"最大欠款天数","type":"number","required":true,"min":1,"suffix":"天","visibleWhen":{"field":"creditType","operator":"==","value":"rolling_order"},"requiredWhen":{"field":"creditType","operator":"==","value":"rolling_order"}},{"key":"rollingMaxOverdueOrders","label":"最大欠款单数","type":"number","required":true,"min":1,"suffix":"单","visibleWhen":{"field":"creditType","operator":"==","value":"rolling_order"},"requiredWhen":{"field":"creditType","operator":"==","value":"rolling_order"}},{"key":"holdSettlementOrders","label":"选择压单结算单","type":"erp_settlement_order","required":true,"searchApi":"erp_settlement_orders","multiple":true,"cascadeFrom":"customer","nameField":"holdSettlementOrderNames","visibleWhen":{"field":"creditType","operator":"==","value":"hold_order"},"requiredWhen":{"field":"creditType","operator":"==","value":"hold_order"}},{"key":"hoardType","label":"压单类型","type":"select","required":false,"defaultValue":"long_term","options":[{"value":"long_term","label":"长期压单"},{"value":"time_limited","label":"期限压单"}],"visibleWhen":{"field":"creditType","operator":"==","value":"hold_order"},"requiredWhen":{"field":"creditType","operator":"==","value":"hold_order"}},{"key":"holdDays","label":"压单天数","type":"number","required":false,"min":1,"suffix":"天","visibleWhen":{"field":"hoardType","operator":"==","value":"time_limited"},"requiredWhen":{"field":"hoardType","operator":"==","value":"time_limited"}},{"key":"businessLicensePhotos","label":"客户营业执照","type":"photo","required":false,"requiredWhen":{"field":"_hasExistingLicense","operator":"==","value":"no"},"maxCount":3},{"key":"remark","label":"备注","type":"textarea","required":false,"maxLength":500},{"key":"_customerName","label":"客户名称","type":"text","required":false},{"key":"_holdSettlementOrderNames","label":"压单结算单名称","type":"text","required":false}]}'
WHERE code = 'customer_credit';
