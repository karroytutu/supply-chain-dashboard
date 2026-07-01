---
version: alpha
name: xly-supply-chain-design
description: 鑫链云供应链数据管理系统设计系统，基于 Ant Design v5 + Less CSS Modules 的企业级后台设计契约。

colors:
  primary: "#1890ff"
  primary-hover: "#40a9ff"
  primary-dark: "#096dd9"
  primary-bg-light: "#e6f7ff"
  primary-bg-lighter: "#f0f5ff"
  on-primary: "#ffffff"
  ink: "#262626"
  body: "#333333"
  body-text: "#595959"
  secondary: "#8c8c8c"
  tertiary: "#666666"
  muted: "#999999"
  disabled: "#bfbfbf"
  canvas: "#f5f7fa"
  surface: "#ffffff"
  surface-hover: "#fafafa"
  surface-muted: "#f5f5f5"
  hairline: "#e8e8e8"
  hairline-light: "#f0f0f0"
  hairline-strong: "#d9d9d9"
  danger: "#ff4d4f"
  danger-dark: "#cf1322"
  success: "#52c41a"
  success-light: "#b7eb8f"
  warning: "#faad14"
  warning-dark: "#fa8c16"
  info: "#1890ff"
  warning-serious: "#ff4d4f"
  warning-serious-bg: "#fff1f0"
  warning-alert: "#faad14"
  warning-alert-bg: "#fffbe6"
  warning-attention: "#fadb14"
  warning-attention-bg: "#fffff0"
  warning-normal: "#52c41a"
  warning-normal-bg: "#f6ffed"

typography:
  metric-lg:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: 36px
    fontWeight: 600
    lineHeight: 1.0
    letterSpacing: 0px
  metric-md:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.0
    letterSpacing: 0px
  heading-md:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0px
  body-md:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5715
    letterSpacing: 0px
  body-sm:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0px
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0px
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: 0px
  code-md:
    fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0px

rounded:
  none: 0px
  sm: 4px
  md: 8px
  lg: 12px
  full: 9999px

spacing:
  xs: 4px
  sm: 8px
  section: 12px
  md: 16px
  card: 20px
  lg: 24px
  xl: 32px

components:
  card-base:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
  card-metric:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.card}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
  text-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
  warning-badge:
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  page-full:
    backgroundColor: "{colors.canvas}"
    padding: "{spacing.md}"
    height: "calc(100vh - 56px)"
  page-scroll:
    backgroundColor: "{colors.canvas}"
    padding: "{spacing.md}"
---

## Overview

鑫链云供应链数据管理系统是一套企业级 B 端后台应用，服务于供应链采购、销售分析、应收账款管理、OA 审批等核心业务场景。

**技术栈**: UmiJS v4 + React + TypeScript + Ant Design v5 + Less CSS Modules

**设计原则**: 数据密度优先、操作效率导向、中性灰白基底承载业务色彩。

## Colors

主色系为科技蓝 `#1890ff`，搭配四级预警色系用于业务数据分级。背景色 `#f5f7fa` 营造中性灰白基底，卡片白色承载内容。

- 所有颜色必须引用 `variables.less` 中的 Less 变量，禁止硬编码色值
- TypeScript 文件中的颜色值（如 ConfigProvider token）必须与 `variables.less` 保持手动同步
- 预警色系的 前景/背景 对经过对比度验证，满足 WCAG AA

**预警四级色系**:

| 级别 | 前景 | 背景 | 用途 |
|---|---|---|---|
| 严重 | `{colors.warning-serious}` | `{colors.warning-serious-bg}` | 7天内临期、逾期超30天 |
| 提醒 | `{colors.warning-alert}` | `{colors.warning-alert-bg}` | 15天内临期、逾期15-30天 |
| 关注 | `{colors.warning-attention}` | `{colors.warning-attention-bg}` | 30天内临期 |
| 正常 | `{colors.warning-normal}` | `{colors.warning-normal-bg}` | 正常状态 |

## Typography

基于系统默认字体栈，14px 基准字号，1.5715 行高（Ant Design 默认）。

| 层级 | 字号 | 字重 | 用途 |
|---|---|---|---|
| `{typography.metric-lg}` | 36px | 600 | 仪表盘核心指标数字 |
| `{typography.metric-md}` | 32px | 600 | 次级指标数字 |
| `{typography.heading-md}` | 16px | 600 | 区块标题 |
| `{typography.label}` | 14px | 500 | 卡片标题、表单标签 |
| `{typography.body-md}` | 14px | 400 | 正文、表格内容 |
| `{typography.body-sm}` | 13px | 400 | 辅助说明、移动端正文 |
| `{typography.caption}` | 12px | 400 | 标签、趋势文字、时间戳 |
| `{typography.code-md}` | 14px | 400 | 代码、技术标识符 |

- 禁止在组件中使用未在 typography token 中定义的字号
- 指标数字字重固定为 600，正文 400，标签/标题 500-600

## Layout

ProLayout Mix 模式（侧边栏 + 顶栏），侧边栏 180px，顶栏 56px。

两种页面容器（定义在 `global.less`）：

