-- 085: 催收管理集成OA流程引擎
-- 新增 ar_collection 表单类型种子数据
-- form_schema 和 workflow_def 以代码定义为准（ar-collection.ts），
-- ON CONFLICT 中同步更新，确保代码变更能反映到数据库

INSERT INTO oa_form_types (code, name, icon, category, sort_order, description, form_schema, workflow_def, is_active, version)
VALUES (
  'ar_collection',
  '逾期催收',
  'AlertOutlined',
  'supply_chain',
  60,
  '逾期应收账款催收处理流程，支持核销、延期、差异、升级、发函、起诉等操作',
  '{"fields":[{"key":"consumerName","label":"客户名称","type":"text","required":false,"disabled":true},{"key":"totalAmount","label":"欠款总额","type":"money","required":false,"disabled":true,"upper":true},{"key":"billCount","label":"账单数","type":"number","required":false,"disabled":true},{"key":"maxOverdueDays","label":"最大逾期天数","type":"number","required":false,"disabled":true,"suffix":"天"},{"key":"managerName","label":"责任人","type":"text","required":false,"disabled":true},{"key":"billDetails","label":"账单明细","type":"table","required":false,"disabled":true,"tableViewMode":"table","children":[{"key":"billNo","label":"单据编号","type":"text","required":false},{"key":"billType","label":"单据类型","type":"text","required":false},{"key":"totalAmount","label":"单据金额","type":"money","required":false},{"key":"leftAmount","label":"剩余未收","type":"money","required":false},{"key":"overdueDays","label":"逾期天数","type":"number","required":false,"suffix":"天"}]},{"key":"_extensionCount","label":"延期次数","type":"number","required":false},{"key":"action","label":"催收操作","type":"select","required":true,"options":[{"value":"verify","label":"核销标记"},{"value":"extension","label":"申请延期"},{"value":"difference","label":"存在差异"},{"value":"escalate","label":"升级处理"},{"value":"resolve_diff","label":"差异解决"},{"value":"send_letter","label":"发函"},{"value":"lawsuit","label":"起诉"}]},{"key":"verifyRemark","label":"核销备注","type":"text","required":false,"visibleWhen":{"field":"action","operator":"==","value":"verify"}},{"key":"extensionDays","label":"延期天数","type":"number","required":true,"min":1,"max":30,"suffix":"天","visibleWhen":{"field":"action","operator":"==","value":"extension"}},{"key":"extensionReason","label":"延期原因","type":"textarea","required":true,"maxLength":500,"visibleWhen":{"field":"action","operator":"==","value":"extension"}},{"key":"guarantorSignature","label":"营销担保签字","type":"signature","required":true,"visibleWhen":{"field":"action","operator":"==","value":"extension"}},{"key":"differenceRemark","label":"差异说明","type":"textarea","required":true,"maxLength":1000,"visibleWhen":{"field":"action","operator":"==","value":"difference"}},{"key":"escalateReason","label":"升级原因","type":"textarea","required":true,"maxLength":500,"visibleWhen":{"field":"action","operator":"==","value":"escalate"}},{"key":"resolveDiffRemark","label":"差异解决说明","type":"textarea","required":true,"maxLength":1000,"visibleWhen":{"field":"action","operator":"==","value":"resolve_diff"}},{"key":"letterAttachment","label":"函件附件","type":"upload","required":true,"maxCount":10,"visibleWhen":{"field":"action","operator":"==","value":"send_letter"}},{"key":"deliveryProof","label":"送达凭证","type":"upload","required":true,"maxCount":10,"visibleWhen":{"field":"action","operator":"==","value":"send_letter"}}]}'::jsonb,
  '{"nodes":[{"order":1,"name":"营销师催收","type":"role","roleCode":"marketer","interactionType":"operation"},{"order":2,"name":"更新催收状态","type":"auto"}]}'::jsonb,
  true,
  1
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  icon = EXCLUDED.icon,
  category = EXCLUDED.category,
  sort_order = EXCLUDED.sort_order,
  description = EXCLUDED.description,
  form_schema = EXCLUDED.form_schema,
  workflow_def = EXCLUDED.workflow_def,
  version = EXCLUDED.version,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
