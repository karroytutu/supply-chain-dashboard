/**
 * OA审批路由
 * @module routes/oa-approval.routes
 */

import { Router } from 'express';
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
} from '../controllers/oa-approval.controller';
import {
  // 审批实例操作
  submit,
  approve,
  reject,
  transfer,
  countersign,
  withdraw,
} from '../controllers/oa-approval-mutation.controller';
import {
  // 数据管理
  getDataList,
  exportData,
} from '../controllers/oa-data.controller';
import {
  // 站内消息
  listMessages,
  getUnreadCount,
  readMessage,
  readAllMessages,
} from '../controllers/oa-message.controller';
import {
  // ERP参考数据
  getErpReference,
  resolveErpReference,
  getCustomerLicense,
  retryErpOperation,
} from '../controllers/erp-reference.controller';
import { uploadCreditLicense, getCreditLicenseUrl } from '../middleware/credit-upload';
import { Request, Response } from 'express';

const router = Router();

// =====================================================
// Token快速操作接口（无需JWT认证，使用Token自身认证）
// 必须放在 router.use(authMiddleware) 之前
// =====================================================

// 验证Token有效性
router.post('/validate-token', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ code: 400, message: '缺少token参数' });
      return;
    }

    const { validateActionToken } = await import('../services/oa-approval/oa-action-token');
    const tokenData = await validateActionToken(token);
    if (!tokenData) {
      res.json({ code: 200, data: { valid: false } });
      return;
    }

    // 获取审批实例信息
    const { appQuery } = await import('../db/appPool');
    const instResult = await appQuery<{ title: string; status: string; instance_no: string; form_type_name: string }>(
      `SELECT i.title, i.status, i.instance_no, ft.name as form_type_name
       FROM oa_approval_instances i
       JOIN oa_form_types ft ON ft.id = i.form_type_id
       WHERE i.id = $1`,
      [tokenData.instanceId]
    );

    if (instResult.rows.length === 0) {
      res.json({ code: 200, data: { valid: false } });
      return;
    }

    const inst = instResult.rows[0];
    res.json({
      code: 200,
      data: {
        valid: true,
        action: tokenData.action,
        instanceId: tokenData.instanceId,
        instanceNo: inst.instance_no,
        title: inst.title,
        formTypeName: inst.form_type_name,
        instanceStatus: inst.status,
      },
    });
  } catch (error) {
    console.error('[OA] Token验证失败:', error);
    res.status(500).json({ code: 500, message: '验证失败' });
  }
});

// 通过Token执行审批操作
router.post('/action-by-token', async (req: Request, res: Response) => {
  try {
    const { token, action, comment } = req.body;
    if (!token || !action) {
      res.status(400).json({ code: 400, message: '缺少token或action参数' });
      return;
    }

    if (!['approve', 'reject'].includes(action)) {
      res.status(400).json({ code: 400, message: '无效的action类型' });
      return;
    }

    const { validateAndConsumeActionToken } = await import('../services/oa-approval/oa-action-token');
    const tokenData = await validateAndConsumeActionToken(token);
    if (!tokenData) {
      res.status(400).json({ code: 400, message: 'Token无效或已过期' });
      return;
    }

    // 校验Token绑定的操作类型与请求操作一致
    // approve token: 允许 approve 和 reject（详情页TokenActionBar共享同一token，需同时支持两种操作）
    // view token: 允许 approve 和 reject（查看详情后可做任意审批操作）
    if (tokenData.action !== 'approve' && tokenData.action !== 'view') {
      res.status(400).json({ code: 400, message: 'Token不允许执行该操作' });
      return;
    }

    const { approveApproval, rejectApproval } = await import('../services/oa-approval/oa-approval.mutation');

    // 获取用户信息
    const { appQuery } = await import('../db/appPool');
    const userResult = await appQuery<{ id: number; name: string }>(
      `SELECT id, name FROM users WHERE id = $1`,
      [tokenData.userId]
    );
    if (userResult.rows.length === 0) {
      res.status(400).json({ code: 400, message: '用户不存在' });
      return;
    }
    const user = userResult.rows[0];

    if (action === 'approve') {
      const result = await approveApproval(tokenData.instanceId, user.id, user.name, comment);
      res.json({ code: 200, data: { status: result.status }, message: '审批通过' });
    } else {
      await rejectApproval(tokenData.instanceId, user.id, user.name, comment || '通过钉钉快速操作拒绝');
      res.json({ code: 200, data: null, message: '已拒绝' });
    }
  } catch (error) {
    console.error('[OA] Token操作失败:', error);
    const message = error instanceof Error ? error.message : '操作失败';
    res.status(400).json({ code: 400, message });
  }
});

// =====================================================
// 所有路由都需要认证
// =====================================================
router.use(authMiddleware);

// =====================================================
// 表单类型接口
// =====================================================

// 获取所有表单类型
router.get('/form-types', requirePermission('oa:approval:read'), listFormTypes);

// 获取按分类分组的表单类型
router.get('/form-types/grouped', requirePermission('oa:approval:read'), listFormTypesGrouped);

