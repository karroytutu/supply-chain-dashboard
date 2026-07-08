/**
 * 通用查重服务
 * 声明式配置替代各表单散写的防重 SQL，框架统一处理查询和提示生成
 * @module services/oa/duplicate-check
 */

import { appQuery } from '../../db/appPool';
import { createLogger } from '../../utils/logger';
import { DuplicateCheckConfig } from './oa.types';

const log = createLogger('DuplicateCheck');

/**
 * 检查是否存在重复的审批申请
 *
 * 根据表单类型配置的 duplicateCheck 规则，查询 oa_approval_instances 表，
 * 匹配相同字段值的在途/已完成申请，生成提示文本。
 *
 * @param formTypeCode 表单类型编码（如 'market_expense'）
 * @param formData 当前提交的表单数据
 * @param config 查重配置
 * @returns 提示文本（无重复返回 null）
 */
export async function checkDuplicate(
  formTypeCode: string,
  formData: Record<string, unknown>,
  config: DuplicateCheckConfig
): Promise<string | null> {
  try {
    const { matchFields, includeStatuses, displayFields } = config;

    if (!matchFields.length || !includeStatuses.length) {
      return null;
    }

    // 构建 WHERE 条件：每个 matchField 对应一个 JSONB ->> 匹配
    const conditions: string[] = [];
    const params: unknown[] = [formTypeCode, includeStatuses];
    let paramIndex = 2;

    for (const field of matchFields) {
      const value = formData[field];

      if (value === undefined || value === null || value === '') {
        // 字段值为空时跳过该条件（避免无意义的匹配）
        continue;
      }

      if (Array.isArray(value)) {
        // fail-fast: table 类型字段（对象数组）不能直接用于查重
        if (value.some(v => typeof v === 'object' && v !== null)) {
          throw new Error(
            `查重配置错误：字段 "${field}" 包含对象数组，` +
            `table 类型字段不能用于 matchFields，请在 beforeSubmit 中提取标量辅助字段`
          );
        }
        // 数组类型字段（如 belongMonths）：使用 JSONB 包含查询
        // 匹配 form_data 中该字段包含任一相同元素
        paramIndex++;
        conditions.push(
          `EXISTS (SELECT 1 FROM jsonb_array_elements_text(i.form_data->'${sanitizeField(field)}') AS elem WHERE elem = ANY($${paramIndex}))`
        );
        params.push(value.map(String));
      } else {
        // 标量字段：使用 ->> 文本匹配
        paramIndex++;
        conditions.push(`i.form_data->>'${sanitizeField(field)}' = $${paramIndex}`);
        params.push(String(value));
      }
    }

    if (conditions.length === 0) {
      return null; // 所有匹配字段都为空，不查重
    }

    const whereClause = conditions.join(' AND ');

    const sql = `
      SELECT i.instance_no, i.status, i.form_data
      FROM oa_approval_instances i
      JOIN oa_form_types ft ON i.form_type_id = ft.id
      WHERE ft.code = $1
        AND i.status = ANY($2)
        AND ${whereClause}
      ORDER BY i.id DESC
      LIMIT 5
    `;

    const result = await appQuery(sql, params);

    if (result.rows.length === 0) {
      return null;
    }

    // 构建提示文本
    const statusLabels: Record<string, string> = {
      processing: '审批中',
      approved: '已通过',
    };

    const items = result.rows.map((row: { instance_no: string; status: string; form_data: Record<string, unknown> }) => {
      const statusLabel = statusLabels[row.status] || row.status;
      const displayValues = displayFields
        .map(field => {
          const val = row.form_data[field];
          if (val === undefined || val === null) return null;
          if (Array.isArray(val)) return (val as string[]).join('、');
          return String(val);
        })
        .filter(Boolean);

      return `单号 ${row.instance_no}（${statusLabel}）${displayValues.length ? '，' + displayValues.join('，') : ''}`;
    });

    const count = result.rows.length;
    const suffix = count >= 5 ? '（仅显示最近5条）' : '';

    const subject = config.subjectLabel ?? '该客户';
    return `${subject}已有 ${count} 笔同类申请${suffix}：\n${items.join('\n')}`;
  } catch (error) {
    // 查重失败不阻断提交，仅记录日志
    log.warn('查重查询失败:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * 字段名白名单校验，防止 SQL 注入
 * 只允许字母、数字、下划线，长度不超过 64
 */
function sanitizeField(field: string): string {
  if (!/^[a-zA-Z0-9_]{1,64}$/.test(field)) {
    throw new Error(`非法字段名: ${field}`);
  }
  return field;
}
