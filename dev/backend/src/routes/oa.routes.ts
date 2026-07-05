/**
 * OA路由
 * @module routes/oa.routes
 */
import { createLogger } from '../utils/logger';
const log = createLogger('Routes');

import express, { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
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
  sendBack,
} from '../controllers/oa-mutation.controller';
import {
  // 数据管理
  getDataList,
  exportData,
  downloadExport,
} from '../controllers/oa-data.controller';
import {
  // ERP参考数据
  getErpReference,
  resolveErpReference,
  getCustomerLicense,
  getCustomerDebt,
  retryErpOperation,
  retryAutoNode,
  getPurchaseOrderAnalysis,
  getErpReferenceTypes,
} from '../controllers/erp-reference.controller';
import {
  terminateChargeContract,
} from '../services/erp-client/erp-market-expense.service';
import { cleanupExpenditureBill } from '../services/erp-client/erp-cleanup';
import {
  // 流程交接
  scanHandoverHandler,
  executeHandoverHandler,
  searchUsersHandler,
  getHistoryHandler,
} from '../controllers/oa-handover.controller';
import {
  // 表单管理（管理员专用）
  listFormTypesForAdmin,
  updateFormTypeBasic,
  updateWorkflowSettings,
  updateViewPermissions,
  listRolesForAdmin,
  batchGetUsers,
} from '../controllers/oa-form-type-admin.controller';
import { uploadCreditLicense, getCreditLicenseUrl } from '../middleware/credit-upload';
import { uploadOaAttachment, uploadCommentImage, uploadCommentFile, getOaAttachmentUrl } from '../middleware/oa-attachment-upload';

const router = Router();

