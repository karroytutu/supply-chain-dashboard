/**
 * 字段权限全量校验工具
 * @module services/oa/field-permission-validator
 *
 * 校验 DB 中的 field_permissions 是否为每个节点完整声明了所有业务字段的权限。
 * 业务字段从 formSchema.fields 提取（不含 internalFields），表格子字段用点号分隔 key。
 */

import type { FormSchema, WorkflowDef, FieldPermissionsOverride } from './oa.types';

/**
 * 提取表单的业务字段 key 列表（含表格子字段，用点号分隔）
 * 排除：_ 前缀字段、hidden 字段、formula 类型字段
 */
export function extractBusinessFields(formSchema: FormSchema): string[] {
  const fields: string[] = [];

  for (const field of formSchema.fields) {
    if (field.key.startsWith('_')) continue;
    if (field.hidden) continue;
    if (field.type === 'formula') continue;

    fields.push(field.key);

    // 表格子字段展开（排除 hidden 子字段）
    if (field.type === 'table' && field.children) {
      for (const child of field.children) {
        if (child.key.startsWith('_')) continue;
        if (child.hidden) continue;
        fields.push(`${field.key}.${child.key}`);
      }
    }
  }

  return fields;
}

/**
 * 返回需要配置权限的节点 order 列表
 * 包含发起节点（order=0）和所有非 auto/cc 类型的审批/办理节点
 */
export function getConfigurableNodeOrders(workflowDef: WorkflowDef): number[] {
  const orders = [0]; // 发起节点

  for (const node of workflowDef.nodes) {
    if (node.type !== 'auto' && node.type !== 'cc') {
      orders.push(node.order);
    }
  }

  return orders;
}

/**
 * 校验权限配置完整性
 * @returns valid: 是否完整；missing: 缺失项列表
 */
export function validateCompleteness(
  formSchema: FormSchema,
  workflowDef: WorkflowDef,
  fieldPermissions: FieldPermissionsOverride | null | undefined
): { valid: boolean; missing: Array<{ node: string; fields: string[] }> } {
  const businessFields = extractBusinessFields(formSchema);
  const nodeOrders = getConfigurableNodeOrders(workflowDef);
  const missing: Array<{ node: string; fields: string[] }> = [];

  for (const order of nodeOrders) {
    const nodePerms = fieldPermissions?.nodes?.[String(order)];

    if (!nodePerms) {
      missing.push({ node: String(order), fields: businessFields });
      continue;
    }

    const missingFields = businessFields.filter(f => !(f in nodePerms));
    if (missingFields.length > 0) {
      missing.push({ node: String(order), fields: missingFields });
    }
  }

  return { valid: missing.length === 0, missing };
}
