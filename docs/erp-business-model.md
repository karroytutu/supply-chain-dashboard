# 舟谱 ERP 业务模型

> 本文档基于对舟谱 ERP 系统的抓包逆向分析，无官方文档。所有接口行为和单据状态均通过实际调用验证。

---

## 一、业务全景图

舟谱 ERP 涵盖 8 大业务领域：

```
基础数据（客户/供应商/商品/品牌）
    ├── 采购流程：采购订单 → WMS验收 → 采购结算单 → 预付款/付款单
    ├── 销售流程：销售订单 → 发货配送 → 销售结算单 → 预收款/收款单
    ├── 结算管理：结算单（自动生成）→ 欠款记录（财务视角）
    ├── 对账管理：客户对账单（打包多张结算单）
    ├── 市场费用：兑付协议 → 客户费用单（可抵扣销售结算单）
    ├── 物流费用：供应商费用单 + 费用分摊单（增加商品成本）
    ├── 客户管理：客户档案、授信管理、压单标记
    └── 市场营销：促销活动（组合搭赠/特价/满减赠品）
```

---

## 二、核心实体关系

```
采购订单 (PO)
    │ 审核 + WMS验收上架
    ▼
采购结算单（自动生成）──── 费用分摊单（增加入库成本）
    │
    ▼
付款单 / 预付款（核销结算单）

销售订单 (SO)
    │ 发货配送
    ▼
销售结算单（自动生成）── 销售明细（结算单行项目）
    │
    ▼
欠款记录（财务视角：id=欠款ID, bizId=结算单ID）
    │
    ▼
收款单 / 预收款（核销结算单）←── 客户费用单（市场费用派生，可抵扣）

客户对账单（手动创建，打包多张销售结算单，记录对账时间和范围）
```

### 关键 ID 映射

| 接口 | 字段 | 业务含义 |
|------|------|---------|
| `/invoice/list-debt-list` | `id` | 欠款记录 ID（应收账款维度） |
| `/invoice/list-debt-list` | `bizId` | 销售结算单 ID（来源单据） |
| `/toliman/consumer-collect/detail` | `billId` | 等同 `list-debt-list` 的 `id`（欠款记录 ID） |

---

## 三、单据状态机

### 标准三态（大部分单据）

```
待审核 ──审核──→ 已审核 ──反审核──→ 待审核
                  │                    │
                  │                    └──取消──→ 已取消
                  │
                  └── (撤销交单，如果已交单) ──→ 反审核 ──→ 取消
```

适用单据：采购订单、付款单、收款单、客户对账单、费用单、供应商费用单

### 兑付协议（特殊状态机）

```
待审核 ──审核──→ 已审核 ──终止──→ 已终止
```

### 结算单（无审核流程）

由仓库操作（采购入库/销售出库）自动生成，无审核/取消概念。仅支持：
- 压单标记（`update-hoard`）：标记为售后保障暂不结算

### 交单规则

ERP 有"员工交单"功能，标记纸质单据是否已交到公司。部分单据反审核前需先撤销交单（`revoke-detail`）。

---

## 四、各业务领域详细说明

### 4.1 采购

```
供应商档案 + 商品档案（基础）
    ↓
采购订单（创建→审核）
    ↓
WMS 验收 + 上架（独立系统，自动生成验收单）
    ↓
采购结算单（系统自动生成）
    ↓
结算方式（二选一或组合）：
├── 预付款路径
│   ├── 采购预付（绑定特定 PO，只能核销该 PO 的结算单）
│   └── 普通预付（可核销任意采购结算单）
└── 付款单路径（选供应商+结算单+付款账户，也可搭配预付款核销）
```

**接口设计**：采购订单的创建（`add-or-update`）和审核（`approve`）是分开的；付款单的创建和审核是合并的（`save-and-approve`）。

### 4.2 销售

```
客户档案 + 商品档案（基础）
    ↓
销售订单（创建→审核）
    ↓
仓库发货配送
    ↓
销售结算单（系统自动生成）── 销售明细（结算单行项目）
    ↓
结算方式（与采购对称）：
├── 预收款
└── 收款单（paymentDirection='IN', traderType='STORE'）
```

### 4.3 市场费用