/** Multer 文件上传错误处理：将 MulterError 转为 JSON 响应 */
function multerErrorHandler(err: any, _req: Request, res: Response, next: NextFunction) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ code: 400, message: '文件大小超出限制' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ code: 400, message: '文件数量超出限制' });
    }
    return res.status(400).json({ code: 400, message: err.message });
  }
  if (err) {
    return res.status(400).json({ code: 400, message: err.message });
  }
  next();
}

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

      const { getFormTypeByCodeQuery } = await import('../services/oa/oa-form-type.query');
      const formType = await getFormTypeByCodeQuery(code);
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

      // 安全检测：条件节点需要 resolvePreviewContext 才能正确预览
      const hasConditionNodes = formType.workflowDef.nodes.some(n => n.condition);
      if (hasConditionNodes && !formType.resolvePreviewContext) {
        log.warn(
          `[流程预览] 表单 ${code} 有条件审批环节但未配置 resolvePreviewContext，` +
          `条件判断可能不准确。如果条件字段来自用户直接输入则无影响，` +
          `如果来自外部系统计算则需要补充 resolvePreviewContext。`
        );
      }

      // 2. 条件过滤：根据丰富的上下文过滤出可见节点
      const { filterNodesByCondition } = await import('../services/oa/oa-utils');
      const { resolvePreviewApproversForNodes } = await import('../services/oa/oa.query');
      const visibleNodes = filterNodesByCondition(formType.workflowDef.nodes, enrichedData);

      // 3. 解析审批人：仅为可见节点解析审批人（传递 enrichedData 以支持 formDataUserIdField 类型节点）
      const approvers = await resolvePreviewApproversForNodes(visibleNodes, userId, enrichedData);

      res.json({ code: 200, data: { visibleNodes, approvers } });
    } catch (error) {
      // 预览场景出错时降级：返回全量节点，不阻断用户操作
      log.warn(`Error for ${req.params.code}:`, error instanceof Error ? error.message : error);
      try {
        const { getFormTypeByCodeQuery } = await import('../services/oa/oa-form-type.query');
        const formType = await getFormTypeByCodeQuery(req.params.code);
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

// 实时预览计算（根据表单数据实时计算展示字段值）
router.post(
  '/form-types/:code/compute-preview',
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

      const { getFormTypeByCodeQuery } = await import('../services/oa/oa-form-type.query');
      const formType = await getFormTypeByCodeQuery(code);
      if (!formType?.computePreview) {
        res.json({ code: 200, data: {} });
        return;
      }
      const result = await formType.computePreview(formData || {}, userId);
      res.json({ code: 200, data: result });
    } catch (error) {
      log.warn(`compute-preview error for ${req.params.code}:`, error instanceof Error ? error.message : error);
      res.json({ code: 200, data: {}, warning: '预览计算暂不可用' });
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

// 提交审批（OA 表单含签名 base64 数据，需 1MB 限制）
router.post('/instances', express.json({ limit: '1mb' }), requirePermission('oa:read'), submit);

// 同意审批
router.post('/instances/:id/approve', requirePermission('oa:read'), approve);

// 拒绝审批
router.post('/instances/:id/reject', requirePermission('oa:read'), reject);

// 转交审批
router.post('/instances/:id/transfer', requirePermission('oa:read'), transfer);

// 加签
router.post('/instances/:id/countersign', requirePermission('oa:read'), countersign);

// 撤回审批
router.post('/instances/:id/withdraw', requirePermission('oa:read'), withdraw);

// 退回审批（流转路由）
router.post('/instances/:id/send-back', requirePermission('oa:read'), sendBack);

// 标记抄送已读
router.post('/instances/:id/cc-read', requirePermission('oa:read'), markCcAsRead);

// 更新实例表单数据（操作型节点，不推进流程）
router.post('/instances/:id/update', requirePermission('oa:read'), updateInstance);

// 添加评论（独立评论，不执行审批动作）
router.post('/instances/:id/comment', requirePermission('oa:read'), addComment);

// =====================================================
// 节点时限接口
// =====================================================

// 获取实例的催办/抄送日志
router.get(
  '/instances/:id/timeout-logs',
  requirePermission('oa:read'),
  async (req: Request, res: Response) => {
    try {
      const instanceId = parseInt(req.params.id, 10);
      if (isNaN(instanceId)) {
        res.status(400).json({ code: 400, message: '无效的实例ID' });
        return;
      }
      const { getTimeoutLogs } = await import('../services/oa/timeout/oa-timeout.repository');
      const logs = await getTimeoutLogs(instanceId);
      res.json({ code: 200, data: logs });
    } catch (error) {
      res.status(500).json({
        code: 500,
        message: error instanceof Error ? error.message : '获取催办日志失败',
      });
    }
  }
);

// 手动催办当前节点
router.post(
  '/instances/:id/remind',
  requirePermission('oa:read'),
  async (req: Request, res: Response) => {
    try {
      const instanceId = parseInt(req.params.id, 10);
      if (isNaN(instanceId)) {
        res.status(400).json({ code: 400, message: '无效的实例ID' });
        return;
      }
      const { appQuery } = await import('../db/appPool');
      const { sendReminder } = await import('../services/oa/timeout/oa-timeout-reminder');
      const { insertTimeoutLog, updateReminderState } = await import(
        '../services/oa/timeout/oa-timeout.repository'
      );

      // 查找当前 pending 节点
      const nodeResult = await appQuery(
        `SELECT n.*, i.instance_no, i.title, i.applicant_id, ft.name AS form_type_name,
                u.name AS first_user_name
         FROM oa_approval_nodes n
         JOIN oa_approval_instances i ON i.id = n.instance_id
         JOIN oa_form_types ft ON ft.id = i.form_type_id
         LEFT JOIN LATERAL (
           SELECT name FROM users WHERE id = ANY(n.assigned_user_ids) LIMIT 1
         ) u ON true
         WHERE n.instance_id = $1 AND n.status = 'pending'
           AND n.deadline_at IS NOT NULL AND n.deadline_at < NOW()
         LIMIT 1`,
        [instanceId]
      );

      if (nodeResult.rows.length === 0) {
        res.status(400).json({ code: 400, message: '当前无超时的待处理节点' });
        return;
      }

      const node = nodeResult.rows[0];

      // 权限校验：仅申请人、当前审批人或管理员可手动催办
      const userId = req.user?.userId;
      const isAdmin = req.user?.roles?.includes('admin');
      const isApplicant = node.applicant_id === userId;
      const isCurrentApprover = Array.isArray(node.assigned_user_ids) && node.assigned_user_ids.includes(userId);
      if (!isAdmin && !isApplicant && !isCurrentApprover) {
        res.status(403).json({ code: 403, message: '只有申请人、当前审批人或管理员可以催办' });
        return;
      }

      // S2: 检查是否已达最大催办次数
      const maxReminders = node.timeout_config?.reminder?.maxReminders;
      if (maxReminders && node.reminder_count >= maxReminders) {
        res.status(400).json({ code: 400, message: `已达最大催办次数 (${maxReminders})` });
        return;
      }

      const sent = await sendReminder(node);
      if (!sent) {
        res.status(500).json({ code: 500, message: '催办通知发送失败，请检查钉钉连接' });
        return;
      }

      await updateReminderState(node.id, {
        last_reminder_at: new Date(),
        reminder_count: node.reminder_count + 1,
      });
      await insertTimeoutLog({
        node_id: node.id,
        instance_id: instanceId,
        log_type: 'manual_remind',
        recipient_user_id: node.assigned_user_ids?.[0] ?? null,
        recipient_user_name: node.first_user_name || null,
        is_supervisor_cc: false,
        message_content: { manual: true, reminder_count: node.reminder_count + 1 },
      });

      res.json({ code: 200, message: '催办通知已发送' });
    } catch (error) {
      res.status(500).json({
        code: 500,
        message: error instanceof Error ? error.message : '手动催办失败',
      });
    }
  }
);

// 获取转交候选人列表
router.get(
  '/transfer-candidates',
  requirePermission('oa:read'),
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
           WHERE r.code IN ('admin', 'department_manager', 'current_accountant', 'marketing_manager', 'general_manager', 'admin_staff', 'warehouse_manager')
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

// 获取采购订单分析结果（含行项明细，供表单选中后预填充明细表）
router.get(
  '/erp-reference/purchase-orders/:billId/analysis',
  requirePermission('oa:read'),
  getPurchaseOrderAnalysis
);

// 获取所有 ERP 参考类型配置（前端动态加载，无需硬编码）
router.get('/erp-reference/types', requirePermission('oa:read'), getErpReferenceTypes);

// 获取ERP参考数据（审批只读用户也需要查看参考数据，read 或 write 任一即可）
router.get('/erp-reference/:type', requirePermission('oa:read'), getErpReference);

// 解析ERP ID→名称（供详情页展示使用）
router.get(
  '/erp-reference/:type/resolve',
  requirePermission('oa:read'),
  resolveErpReference
);

// 获取客户营业执照信息（供表单展示已有执照）
router.get(
  '/erp-reference/customers/:id/license-info',
  requirePermission('oa:read'),
  getCustomerLicense
);

// 获取客户欠款总额（供表单展示欠款，用于停用校验）
router.get(
  '/erp-reference/customers/:id/debt',
  requirePermission('oa:read'),
  getCustomerDebt
);

// 重试失败的ERP操作
router.post('/instances/:id/retry-erp', requirePermission('oa:read'), retryErpOperation);

// 重试卡住的auto节点
router.post('/instances/:id/retry-auto-node', requirePermission('oa:read'), retryAutoNode);

// =====================================================
// 客户授信 - 营业执照上传
// =====================================================

router.post(
  '/upload-license',
  // 权限：finance:credit:write（授信专有）或 oa:read（审批通用）均可上传
  requirePermission(['finance:credit:write', 'oa:read']),
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
// OA 附件上传（通用，适用于所有表单的 upload 字段）
// =====================================================

router.post(
  '/upload-attachment',
  requirePermission('oa:read'),
  uploadOaAttachment.array('files', 10),
  multerErrorHandler,
  async (req: Request, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        res.status(400).json({ code: 400, message: '请上传文件' });
        return;
      }
      const urls = files.map(f => getOaAttachmentUrl(f.filename));
      res.json({ code: 200, data: { urls } });
    } catch (error) {
      res
        .status(500)
        .json({ code: 500, message: error instanceof Error ? error.message : '上传失败' });
    }
  }
);

// =====================================================
// 评论/附言图片上传（最多9张，每张≤5MB）
// =====================================================

router.post(
  '/upload-comment-image',
  requirePermission('oa:read'),
  uploadCommentImage.array('images', 9),
  multerErrorHandler,
  async (req: Request, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        res.status(400).json({ code: 400, message: '请上传图片' });
        return;
      }
      const urls = files.map(f => ({
        name: f.originalname,
        url: getOaAttachmentUrl(f.filename),
        size: f.size,
        type: f.mimetype,
        isImage: true,
      }));
      res.json({ code: 200, data: { attachments: urls } });
    } catch (error) {
      res
        .status(500)
        .json({ code: 500, message: error instanceof Error ? error.message : '上传失败' });
    }
  }
);

// =====================================================
// 评论/附言文件上传（最多9个，每个≤200MB）
// =====================================================

router.post(
  '/upload-comment-file',
  requirePermission('oa:read'),
  uploadCommentFile.array('files', 9),
  multerErrorHandler,
  async (req: Request, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        res.status(400).json({ code: 400, message: '请上传文件' });
        return;
      }
      const urls = files.map(f => ({
        name: f.originalname,
        url: getOaAttachmentUrl(f.filename),
        size: f.size,
        type: f.mimetype,
        isImage: false,
      }));
      res.json({ code: 200, data: { attachments: urls } });
    } catch (error) {
      res
        .status(500)
        .json({ code: 500, message: error instanceof Error ? error.message : '上传失败' });
    }
  }
);

