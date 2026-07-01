/**
 * 目标管理模块入口
 */
export { queryTargetList, queryTargetDetail } from './sales-target-query.service';
export { saveTarget, updateTarget, removeTarget } from './sales-target-mutation.service';
export {
  getMarketerErpStaffIds,
  getMarketerStaffId,
  getCustomerList,
  getProductCatalog,
  getHistoricalSales,
  buildInitialTargetData,
  getOverviewData,
} from './sales-target-erp.service';
