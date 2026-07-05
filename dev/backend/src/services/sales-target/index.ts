/**
 * 目标管理模块入口
 */
export { queryTargetList, queryTargetDetail } from './sales-target-query.service';
export { saveTarget, updateTarget, removeTarget, getTarget, changeTargetStatus } from './sales-target-mutation.service';
export {
  getMarketerErpStaffIds,
  getMarketerStaffId,
} from './sales-target-marketer.service';
export { getMarketerUsers } from './sales-target-utils';
export { getCustomerList } from './sales-target-customer.service';
export { getProductCatalog } from './sales-target-product.service';
export { getHistoricalSales } from './sales-target-historical.service';
export { buildInitialTargetData } from './sales-target-init.service';
export { getOverviewData } from './sales-target-overview.service';
