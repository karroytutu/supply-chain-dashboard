-- 132: modal_select 控件自动持久化架构迁移
-- 将旧的 detailsField / 手动快照数据迁移到统一的 _details 容器格式
--
-- 旧模式：每个 modal_select 字段手动配 detailsField + beforeSubmit 快照
-- 新模式：控件自动将选中记录存入 formData._details[field.key]
--
-- 迁移范围：
-- 1. purchase_payment 实例：_debtDetails (JSONB array) → _details.debtIds
-- 2. customer_credit 实例：_holdSettlementOrderDetails (JSON string) → _details.holdSettlementOrders
-- 3. 清理旧 key

-- 1. purchase_payment: _debtDetails → _details.debtIds
-- _debtDetails 是 JSONB 数组，直接移入 _details.debtIds
UPDATE oa_approval_instances
SET form_data = jsonb_set(
  form_data,
  '{_details}',
  COALESCE(form_data->'_details', '{}'::jsonb) || jsonb_build_object('debtIds', form_data->'_debtDetails')
)
WHERE form_data ? '_debtDetails'
  AND form_data->'_debtDetails' IS NOT NULL
  AND jsonb_typeof(form_data->'_debtDetails') = 'array';

-- 2. customer_credit: _holdSettlementOrderDetails (JSON 字符串) → _details.holdSettlementOrders
-- 旧格式是 JSON.stringify 后的字符串（jsonb_typeof = 'string'），需先解析为数组
UPDATE oa_approval_instances
SET form_data = jsonb_set(
  form_data,
  '{_details}',
  COALESCE(form_data->'_details', '{}'::jsonb) || jsonb_build_object(
    'holdSettlementOrders',
    CASE
      WHEN jsonb_typeof(form_data->'_holdSettlementOrderDetails') = 'string'
      THEN (form_data->>'_holdSettlementOrderDetails')::jsonb
      ELSE form_data->'_holdSettlementOrderDetails'
    END
  )
)
WHERE form_data ? '_holdSettlementOrderDetails'
  AND form_data->'_holdSettlementOrderDetails' IS NOT NULL;

-- 3. 清理旧 key（保持 formData 整洁）
UPDATE oa_approval_instances
SET form_data = form_data - '_debtDetails' - '_holdSettlementOrderDetails' - '_holdSettlementOrderNames'
WHERE form_data ?| ARRAY['_debtDetails', '_holdSettlementOrderDetails', '_holdSettlementOrderNames'];
