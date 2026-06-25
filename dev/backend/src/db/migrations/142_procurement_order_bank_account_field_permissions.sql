-- =====================================================
-- 142: 采购审批表单新增收款账户(bankAccountSelector)字段权限
--
-- 背景：
-- 采购审批表单(procurement_order)新增 bankAccountSelector 字段（收款账户），
-- 选择供应商后自动从 ERP 填充银行信息，由出纳在付款环节编辑。
--
-- 变更：
-- 节点 0(发起)/1-3(审批)：bankAccountSelector = hidden（出纳专属字段）
-- 节点 4(出纳付款)：bankAccountSelector = editable
-- 使用 jsonb_set 逐节点追加，不覆盖已有权限配置。
-- =====================================================

UPDATE oa_form_types
SET field_permissions =
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            field_permissions,
            '{nodes,0,bankAccountSelector}', '"hidden"'
          ),
          '{nodes,1,bankAccountSelector}', '"hidden"'
        ),
        '{nodes,2,bankAccountSelector}', '"hidden"'
      ),
      '{nodes,3,bankAccountSelector}', '"hidden"'
    ),
    '{nodes,4,bankAccountSelector}', '"editable"'
  )
WHERE code = 'procurement_order';