// =====================================================
// 用户银行账户历史（物流装卸费用申请专用）
// =====================================================

// 获取当前用户的银行账户列表
router.get(
  '/user/bank-accounts',
  requirePermission('oa:read'),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ code: 401, message: '未登录' });
        return;
      }
      const { getUserBankAccounts } = await import('../services/oa/user-bank-account.service');
      const accounts = await getUserBankAccounts(userId);
      res.json({ code: 200, data: accounts });
    } catch (error) {
      res.status(500).json({
        code: 500,
        message: error instanceof Error ? error.message : '获取银行账户失败',
      });
    }
  }
);

// 新增银行账户
router.post(
  '/user/bank-accounts',
  requirePermission('oa:read'),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ code: 401, message: '未登录' });
        return;
      }
      const { saveBankAccount } = await import('../services/oa/user-bank-account.service');
      const account = await saveBankAccount(userId, req.body);
      res.json({ code: 200, data: account });
    } catch (error) {
      res.status(500).json({
        code: 500,
        message: error instanceof Error ? error.message : '保存银行账户失败',
      });
    }
  }
);

// 删除银行账户
router.delete(
  '/user/bank-accounts/:id',
  requirePermission('oa:read'),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ code: 401, message: '未登录' });
        return;
      }
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ code: 400, message: '无效的账户ID' });
        return;
      }
      const { deleteBankAccount } = await import('../services/oa/user-bank-account.service');
      await deleteBankAccount(id, userId);
      res.json({ code: 200, message: '删除成功' });
    } catch (error) {
      res.status(500).json({
        code: 500,
        message: error instanceof Error ? error.message : '删除银行账户失败',
      });
    }
  }
);

