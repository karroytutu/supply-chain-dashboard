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
  retryErpOperation,
} from '../controllers/erp-reference.controller';
import { uploadCreditLicense, getCreditLicenseUrl } from '../middleware/credit-upload';
import { Request, Response } from 'express';

const router = Router();

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

// 重试失败的ERP操作
router.post('/instances/:id/retry-erp', requirePermission('oa:approval:write'), retryErpOperation);

// =====================================================
// 客户授信 - 营业执照上传
// =====================================================

router.post(
  '/upload-license',
  requirePermission('finance:credit:write'),
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