- `.page-full`: `height: calc(100vh - 56px)`，一屏展示，内部 flex 布局 + 滚动。适合仪表盘、看板页面
- `.page-scroll`: `min-height: calc(100vh - 56px)`，内容可超出视口，页面整体滚动。适合表单、列表页

**规则**: 页面根容器必须使用这两个类之一，禁止自行编写 `height` / `min-height`。

侧边栏菜单紧凑化：一级菜单 40px，二级菜单 36px，以容纳更多业务入口。

## Elevation & Depth

三级阴影体系：

| 级别 | 值 | 用途 |
|---|---|---|
| `{components.card-base}` 静态 | `0 2px 8px rgba(0,0,0,0.06)` | 卡片默认状态 |
| 悬停 | `0 4px 12px rgba(0,0,0,0.1)` | 卡片 hover 状态 |
| 弹窗 | `0 4px 12px rgba(0,0,0,0.15)` | Modal、Dropdown |

## Shapes

圆角梯度（定义在 `variables.less`）：

| 变量 | 值 | 用途 |
|---|---|---|
| `@border-radius-sm` | `{rounded.sm}` | Badge、Tag、小元素 |
| `@border-radius-base` | `{rounded.md}` | 按钮、输入框、小卡片 |
| `@border-radius-lg` | `{rounded.lg}` | MetricCard、SummaryCard 等仪表盘大卡片 |

## Components

### Card（卡片）
使用 Ant Design `<Card>` 作为基础，`bordered={false}`。普通卡片圆角 `{rounded.md}`，仪表盘指标卡片圆角 `{rounded.lg}`。全局业务卡片类 `.dashboard-card` 内边距 `{spacing.lg}`。

### MetricCard（指标卡片）
用于仪表盘 KPI 展示。大数字 + 趋势指示器 + 辅助信息。悬停时阴影从 `@box-shadow-card` 加深至 `@box-shadow-hover`。

### SummaryCard（摘要卡片）
仪表盘顶部指标展示，支持趋势、统计、月度齐全率模式。可点击变体增加 `cursor: pointer` 和 `translateY(-2px)` 悬停效果。

### WarningBadge（预警徽章）
四级色彩映射至 `{colors.warning-*}` 系列。`{typography.caption}` + `{rounded.sm}` + `padding: 2px 8px`。

### Authorized（权限控制）
声明式权限包裹组件，支持 permission/role 检查和 any/all 模式。无权限时隐藏子元素或显示 fallback。

### OA 表单引擎（FormFieldRenderer）
动态表单渲染器，支持 20+ 控件类型。自定义控件包括签名板（SignaturePad）、ERP 数据选择器、银行账户选择器、可编辑明细表等。

### 全局业务类名（global.less）

| 类名 | 用途 |
|---|---|
| `.page-full` | 一屏展示页面容器 |
| `.page-scroll` | 可滚动页面容器 |
| `.dashboard-card` | 通用卡片样式 |
| `.trend-indicator` | 趋势指示器（up/down/flat） |
| `.warning-badge` | 预警徽章（serious/alert/attention/normal） |
| `.category-progress` | 品类进度条 |
| `.mobile-show` / `.mobile-hide` | 移动端显隐控制 |

## Do's and Don'ts

- **Do**: 所有颜色/间距/圆角/阴影引用 `variables.less` 变量
- **Do**: 页面根容器使用 `.page-full` 或 `.page-scroll`
- **Do**: 格式化函数统一从 `@/utils/format.ts` 导入
- **Do**: Ant Design 样式定制通过组件 props（`style`、`styles`、`rowClassName`）或 ConfigProvider token
- **Do**: CSS Modules（`.less` 文件）做样式隔离
- **Don't**: 使用 `:global(.ant-xxx)` 穿透 Ant Design 组件内部 DOM
- **Don't**: 使用 `!important` 覆盖 Ant Design 样式
- **Don't**: 在组件 .less 文件中硬编码已定义在 `variables.less` 中的色值
- **Don't**: 用原生 HTML 替代 Ant Design 组件（如 `<button>` 替代 `<Button>`）
- **Don't**: 自行编写 `height: calc(100vh - ...)` 而不使用标准页面容器类

## Responsive Behavior

7 级断点：375 / 480 / 576 / 768 / 992 / 1200 / 1400px。

移动端（<768px）核心适配：
- 触摸目标最小 `{spacing.card}` + 4px = 44px（`@touch-target-size`）
- 表格横向滚动（`-webkit-overflow-scrolling: touch`）
- Modal 宽度自适应（`max-width: calc(100vw - 32px)`）
- 分页器居中换行
- 输入控件最小高度 44px
- `.mobile-show` / `.mobile-hide` 控制元素显隐

## Known Gaps

- 排版层级已部分提取到 `variables.less`（`@font-size-sm: 12px`、`@font-size-base: 14px`、`@font-size-lg: 16px`），但指标大数字（32/36px）仍散落在组件中
- 无 Figma 设计稿，设计令牌以代码为唯一真相源
- 侧边栏菜单样式（`global.less`）使用 `!important` 违反规范，需改用 ConfigProvider 组件级 token
- `app.tsx` 中 `contentStyle.background` 硬编码为 `#f5f7fa`，无法引用 Less 变量（TS 限制），需手动同步
