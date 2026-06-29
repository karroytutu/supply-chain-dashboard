-- =====================================================
-- 154: 采购审批表单新增 isAfterSalesReturn（是否整单售后）字段权限
--
-- 背景：
-- 采购审批(procurement_order)新增"是否整单售后"选项，选"是"时跳过营销审批。
--
-- 权限：
-- 节点 0(发起)：editable
-- 节点 1-6(审批/出纳/auto/抄送)：readonly
-- =====================================================

UPDATE oa_form_types
SET field_permissions =
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                field_permissions,
                '{nodes,0,isAfterSalesReturn}', '"editable"'
              ),
              '{nodes,1,isAfterSalesReturn}', '"readonly"'
            ),
            '{nodes,2,isAfterSalesReturn}', '"readonly"'
          ),
          '{nodes,3,isAfterSalesReturn}', '"readonly"'
        ),
        '{nodes,4,isAfterSalesReturn}', '"readonly"'
      ),
      '{nodes,5,isAfterSalesReturn}', '"readonly"'
    ),
    '{nodes,6,isAfterSalesReturn}', '"readonly"'
  )
WHERE code = 'procurement_order';
