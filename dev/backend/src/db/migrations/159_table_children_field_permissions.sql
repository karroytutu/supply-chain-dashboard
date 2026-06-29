-- =====================================================
-- 159: 补充 modal_select→table 迁移后的字段权限
--
-- 6 个表单的字段从 modal_select 改为 table 后新增了 children 子字段，
-- 需要在已有的 field_permissions 中为每个节点补充子字段的 readonly 权限。
-- 仅更新 field_permissions IS NOT NULL 的行（未配置的不受影响）。
-- =====================================================

-- customer_credit: holdSettlementOrders 新增 3 个子字段
UPDATE oa_form_types
SET field_permissions = jsonb_set(
  jsonb_set(
    jsonb_set(field_permissions,
      '{nodes,0}', COALESCE(field_permissions->'nodes'->'0', '{}'::jsonb) ||
        '{"holdSettlementOrders.workTime":"readonly","holdSettlementOrders.bizStr":"readonly","holdSettlementOrders.leftAmount":"readonly"}'::jsonb),
    '{nodes,1}', COALESCE(field_permissions->'nodes'->'1', '{}'::jsonb) ||
      '{"holdSettlementOrders.workTime":"readonly","holdSettlementOrders.bizStr":"readonly","holdSettlementOrders.leftAmount":"readonly"}'::jsonb),
  '{nodes,2}', COALESCE(field_permissions->'nodes'->'2', '{}'::jsonb) ||
    '{"holdSettlementOrders.workTime":"readonly","holdSettlementOrders.bizStr":"readonly","holdSettlementOrders.leftAmount":"readonly"}'::jsonb)
WHERE code = 'customer_credit' AND field_permissions IS NOT NULL;

-- customer_reconciliation: 3 个 table 字段共 16 个子字段
DO $$
DECLARE
  child_fields jsonb := '{"receivableOrderIds.workTime":"readonly","receivableOrderIds.bizOrderStr":"readonly","receivableOrderIds.billTypeName":"readonly","receivableOrderIds.totalAmount":"readonly","receivableOrderIds.leftAmount":"readonly","receivableOrderIds.bizOrderNote":"readonly","unreconciledOrderIds.workTime":"readonly","unreconciledOrderIds.bizOrderStr":"readonly","unreconciledOrderIds.billTypeName":"readonly","unreconciledOrderIds.totalAmount":"readonly","unreconciledOrderIds.leftAmount":"readonly","differenceOrderIds.workTime":"readonly","differenceOrderIds.bizOrderStr":"readonly","differenceOrderIds.billTypeName":"readonly","differenceOrderIds.totalAmount":"readonly","differenceOrderIds.leftAmount":"readonly"}'::jsonb;
  fp jsonb;
  node_key text;
BEGIN
  SELECT field_permissions INTO fp FROM oa_form_types
    WHERE code = 'customer_reconciliation' AND field_permissions IS NOT NULL;
  IF fp IS NULL THEN RETURN; END IF;
  FOR node_key IN SELECT jsonb_object_keys(fp->'nodes') LOOP
    fp := jsonb_set(fp, ARRAY['nodes', node_key],
      COALESCE(fp->'nodes'->node_key, '{}'::jsonb) || child_fields);
  END LOOP;
  UPDATE oa_form_types SET field_permissions = fp
    WHERE code = 'customer_reconciliation' AND field_permissions IS NOT NULL;
END $$;

-- logistics_fee: 2 个 table 字段共 12 个子字段
DO $$
DECLARE
  child_fields jsonb := '{"settlementIds.workTime":"readonly","settlementIds.bizStr":"readonly","settlementIds.supplierName":"readonly","settlementIds.settleAmount":"readonly","settlementIds.warehouseName":"readonly","feeLines.billOrderStr":"readonly","feeLines.goodsName":"readonly","feeLines.quantity":"readonly","feeLines.currUnitName":"readonly","feeLines.settleAmount":"readonly","feeLines.feeUnitPrice":"readonly","feeLines.feeAmount":"readonly"}'::jsonb;
  fp jsonb;
  node_key text;
BEGIN
  SELECT field_permissions INTO fp FROM oa_form_types
    WHERE code = 'logistics_fee' AND field_permissions IS NOT NULL;
  IF fp IS NULL THEN RETURN; END IF;
  FOR node_key IN SELECT jsonb_object_keys(fp->'nodes') LOOP
    fp := jsonb_set(fp, ARRAY['nodes', node_key],
      COALESCE(fp->'nodes'->node_key, '{}'::jsonb) || child_fields);
  END LOOP;
  UPDATE oa_form_types SET field_permissions = fp
    WHERE code = 'logistics_fee' AND field_permissions IS NOT NULL;
