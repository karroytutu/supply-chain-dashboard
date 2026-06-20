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
} from '../controllers/erp-reference.controller';
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
  updateFormTypeWorkflow,
  listRolesForAdmin,
} from '../controllers/oa-form-type-admin.controller';
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
router.post('/instances', requirePermission('oa:read'), submit);

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
        `SELECT n.*, i.instance_no, i.title, i.applicant_id, ft.name AS form_type_name
         FROM oa_approval_nodes n
         JOIN oa_approval_instances i ON i.id = n.instance_id
         JOIN oa_form_types ft ON ft.id = i.form_type_id
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
      const isCurrentApprover = node.assigned_user_id === userId;
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
        recipient_user_id: node.assigned_user_id,
        recipient_user_name: node.assigned_user_name,
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

// 获取所有表单类型（含完整 workflow_def 和 allowed_roles）
router.get('/admin/form-types', requirePermission('oa:form:manage'), listFormTypesForAdmin);

// 更新表单基本信息和可发起岗位
router.patch('/admin/form-types/:code', requirePermission('oa:form:manage'), updateFormTypeBasic);

// 更新表单审批流程配置（含乐观锁）
router.put('/admin/form-types/:code/workflow', requirePermission('oa:form:manage'), updateFormTypeWorkflow);

// 获取系统所有岗位列表（供配置审批人时使用）
router.get('/admin/roles', requirePermission('oa:form:manage'), listRolesForAdmin);

export default router;
