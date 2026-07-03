/**
 * ERP参考数据控制器
 * 为OA表单提供ERP数据查询接口
 * @module controllers/erp-reference.controller
 */
import { createLogger } from '../utils/logger';
const log = createLogger('ErpReference');

import { Request, Response, NextFunction } from 'express';
import {
  searchErpAssets,
  getErpDepartments,
  getErpStaff,
  getErpPaymentAccounts,
  getErpAssetCategories,
} from '../services/fixed-asset/fixed-asset.query';
import {
  searchErpCustomersByKeyword,
  getCustomerLicenseInfo,
  getCustomerDebtTotal,
} from '../services/erp-client/erp-customer.service';
import {
  getErpGrades,
  getErpGroups,
  getErpAreas,
  getErpAreaTree,
} from '../services/erp-client/erp-customer-reference.service';
import { fetchAllBrands } from '../services/erp-client/erp-brand.service';
import {
  searchErpSettlementOrders,
  searchErpSettlementOrdersPaged,
} from '../services/erp-client/erp-settlement.service';
import {
  searchSuppliers,
} from '../services/erp-client/erp-supplier.service';
import {
  listTraderPrepayments,
} from '../services/erp-client/erp-prepayment.service';
import {
  searchSupplierIncomes,
} from '../services/erp-client/erp-supplier-income.service';
import {
  searchPurchaseOrders,
} from '../services/erp-client/erp-purchase-order.service';
import {
  searchSupplierDebts,
  searchSupplierDebtsPaged,
} from '../services/erp-client/erp-supplier-debt.service';
import {
  searchPurchaseSettlements,
  getAllocatablePurchaseDetails,
  getAllocatableExpenseDetails,
} from '../services/erp-client/erp-purchase-settlement.service';
import { searchPromotionGoods } from '../services/erp-client/erp-product.service';
import { analyzePurchaseOrder, buildPurchaseLines } from '../services/procurement-order/procurement-analysis';
import { retryErpOperation as retryErpOp } from '../services/fixed-asset/erp-meta-utils';
import { cache, CACHE_TTL } from '../utils/cache';
import { CACHE_KEY } from '../utils/cache-keys';
import { retryAutoNode as retryAutoNodeService } from '../services/oa/oa.mutation';
import {
  resolveErpReference as resolveErpReferenceService,
  LABEL_FIELDS,
  VALUE_FIELDS,
  flattenTree,
} from '../services/erp-client/erp-reference-resolver.service';

/**
 * 获取所有 ERP 参考类型配置
 * GET /oa/erp-reference/types
 * 前端动态获取类型列表、标签字段、值字段，无需硬编码
 */
export async function getErpReferenceTypes(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const types = Object.keys(LABEL_FIELDS).map(type => ({
      type,
      labelField: LABEL_FIELDS[type],
      valueField: VALUE_FIELDS[type] || 'id',
    }));
    res.json({ code: 200, data: types });
  } catch (error) {
    next(error);
  }
}

/**
 * 获取ERP参考数据
 * GET /oa/erp-reference/:type
 * 查询参数:
 *   - keyword: 搜索关键词
 *   - includeAllStates: 客户搜索时是否包含所有状态（默认仅启用）
 */
