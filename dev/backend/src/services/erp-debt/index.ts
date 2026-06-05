/**
 * ERP 欠款数据管道
 *
 * 负责 ERP 欠款数据的同步、富化、压单检测
 * 从 ar-collection 模块迁移而来，与 ERP 客户端高耦合
 */

export * from './erp-debt.types';
export { syncERPDebts, checkExtensionExpiry, checkHoldExpiry } from './erp-debt-sync.task';
export { enrichDebtRecords, filterHoardDebts, fetchCustomerData, fetchHoardTags } from './erp-debt-enrichment.service';
export { detectHoardChangesByCustomer, detectAllHoardChanges } from './erp-hoard-detect';