END $$;

-- promotion_combined_offline: 3 个 table 字段共 11 个子字段
DO $$
DECLARE
  child_fields jsonb := '{"clientIdList.name":"readonly","clientIdList.consumerCode":"readonly","goodsList.goodsId":"readonly","goodsList.currUnitName":"readonly","goodsList.onSalePrice":"readonly","goodsList.quantity":"readonly","goodsList.mustSelect":"readonly","presentList.goodsId":"readonly","presentList.currUnitName":"readonly","presentList.quantity":"readonly","presentList.mustSelect":"readonly"}'::jsonb;
  fp jsonb;
  node_key text;
BEGIN
  SELECT field_permissions INTO fp FROM oa_form_types
    WHERE code = 'promotion_combined_offline' AND field_permissions IS NOT NULL;
  IF fp IS NULL THEN RETURN; END IF;
  FOR node_key IN SELECT jsonb_object_keys(fp->'nodes') LOOP
    fp := jsonb_set(fp, ARRAY['nodes', node_key],
      COALESCE(fp->'nodes'->node_key, '{}'::jsonb) || child_fields);
  END LOOP;
  UPDATE oa_form_types SET field_permissions = fp
    WHERE code = 'promotion_combined_offline' AND field_permissions IS NOT NULL;
END $$;

-- promotion_fullgift_offline: 5 个 table 字段共 22 个子字段
DO $$
DECLARE
  child_fields jsonb := '{"clientIdList.name":"readonly","clientIdList.consumerCode":"readonly","mainGoodsList.goodsId":"readonly","mainGoodsList.currUnitName":"readonly","mainGoodsList.onSalePrice":"readonly","mainGoodsList.startingQuantity":"readonly","mainGoodsList.purchaseLimits":"readonly","mainGoodsList.activeStock":"readonly","mainGoodsList.mustSelect":"readonly","loopPresents.goodsId":"readonly","loopPresents.currUnitName":"readonly","loopPresents.quantity":"readonly","loopPresents.mustSelect":"readonly","stepRules.seq":"readonly","stepRules.countLatch":"readonly","stepRules.giveType":"readonly","stepRules.giveCount":"readonly","stepPresents.seq":"readonly","stepPresents.goodsId":"readonly","stepPresents.currUnitName":"readonly","stepPresents.quantity":"readonly","stepPresents.mustSelect":"readonly"}'::jsonb;
  fp jsonb;
  node_key text;
BEGIN
  SELECT field_permissions INTO fp FROM oa_form_types
    WHERE code = 'promotion_fullgift_offline' AND field_permissions IS NOT NULL;
  IF fp IS NULL THEN RETURN; END IF;
  FOR node_key IN SELECT jsonb_object_keys(fp->'nodes') LOOP
    fp := jsonb_set(fp, ARRAY['nodes', node_key],
      COALESCE(fp->'nodes'->node_key, '{}'::jsonb) || child_fields);
  END LOOP;
  UPDATE oa_form_types SET field_permissions = fp
    WHERE code = 'promotion_fullgift_offline' AND field_permissions IS NOT NULL;
END $$;

-- promotion_special_offline: 2 个 table 字段共 15 个子字段
DO $$
DECLARE
  child_fields jsonb := '{"clientIdList.name":"readonly","clientIdList.consumerCode":"readonly","goodsList.goodsId":"readonly","goodsList.currUnitName":"readonly","goodsList.qualifiedNum":"readonly","goodsList.onSalePrice":"readonly","goodsList.onSalePriceMin":"readonly","goodsList.activeStock":"readonly","goodsList.nearExpiryDays1":"readonly","goodsList.nearExpiryPrice1":"readonly","goodsList.nearExpiryDays2":"readonly","goodsList.nearExpiryPrice2":"readonly","goodsList.nearExpiryDays3":"readonly","goodsList.nearExpiryPrice3":"readonly"}'::jsonb;
  fp jsonb;
  node_key text;
BEGIN
  SELECT field_permissions INTO fp FROM oa_form_types
    WHERE code = 'promotion_special_offline' AND field_permissions IS NOT NULL;
  IF fp IS NULL THEN RETURN; END IF;
  FOR node_key IN SELECT jsonb_object_keys(fp->'nodes') LOOP
    fp := jsonb_set(fp, ARRAY['nodes', node_key],
      COALESCE(fp->'nodes'->node_key, '{}'::jsonb) || child_fields);
  END LOOP;
  UPDATE oa_form_types SET field_permissions = fp
    WHERE code = 'promotion_special_offline' AND field_permissions IS NOT NULL;
END $$;
