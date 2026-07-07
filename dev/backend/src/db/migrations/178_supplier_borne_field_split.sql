-- 178: 供应商承担字段流程拆分 - 更新表单版本号
-- 将供应商/承担金额/收入类别从提交阶段移至采购审批节点
UPDATE oa_form_types SET version = 4
WHERE code IN ('market_expense', 'promotion_combined_offline',
               'promotion_special_offline', 'promotion_fullgift_offline');