export async function getErpReference(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { type } = req.params;
    const keyword = req.query.keyword as string | undefined;
    const includeAllStates = req.query.includeAllStates === 'true';

    let data: unknown;

    switch (type) {
      case 'assets':
        data = await searchErpAssets(keyword || '', '');
        break;

      case 'departments':
        data = await getErpDepartments();
        break;

      case 'staff':
        data = await getErpStaff(keyword || undefined);
        break;

      case 'payment-accounts': {
        const allAccounts = await getErpPaymentAccounts();
        // ERP 返回树形结构（类别 > 子账户），展平为扁平列表供 select 下拉使用
        const flatAccounts = flattenTree(allAccounts);
        data = keyword ? flatAccounts.filter(a => (a.name || a.text || '').toLowerCase().includes(keyword.toLowerCase())) : flatAccounts;
        break;
      }

      case 'asset-categories':
        data = await getErpAssetCategories();
        break;

      case 'customers':
        data = await searchErpCustomersByKeyword(keyword || '', { includeAllStates });
        break;

      case 'grades':
        data = await getErpGrades();
        break;

      case 'groups':
        data = await getErpGroups();
        break;

      case 'areas':
        data = await getErpAreas();
        break;

      case 'areas-tree':
        data = await getErpAreaTree();
        break;

      case 'brands':
        data = await fetchAllBrands();
        break;

      case 'settlement-orders': {
        const consumerId = req.query.consumerId as string;
        if (!consumerId) {
          res.status(400).json({ code: 400, message: '结算单查询需要 consumerId 参数' });
          return;
        }
        // 支持分页模式：传 page 参数时返回分页结果
        const pageParam = req.query.page as string | undefined;
        if (pageParam) {
          const page = parseInt(pageParam, 10) || 1;
          const pageSize =
            parseInt((req.query.page_size as string) || (req.query.pageSize as string), 10) || 20;
          const keyword = req.query.keyword as string | undefined;
          const startDate = req.query.startDate as string | undefined;
          const endDate = req.query.endDate as string | undefined;
          // 从前端透传的静态过滤参数（来自表单 schema 的 defaultQueryParams）
          const writeOffQueryStates = req.query.writeOffQueryStates as string | undefined;
          const consumerCollectTypes = req.query.consumerCollectTypes as string | undefined;
          const queryDebtStr = req.query.queryDebt as string | undefined;
          data = await searchErpSettlementOrdersPaged({
            traderId: consumerId,
            keyword,
            page,
            pageSize,
            startDate,
            endDate,
            ...(writeOffQueryStates !== undefined && { writeOffQueryStates }),
            ...(consumerCollectTypes !== undefined && { consumerCollectTypes }),
            ...(queryDebtStr !== undefined && { queryDebt: queryDebtStr === 'true' }),
          });
        } else {
          // 兼容旧的全量查询模式
          data = await searchErpSettlementOrders({ traderId: consumerId, keyword });
        }
        break;
      }

      case 'suppliers': {
        // 供应商列表需全量加载，供筛选下拉完整搜索
        // 优先检查统一缓存，避免逐页缓存碎片
        const cachedAll = cache.get(CACHE_KEY.ERP_PURCHASE_SUPPLIERS_ALL);
        if (cachedAll && !keyword) {
          data = cachedAll;
          break;
        }
        // 首页获取总数，再并行加载剩余页
        const pageSize = 200;
        const firstPage = await searchSuppliers(keyword || undefined, 1, pageSize);
        const allSuppliers = [...firstPage];
        if (firstPage.length >= pageSize) {
          // 估算剩余页数（每页 200 条，假设最多 10 页 = 2000 条安全上限）
          const maxPages = 10;
          const remainingPageCount = maxPages - 1;
          const remainingPages = await Promise.all(
            Array.from({ length: remainingPageCount }, (_, i) =>
              searchSuppliers(keyword || undefined, i + 2, pageSize)
            )
          );
          for (const batch of remainingPages) {
            allSuppliers.push(...batch);
            if (batch.length < pageSize) break; // 已拉完
          }
        }
        // 无关键词时写入统一缓存
        if (!keyword && allSuppliers.length > 0) {
          cache.set(CACHE_KEY.ERP_PURCHASE_SUPPLIERS_ALL, allSuppliers, CACHE_TTL.LOW_FREQUENCY);
        }
        data = allSuppliers;
        break;
      }

      case 'prepayments': {
        const traderId = req.query.traderId as string;
        if (!traderId) {
          res.status(400).json({ code: 400, message: '预付款查询需要 traderId 参数' });
          return;
        }
        const parsedTraderId = parseInt(traderId, 10);
        if (isNaN(parsedTraderId)) {
          res.status(400).json({ code: 400, message: 'traderId 必须为数字' });
          return;
        }
        data = await listTraderPrepayments(parsedTraderId, keyword || undefined);
        break;
      }

      case 'supplier-incomes': {
        const incomeTraderId = req.query.traderId as string;
        if (!incomeTraderId) {
          res.status(400).json({ code: 400, message: '收入单查询需要 traderId 参数' });
          return;
        }
        const parsedIncomeId = parseInt(incomeTraderId, 10);
        if (isNaN(parsedIncomeId)) {
          res.status(400).json({ code: 400, message: 'traderId 必须为数字' });
          return;
        }
        data = await searchSupplierIncomes(parsedIncomeId, undefined, undefined, keyword || undefined);
        break;
      }

      case 'purchase-orders': {
        const supplierIdsParam = req.query.supplierIds as string;
        if (!supplierIdsParam) {
          res.status(400).json({ code: 400, message: '采购订单查询需要 supplierIds 参数' });
          return;
        }
        const supplierIds = supplierIdsParam.split(',').map(Number).filter(n => !isNaN(n));
        const result = await searchPurchaseOrders({ supplierIds, states: ['UN_APPROVED'], size: 500, keyword: keyword || undefined });
        data = result.records;
        break;
      }

      case 'purchase-settlements': {
        // 采购结算单列表：支持日期范围、关键词、供应商筛选
        const psStartDate = req.query.startDate as string | undefined;
        const psEndDate = req.query.endDate as string | undefined;
        const psSupplierId = req.query.supplierId as string | undefined;
        const psPage = parseInt((req.query.page as string) || '1', 10);
        const psPageSize = parseInt((req.query.pageSize as string) || '20', 10);
        const psResult = await searchPurchaseSettlements({
          startDate: psStartDate || undefined,
          endDate: psEndDate || undefined,
          supplierId: psSupplierId || undefined,
          current: psPage,
          size: psPageSize,
          keyword: keyword || undefined,
        });
        data = psResult;
        break;
      }

      case 'allocatable-purchase-details': {
        // 可分摊采购明细：支持按结算单号、供应商ID列表、分页大小筛选
        const apdBillStr = req.query.billStr as string | undefined;
        const apdSupplierIds = req.query.supplierIdList as string | undefined;
        const apdStartDate = req.query.startDate as string | undefined;
        const apdEndDate = req.query.endDate as string | undefined;
        const apdSize = parseInt((req.query.size as string) || '', 10);
        const apdResult = await getAllocatablePurchaseDetails({
          billStr: apdBillStr || undefined,
          supplierIdList: apdSupplierIds ? apdSupplierIds.split(',').filter(Boolean) : undefined,
          startDate: apdStartDate || undefined,
          endDate: apdEndDate || undefined,
          size: !isNaN(apdSize) && apdSize > 0 ? apdSize : undefined,
        });
        data = apdResult;
        break;
      }

      case 'allocatable-expense-details': {
        // 可分摊费用明细：支持按费用单号、交易对象类型筛选
        const aedBillStr = req.query.billStr as string | undefined;
        const aedTraderTypes = req.query.traderTypes as string | undefined;
        const aedStartDate = req.query.startDate as string | undefined;
        const aedEndDate = req.query.endDate as string | undefined;
        const aedResult = await getAllocatableExpenseDetails({
          billStr: aedBillStr || undefined,
          traderTypes: aedTraderTypes ? aedTraderTypes.split(',').filter(Boolean) : undefined,
          startDate: aedStartDate || undefined,
          endDate: aedEndDate || undefined,
        });
        data = aedResult;
        break;
      }

      case 'supplier-debts': {
        // 供应商应付单据：需要 traderId（供应商 ID）
        const sdTraderId = req.query.traderId as string;
        if (!sdTraderId) {
          res.status(400).json({ code: 400, message: '供应商应付单据查询需要 traderId 参数' });
          return;
        }
        const sdParsedTraderId = parseInt(sdTraderId, 10);
        if (isNaN(sdParsedTraderId)) {
          res.status(400).json({ code: 400, message: 'traderId 必须为数字' });
          return;
        }
        // 支持分页模式：传 page 参数时返回分页结果
        const sdPageParam = req.query.page as string | undefined;
        if (sdPageParam) {
          const sdPage = parseInt(sdPageParam, 10) || 1;
          const sdPageSize =
            parseInt((req.query.page_size as string) || (req.query.pageSize as string), 10) || 20;
          const sdKeyword = req.query.keyword as string | undefined;
          data = await searchSupplierDebtsPaged({
            traderId: sdParsedTraderId,
            keyword: sdKeyword,
            page: sdPage,
            pageSize: sdPageSize,
          });
        } else {
          data = await searchSupplierDebts(sdParsedTraderId);
        }
        break;
      }

      case 'promotion-goods': {
        // 促销表单商品搜索：返回含成本价和可用单位的商品列表
        const pgKeyword = (req.query.keyword as string) || '';
        const pgLimit = parseInt((req.query.limit as string) || '50', 10);
        data = await searchPromotionGoods(pgKeyword, pgLimit);
        break;
      }

      default:
        res.status(400).json({ code: 400, message: `不支持的参考数据类型: ${type}` });
        return;
    }

    res.json({ code: 200, data });
  } catch (error) {
    next(error);
  }
}