// =====================================================
// 用户签名持久化（跨表单签名复用）
// =====================================================

// 获取当前用户已保存的签名
router.get(
  '/user/signature',
  requirePermission('oa:read'),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ code: 401, message: '未登录' });
        return;
      }
      const { getUserSignature } = await import('../services/oa/user-signature.service');
      const signature = await getUserSignature(userId);
      res.json({ code: 200, data: signature });
    } catch (error) {
      res.status(500).json({
        code: 500,
        message: error instanceof Error ? error.message : '获取签名失败',
      });
    }
  }
);

// 保存签名到个人档案（UPSERT，覆盖旧签名）
router.post(
  '/user/signature',
  requirePermission('oa:read'),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ code: 401, message: '未登录' });
        return;
      }
      const { signatureData } = req.body;
      if (!signatureData) {
        res.status(400).json({ code: 400, message: '签名数据不能为空' });
        return;
      }
      // base64 签名 data URL 通常 < 200KB，限制 512KB 防止数据库膨胀
      if (typeof signatureData !== 'string' || signatureData.length > 512 * 1024) {
        res.status(400).json({ code: 400, message: '签名数据过大（最大 512KB）' });
        return;
      }
      const { saveUserSignature } = await import('../services/oa/user-signature.service');
      const saved = await saveUserSignature(userId, signatureData);
      res.json({ code: 200, data: saved });
    } catch (error) {
      res.status(500).json({
        code: 500,
        message: error instanceof Error ? error.message : '保存签名失败',
      });
    }
  }
);