```
市场费用审批通过
    ↓
创建兑付协议
├── 商品类型：直接给客户商品，流程结束
└── 现金类型：需再走一步
        ↓
    生成客户费用单（从兑付协议派生）
        ↓
    进入欠款明细（未结清时）
        ↓
    收款时可勾选费用单抵扣销售结算单
```

### 4.4 物流费用

```
物流等采购附带费用产生
    ↓
录入供应商费用单 → 增加对供应商的应付账款
    ↓
两条路径：
├── 付款单核销：付款时勾选供应商费用单 + 采购结算单一起支付
└── 费用分摊：把费用分摊到采购结算单 → 增加商品入库成本
```

### 4.5 压单

压单是销售结算单上的业务标记，表示"客户保留这几张单暂不结算，作为售后保障，合作结束时再结算"。通过 `update-hoard` 接口标记，不改变结算单金额或状态。

### 4.6 促销

属于 ERP 的"市场营销"模块。创建促销方案后，在销售开单时可选用。支持三种类型：
- 组合搭赠（combinedSale）
- 特价促销（specialOffer）
- 满减赠品（reachGive）

### 4.7 WMS 集成

WMS（仓储管理系统）是独立系统（`wms.zhoupudata.com`），与 ERP 高度集成：

```
采购订单审核(ERP) → 自动创建验收单(WMS) → 验收+上架(WMS) → 自动生成采购结算单(ERP)
```

WMS 使用独立的 Cookie 认证（`WMSJSESSIONID`），不走 ERP 的 Bearer Token。

---

## 五、ERP 接口清单（72 个）

> 所有接口均需要携带 `authorization`（Bearer Token）、`cid`、`uid`、`SaasCid`、`apiversion` 等公共头字段。

### 5.1 采购订单（6 个，路径前缀 `/saas/pro/`）

| 路径 | 方法 | 函数名 | 说明 |
|------|------|--------|------|
| `/web/purchase-order-bill/bill-list` | POST | `searchPurchaseOrders` | 搜索采购订单列表 |
| `/web/purchase-order-bill/detail` | GET | `getPurchaseOrderDetail` | 获取采购订单详情 |
| `/web/purchase-order-bill/add-or-update` | POST | `createPurchaseOrder` | 创建/更新采购订单 |
| `/web/purchase-order-bill/approve` | POST | `approvePurchaseOrder` | 审核采购订单 |
| `/web/purchase-order-bill/de-approve` | POST | `deApprovePurchaseOrder` | 反审核采购订单 |
| `/web/purchase-order-bill/cancel-v2` | POST | `cancelPurchaseOrder` | 取消采购订单 |

### 5.2 预付款（5 个，路径前缀 `/saas/pro/`）

| 路径 | 方法 | 函数名 | 说明 |
|------|------|--------|------|
| `/prepay/operate-pre-payment` | POST | `createPurchasePrepayment` | 创建采购预付款（关联PO） |
| `/prepay/operate-pre-payment` | POST | `createNormalPrepayment` | 创建普通预付款（不关联PO） |
| `/prepay/de-approve` | POST | `deApprovePrepayment` | 反审核预付款 |
| `/prepay/cancel` | POST | `cancelPrepayment` | 取消预付款 |
| `/prepay/list-trader-prepay` | GET | `listTraderPrepayments` | 查询供应商预付款列表 |

### 5.3 付款单/收款单（6 个，路径前缀 `/saas/pro/`）

| 路径 | 方法 | 函数名 | 说明 |
|------|------|--------|------|
| `/paid/save-and-approve` | POST | `createPaidBill` | 创建供应商付款单并审核（paymentDirection='OUT'） |
| `/paid/save-and-approve` | POST | `createCustomerReceipt` | 创建客户收款单并审核（paymentDirection='IN'） |
| `/approval-process/approval-permission` | POST | `deApprovePaidBill` | 反审核付款单 |
| `/paid/de-approve` | POST | `deApproveCustomerReceipt` | 反审核收款单 |
| `/paid/cancel` | POST | `cancelPaidBill` / `cancelCustomerReceipt` | 取消付款单/收款单 |

### 5.4 供应商（4 个）

| 路径 | 方法 | 路径前缀 | 函数名 | 说明 |
|------|------|---------|--------|------|
| `/supplier/search` | POST | `/redcoast/` | `searchSuppliers` | 查询供应商列表 |
| `/invoice/list-debt-list` | GET | `/saas/pro/` | `searchSupplierDebts` | 查询供应商欠款（traderType='SUPPLIER'） |
| `/invoice/list-debt-list` | GET | `/saas/pro/` | `searchSupplierDebtsPaged` | 供应商欠款分页查询 |
| `/income/new/list` | POST | `/saas/pro/` | `searchSupplierIncomes` | 查询供应商收入单 |

