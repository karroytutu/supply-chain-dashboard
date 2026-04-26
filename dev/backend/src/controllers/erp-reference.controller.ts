/**
 * ERP参考数据控制器
 * 为OA审批表单提供ERP数据查询接口
 * @module controllers/erp-reference.controller
 */

import { Request, Response, NextFunction } from 'express';
import {
  searchErpAssets,
  getErpAssetDetail,
  getErpDepartments,
  getErpStaff,
  getErpPaymentAccounts,
  getErpAssetCategories,
} from '../services/fixed-asset/fixed-asset.query';
import { searchErpCustomersByKeyword, getErpCustomerProfile } from '../services/erp-client/erp-customer.service';
import { searchErpSettlementOrders } from '../services/erp-client/erp-settlement.service';
import { retryErpOperation as retryErpOp } from '../services/fixed-asset/erp-meta-utils';

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
};

/**
 * 获取ERP参考数据
 * GET /oa-approval/erp-reference/:type
 */
export async function getErpReference(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { type } = req.params;
    const keyword = req.query.keyword as string | undefined;

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
        data = await searchErpCustomersByKeyword(keyword || '');
        break;

      case 'settlement-orders': {
        const consumerId = req.query.consumerId as string;
        if (!consumerId) {
          res.status(400).json({ code: 400, message: '结算单查询需要 consumerId 参数' });
          return;
        }
        data = await searchErpSettlementOrders({ traderId: consumerId, keyword });
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
 * POST /oa-approval/instances/:id/retry-erp
 */
export async function retryErpOperation(req: Request, res: Response, next: NextFunction): Promise<void> {
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
 * 解析 ERP ID → 名称
 * GET /oa-approval/erp-reference/:type/resolve?ids=1,2,3
 */
export async function resolveErpReference(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { type } = req.params;
    const idsParam = req.query.ids as string | undefined;

    if (!idsParam) {
      res.status(400).json({ code: 400, message: 'ids 参数必填' });
      return;
    }
    const ids = idsParam.split(',').map(Number).filter((n) => !isNaN(n));
    if (ids.length === 0) {
      res.status(400).json({ code: 400, message: 'ids 参数格式无效' });
      return;
    }

    const labelField = LABEL_FIELDS[type] || 'name';
    let resolved: ResolvedItem[];

    switch (type) {
      case 'customers': {
        const results = await Promise.allSettled(
          ids.map(async (id) => {
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
          ids.map(async (id) => {
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
        const map = new Map(all.map((d) => [d.deptId, d.deptName]));
        resolved = ids.map((id) => ({ id, label: String(map.get(id) ?? id) }));
        break;
      }

      case 'staff': {
        const all = await getErpStaff();
        const map = new Map(all.map((s) => [s.id, s.name]));
        resolved = ids.map((id) => ({ id, label: String(map.get(id) ?? id) }));
        break;
      }

      case 'payment-accounts': {
        const all = flattenTree(await getErpPaymentAccounts());
        const map = new Map(all.map((a) => [a.id, a.name]));
        resolved = ids.map((id) => ({ id, label: String(map.get(id) ?? id) }));
        break;
      }

      case 'asset-categories': {
        const all = flattenTree(await getErpAssetCategories());
        const map = new Map(all.map((c) => [c.id, c.name]));
        resolved = ids.map((id) => ({ id, label: String(map.get(id) ?? id) }));
        break;
      }

      case 'settlement-orders': {
        const consumerId = req.query.consumerId as string;
        if (!consumerId) {
          res.status(400).json({ code: 400, message: '结算单解析需要 consumerId 参数' });
          return;
        }
        const all = await searchErpSettlementOrders({ traderId: consumerId });
        const map = new Map(all.map((o) => [o.id, o.bizStr]));
        resolved = ids.map((id) => ({ id, label: String(map.get(id) ?? id) }));
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
