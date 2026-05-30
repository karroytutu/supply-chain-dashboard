/**
 * WMS 云仓退货验收服务
 * 通过 WMS API 拉取退货验收数据，替代直连 xinshutong 数据库
 * @module services/erp-client/erp-return-acceptance.service
 */

import { wmsGet } from './erp-wms-client';

/** WMS 退货验收记录 */
export interface ErpReturnAcceptance {
  sourceBillNo: string;
  goodsId: number;
  goodsName: string;
  unitName: string;
  unfrozenIncreasedQuantity: number;
  productionDate: string;
  createTime: string;
  expireDate: string;
  relatedBillNo: string;
  warehouseName: string;
  createrName: string;
  goodsCode: string;
}

/** WMS API 响应 */
interface WmsReturnResponse {
  total: number;
  rows: ErpReturnAcceptance[];
}

/**
 * 从 WMS API 拉取指定日期范围的退货验收记录
 *
 * @param dateStart - 开始日期（YYYY-MM-DD）
 * @param dateEnd - 结束日期（YYYY-MM-DD）
 */
export async function fetchReturnAcceptances(
  dateStart: string,
  dateEnd: string
): Promise<ErpReturnAcceptance[]> {
  const result = await wmsGet<WmsReturnResponse>('/wms/stock/stockthreelevelreport', {
    relatedBillType: 3,
    dateStart,
    dateEnd,
    page: 1,
    rows: 2000,
    _: Date.now(),
  });

  return result?.rows || [];
}
