/**
 * ERP API 客户端模块入口
 * @module services/erp-client
 */

export { getErpConfig, getErpDefaults, ERP_API_VERSION } from './erp-config';
export { getErpAccessToken, refreshErpToken, invalidateErpToken } from './erp-auth';
export { erpRequest, erpGet, erpPost, erpPut } from './erp-client';
export {
  cleanupExpenditureBill,
  cleanupIncomeBill,
  revokeBillSubmission,
  cleanupBadDebtBills,
} from './erp-cleanup';
export {
  createCustomerReceipt,
  deApproveCustomerReceipt,
  cancelCustomerReceipt,
} from './erp-customer-receipt.service';
export type {
  ReceiptInvoiceItem,
  CreateCustomerReceiptParams,
  CreateCustomerReceiptResult,
} from './erp-customer-receipt.service';
export { createLogEntry, writeErpLog } from './erp-logger';
export { withInFlightDedup, withInFlightDedupByKey } from './erp-inflight';
export {
  CircuitBreaker,
  getErpCircuitBreaker,
  getCircuitBreakerStats,
  ErpCircuitOpenError,
} from './erp-circuit-breaker';
export type { CircuitState, CircuitBreakerConfig, CircuitBreakerStats } from './erp-circuit-breaker';
export { ErpApiError } from './erp-client.types';
export type {
  ErpApiConfig,
  ErpToken,
  ErpRequestOptions,
  ErpApiResponse,
  ErpBillResponse,
  ErpPageResponse,
  ErpLogEntry,
} from './erp-client.types';
// ==================== 采购订单 ====================
export {
  searchPurchaseOrders,
  getPurchaseOrderDetail,
  createPurchaseOrder,
  approvePurchaseOrder,
  deApprovePurchaseOrder,
  cancelPurchaseOrder,
  buildProcurementIdemKey,
  buildPurchasePaymentIdemKey,
} from './erp-purchase-order.service';
// ==================== 预付款 ====================
export {
  createPurchasePrepayment,
  createNormalPrepayment,
  deApprovePrepayment,
  cancelPrepayment,
  listTraderPrepayments,
} from './erp-prepayment.service';
// ==================== 付款单（供应商侧） ====================
export {
  createPaidBill,
  deApprovePaidBill,
  cancelPaidBill,
} from './erp-paid-bill.service';
// ==================== 收付款单统一服务 ====================
export {
  submitPaymentBill,
} from './erp-payment-bill.service';
export type {
  SubmitPaymentBillParams,
  SubmitPaymentBillResponse,
  PaymentBillInvoiceItem,
  PaymentBillPrepayItem,
} from './erp-payment-bill.service';
// ==================== 供应商收入单 ====================
export {
  searchSupplierIncomes,
  createSupplierIncomeBill,
} from './erp-supplier-income.service';
export type {
  CreateSupplierIncomeBillParams,
  SupplierIncomeBillResponse,
} from './erp-supplier-income.service';
// ==================== 供应商收入类别 ====================
export {
  getIncomeCategories,
} from './erp-income-category.service';
export type { IncomeCategory } from './erp-income-category.service';
// ==================== 日均销售报表 ====================
export {
  getDailySalesData,
} from './erp-daily-sales.service';
// ==================== 供应商欠款 ====================
export {
  searchSupplierDebts,
  searchSupplierDebtsPaged,
} from './erp-supplier-debt.service';
export type { SupplierDebtPagedResult } from './erp-supplier-debt.service';
// ==================== 供应商查询 ====================
export {
  searchSuppliers,
} from './erp-supplier.service';
export {
  searchPurchaseSettlements,
  getAllocatablePurchaseDetails,
  getAllocatableExpenseDetails,
} from './erp-purchase-settlement.service';
// ==================== 欠款列表统一查询 ====================
export {
  fetchDebtList,
  fetchDebtListPaged,
} from './erp-debt-list-query.service';
export type { DebtListQueryParams } from './erp-debt-list-query.service';
export {
  fetchReceivableOrders,
  createReconciliationDraft,
  approveReconciliation,
  cancelReconciliation,
  fetchPrintTemplate,
} from './erp-reconciliation.service';
export type {
  PurchaseSettlementListResult,
  AllocatablePurchaseDetailParams,
  AllocatablePurchaseDetailResult,
  AllocatableExpenseDetailParams,
  AllocatableExpenseDetailResult,
} from './erp-purchase-settlement.service';
export {
  createSupplierExpenseBill,
  createExpenseAllocation,
  cancelExpenseAllocation,
  buildLogisticsFeeIdemKey,
} from './erp-expense-allocation.service';
export {
  fetchAllBrands,
} from './erp-brand.service';
export type { ErpBrand } from './erp-brand.service';
export {
  createChargeContract,
  createCustomerExpenditure,
  getChargeContractDetail,
  terminateChargeContract,
} from './erp-market-expense.service';
export type {
  CreateChargeContractParams,
  CreateChargeContractResult,
  CreateCustomerExpenditureParams,
  CreateCustomerExpenditureResult,
  CreateBadDebtExpenditureParams,
} from './erp-market-expense.service';
export { createBadDebtExpenditure } from './erp-market-expense.service';
export type {
  CreateSupplierExpenseBillRequest,
  SupplierExpenseBillResponse,
  AllocationDetailItem,
  CreateExpenseAllocationRequest,
  ExpenseAllocationResponse,
} from './erp-expense-allocation.service';
export type {
  PurchaseOrderListItem,
  PurchaseOrderDetailResponse,
  PurchaseOrderLineItem,
  PurchaseGoodsInfo,
  PurchaseGoodsPriceInfo,
  PurchaseStockInfo,
  CreatePurchaseOrderRequest,
  CreatePurchaseOrderDetail,
  AvailablePrepayment,
  CreatePurchasePrepaymentRequest,
  CreateNormalPrepaymentRequest,
  CreatePaidBillInput,
  CreatePaidBillRequest,
  CreatePaidBillResponse,
  PaidBillInvoiceInput,
  PaidBillInvoiceItem,
  PaidBillPrepayItem,
  SupplierIncomeRecord,
  ErpSupplier,
  DailySalesGoodsRecord,
  DailySalesPeriod,
  SupplierDebtRecord,
  PurchaseSettlementListItem,
  AllocatablePurchaseDetail,
  AllocatableExpenseDetail,
} from './erp-purchase.types';
// ==================== 独立类型文件 re-export ====================
export type { ErpCustomer, ErpCustomerProfile, CustomerLicenseInfo } from './erp-customer.types';
export type { ErpSettlementOrder, ErpSettlementOrderPagedResult } from './erp-settlement.types';
export type { ReceivableOrder, StatementDetailItem } from './erp-reconciliation.types';
export type { ErpProduct, PromotionGoodsItem } from './erp-product.types';
export type { ErpInventoryRecord } from './erp-inventory.types';
