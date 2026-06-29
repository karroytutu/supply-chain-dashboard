-- =====================================================
-- 156: 采购付款申请单新增字段权限
--
-- 新增字段：
-- supplierConfirmUrls: 供应商确认截图（发起可编辑，后续只读）
-- usePrepayWriteOff: 是否使用预付款核销（发起可编辑，后续只读）
-- prepaymentIds: 预付款单选择（发起可编辑，后续只读）
-- paymentLines: 银行转账明细（出纳支付环节填写）
-- 节点 0-2(发起/财务/总经理)：hidden（出纳专属字段）
-- 节点 3(出纳支付)：editable
-- 节点 4(ERP自动操作)：readonly
--
-- 节点：0=发起, 1=财务审批, 2=总经理审批, 3=出纳支付, 4=ERP自动操作
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
                jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(
                        jsonb_set(
                          jsonb_set(
                            jsonb_set(
                              jsonb_set(
                                jsonb_set(
                                  jsonb_set(
                                    jsonb_set(
                                      jsonb_set(
                                        jsonb_set(
                                          field_permissions,
                                            '{nodes,0,supplierConfirmUrls}', '"editable"'
                                          ),
                                          '{nodes,1,supplierConfirmUrls}', '"readonly"'
                                        ),
                                        '{nodes,2,supplierConfirmUrls}', '"readonly"'
                                      ),
                                      '{nodes,3,supplierConfirmUrls}', '"readonly"'
                                    ),
                                    '{nodes,4,supplierConfirmUrls}', '"readonly"'
                                  ),
                                  '{nodes,0,usePrepayWriteOff}', '"editable"'
                                ),
                                '{nodes,1,usePrepayWriteOff}', '"readonly"'
                              ),
                              '{nodes,2,usePrepayWriteOff}', '"readonly"'
                            ),
                            '{nodes,3,usePrepayWriteOff}', '"readonly"'
                          ),
                          '{nodes,4,usePrepayWriteOff}', '"readonly"'
                        ),
                        '{nodes,0,prepaymentIds}', '"editable"'
                      ),
                      '{nodes,1,prepaymentIds}', '"readonly"'
                    ),
                    '{nodes,2,prepaymentIds}', '"readonly"'
                  ),
                  '{nodes,3,prepaymentIds}', '"readonly"'
                ),
                '{nodes,4,prepaymentIds}', '"readonly"'
              ),
              '{nodes,0,paymentLines}', '"hidden"'
            ),
            '{nodes,1,paymentLines}', '"hidden"'
          ),
          '{nodes,2,paymentLines}', '"hidden"'
        ),
        '{nodes,3,paymentLines}', '"editable"'
      ),
      '{nodes,4,paymentLines}', '"readonly"'
    )
WHERE code = 'purchase_payment';
