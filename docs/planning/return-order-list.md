# 退货单列表页 UI/UX 优化计划

## Context

用户希望全面优化前端退货单列表页的UI/UX，解决以下核心问题：
- **信息密度过高**：表格11列信息拥挤，关键信息不突出
- **筛选方式分散**：统计卡片和下拉框两处筛选状态容易混乱
- **操作入口不直观**：不同状态的操作入口不一致，用户需要逐行查看
- **移动端体验差**：小屏幕时表格水平滚动体验差

**注意**：当前在 `feature/current-stock-field` 分支，需要先切换到 main 并创建新功能分支 `feature/return-order-list-ui-ux`。

---

## Implementation Steps

### Step 1: 创建功能分支

```bash
git stash  # 暂存当前修改
git checkout main
git pull origin main
git checkout -b feature/return-order-list-ui-ux
```

### Step 2: 统一筛选交互（移除状态下拉框）

**修改文件**: `dev/frontend/src/pages/ProcurementReturn/Orders/index.tsx`

- 移除工具栏中的状态下拉框 Select 组件（第173-180行）
- 保持统计卡片作为唯一的状态筛选入口
- 删除 `statusOptions` 常量（第21-29行，已无使用）

### Step 3: 增强统计卡片选中态视觉

**修改文件**: `dev/frontend/src/pages/ProcurementReturn/Orders/components/ReturnOrderStats.tsx`

- 添加选中状态的背景色高亮效果
- 添加底部选中指示条
- 优化 hover 效果

**修改文件**: `dev/frontend/src/pages/ProcurementReturn/Orders/index.less`

- 添加 `.statsCardActive` 样式类
- 添加过渡动画效果

### Step 4: 精简表格列 + 添加展开详情

**修改文件**: `dev/frontend/src/pages/ProcurementReturn/Orders/components/ReturnOrderTable.tsx`

1. **精简主表列（从11列减少到7列）**：
   - 退货单号（固定左侧，140px）
   - 商品名称（自适应，ellipsis省略）
   - 数量（80px）
   - 当前库存（90px）
   - 当前剩余保质期（110px，带颜色预警）
   - 当前节点（100px，状态标签）
   - 操作（120px，固定右侧）

2. **移除的列**（移至展开详情）：
   - 生产日期
   - 退货时间
   - 退货时保质期
   - 责任人

3. **添加展开行配置**：
   - 使用 Table 的 `expandable` 配置
   - 展开面板显示移除的列信息

**新建文件**: `dev/frontend/src/pages/ProcurementReturn/Orders/components/ExpandedDetail.tsx`

- 展开详情面板组件（约50行）
- 显示：生产日期、退货时间、退货时保质期、责任人、ERP退货单号

### Step 5: 移动端卡片视图适配

**新建文件**: `dev/frontend/src/pages/ProcurementReturn/Orders/hooks/useMobileDetect.ts`

- 移动端检测 Hook（约20行）
- 断点：768px

**新建文件**: `dev/frontend/src/pages/ProcurementReturn/Orders/components/ReturnOrderCard.tsx`

- 移动端卡片组件（约100行）
- 卡片布局展示关键信息
- 操作按钮底部固定，触摸友好（高度44px）

**修改文件**: `dev/frontend/src/pages/ProcurementReturn/Orders/components/ReturnOrderTable.tsx`

- 添加移动端判断逻辑
- 768px以下切换为卡片列表视图

**修改文件**: `dev/frontend/src/pages/ProcurementReturn/Orders/index.less`

- 添加移动端卡片样式
- 添加统计卡片横向滚动样式
- 添加触摸友好的按钮样式

### Step 6: 操作引导组件（可选增强）

**新建文件**: `dev/frontend/src/pages/ProcurementReturn/Orders/components/OperationGuide.tsx`

- 根据当前筛选状态显示对应的批量操作入口
- 待确认状态：批量确认可退货 / 批量确认不可退货
- 待填ERP状态：批量填写ERP / 批量回退

**修改文件**: `dev/frontend/src/pages/ProcurementReturn/Orders/index.tsx`

- 在批量操作栏上方添加 OperationGuide 组件

---

## Files to Modify

| 文件路径 | 操作 | 说明 |
|----------|------|------|
| `dev/frontend/src/pages/ProcurementReturn/Orders/index.tsx` | 修改 | 移除状态下拉框，添加操作引导 |
| `dev/frontend/src/pages/ProcurementReturn/Orders/components/ReturnOrderTable.tsx` | 修改 | 精简列，添加展开配置，移动端切换 |
| `dev/frontend/src/pages/ProcurementReturn/Orders/components/ReturnOrderStats.tsx` | 修改 | 增强选中态视觉 |
| `dev/frontend/src/pages/ProcurementReturn/Orders/index.less` | 修改 | 添加展开面板、移动端样式 |

## Files to Create

| 文件路径 | 说明 | 预估行数 |
|----------|------|----------|
| `components/ExpandedDetail.tsx` | 展开详情面板组件 | ~50行 |
| `components/ReturnOrderCard.tsx` | 移动端卡片组件 | ~100行 |
| `components/OperationGuide.tsx` | 操作引导组件 | ~80行 |
| `hooks/useMobileDetect.ts` | 移动端检测Hook | ~20行 |

---

## Verification

1. **确保后端服务运行中（端口 8100）**
2. **确保前端服务已启动（端口 3100）**
3. 刷新页面验证功能：

### 桌面端验证
- [ ] 统计卡片点击筛选正常，选中态高亮明显
- [ ] 表格仅显示7列，信息清晰
- [ ] 点击展开行显示详情面板
- [ ] 操作按钮功能正常（填写ERP、执行退货、回退）
- [ ] 批量操作功能正常

### 移动端验证（调整浏览器宽度至768px以下）
- [ ] 统计卡片横向滚动
- [ ] 卡片列表视图正常显示
- [ ] 操作按钮触摸友好（高度44px）
- [ ] 筛选功能正常

---

## Notes

- 保持现有 API 接口不变
- 遵循项目编码规范（组件文件≤200行）
- 保持与项目其他页面的视觉一致性
- 完成后需用户验证确认才能提交代码
