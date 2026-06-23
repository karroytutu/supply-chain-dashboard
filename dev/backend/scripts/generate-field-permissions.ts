/**
 * 字段权限配置生成脚本
 * 运行: npx ts-node scripts/generate-field-permissions.ts
 *
 * 从代码中的 ALL_FORM_TYPES 提取业务字段清单和节点清单，
 * 生成完整的 field_permissions 配置，输出为 SQL 迁移脚本。
 *
 * 默认权限规则：
 * - 发起节点(0)：申请人填写的字段 = editable，后续环节专属字段 = hidden
 * - 审批节点(approval)：所有字段 = readonly
 * - 办理节点(handle)：该环节可编辑字段 = editable，其余 = readonly 或 hidden
 * - auto/cc 节点：不配置权限
 */

import { ALL_FORM_TYPES } from '../src/services/oa/form-types';
import type { FormField, FieldPermission } from '../src/services/oa/oa.types';

/** 提取业务字段 key（含表格子字段，排除 _前缀/hidden/formula） */
function extractBusinessFields(fields: FormField[]): string[] {
  const result: string[] = [];
  for (const field of fields) {
    if (field.key.startsWith('_')) continue;
    if (field.hidden) continue;
    if (field.type === 'formula') continue;
    result.push(field.key);
    if (field.type === 'table' && field.children) {
      for (const child of field.children) {
        if (child.key.startsWith('_')) continue;
        if (child.hidden) continue;
        result.push(`${field.key}.${child.key}`);
      }
    }
  }
  return result;
}

/** 判断字段是否为出纳/支付相关（在审批节点应隐藏） */
function isPaymentField(key: string): boolean {
  // 精确匹配出纳专属字段，不用前缀匹配（避免误判 paymentReason 等业务字段）
  return ['paymentAmount', 'paymentSubjectId', 'paymentReceiptUrls', 'paymentDate', 'receiptUrls', 'paymentNote'].includes(key);
}

/** 判断字段是否为采购/入库相关（在审批节点应隐藏） */
function isPurchaseField(key: string): boolean {
  return ['purchaseDate', 'purchaseNote', 'arrivalLines'].includes(key);
}

/** 为指定节点生成默认权限 */
function generateDefaultPermissions(
  fields: string[],
  nodeOrder: number,
  nodeType: string,
  nodeName: string
): Record<string, FieldPermission> {
  const perms: Record<string, FieldPermission> = {};

  for (const fieldKey of fields) {
    // 表格子字段的顶层 key
    const topLevelKey = fieldKey.includes('.') ? fieldKey.split('.')[0] : fieldKey;

    if (nodeOrder === 0) {
      // 发起节点：支付/采购/入库字段隐藏，其余可编辑
      if (isPaymentField(topLevelKey) || isPurchaseField(topLevelKey)) {
        perms[fieldKey] = 'hidden';
      } else {
        perms[fieldKey] = 'editable';
      }
    } else if (nodeType === 'approval') {
      // 审批节点：支付/采购字段隐藏，其余只读
      if (isPaymentField(topLevelKey) || isPurchaseField(topLevelKey)) {
        perms[fieldKey] = 'hidden';
      } else {
        perms[fieldKey] = 'readonly';
      }
    } else if (nodeType === 'handle') {
      // 办理节点：根据节点名称判断可编辑字段
      if (nodeName.includes('出纳') || nodeName.includes('支付') || nodeName.includes('付款')) {
        // 出纳节点：支付字段可编辑，其余只读
        if (isPaymentField(topLevelKey)) {
          perms[fieldKey] = 'editable';
        } else if (isPurchaseField(topLevelKey)) {
          perms[fieldKey] = 'hidden';
        } else {
          perms[fieldKey] = 'readonly';
        }
      } else if (nodeName.includes('采购') || nodeName.includes('入库')) {
        // 采购/入库节点：采购字段可编辑，支付字段隐藏，其余只读
        if (isPurchaseField(topLevelKey)) {
          perms[fieldKey] = 'editable';
        } else if (isPaymentField(topLevelKey)) {
          perms[fieldKey] = 'hidden';
        } else {
          perms[fieldKey] = 'readonly';
        }
      } else if (nodeName.includes('询价')) {
        // 询价节点：询价字段可编辑，支付/采购字段隐藏，其余只读
        if (topLevelKey === 'inquiryLines' || topLevelKey === 'quotations') {
          perms[fieldKey] = 'editable';
        } else if (isPaymentField(topLevelKey) || isPurchaseField(topLevelKey)) {
          perms[fieldKey] = 'hidden';
        } else {
          perms[fieldKey] = 'readonly';
        }
      } else {
        // 其他办理节点：默认只读
        perms[fieldKey] = 'readonly';
      }
    }
  }

  return perms;
}

// 主逻辑
const lines: string[] = [];
lines.push('-- 126: 字段权限全量迁移 — DB 成为唯一配置来源');
lines.push('-- 结构: {nodes: {"0": {field: perm}, "1": {...}}} — 节点0=发起阶段');
lines.push('-- 自动生成，需人工审核后执行');
lines.push('');
lines.push('BEGIN;');
lines.push('');

// 1. 迁移 procurement_order 旧 initiation 到 nodes["0"]
lines.push('-- 1. 迁移 procurement_order 旧 initiation 到 nodes["0"]');
lines.push("UPDATE oa_form_types");
lines.push("SET field_permissions = jsonb_set(");
lines.push("  COALESCE(field_permissions, '{}'::jsonb),");
lines.push("  '{nodes,0}',");
lines.push("  COALESCE(field_permissions->'initiation', '{}'::jsonb)");
lines.push(") - 'initiation'");
lines.push("WHERE code = 'procurement_order' AND field_permissions ? 'initiation';");
lines.push('');

// 2. 为每个表单生成完整配置
lines.push('-- 2. 为每个表单写入完整的 field_permissions 配置');
lines.push('');

for (const formType of ALL_FORM_TYPES) {
  const businessFields = extractBusinessFields(formType.formSchema.fields);
  const nodes = formType.workflowDef.nodes;

  const nodePerms: Record<string, Record<string, FieldPermission>> = {};

  // 发起节点 (order=0)
  nodePerms['0'] = generateDefaultPermissions(businessFields, 0, 'initiation', '发起阶段');

  // 审批/办理节点
  for (const node of nodes) {
    if (node.type === 'auto' || node.type === 'cc') continue;
    nodePerms[String(node.order)] = generateDefaultPermissions(
      businessFields,
      node.order,
      node.type,
      node.name
    );
  }

  const json = JSON.stringify({ nodes: nodePerms });
  lines.push(`-- ${formType.name} (${formType.code})`);
  lines.push(`UPDATE oa_form_types SET field_permissions = $$${json}$$::jsonb WHERE code = $tag$${formType.code}$tag$;`);
  lines.push('');
}

lines.push('COMMIT;');

// 输出到文件
const output = lines.join('\n');
console.log(output);
