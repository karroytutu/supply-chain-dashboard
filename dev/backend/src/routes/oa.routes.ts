/**
 * OA路由
 * @module routes/oa.routes
 */
import { createLogger } from '../utils/logger';
const log = createLogger('Routes');

import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import {
  // 表单类型
  listFormTypes,
  listFormTypesGrouped,
  getFormType,
} from '../controllers/oa-form-type.controller';
import {
  // 审批实例查询
  listApprovals,
  getStats,
  getDetail,
} from '../controllers/oa.controller';
import {
  // 审批实例操作
  submit,
  approve,
  reject,
  transfer,
  countersign,
  withdraw,
  markCcAsRead,
  updateInstance,
  addComment,
} from '../controllers/oa-mutation.controller';
import {
  // 数据管理
  getDataList,
  exportData,
} from '../controllers/oa-data.controller';
import {
  // ERP参考数据
  getErpReference,
  resolveErpReference,
  getCustomerLicense,
  getCustomerDebt,
  retryErpOperation,
  retryAutoNode,
} from '../controllers/erp-reference.controller';
import { uploadCreditLicense, getCreditLicenseUrl } from '../middleware/credit-upload';

const router = Router();

// =====================================================
// 所有路由都需要认证
// =====================================================
router.use(authMiddleware);

// =====================================================
// 表单类型接口
// =====================================================

// 获取所有表单类型
router.get('/form-types', requirePermission('oa:read'), listFormTypes);

// 获取按分类分组的表单类型
router.get('/form-types/grouped', requirePermission('oa:read'), listFormTypesGrouped);

// 获取单个表单类型
router.get('/form-types/:code', requirePermission('oa:read'), getFormType);

// 预解析审批人（发起审批时预览流程用）
router.get(
  '/form-types/:code/preview-approvers',
  requirePermission('oa:read'),
  async (req: Request, res: Response) => {
    try {
      const { code } = req.params;
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ code: 401, message: '未登录' });
        return;
      }
      const { previewApprovers } = await import('../services/oa/oa.query');
      const result = await previewApprovers(code, userId);
      res.json({ code: 200, data: result });
    } catch (error) {
      res
        .status(500)
        .json({ code: 500, message: error instanceof Error ? error.message : '预解析审批人失败' });
    }
  }
);

// 动态流程预览（根据表单数据实时计算可见节点和审批人）
router.post(
  '/form-types/:code/preview-workflow',
  requirePermission('oa:read'),
  async (req: Request, res: Response) => {
    try {
      const { code } = req.params;
      const { formData } = req.body as { formData?: Record<string, unknown> };
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ code: 401, message: '未登录' });
        return;
      }

      const { getFormTypeByCode } = await import('../services/oa/form-types');
      const formType = await getFormTypeByCode(code);
      if (!formType) {
        res.status(404).json({ code: 404, message: '表单类型不存在' });
        return;
      }

      // 1. 丰富 formData：调用 resolvePreviewContext 注入计算字段
      let enrichedData = formData || {};
      if (formType.resolvePreviewContext) {
        const { contextFields } = await formType.resolvePreviewContext(enrichedData, userId);
        enrichedData = { ...enrichedData, ...contextFields };
      }

      // 2. 条件过滤：根据丰富的上下文过滤出可见节点
      const { filterNodesByCondition } = await import('../services/oa/oa-utils');
      const { resolvePreviewApproversForNodes } = await import('../services/oa/oa.query');
      const visibleNodes = filterNodesByCondition(formType.workflowDef.nodes, enrichedData);

      // 3. 解析审批人：仅为可见节点解析审批人
      const approvers = await resolvePreviewApproversForNodes(visibleNodes, userId);

      res.json({ code: 200, data: { visibleNodes, approvers } });
    } catch (error) {
      // 预览场景出错时降级：返回全量节点，不阻断用户操作
      log.warn(`Error for ${req.params.code}:`, error instanceof Error ? error.message : error);
      try {
        const { getFormTypeByCode } = await import('../services/oa/form-types');
        const formType = await getFormTypeByCode(req.params.code);
        res.json({
          code: 200,
          data: { visibleNodes: formType?.workflowDef.nodes || [], approvers: [] },
        });
      } catch {
        res.json({ code: 200, data: { visibleNodes: [], approvers: [] } });
      }
    }
  }
);

