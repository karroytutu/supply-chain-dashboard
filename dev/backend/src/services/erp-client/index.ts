/**
 * ERP API 客户端模块入口
 * @module services/erp-client
 */

export { getErpConfig, getErpDefaults, ERP_API_VERSION } from './erp-config';
export { getErpAccessToken, refreshErpToken, invalidateErpToken } from './erp-auth';
export { erpRequest, erpGet, erpPost, erpPut } from './erp-client';
export { cleanupExpenditureBill, cleanupIncomeBill } from './erp-cleanup';
export { createLogEntry, writeErpLog } from './erp-logger';
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
export {
  searchPurchaseOrders,
  getPurchaseOrderDetail,
  createPurchaseOrder,
  approvePurchaseOrder,
  deApprovePurchaseOrder,
  cancelPurchaseOrder,
  createPurchasePrepayment,
  deApprovePrepayment,
  cancelPrepayment,
  listTraderPrepayments,
  createPaidBill,
  deApprovePaidBill,
  cancelPaidBill,
  searchSupplierIncomes,
  getDailySalesData,
  searchSupplierDebts,
  searchSuppliers,
  buildProcurementIdemKey,
} from './erp-purchase.service';
export {
  searchPurchaseSettlements,
  getAllocatablePurchaseDetails,
  getAllocatableExpenseDetails,
} from './erp-purchase-settlement.service';
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
  CreatePaidBillRequest,
  CreatePaidBillResponse,
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
