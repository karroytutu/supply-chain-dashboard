/**
 * ERP 欠款数据管道
 *
 * 负责 ERP 欠款数据的富化、压单元数据管理
 * 从 ar-collection 模块迁移而来，与 ERP 客户端高耦合
 *
 * 注：旧催收系统（syncERPDebts / checkExtensionExpiry / checkHoldExpiry / hoard-detect）已清理
 */

export * from './erp-debt.types';
export { enrichDebtRecords, filterHoardDebts, fetchCustomerData, fetchHoardTags, getEnrichedNonHoardDebts } from './erp-debt-enrichment.service';
export { upsertHoldMeta, fetchHoldMeta, checkHoldMetaExpiry } from './ar-hold-meta.service';