### 5.5 客户管理（7 个）

| 路径 | 方法 | 路径前缀 | 函数名 | 说明 |
|------|------|---------|--------|------|
| `/store-query/search` | POST | `/redcoast/` | `searchErpCustomers` | 搜索客户列表 |
| `/store-query/query-store-web` | GET | `/redcoast/` | `getErpCustomerProfile` | 获取客户完整资料 |
| `/web/consumer/update-consumer` | POST | `/saas/pro/` | `erpUpdateCustomerFields` | 更新客户档案字段 |
| `/web/consumer/batch-edit-max-debt-days` | POST | `/saas/pro/` | `erpUpdateMaxDebtDays` | 批量更新最大欠款天数 |
| `/web/consumer/batch-edit-max-debt-order-num` | POST | `/saas/pro/` | `erpUpdateMaxDebtOrderNum` | 批量更新最大欠款单数 |
| `/store-grade-query/query-list` | POST | `/redcoast/` | `getErpGrades` | 客户等级列表 |
| `/store-group-query/query-list` | POST | `/redcoast/` | `getErpGroups` | 客户分组列表 |

### 5.6 客户参考数据（2 个，路径前缀 `/redcoast/`）

| 路径 | 方法 | 函数名 | 说明 |
|------|------|--------|------|
| `/store-area-query/query-list` | POST | `getErpAreas` / `getErpAreaTree` | 客户区域列表/树 |

### 5.7 结算单/欠款（5 个）

| 路径 | 方法 | 路径前缀 | 函数名 | 说明 |
|------|------|---------|--------|------|
| `/invoice/list-debt-list` | GET | `/saas/pro/` | `searchErpSettlementOrders` | 搜索客户结算单（traderType='STORE'） |
| `/invoice/list-debt-list` | GET | `/saas/pro/` | `searchErpSettlementOrdersPaged` | 结算单分页查询 |
| `/invoice/list-debt-list` | GET | `/saas/pro/` | `fetchReceivableOrders` | 查询应收单据（对账单用） |
| `/consumer-collect/detail` | POST | `/toliman/` | `fetchAllErpDebts` | 获取客户欠款明细 |
| `/funds-sale/update-hoard` | POST | `/saas/pro/` | `erpMarkHoldOrders` | 标记/取消压单 |

### 5.8 对账单（4 个，路径前缀 `/saas/pro/`）

| 路径 | 方法 | 函数名 | 说明 |
|------|------|--------|------|
| `/consumer-collect/save` | POST | `createReconciliationDraft` | 保存对账单草稿 |
| `/consumer-collect/direct-approve` | POST | `approveReconciliation` | 直接审核对账单 |
| `/consumer-collect/cancel` | POST | `cancelReconciliation` | 取消对账单 |

### 5.9 市场费用（5 个，路径前缀 `/saas/pro/`）

| 路径 | 方法 | 函数名 | 说明 |
|------|------|--------|------|
| `/bill/contract/cost/approve` | POST | `createChargeContract` | 创建兑付协议 |
| `/expenditure-bill/save-approve-trade-expenditure` | POST | `createCustomerExpenditure` | 兑付协议生成客户费用单 |
| `/expenditure-bill/save-approve-trade-expenditure` | POST | `createBadDebtExpenditure` | 坏账创建费用单 |
| `/bill/contract/cost/detail` | GET | `getChargeContractDetail` | 查询兑付协议详情 |
| `/bill/contract/cost/terminate` | POST | `terminateChargeContract` | 终止兑付协议 |

### 5.10 物流费用分摊（4 个）

| 路径 | 方法 | 路径前缀 | 函数名 | 说明 |
|------|------|---------|--------|------|
| `/expenditure-bill/save-approve-trade-expenditure` | POST | `/saas/pro/` | `createSupplierExpenseBill` | 创建供应商费用单 |
| `/expenditure-allocation/save-approve` | POST | `/saas/pro/` | `createExpenseAllocation` | 创建费用分摊单 |
| `/expenditure-allocation/cancel` | POST | `/saas/pro/` | `cancelExpenseAllocation` | 取消费用分摊单 |
| `/expenditure-allocation/settle-allocatable-purchase-detail` | POST | `/toliman/` | `getAllocatablePurchaseDetails` | 查询可分摊采购明细 |

