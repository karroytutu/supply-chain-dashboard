/**
 * OA - 数据管理查询
 * @module services/oa/queries/data-query
 */

import { appQuery as query } from '../../../db/appPool';
import { escapeLikePattern } from '../../../utils/sqlHelpers';
import { ApprovalListParams, WorkflowNodeDef } from '../oa.types';
import { getFormTypeByCode } from '../form-types';
import { formatInstanceListItem, InstanceListItem } from '../oa.query';
import { getStatusLabel } from '../oa-utils';

/**
 * 获取所有审批数据列表（数据管理用）
 */
export async function getDataListAll(
  params: ApprovalListParams
): Promise<{ list: InstanceListItem[]; total: number }> {
  const conditions: string[] = [];
  const queryParams: unknown[] = [];
  let paramIndex = 1;

  if (params.formTypeCode) {
    conditions.push(`ft.code = $${paramIndex}`);
    queryParams.push(params.formTypeCode);
    paramIndex++;
  }

  if (params.status) {
    conditions.push(`i.status = $${paramIndex}`);
    queryParams.push(params.status);
    paramIndex++;
  }

  if (params.startDate) {
    conditions.push(`i.submitted_at >= $${paramIndex}`);
    queryParams.push(params.startDate);
    paramIndex++;
  }
  if (params.endDate) {
    conditions.push(`i.submitted_at <= $${paramIndex}::date + interval '1 day'`);
    queryParams.push(params.endDate);
    paramIndex++;
  }

  // keyword 模糊搜索审批编号、标题和申请人（OR 关系，括号包裹与外部 AND 衔接）
  if (params.keyword && params.keyword.trim()) {
    const keywordPattern = `%${escapeLikePattern(params.keyword.trim())}%`;
    conditions.push(`(i.instance_no ILIKE $${paramIndex} OR i.title ILIKE $${paramIndex} OR i.applicant_name ILIKE $${paramIndex})`);
    queryParams.push(keywordPattern);
    paramIndex++;
  }

  // applicant_name 模糊搜索申请人姓名
  if (params.applicantName && params.applicantName.trim()) {
    conditions.push(`i.applicant_name ILIKE $${paramIndex}`);
    queryParams.push(`%${escapeLikePattern(params.applicantName.trim())}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const page = params.page || 1;
  const pageSize = params.pageSize || 20;
  const offset = (page - 1) * pageSize;

  const countResult = await query<{ total: number }>(
    `
    SELECT COUNT(DISTINCT i.id) as total
    FROM oa_approval_instances i
    JOIN oa_form_types ft ON i.form_type_id = ft.id
    ${whereClause}
  `,
    queryParams
  );

  const total = countResult.rows[0]?.total || 0;

  const listResult = await query<any>(
    `
    SELECT 
      i.id, i.instance_no, i.form_type_id, i.title, i.form_data,
      i.status, i.applicant_id, i.applicant_name, i.applicant_dept,
      i.current_node_order, i.submitted_at, i.completed_at,
      ft.code as form_type_code, ft.name as form_type_name, ft.icon as form_type_icon,
      (
        SELECT n.node_name FROM oa_approval_nodes n
        WHERE n.instance_id = i.id AND n.node_order = i.current_node_order LIMIT 1
      ) as current_node_name
    FROM oa_approval_instances i
    JOIN oa_form_types ft ON i.form_type_id = ft.id
    ${whereClause}
    ORDER BY i.submitted_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `,
    [...queryParams, pageSize, offset]
  );

  return {
    list: listResult.rows.map(row => formatInstanceListItem(row)),
    total,
  };
}

/** 预解析节点审批人结果 */
export interface PreviewApprover {
  nodeOrder: number;
  approverId: number | null;
  approverName: string | null;
  approverAvatar: string | null;
}

/**
 * 为指定的节点列表解析审批人（支持多人）
 */
export async function resolvePreviewApproversForNodes(
  nodes: WorkflowNodeDef[],
  userId: number
): Promise<PreviewApprover[]> {
  const { resolveHandlerRule } = await import('../oa-utils');
  const results: PreviewApprover[] = [];

  for (const node of nodes) {
    if (node.type === 'auto') continue;

    const { userIds } = await resolveHandlerRule(node, userId);

    if (userIds.length === 0) {
      results.push({
        nodeOrder: node.order,
        approverId: null,
        approverName: null,
        approverAvatar: null,
      });
    } else {
      for (const uid of userIds) {
        let approverName: string | null = null;
        let approverAvatar: string | null = null;
        const userResult = await query<{ name: string; avatar: string | null }>(
          'SELECT name, avatar FROM users WHERE id = $1',
          [uid]
        );
        if (userResult.rows.length > 0) {
          approverName = userResult.rows[0].name;
          approverAvatar = userResult.rows[0].avatar;
        }
        results.push({
          nodeOrder: node.order,
          approverId: uid,
          approverName,
          approverAvatar,
        });
      }
    }
  }

  return results;
}

/**
 * 预解析表单类型的审批人（全量节点）
 */
export async function previewApprovers(
  formTypeCode: string,
  userId: number
): Promise<PreviewApprover[]> {
  const formType = await getFormTypeByCode(formTypeCode);
  if (!formType) return [];

  return resolvePreviewApproversForNodes(formType.workflowDef.nodes, userId);
}

/**
 * 获取用于导出的全量审批数据（忽略分页）
 */
export async function getDataListForExport(
  params: ApprovalListParams
): Promise<InstanceListItem[]> {
  const result = await getDataListAll({ ...params, page: 1, pageSize: 10000 });
  return result.list;
}

/** 转义 HTML 特殊字符（空值守卫：避免 null/undefined 导致 TypeError） */
function escapeHtml(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 生成导出用 HTML 表格 */
export function generateExportHtml(data: InstanceListItem[]): string {
  const rows = data
    .map(
      item => `
    <tr>
      <td>${escapeHtml(item.instanceNo)}</td>
      <td>${escapeHtml(item.title)}</td>
      <td>${escapeHtml(item.formTypeName)}</td>
      <td>${escapeHtml(item.applicantName)}</td>
      <td>${escapeHtml(getStatusLabel(item.status))}</td>
      <td>${escapeHtml(item.currentNodeName || '-')}</td>
      <td>${item.submittedAt ? escapeHtml(new Date(item.submittedAt).toLocaleString()) : '-'}</td>
      <td>${item.completedAt ? escapeHtml(new Date(item.completedAt).toLocaleString()) : '-'}</td>
    </tr>
  `
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>审批数据导出</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d9d9d9; padding: 8px 12px; text-align: left; font-size: 13px; }
    th { background: #fafafa; font-weight: 600; }
    tr:nth-child(even) { background: #fafafa; }
  </style>
</head>
<body>
  <h2>审批数据导出</h2>
  <table>
    <thead>
      <tr>
        <th>审批编号</th>
        <th>标题</th>
        <th>表单类型</th>
        <th>申请人</th>
        <th>状态</th>
        <th>当前节点</th>
        <th>提交时间</th>
        <th>完成时间</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="8" style="text-align:center">无数据</td></tr>'}</tbody>
  </table>
</body>
</html>
  `.trim();
}

/**
 * 清洗 Excel 单元格值，防止公式注入（CSV Injection）
 * 以 =+@-\t\r\n 开头的字符串会被 Excel 解释为公式，加前缀单引号强制视为纯文本
 */
function sanitizeExcelValue(value: string): string {
  if (/^[=+\-@\t\r\n]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

/** 生成 Excel 文件 */
export async function generateExportExcel(
  data: InstanceListItem[],
  filePath: string
): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('审批数据');
  worksheet.columns = [
    { header: '审批编号', key: 'instanceNo', width: 20 },
    { header: '标题', key: 'title', width: 40 },
    { header: '表单类型', key: 'formTypeName', width: 20 },
    { header: '申请人', key: 'applicantName', width: 15 },
    { header: '状态', key: 'status', width: 12 },
    { header: '当前节点', key: 'currentNodeName', width: 20 },
    { header: '提交时间', key: 'submittedAt', width: 20 },
    { header: '完成时间', key: 'completedAt', width: 20 },
  ];

  data.forEach(item => {
    worksheet.addRow({
      instanceNo: sanitizeExcelValue(item.instanceNo),
      title: sanitizeExcelValue(item.title),
      formTypeName: sanitizeExcelValue(item.formTypeName),
      applicantName: sanitizeExcelValue(item.applicantName),
      status: sanitizeExcelValue(getStatusLabel(item.status)),
      currentNodeName: sanitizeExcelValue(item.currentNodeName || '-'),
      submittedAt: item.submittedAt ? sanitizeExcelValue(new Date(item.submittedAt).toLocaleString()) : '-',
      completedAt: item.completedAt ? sanitizeExcelValue(new Date(item.completedAt).toLocaleString()) : '-',
    });
  });

  await workbook.xlsx.writeFile(filePath);
}