/**
 * 获取采购订单分析结果（含行项明细）
 * GET /oa/erp-reference/purchase-orders/:billId/analysis
 * 在表单选中采购订单后调用，返回行项明细供前端预填充表格
 */
export async function getPurchaseOrderAnalysis(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const billId = Number(req.params.billId);
    if (isNaN(billId) || billId <= 0) {
      res.status(400).json({ code: 400, message: '无效的采购订单ID' });
      return;
    }

    const analysis = await analyzePurchaseOrder(billId);
    const purchaseLines = buildPurchaseLines(analysis.lines);

    res.json({
      code: 200,
      data: {
        billId: analysis.billId,
        billStr: analysis.billStr,
        supplierId: analysis.supplierId,
        supplierName: analysis.supplierName,
        warehouseName: analysis.warehouseName,
        totalAmount: analysis.totalAmount,
        purchaseLines,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('超时')) {
      res.status(504).json({ code: 504, message: error.message });
      return;
    }
    next(error);
  }
}

/**
 * 重试失败的ERP操作
 * POST /oa/instances/:id/retry-erp
 */
export async function retryErpOperation(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const instanceId = Number(req.params.id);
    if (isNaN(instanceId)) {
      res.status(400).json({ code: 400, message: '无效的实例ID' });
      return;
    }
    await retryErpOp(instanceId);
    res.json({ code: 200, message: 'ERP重试已触发' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ERP重试失败';
    res.status(500).json({ code: 500, message });
  }
}

/**
 * 重试卡住的 auto 节点
 * POST /oa/instances/:id/retry-auto-node
 */
export async function retryAutoNode(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const instanceId = Number(req.params.id);
    if (isNaN(instanceId)) {
      res.status(400).json({ code: 400, message: '无效的实例ID' });
      return;
    }
    await retryAutoNodeService(instanceId);
    res.json({ code: 200, message: 'auto节点重试已触发' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'auto节点重试失败';
    // 业务逻辑错误返回 400，未知/系统错误返回 500
    const clientErrors = [
      '不存在',
      '已处于终态',
      '正在处理中',
      '不是 auto 类型',
      '不满足重试条件',
      '未找到表单类型',
    ];
    const isClientError = clientErrors.some(keyword => message.includes(keyword));
    const status = isClientError ? 400 : 500;
    res.status(status).json({ code: status, message });
  }
}

/**
 * 解析 ERP ID → 名称
 * GET /oa/erp-reference/:type/resolve?ids=1,2,3
 */
export async function resolveErpReference(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { type } = req.params;
    const idsParam = req.query.ids as string | undefined;

    if (!idsParam) {
      res.status(400).json({ code: 400, message: 'ids 参数必填' });
      return;
    }
    const ids = idsParam
      .split(',')
      .map(Number)
      .filter(n => !isNaN(n));
    if (ids.length === 0) {
      res.status(400).json({ code: 400, message: 'ids 参数格式无效' });
      return;
    }

    const consumerId = req.query.consumerId as string | undefined;
    const resolved = await resolveErpReferenceService(type, ids, consumerId);
    res.json({ code: 200, data: resolved });
  } catch (error) {
    next(error);
  }
}

/**
 * 获取客户营业执照信息
 * GET /oa/erp-reference/customers/:id/license-info
 *
 * 从 ERP 客户详情接口提取执照图片 URL，供前端表单展示已有执照
 */
export async function getCustomerLicense(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const customerId = Number(req.params.id);
    if (isNaN(customerId) || customerId <= 0) {
      res.status(400).json({ code: 400, message: '无效的客户ID' });
      return;
    }

    try {
      const licenseInfo = await getCustomerLicenseInfo(customerId);
      res.json({ code: 200, data: licenseInfo });
    } catch (erpError) {
      // ERP 不可用时降级返回，保证表单仍可用
      log.warn(
        '获取客户执照信息失败，降级返回:',
        erpError instanceof Error ? erpError.message : erpError
      );
      res.json({ code: 200, data: { hasLicense: false, imageCount: 0, attachedPicUrls: [] } });
    }
  } catch (error) {
    next(error);
  }
}

/**
 * 获取客户欠款总额
 * GET /oa/erp-reference/customers/:id/debt
 *
 * 通过 settlement API 求和 leftAmount 获取真实欠款（ERP debtAmount 字段不可靠）
 */
export async function getCustomerDebt(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const customerId = Number(req.params.id);
    if (isNaN(customerId) || customerId <= 0) {
      res.status(400).json({ code: 400, message: '无效的客户ID' });
      return;
    }

    try {
      const debtAmount = await getCustomerDebtTotal(customerId);
      res.json({ code: 200, data: { debtAmount } });
    } catch (erpError) {
      // ERP 不可用时降级返回 null，前端可据此决定是否显示
      log.warn(
        '获取客户欠款失败，降级返回:',
        erpError instanceof Error ? erpError.message : erpError
      );
      res.json({ code: 200, data: { debtAmount: null } });
    }
  } catch (error) {
    next(error);
  }
}