### 5.11 清理/回滚（5 个）

| 路径 | 方法 | 路径前缀 | 函数名 | 说明 |
|------|------|---------|--------|------|
| `/expenditure-bill/re-approve-expenditure` | POST | `/saas/pro/` | `cleanupExpenditureBill` | 费用单反审核 |
| `/expenditure-bill/cancel-expenditure` | POST | `/saas/pro/` | `cleanupExpenditureBill` | 费用单取消 |
| `/income/re-approve-income` | POST | `/saas/pro/` | `cleanupIncomeBill` | 收入单反审核 |
| `/income/cancel-income` | POST | `/saas/pro/` | `cleanupIncomeBill` | 收入单取消 |
| `/worker-payment-web/revoke-detail` | POST | `/messiah/` | `revokeBillSubmission` | 撤销交单（反审核前置） |

### 5.12 采购结算（1 个，路径前缀 `/saas/pro/`）

| 路径 | 方法 | 函数名 | 说明 |
|------|------|--------|------|
| `/funds-purchase/list` | GET | `searchPurchaseSettlements` | 查询采购结算单列表 |

### 5.13 数据报表（5 个，路径前缀 `/toliman/` 或 `/redcoast/`）

| 路径 | 方法 | 路径前缀 | 函数名 | 说明 |
|------|------|---------|--------|------|
| `/funds-sale/list-sale-detail` | POST | `/toliman/` | `fetchSalesDetails` | 销售明细（结算单行项目） |
| `/stock/report/query-realtime-stock-search` | POST | `/toliman/` | `fetchAllInventory` | 实时库存 |
| `/cwms/stock/wms-stock-detail` | POST | `/toliman/` | `fetchAllBatchInventory` | 批次库存 |
| `/goods/report/daily-sale` | POST | `/toliman/` | `getDailySalesData` | 日均销售报表 |
| `/spu-query/search` | POST | `/redcoast/` | `fetchAllProducts` | 全量商品档案 |

### 5.14 品牌（1 个，路径前缀 `/redcoast/`）

| 路径 | 方法 | 函数名 | 说明 |
|------|------|--------|------|
| `/brand/search-without-permission` | POST | `fetchAllBrands` | 全量品牌列表 |

### 5.15 促销活动（5 个，路径前缀 `/`）

| 路径 | 方法 | 函数名 | 说明 |
|------|------|--------|------|
| `/quantum/promotion/doc/save-or-update-promotion` | POST | `erpCreatePromotion` | 创建促销活动 |
| `/quantum/promotion/doc/query-promotion-detail` | GET | （内部调用） | 查询促销详情 |
| `/quantum/promotion/doc/update-goods-for-combined-sale` | POST | `erpSaveCombinedSaleAndShelf` | 组合搭赠上架 |
| `/quantum/promotion/doc/update-goods-for-special-offer` | POST | `erpSaveSpecialOfferAndShelf` | 特价促销上架 |
| `/quantum/promotion/doc/update-goods-for-full-gift` | POST | `erpSaveFullGiftAndShelf` | 满减赠品上架 |

### 5.16 文件上传（1 个）

| 路径 | 方法 | 函数名 | 说明 |
|------|------|--------|------|
| `/file/uploadWithoutWaterMark` | POST | `erpUploadImageToErp` | 上传图片（multipart，不走 erpRequest） |

### 5.17 WMS（1 个，独立系统）

| 路径 | 方法 | 域名 | 函数名 | 说明 |
|------|------|------|--------|------|
| `/wms/stock/stockthreelevelreport` | GET | `wms.zhoupudata.com` | `fetchReturnAcceptances` | WMS 退货验收报表 |

### 5.18 其他（2 个）

| 路径 | 方法 | 域名/前缀 | 函数名 | 说明 |
|------|------|----------|--------|------|
| `/saas/erp/other/printtemplate/print` | POST | `portal.zhoupudata.com` | `fetchPrintTemplate` | 获取打印模板（Cookie 认证） |
| `/expenditure-allocation/expenditure-allocatable-detail` | POST | `/toliman/` | `getAllocatableExpenseDetails` | 查询可分摊费用明细 |
