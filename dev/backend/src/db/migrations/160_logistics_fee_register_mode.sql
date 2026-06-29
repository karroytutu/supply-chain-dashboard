-- 160: 物流装卸费用申请新增登记模式
-- paymentMode 字段权限已固化到代码中 (logistics-fee.ts)
-- 仅需更新版本号以触发前端缓存刷新
UPDATE oa_form_types SET version = 4 WHERE code = 'logistics_fee';
-- 160: 物流装卸费用申请新增登记模式
-- 新增 paymentMode 字段权限 + 更新版本号
-- form_schema 和 workflow_def 的权威定义在代码中 (logistics-fee.ts)
-- =====================================================

BEGIN;

-- 更新 field_permissions：为所有节点添加 paymentMode 字段权限
UPDATE oa_form_types SET field_permissions = '{
  "nodes": {
    "0": {
      "feeSupplierId": "editable",
      "settlementIds": "editable",
      "feeType": "editable",
      "feeLines": "editable",
      "feeLines.billOrderStr": "readonly",
      "feeLines.goodsName": "readonly",
      "feeLines.quantity": "readonly",
      "feeLines.currUnitName": "readonly",
      "feeLines.settleAmount": "readonly",
      "feeLines.feeUnitPrice": "editable",
      "feeLines.feeAmount": "readonly",
      "feeTotalAmount": "editable",
      "attachmentUrls": "editable",
      "remark": "editable",
      "paymentMode": "editable",
      "bankAccountSelector": "editable",
      "paymentAmount": "hidden",
      "paymentSubjectId": "hidden",
      "paymentReceiptUrls": "hidden"
    },
    "1": {
      "feeSupplierId": "readonly",
      "settlementIds": "readonly",
      "feeType": "readonly",
      "feeLines": "readonly",
      "feeLines.billOrderStr": "readonly",
      "feeLines.goodsName": "readonly",
      "feeLines.quantity": "readonly",
      "feeLines.currUnitName": "readonly",
      "feeLines.settleAmount": "readonly",
      "feeLines.feeUnitPrice": "readonly",
      "feeLines.feeAmount": "readonly",
      "feeTotalAmount": "readonly",
      "attachmentUrls": "readonly",
      "remark": "readonly",
      "paymentMode": "readonly",
      "bankAccountSelector": "readonly",
      "paymentAmount": "hidden",
      "paymentSubjectId": "hidden",
      "paymentReceiptUrls": "hidden"
    },
    "2": {
      "feeSupplierId": "readonly",
      "settlementIds": "readonly",
      "feeType": "readonly",
      "feeLines": "readonly",
      "feeLines.billOrderStr": "readonly",
      "feeLines.goodsName": "readonly",
      "feeLines.quantity": "readonly",
      "feeLines.currUnitName": "readonly",
      "feeLines.settleAmount": "readonly",
      "feeLines.feeUnitPrice": "readonly",
      "feeLines.feeAmount": "readonly",
      "feeTotalAmount": "readonly",
      "attachmentUrls": "readonly",
      "remark": "readonly",
      "paymentMode": "readonly",
      "bankAccountSelector": "readonly",
      "paymentAmount": "editable",
      "paymentSubjectId": "editable",
      "paymentReceiptUrls": "editable"
    }
  }
}'::jsonb WHERE code = 'logistics_fee';

-- 更新版本号
UPDATE oa_form_types SET version = 4 WHERE code = 'logistics_fee';

COMMIT;