// 获取单个表单类型
router.get('/form-types/:code', requirePermission('oa:approval:read'), getFormType);

// 预解析审批人（发起审批时预览流程用）
router.get('/form-types/:code/preview-approvers', requirePermission('oa:approval:read'), async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({ code: 401, message: '未登录' });
      return;
    }
    const { previewApprovers } = await import('../services/oa-approval/oa-approval.query');
    const result = await previewApprovers(code, userId);
    res.json({ code: 200, data: result });
  } catch (error) {
    res.status(500).json({ code: 500, message: error instanceof Error ? error.message : '预解析审批人失败' });
  }
});

// 动态流程预览（根据表单数据实时计算可见节点和审批人）
router.post('/form-types/:code/preview-workflow', requirePermission('oa:approval:read'), async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    const { formData } = req.body as { formData?: Record<string, unknown> };
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({ code: 401, message: '未登录' });
      return;
    }

    const { getFormTypeByCode } = await import('../services/oa-approval/form-types');
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
    const { filterNodesByCondition } = await import('../services/oa-approval/oa-approval-utils');
    const { resolvePreviewApproversForNodes } = await import('../services/oa-approval/oa-approval.query');
    const visibleNodes = filterNodesByCondition(formType.workflowDef.nodes, enrichedData);

    // 3. 解析审批人：仅为可见节点解析审批人
    const approvers = await resolvePreviewApproversForNodes(visibleNodes, userId);

    res.json({ code: 200, data: { visibleNodes, approvers } });
  } catch (error) {
    // 预览场景出错时降级：返回全量节点，不阻断用户操作
    console.warn(`[preview-workflow] Error for ${req.params.code}:`, error instanceof Error ? error.message : error);
    try {
      const { getFormTypeByCode } = await import('../services/oa-approval/form-types');
      const formType = await getFormTypeByCode(req.params.code);
      res.json({ code: 200, data: { visibleNodes: formType?.workflowDef.nodes || [], approvers: [] } });
    } catch {
      res.json({ code: 200, data: { visibleNodes: [], approvers: [] } });
    }
  }
});

// =====================================================
// 审批实例接口
// =====================================================

// 获取审批统计
router.get('/instances/stats', requirePermission('oa:approval:read'), getStats);

// 获取审批列表
router.get('/instances', requirePermission('oa:approval:read'), listApprovals);

// 获取审批详情
router.get('/instances/:id', requirePermission('oa:approval:read'), getDetail);

// 提交审批
router.post('/instances', requirePermission('oa:approval:write'), submit);

// 同意审批
router.post('/instances/:id/approve', requirePermission('oa:approval:write'), approve);

// 拒绝审批
router.post('/instances/:id/reject', requirePermission('oa:approval:write'), reject);

// 转交审批
router.post('/instances/:id/transfer', requirePermission('oa:approval:write'), transfer);

// 加签
router.post('/instances/:id/countersign', requirePermission('oa:approval:write'), countersign);

// 撤回审批
router.post('/instances/:id/withdraw', requirePermission('oa:approval:write'), withdraw);

// 获取转交候选人列表
router.get('/transfer-candidates', requirePermission('oa:approval:write'), async (req: Request, res: Response) => {
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
    res.status(500).json({ code: 500, message: error instanceof Error ? error.message : '获取转交候选人失败' });
  }
});

// =====================================================
// ERP参考数据接口（供表单控件使用）
// =====================================================

// 获取ERP参考数据（审批只读用户也需要查看参考数据，read 或 write 任一即可）
router.get('/erp-reference/:type', requirePermission(['oa:approval:read', 'oa:approval:write']), getErpReference);

// 解析ERP ID→名称（供详情页展示使用）
router.get('/erp-reference/:type/resolve', requirePermission(['oa:approval:read', 'oa:approval:write']), resolveErpReference);

// 获取客户营业执照信息（供表单展示已有执照）
router.get('/erp-reference/customers/:id/license-info', requirePermission(['oa:approval:read', 'oa:approval:write']), getCustomerLicense);

// 重试失败的ERP操作
router.post('/instances/:id/retry-erp', requirePermission('oa:approval:write'), retryErpOperation);

// =====================================================
// 客户授信 - 营业执照上传
// =====================================================

router.post(
  '/upload-license',
  // 权限：finance:credit:write（授信专有）或 oa:approval:write（审批通用）均可上传
  requirePermission(['finance:credit:write', 'oa:approval:write']),
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
      res.status(500).json({ code: 500, message: error instanceof Error ? error.message : '上传失败' });
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

// =====================================================
// 站内消息接口
// =====================================================

// 获取未读消息数量
router.get('/messages/unread-count', requirePermission('oa:approval:read'), getUnreadCount);

// 获取消息列表
router.get('/messages', requirePermission('oa:approval:read'), listMessages);

// 标记消息已读
router.post('/messages/:id/read', requirePermission('oa:approval:write'), readMessage);

// 标记所有消息已读
router.post('/messages/read-all', requirePermission('oa:approval:write'), readAllMessages);

export default router;