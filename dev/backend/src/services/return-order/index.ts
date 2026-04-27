/**
 * 退货单管理模块入口
 */

// 查询服务
export {
  getReturnOrders,
  getReturnOrderById,
  getReturnOrderStats,
  getPendingErpOrders,
  getReturnOrderActions,
} from './return-order.query';

// 变更服务
export {
  createReturnOrder,
  updateReturnOrderStatus,
  batchConfirmReturnOrders,
  cancelReturnOrder,
  fillErpReturnNo,
  warehouseExecute,
  marketingSaleComplete,
  rollbackReturnOrder,
} from './return-order.mutation';

// DTO 映射器
export { toReturnOrderDTO, toReturnActionDTO, toReturnOrderStatsDTO } from './return-order.mapper';

// 数据访问层
export type { ReturnOrderRow } from './return-order-utils';
export { invalidateOrderCache } from './return-order.repository';

// 类型定义
export type {
  ReturnOrder,
  ReturnOrderStatus,
  ReturnOrderQueryParams,
  ReturnOrderStats,
  ReturnOrderListResult,
  ReturnActionType,
  ReturnAction,
  CreateReturnOrderParams,
  BatchConfirmReturnOrdersParams,
  BatchConfirmResult,
  UpdateStatusParams,
  FillErpReturnNoParams,
  WarehouseExecuteParams,
  MarketingSaleCompleteParams,
  RollbackReturnOrderParams,
} from './return-order.types';
