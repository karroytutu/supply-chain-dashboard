-- 131: 应付对账单字段权限配置
-- 表单定义见 form-types/customer-reconciliation.ts，此为 DB 唯一权限来源
-- 节点：0=发起, 2=创建对账单(auto), 3=上传PDF(auto), 4=单据准备(结算会计),
--       5=确认领出(发起人), 6=提交结果(发起人), 7=差异审核(往来会计), 8=审核对账单(auto)

UPDATE oa_form_types
SET field_permissions = '{
  "nodes": {
    "0": {
      "customerId": "editable",
      "receivableOrderIds": "editable",
      "needOriginalDocs": "editable",
      "needPrintStatement": "editable",
      "totalReceivableAmount": "readonly",
      "receivableOrderCount": "readonly",
      "pickupSignature": "hidden",
      "reconciliationResult": "hidden",
      "unreconciledOrderIds": "hidden",
      "differenceStatus": "hidden",
      "differenceReasons": "hidden",
      "differenceRemark": "hidden",
      "differenceOrderIds": "hidden"
    },
    "2": {
      "customerId": "readonly",
      "receivableOrderIds": "readonly",
      "needOriginalDocs": "readonly",
      "needPrintStatement": "readonly",
      "totalReceivableAmount": "readonly",
      "receivableOrderCount": "readonly",
      "pickupSignature": "hidden",
      "reconciliationResult": "hidden",
      "unreconciledOrderIds": "hidden",
      "differenceStatus": "hidden",
      "differenceReasons": "hidden",
      "differenceRemark": "hidden",
      "differenceOrderIds": "hidden"
    },
    "3": {
      "customerId": "readonly",
      "receivableOrderIds": "readonly",
      "needOriginalDocs": "readonly",
      "needPrintStatement": "readonly",
      "totalReceivableAmount": "readonly",
      "receivableOrderCount": "readonly",
      "pickupSignature": "hidden",
      "reconciliationResult": "hidden",
      "unreconciledOrderIds": "hidden",
      "differenceStatus": "hidden",
      "differenceReasons": "hidden",
      "differenceRemark": "hidden",
      "differenceOrderIds": "hidden"
    },
    "4": {
      "customerId": "readonly",
      "receivableOrderIds": "readonly",
      "needOriginalDocs": "readonly",
      "needPrintStatement": "readonly",
      "totalReceivableAmount": "readonly",
      "receivableOrderCount": "readonly",
      "pickupSignature": "hidden",
      "reconciliationResult": "hidden",
      "unreconciledOrderIds": "hidden",
      "differenceStatus": "hidden",
      "differenceReasons": "hidden",
      "differenceRemark": "hidden",
      "differenceOrderIds": "hidden"
    },
    "5": {
      "customerId": "readonly",
      "receivableOrderIds": "readonly",
      "needOriginalDocs": "readonly",
      "needPrintStatement": "readonly",
      "totalReceivableAmount": "readonly",
      "receivableOrderCount": "readonly",
      "pickupSignature": "editable",
      "reconciliationResult": "hidden",
      "unreconciledOrderIds": "hidden",
      "differenceStatus": "hidden",
      "differenceReasons": "hidden",
      "differenceRemark": "hidden",
      "differenceOrderIds": "hidden"
    },
    "6": {
      "customerId": "readonly",
      "receivableOrderIds": "readonly",
      "needOriginalDocs": "readonly",
      "needPrintStatement": "readonly",
      "totalReceivableAmount": "readonly",
      "receivableOrderCount": "readonly",
      "pickupSignature": "readonly",
      "reconciliationResult": "editable",
      "unreconciledOrderIds": "editable",
      "differenceStatus": "editable",
      "differenceReasons": "editable",
      "differenceRemark": "editable",
      "differenceOrderIds": "hidden"
    },
    "7": {
      "customerId": "readonly",
      "receivableOrderIds": "readonly",
      "needOriginalDocs": "readonly",
      "needPrintStatement": "readonly",
      "totalReceivableAmount": "readonly",
      "receivableOrderCount": "readonly",
      "pickupSignature": "readonly",
      "reconciliationResult": "readonly",
      "unreconciledOrderIds": "readonly",
      "differenceStatus": "readonly",
      "differenceReasons": "readonly",
      "differenceRemark": "readonly",
      "differenceOrderIds": "editable"
    },
    "8": {
      "customerId": "readonly",
      "receivableOrderIds": "readonly",
      "needOriginalDocs": "readonly",
      "needPrintStatement": "readonly",
      "totalReceivableAmount": "readonly",
      "receivableOrderCount": "readonly",
      "pickupSignature": "readonly",
      "reconciliationResult": "readonly",
      "unreconciledOrderIds": "readonly",
      "differenceStatus": "readonly",
      "differenceReasons": "readonly",
      "differenceRemark": "readonly",
      "differenceOrderIds": "readonly"
    }
  }
}'::jsonb
WHERE code = 'customer_reconciliation';
