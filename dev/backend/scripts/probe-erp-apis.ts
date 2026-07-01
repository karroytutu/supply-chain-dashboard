/**
 * ERP API 探针脚本
 * 调用所有 6 个数据集的 ERP API，打印响应结构和样本数据
 * 用途：验证表字段设计是否覆盖所有 API 返回字段
 *
 * 运行: cd dev/backend && npx ts-node scripts/probe-erp-apis.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.development' });

import { erpPost, erpGet, extractErpData } from '../src/services/erp-client/erp-client';
import { getErpDefaults } from '../src/services/erp-client/erp-config';
import { beijingDate, beijingDateOffset } from '../src/utils/beijingTime';
import { ERP_DUSHAN_WAREHOUSE_ID, SALES_BUSINESS_ATTR_IDS } from '../src/utils/constants';

async function probe(name: string, fn: () => Promise<unknown>) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${name}`);
  console.log('='.repeat(60));
  try {
    const result = await fn();
    if (Array.isArray(result)) {
      console.log(`记录数: ${result.length}`);
      if (result.length > 0) {
        const sample = result[0];
        console.log(`字段列表 (${Object.keys(sample).length} 个):`);
        for (const [key, value] of Object.entries(sample)) {
          console.log(`  ${key}: ${typeof value} = ${JSON.stringify(value)?.slice(0, 80)}`);
        }
      }
    } else {
      console.log('非数组响应:', JSON.stringify(result)?.slice(0, 500));
    }
  } catch (error) {
    console.error(`失败:`, error instanceof Error ? error.message : error);
  }
}

async function main() {
  const { cid, uid } = getErpDefaults();

  // 1. 客户欠款
  await probe('1. 客户欠款 (consumer-collect/detail)', async () => {
    const result = await erpPost<any>('/consumer-collect/detail', {
      workStartDate: '2020-01-01', workEndDate: beijingDate(),
      size: 5, total: 0, current: 1,
      settlementStateIds: ['NONE', 'PART'], timeType: ['WORK'],
      ifShowSubtotal: false, groupingDims: ['settlerName'],
      cid, uid,
    }, { pathPrefix: '/toliman/', businessType: 'probe_debt' });
    return result?.data?.records || [];
  });

  // 2. 商品档案
  await probe('2. 商品档案 (spu-query/search)', async () => {
    const result = await erpPost<any>('/spu-query/search', {
      state: 0, current: 1, size: 5, total: 0, cid, uid,
    }, { pathPrefix: '/redcoast/', businessType: 'probe_product' });
    return result?.data?.records || [];
  });

  // 3. 实时库存
  await probe('3. 实时库存 (stock/report/query-realtime-stock-search)', async () => {
    const result = await erpPost<any>('/stock/report/query-realtime-stock-search', {
      current: 1, size: 5, warehouseIds: [], cwmSourceCidList: [],
      brandIds: [], mainSupplierIdList: [], goodsState: 'ENABLE',
      stockType: 'PHYSICAL', unitDisplayType: 'BASE_UNIT',
      costPriceType: 'MOVE_COST_PRICE', showZeroStock: true,
      dimList: [''], warehouseType: 0, states: [], cid, uid,
    }, { pathPrefix: '/toliman/', businessType: 'probe_inventory' });
    return result?.data?.records || [];
  });

  // 4. 批次库存
  await probe('4. 批次库存 (cwms/stock/wms-stock-detail)', async () => {
    const result = await erpPost<any>('/cwms/stock/wms-stock-detail', {
      current: 1, size: 5, searchImage: true,
      warehouseId: String(ERP_DUSHAN_WAREHOUSE_ID),
      unitDisplayType: 'BASE_UNIT', onlyZeroStockFile: false,
      isJoiner: false, cid, uid, total: 0,
    }, { pathPrefix: '/toliman/', businessType: 'probe_batch' });
    return result?.data?.records || [];
  });

  // 5. 客户档案
  await probe('5. 客户档案 (store-query/search)', async () => {
    const result = await erpPost<any>('/store-query/search', {
      current: 1, size: 5, cid, uid, docState: 1,
    }, { pathPrefix: '/redcoast/', businessType: 'probe_customer' });
    return result?.data?.records || [];
  });

  // 6. 销售明细
  await probe('6. 销售明细 (funds-sale/list-sale-detail)', async () => {
    const result = await erpPost<any>('/funds-sale/list-sale-detail', {
      dimList: [], submitTimeFrom: beijingDateOffset(-7), submitTimeTo: beijingDate(),
      goodsIds: [], consumerIds: [], salesmanIds: [], subTypes: [],
      billTypes: [], businessAttrIds: [...SALES_BUSINESS_ATTR_IDS],
      tagIds: [], orderStateIds: ['APPROVED'], settlementStateIds: [],
      brandIds: [], categoryIds: [], costPriceType: 'MOVE_COST_PRICE',
      areaIds: [], groupIds: [], gradeIds: [], deliverIds: [],
      orderNote: '', originStr: '', warehouseIds: [],
      submitTimeType: 'settle_time', unitDisplayType: 'BASE_UNIT',
      mixPriceUnit: 'PKG_UNIT', exportType: 'mergeexport',
      orderBy: '', orderType: '', signStateIds: [], deptIds: [],
      settleConsumerIds: [], supplierIds: [],
      defaultSelectedIndex: 0, qualityType: '',
      current: 1, size: 5,
      fundsSaleTotalAmountFrom: '', fundsSaleTotalAmountTo: '',
      bizCollectorIds: [], fuzzySearchGoodsStr: '', cid, uid,
    }, { pathPrefix: '/toliman/', businessType: 'probe_sales' });
    return result?.data?.records || [];
  });

  console.log('\n\n探针执行完毕');
  process.exit(0);
}

main().catch(console.error);
