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
  getErpAssetDetail,
  getErpDepartments,
  getErpStaff,
  getErpPaymentAccounts,
  getErpAssetCategories,
} from '../services/fixed-asset/fixed-asset.query';
import {
  searchErpCustomersByKeyword,
  getErpCustomerProfile,
  getCustomerLicenseInfo,
  getCustomerDebtTotal,
} from '../services/erp-client/erp-customer.service';
import {
  getErpGrades,
  getErpGroups,
  getErpAreas,
} from '../services/erp-client/erp-customer-reference.service';
import {
  searchErpSettlementOrders,
  searchErpSettlementOrdersPaged,
} from '../services/erp-client/erp-settlement.service';
import { retryErpOperation as retryErpOp } from '../services/fixed-asset/erp-meta-utils';
import { retryAutoNode as retryAutoNodeService } from '../services/oa/oa.mutation';

/** 解析结果项 */
interface ResolvedItem {
  id: number;
  label: string;
}

/** 递归展平树形结构 */
function flattenTree<T extends { children?: T[] | null }>(nodes: T[]): T[] {
  const result: T[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children?.length) {
      result.push(...flattenTree(node.children));
    }
  }
  return result;
}

/** 各 ERP 类型的标签字段映射 */
const LABEL_FIELDS: Record<string, string> = {
  assets: 'name',
  departments: 'deptName',
  staff: 'name',
  'payment-accounts': 'name',
  'asset-categories': 'name',
  customers: 'name',
  'settlement-orders': 'bizStr',
  grades: 'name',
  groups: 'name',
  areas: 'name',
};

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
        data = await getErpStaff();
        break;

      case 'payment-accounts':
        data = await getErpPaymentAccounts();
        break;

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
          data = await searchErpSettlementOrdersPaged({
            traderId: consumerId,
            keyword,
            page,
            pageSize,
          });
        } else {
          // 兼容旧的全量查询模式
          data = await searchErpSettlementOrders({ traderId: consumerId, keyword });
        }
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

    const labelField = LABEL_FIELDS[type] || 'name';
    let resolved: ResolvedItem[];

    switch (type) {
      case 'customers': {
        const results = await Promise.allSettled(
          ids.map(async id => {
            const profile = await getErpCustomerProfile(id);
            return { id, label: String((profile as Record<string, unknown>)[labelField] ?? id) };
          })
        );
        resolved = results.map((r, i) =>
          r.status === 'fulfilled' ? r.value : { id: ids[i], label: String(ids[i]) }
        );
        break;
      }

      case 'assets': {
        const results = await Promise.allSettled(
          ids.map(async id => {
            const asset = await getErpAssetDetail(id);
            return { id, label: String(asset?.[labelField as keyof typeof asset] ?? id) };
          })
        );
        resolved = results.map((r, i) =>
          r.status === 'fulfilled' ? r.value : { id: ids[i], label: String(ids[i]) }
        );
        break;
      }

      case 'departments': {
        const all = await getErpDepartments();
        const map = new Map(all.map(d => [d.deptId, d.deptName]));
        resolved = ids.map(id => ({ id, label: String(map.get(id) ?? id) }));
        break;
      }

      case 'staff': {
        const all = await getErpStaff();
        const map = new Map(all.map(s => [s.id, s.name]));
        resolved = ids.map(id => ({ id, label: String(map.get(id) ?? id) }));
        break;
      }

      case 'payment-accounts': {
        const all = flattenTree(await getErpPaymentAccounts());
        const map = new Map(all.map(a => [a.id, a.name]));
        resolved = ids.map(id => ({ id, label: String(map.get(id) ?? id) }));
        break;
      }

      case 'asset-categories': {
        const all = flattenTree(await getErpAssetCategories());
        const map = new Map(all.map(c => [c.id, c.name]));
        resolved = ids.map(id => ({ id, label: String(map.get(id) ?? id) }));
        break;
      }

      case 'settlement-orders': {
        const consumerId = req.query.consumerId as string;
        if (!consumerId) {
          res.status(400).json({ code: 400, message: '结算单解析需要 consumerId 参数' });
          return;
        }
        const all = await searchErpSettlementOrders({ traderId: consumerId });
        // 构建含金额的 label（如 "THJS241214000001 (¥12,345.00)"）
        const buildLabel = (order: { bizStr: string; leftAmount: string }) => {
          const amount = parseFloat(order.leftAmount);
          if (isNaN(amount)) return order.bizStr;
          return `${order.bizStr} (¥${Number(amount).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
        };
        // 双模式查找：新数据用 bizId，旧数据用 id
        const bizIdMap = new Map(all.map(o => [o.bizId, buildLabel(o)]));
        const idMap = new Map(all.map(o => [o.id, buildLabel(o)]));
        resolved = ids.map(id => ({
          id,
          label: String(bizIdMap.get(id) ?? idMap.get(id) ?? id),
        }));
        break;
      }

      case 'grades': {
        const all = await getErpGrades();
        const map = new Map(all.map(g => [g.id, g.name]));
        resolved = ids.map(id => ({ id, label: String(map.get(id) ?? map.get(String(id)) ?? id) }));
        break;
      }

      case 'groups': {
        const all = await getErpGroups();
        const map = new Map(all.map(g => [g.id, g.name]));
        resolved = ids.map(id => ({ id, label: String(map.get(id) ?? map.get(String(id)) ?? id) }));
        break;
      }

      case 'areas': {
        const all = await getErpAreas();
        const map = new Map(all.map(a => [a.id, a.name]));
        resolved = ids.map(id => ({ id, label: String(map.get(id) ?? map.get(String(id)) ?? id) }));
        break;
      }

      default:
        res.status(400).json({ code: 400, message: `不支持的参考数据类型: ${type}` });
        return;
    }

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
