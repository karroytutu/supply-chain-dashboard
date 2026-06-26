-- 148: 组合搭赠表单 - 必选列仅在任选模式下显示
-- 为主品列表的 mustSelect 子字段添加 visibleWhen: goodsType == 0（任选主品）
-- 为赠品列表的 mustSelect 子字段添加 visibleWhen: presentType == 0（任选赠品）
-- 固定模式下所有商品都是必选的，必选列无意义，因此隐藏

DO $$
DECLARE
  v_schema jsonb;
  v_field jsonb;
  v_child jsonb;
  i int;
  j int;
BEGIN
  SELECT form_schema INTO v_schema
  FROM oa_form_types
  WHERE code = 'promotion_combined_offline';

  IF v_schema IS NULL THEN
    RETURN;
  END IF;

  FOR i IN 0..jsonb_array_length(v_schema->'fields') - 1 LOOP
    v_field := v_schema->'fields'->i;

    IF v_field->>'key' = 'goodsList' AND v_field->>'type' = 'table' THEN
      FOR j IN 0..jsonb_array_length(v_field->'children') - 1 LOOP
        v_child := v_field->'children'->j;
        IF v_child->>'key' = 'mustSelect' THEN
          v_schema := jsonb_set(
            v_schema,
            ARRAY['fields', i::text, 'children', j::text, 'visibleWhen'],
            '{"field": "goodsType", "operator": "==", "value": 0}'::jsonb
          );
        END IF;
      END LOOP;
    END IF;

    IF v_field->>'key' = 'presentList' AND v_field->>'type' = 'table' THEN
      FOR j IN 0..jsonb_array_length(v_field->'children') - 1 LOOP
        v_child := v_field->'children'->j;
        IF v_child->>'key' = 'mustSelect' THEN
          v_schema := jsonb_set(
            v_schema,
            ARRAY['fields', i::text, 'children', j::text, 'visibleWhen'],
            '{"field": "presentType", "operator": "==", "value": 0}'::jsonb
          );
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  UPDATE oa_form_types
  SET form_schema = v_schema, updated_at = NOW()
  WHERE code = 'promotion_combined_offline';
END $$;
