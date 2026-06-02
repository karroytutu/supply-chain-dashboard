/**
 * OA表单摘要提取
 * 从表单Schema和数据中提取通知摘要，用于钉钉消息展示
 * @module services/oa/oa-form-summary
 */

import { OaMessageFormRow } from '../dingtalk.service';
import { FormSchema } from './oa.types';
import { OA_NOTIFICATION_FORM_SUMMARY_MAX_FIELDS } from '../../utils/constants';

// =====================================================
// 类型与常量
// =====================================================

/** 可展示在通知摘要中的字段类型 */
const SUMMARIZABLE_TYPES = new Set([
  'text', 'number', 'money', 'select', 'date', 'radio',
]);

// =====================================================
// 表单摘要提取
// =====================================================

/**
 * 从表单Schema和数据中提取通知摘要
 * 遍历formSchema.fields，筛选可展示类型，限制字段数
 */
export function extractFormSummary(
  formSchema?: FormSchema,
  formData?: Record<string, unknown>
): OaMessageFormRow[] {
  if (!formSchema || !formData) return [];

  const rows: OaMessageFormRow[] = [];

  for (const field of formSchema.fields) {
    if (rows.length >= OA_NOTIFICATION_FORM_SUMMARY_MAX_FIELDS) break;

    // 跳过不可展示类型
    if (!SUMMARIZABLE_TYPES.has(field.type)) continue;

    // 跳过内部字段（bizAlias以下划线开头）
    if (field.bizAlias && field.bizAlias.startsWith('_')) continue;

    // 跳过disabled字段（自动填充的只读字段，除非是关键字段）
    if (field.disabled && field.type !== 'text') continue;

    const rawValue = formData[field.key];
    if (rawValue === undefined || rawValue === null || rawValue === '') continue;

    let displayValue = String(rawValue);

    // 格式化不同类型的值
    switch (field.type) {
      case 'money':
        displayValue = `¥${Number(rawValue).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;
        break;
      case 'select':
      case 'radio':
        // 从options中解析label
        if (field.options) {
          const opt = field.options.find(o => o.value === rawValue);
          if (opt) displayValue = opt.label;
        }
        break;
      case 'number':
        if (field.suffix) displayValue = `${rawValue}${field.suffix}`;
        break;
    }

    rows.push({ key: field.label, value: displayValue });
  }

  return rows;
}

/**
 * 构建Markdown格式的表单摘要（用于ActionCard）
 */
export function buildFormSummaryMarkdown(
  formSchema?: FormSchema,
  formData?: Record<string, unknown>,
  extraRows?: Array<{ key: string; value: string }>
): string {
  const formRows = extractFormSummary(formSchema, formData);
  const allRows = [...formRows, ...(extraRows || [])];

  if (allRows.length === 0) return '';

  return allRows.map(r => `**${r.key}**: ${r.value}`).join('\n\n');
}