// 删除已保存的签名
router.delete(
  '/user/signature',
  requirePermission('oa:read'),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ code: 401, message: '未登录' });
        return;
      }
      const { deleteUserSignature } = await import('../services/oa/user-signature.service');
      await deleteUserSignature(userId);
      res.json({ code: 200, message: '删除成功' });
    } catch (error) {
      res.status(500).json({
        code: 500,
        message: error instanceof Error ? error.message : '删除签名失败',
      });
    }
  }
);

// =====================================================
// 数据管理接口
// =====================================================

// 获取数据列表（表单级权限过滤在 Controller 内完成）
router.get('/data', requirePermission('oa:read'), getDataList);

// 导出数据（表单级权限过滤在 Controller 内完成）
router.get('/data/export', requirePermission('oa:read'), exportData);

// 下载导出文件（带鉴权）
router.get('/data/export/download/:fileName', requirePermission('oa:read'), downloadExport);

// =====================================================
// 流程交接接口
// =====================================================

// 扫描交接影响范围
router.get('/workflow-handover/scan', requirePermission('oa:workflow:handover'), scanHandoverHandler);

// 执行交接
router.post('/workflow-handover/execute', requirePermission('oa:workflow:handover'), executeHandoverHandler);

// 搜索用户（交接人员选择器）
router.get('/workflow-handover/user-search', requirePermission('oa:workflow:handover'), searchUsersHandler);

// 交接历史
router.get('/workflow-handover/history', requirePermission('oa:workflow:handover'), getHistoryHandler);

// =====================================================
// 表单管理接口（管理员专用）
// =====================================================

// 获取所有表单类型（含 allowed_roles 等管理配置）
router.get('/admin/form-types', requirePermission('oa:form:manage'), listFormTypesForAdmin);

// 更新表单基本信息和可发起岗位
router.patch('/admin/form-types/:code', requirePermission('oa:form:manage'), updateFormTypeBasic);

// 更新表单流程管理配置（审批人规则、签署模式、超时时限）
router.put('/admin/form-types/:code/workflow-settings', requirePermission('oa:form:manage'), updateWorkflowSettings);

// 更新表单查看权限配置（管理员配置非办理人查看详情的字段可见性）
router.patch('/admin/form-types/:code/view-permissions', requirePermission('oa:form:manage'), updateViewPermissions);

// 批量获取用户信息（根据 ID 列表，用于表单管理页显示用户姓名）
router.get('/admin/users/batch', requirePermission('oa:form:manage'), batchGetUsers);

// 获取系统所有岗位列表（供配置审批人时使用）
router.get('/admin/roles', requirePermission('oa:form:manage'), listRolesForAdmin);

// =====================================================
// 市场费用 - ERP 操作接口
// =====================================================

/** 终止兑付协议 */
router.post(
  '/erp-market-expense/terminate-contract',
  requirePermission('oa:read'),
  async (req: Request, res: Response) => {
    try {
      const { billStr } = req.body;
      if (!billStr) {
        res.status(400).json({ code: 400, message: '缺少 billStr 参数' });
        return;
      }
      await terminateChargeContract(billStr);
      res.json({ code: 200, message: '兑付协议已终止' });
    } catch (error) {
      res.status(500).json({ code: 500, message: error instanceof Error ? error.message : '终止协议失败' });
    }
  }
);

/** 取消费用单（反审核 + 取消） */
router.post(
  '/erp-market-expense/cancel-expenditure',
  requirePermission('oa:read'),
  async (req: Request, res: Response) => {
    try {
      const { billId } = req.body;
      if (!billId) {
        res.status(400).json({ code: 400, message: '缺少 billId 参数' });
        return;
      }
      await cleanupExpenditureBill(billId);
      res.json({ code: 200, message: '费用单已取消' });
    } catch (error) {
      res.status(500).json({ code: 500, message: error instanceof Error ? error.message : '取消费用单失败' });
    }
  }
);

export default router;
