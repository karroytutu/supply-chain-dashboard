-- =====================================================
-- 迁移 095: 数据修复 — 催收升级节点缺失 & ERP 状态标记不一致
--
-- 背景：recoverStuckAutoNodes 误检导致 auto 节点在营销师审批前被提前执行，
--   此时 formData.action 为 undefined，回调空跑后 auto 节点被错误标记 approved，
--   导致后续营销师审批时系统认为所有步骤已完成，升级节点被跳过。
--
-- 修复内容：
--   7a. 为 6 张催收单补插缺失的「营销经理催收」升级节点，回退到等待审批状态
--   7b. 修复 12 张审批单的 erp_meta.status 不一致（approved 但 erp_meta=processing）
-- =====================================================

-- =====================================================
-- 7a. 为 6 张催收单补插缺失的升级节点
-- =====================================================

-- 修复目标状态：
--   节点1: 营销师催收 (role/marketer, approved) — 不变
--   节点2: 营销经理催收 (role/marketing_manager, pending) — 新插入
--   节点3: 更新催收状态 (auto, approved) — 从节点2移到节点3
--   实例: status=pending, current_node_order=2

-- 通用修复函数：对单个实例执行
DO $$
DECLARE
  v_instance_ids INTEGER[] := ARRAY[765, 770, 771, 809, 863, 864];
  v_instance_id INTEGER;
BEGIN
  FOREACH v_instance_id IN ARRAY v_instance_ids
  LOOP
    -- 幂等性检查：如果位置2已有"营销经理催收"节点，说明该实例已修复
    IF EXISTS (
      SELECT 1 FROM oa_approval_nodes
      WHERE instance_id = v_instance_id
        AND node_order = 2
        AND node_name = '营销经理催收'
    ) THEN
      RAISE NOTICE '实例 % 已修复，跳过', v_instance_id;
      CONTINUE;
    END IF;

    -- Step 1: 将自动步骤从位置2移到位置3
    UPDATE oa_approval_nodes
    SET node_order = 3, updated_at = NOW()
    WHERE instance_id = v_instance_id
      AND node_order = 2
      AND node_type = 'auto';

    -- Step 2: 在位置2插入升级节点
    INSERT INTO oa_approval_nodes
      (instance_id, node_order, node_name, node_type, role_code, status)
    VALUES
      (v_instance_id, 2, '营销经理催收', 'role', 'marketing_manager', 'pending');

    -- Step 3: 回退实例状态
    UPDATE oa_approval_instances
    SET status = 'pending',
        current_node_order = 2,
        completed_at = NULL,
        erp_meta = jsonb_set(COALESCE(erp_meta, '{}'), '{status}', '"completed"'),
        updated_at = NOW()
    WHERE id = v_instance_id;

    -- Step 4: 插入修复操作记录
    INSERT INTO oa_approval_actions
      (instance_id, action_type, operator_name, comment)
    VALUES
      (v_instance_id, 'resubmit', '系统',
       '数据修复(095): 补插升级节点，回退到等待营销经理审批状态');

    RAISE NOTICE '修复实例 % 完成', v_instance_id;
  END LOOP;
END $$;

-- =====================================================
-- 7b. 修复 erp_meta.status 不一致的审批单
-- 注意：7a 修复的 6 张单在修复后 status 变为 pending，不会被此 SQL 命中
-- =====================================================

UPDATE oa_approval_instances
SET erp_meta = jsonb_set(COALESCE(erp_meta, '{}'), '{status}', '"completed"'),
    updated_at = NOW()
WHERE status = 'approved'
  AND erp_meta->>'status' = 'processing';