// =====================================================
// 审批实例接口
// =====================================================

// 获取审批统计
router.get('/instances/stats', requirePermission('oa:read'), getStats);

// 获取审批列表
router.get('/instances', requirePermission('oa:read'), listApprovals);

// 获取审批详情
router.get('/instances/:id', requirePermission('oa:read'), getDetail);

// 提交审批
router.post('/instances', requirePermission('oa:write'), submit);

// 同意审批
router.post('/instances/:id/approve', requirePermission('oa:write'), approve);

// 拒绝审批
router.post('/instances/:id/reject', requirePermission('oa:write'), reject);

// 转交审批
router.post('/instances/:id/transfer', requirePermission('oa:write'), transfer);

// 加签
router.post('/instances/:id/countersign', requirePermission('oa:write'), countersign);

// 撤回审批
router.post('/instances/:id/withdraw', requirePermission('oa:write'), withdraw);

// 标记抄送已读
router.post('/instances/:id/cc-read', requirePermission('oa:read'), markCcAsRead);

// 更新实例表单数据（操作型节点，不推进流程）
router.post('/instances/:id/update', requirePermission('oa:write'), updateInstance);

// 添加评论（独立评论，不执行审批动作）
router.post('/instances/:id/comment', requirePermission('oa:write'), addComment);

// 获取转交候选人列表
router.get(
  '/transfer-candidates',
  requirePermission('oa:write'),
  async (req: Request, res: Response) => {
    try {
      const { appQuery } = await import('../db/appPool');
      const result = await appQuery(
        `SELECT DISTINCT u.id, u.name
       FROM users u
       WHERE u.status = 1
         AND u.id IN (
           SELECT ur.user_id FROM user_roles ur
           INNER JOIN roles r ON ur.role_id = r.id
           WHERE r.code IN ('admin', 'manager', 'current_accountant', 'marketing_manager', 'general_manager', 'admin_staff', 'warehouse_manager')
         )
       ORDER BY u.name
       LIMIT 100`
      );
      res.json({ code: 200, data: result.rows });
    } catch (error) {
      res.status(500).json({
        code: 500,
        message: error instanceof Error ? error.message : '获取转交候选人失败',
      });
    }
  }
);

// =====================================================
// ERP参考数据接口（供表单控件使用）
// =====================================================

// 获取ERP参考数据（审批只读用户也需要查看参考数据，read 或 write 任一即可）
router.get('/erp-reference/:type', requirePermission(['oa:read', 'oa:write']), getErpReference);

// 解析ERP ID→名称（供详情页展示使用）
router.get(
  '/erp-reference/:type/resolve',
  requirePermission(['oa:read', 'oa:write']),
  resolveErpReference
);

// 获取客户营业执照信息（供表单展示已有执照）
router.get(
  '/erp-reference/customers/:id/license-info',
  requirePermission(['oa:read', 'oa:write']),
  getCustomerLicense
);

// 获取客户欠款总额（供表单展示欠款，用于停用校验）
router.get(
  '/erp-reference/customers/:id/debt',
  requirePermission(['oa:read', 'oa:write']),
  getCustomerDebt
);

// 重试失败的ERP操作
router.post('/instances/:id/retry-erp', requirePermission('oa:write'), retryErpOperation);

// 重试卡住的auto节点
router.post('/instances/:id/retry-auto-node', requirePermission('oa:write'), retryAutoNode);

// =====================================================
// 客户授信 - 营业执照上传
// =====================================================

router.post(
  '/upload-license',
  // 权限：finance:credit:write（授信专有）或 oa:write（审批通用）均可上传
  requirePermission(['finance:credit:write', 'oa:write']),
  uploadCreditLicense.array('files', 3),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        res.status(400).json({ code: 400, message: '请上传文件' });
        return;
      }
      const urls = files.map(f => getCreditLicenseUrl(f.filename));
      res.json({ code: 200, data: { urls } });
    } catch (error) {
      res
        .status(500)
        .json({ code: 500, message: error instanceof Error ? error.message : '上传失败' });
    }
  }
);

// =====================================================
// 数据管理接口
// =====================================================

// 获取数据列表
router.get('/data', requirePermission('oa:data:read'), getDataList);

// 导出数据
router.get('/data/export', requirePermission('oa:data:export'), exportData);

export default router;
