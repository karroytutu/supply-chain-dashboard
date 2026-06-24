-- 136: 移除应收对账表单中冗余的汇总字段
-- 原因：modal_select 控件（receivableOrderIds）只读模式下已自带合计行展示，
--       totalReceivableAmount（应收总额）和 receivableOrderCount（单据数量）完全冗余
-- 操作：从 field_permissions 中移除这两个字段的权限声明

UPDATE oa_form_types
SET field_permissions = (
  field_permissions::jsonb
  #- '{nodes,0,totalReceivableAmount}'
  #- '{nodes,0,receivableOrderCount}'
  #- '{nodes,2,totalReceivableAmount}'
  #- '{nodes,2,receivableOrderCount}'
  #- '{nodes,3,totalReceivableAmount}'
  #- '{nodes,3,receivableOrderCount}'
  #- '{nodes,4,totalReceivableAmount}'
  #- '{nodes,4,receivableOrderCount}'
  #- '{nodes,5,totalReceivableAmount}'
  #- '{nodes,5,receivableOrderCount}'
  #- '{nodes,6,totalReceivableAmount}'
  #- '{nodes,6,receivableOrderCount}'
  #- '{nodes,7,totalReceivableAmount}'
  #- '{nodes,7,receivableOrderCount}'
  #- '{nodes,8,totalReceivableAmount}'
  #- '{nodes,8,receivableOrderCount}'
)
WHERE code = 'customer_reconciliation';
