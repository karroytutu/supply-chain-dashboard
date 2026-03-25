-- 性能优化索引 - 供应链仪表盘
-- 数据库: xinshutong (业务数据库)
-- 创建时间: 2024-03-25
-- 说明: 为仪表盘查询性能优化添加关键索引

-- ============================================
-- 1. 销售结算明细表索引 (日均销售计算)
-- ============================================
-- settleTime 索引用于时间范围查询
CREATE INDEX IF NOT EXISTS idx_销售结算明细表_settleTime
ON "销售结算明细表"("settleTime" DESC);

-- goodsName 索引用于商品名称关联
CREATE INDEX IF NOT EXISTS idx_销售结算明细表_goodsName
ON "销售结算明细表"("goodsName");

-- 复合索引用于商品名称+时间范围的组合查询
CREATE INDEX IF NOT EXISTS idx_销售结算明细表_goodsName_settleTime
ON "销售结算明细表"("goodsName", "settleTime" DESC);

-- ============================================
-- 2. 实时库存表索引
-- ============================================
-- goodsId 索引用于商品ID关联（最重要）
CREATE INDEX IF NOT EXISTS idx_实时库存表_goodsId
ON "实时库存表"("goodsId");

-- goodsName 索引用于商品名称关联
CREATE INDEX IF NOT EXISTS idx_实时库存表_goodsName
ON "实时库存表"("goodsName");

-- 部分索引：只索引有库存的商品（减少索引大小）
CREATE INDEX IF NOT EXISTS idx_实时库存表_goodsId_available
ON "实时库存表"("goodsId")
WHERE "availableBaseQuantity" > 0;

-- ============================================
-- 3. 商品档案索引
-- ============================================
-- state 索引用于状态过滤（启用/禁用）
CREATE INDEX IF NOT EXISTS idx_商品档案_state
ON "商品档案"("state");

-- categoryChainName 索引用于品类路径查询
CREATE INDEX IF NOT EXISTS idx_商品档案_categoryChainName
ON "商品档案"("categoryChainName");

-- 部分索引：只索引启用商品（最常用的查询场景）
CREATE INDEX IF NOT EXISTS idx_商品档案_state_category
ON "商品档案"("state", "categoryChainName")
WHERE "state" = 0;

-- goodsId 索引用于商品ID关联
CREATE INDEX IF NOT EXISTS idx_商品档案_goodsId
ON "商品档案"("goodsId");

-- ============================================
-- 4. 批次库存表索引 (临期商品查询)
-- ============================================
-- goodsName 索引用于商品名称关联
CREATE INDEX IF NOT EXISTS idx_独山云仓批次库存表_goodsName
ON "独山云仓批次库存表"("goodsName");

-- 部分索引：只索引良品的临期商品
CREATE INDEX IF NOT EXISTS idx_独山云仓批次库存表_daysToExpire
ON "独山云仓批次库存表"("daysToExpire")
WHERE "qualityTypeStr" = '良品';

-- 复合索引用于临期商品查询
CREATE INDEX IF NOT EXISTS idx_独山云仓批次库存表_expire
ON "独山云仓批次库存表"("goodsName", "daysToExpire", "qualityTypeStr");

-- ============================================
-- 5. 库存成本汇总表索引 (周转计算)
-- ============================================
-- 数据月份索引用于月度数据筛选
CREATE INDEX IF NOT EXISTS idx_近2月商品库存成本汇总_数据月份
ON "近2月商品库存成本汇总"("数据月份");

-- goodsId 索引用于商品ID关联
CREATE INDEX IF NOT EXISTS idx_近2月商品库存成本汇总_goodsId
ON "近2月商品库存成本汇总"("goodsId");

-- ============================================
-- 6. 分析统计信息（帮助查询优化器）
-- ============================================
-- 创建索引后执行 ANALYZE 更新统计信息
-- 注意：这些命令需要在实际数据库中执行
-- ANALYZE "销售结算明细表";
-- ANALYZE "实时库存表";
-- ANALYZE "商品档案";
-- ANALYZE "独山云仓批次库存表";
-- ANALYZE "近2月商品库存成本汇总";
