-- 129: 采购付款申请单字段权限配置
-- 表单定义见 form-types/purchase-payment.ts，此为 DB 唯一权限来源
-- 节点：0=发起, 1=财务审批, 2=总经理审批(条件>5万), 3=出纳支付, 4=ERP自动操作

UPDATE oa_form_types
SET field_permissions = '{
  "nodes": {
    "0": {
      "supplierId": "editable",
      "paymentType": "editable",
      "debtIds": "editable",
      "totalPayableAmount": "editable",
      "discountAmount": "editable",
      "paymentAmount": "editable",
      "prepayAmount": "editable",
      "bankAccountSelector": "editable",
      "remark": "editable",
      "paymentSubjectId": "hidden",
      "actualAmount": "hidden",
      "receiptUrls": "hidden",
      "erpBillStr": "hidden"
    },
    "1": {
      "supplierId": "readonly",
      "paymentType": "readonly",
      "debtIds": "readonly",
      "totalPayableAmount": "readonly",
      "discountAmount": "readonly",
      "paymentAmount": "readonly",
      "prepayAmount": "readonly",
      "bankAccountSelector": "readonly",
      "remark": "readonly",
      "paymentSubjectId": "hidden",
      "actualAmount": "hidden",
      "receiptUrls": "hidden",
      "erpBillStr": "hidden"
    },
    "2": {
      "supplierId": "readonly",
      "paymentType": "readonly",
      "debtIds": "readonly",
      "totalPayableAmount": "readonly",
      "discountAmount": "readonly",
      "paymentAmount": "readonly",
      "prepayAmount": "readonly",
      "bankAccountSelector": "readonly",
      "remark": "readonly",
      "paymentSubjectId": "hidden",
      "actualAmount": "hidden",
      "receiptUrls": "hidden",
      "erpBillStr": "hidden"
    },
    "3": {
      "supplierId": "readonly",
      "paymentType": "readonly",
      "debtIds": "readonly",
      "totalPayableAmount": "readonly",
      "discountAmount": "readonly",
      "paymentAmount": "readonly",
      "prepayAmount": "readonly",
      "bankAccountSelector": "readonly",
      "remark": "readonly",
      "paymentSubjectId": "editable",
      "actualAmount": "editable",
      "receiptUrls": "editable",
      "erpBillStr": "hidden"
    },
    "4": {
      "supplierId": "readonly",
      "paymentType": "readonly",
      "debtIds": "readonly",
      "totalPayableAmount": "readonly",
      "discountAmount": "readonly",
      "paymentAmount": "readonly",
      "prepayAmount": "readonly",
      "bankAccountSelector": "readonly",
      "remark": "readonly",
      "paymentSubjectId": "readonly",
      "actualAmount": "readonly",
      "receiptUrls": "readonly",
      "erpBillStr": "readonly"
    }
  }
}'::jsonb
WHERE code = 'purchase_payment';
