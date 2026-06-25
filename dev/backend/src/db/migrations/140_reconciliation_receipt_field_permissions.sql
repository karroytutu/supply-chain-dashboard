-- 140: 应收对账表单新增"对账回单"字段权限配置
-- 对账回单（reconciliationReceipt）：节点6提交对账结果时可编辑，节点7/8只读，其余隐藏
-- 条件显示逻辑由表单 formSchema 的 visibleWhen/requiredWhen 控制

BEGIN;

UPDATE oa_form_types
SET field_permissions = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                field_permissions,
                '{nodes,0,reconciliationReceipt}', '"hidden"'
              ),
              '{nodes,2,reconciliationReceipt}', '"hidden"'
            ),
            '{nodes,3,reconciliationReceipt}', '"hidden"'
          ),
          '{nodes,4,reconciliationReceipt}', '"hidden"'
        ),
        '{nodes,5,reconciliationReceipt}', '"hidden"'
      ),
      '{nodes,6,reconciliationReceipt}', '"editable"'
    ),
    '{nodes,7,reconciliationReceipt}', '"readonly"'
  ),
  '{nodes,8,reconciliationReceipt}', '"readonly"'
)
WHERE code = 'customer_reconciliation';

COMMIT;
