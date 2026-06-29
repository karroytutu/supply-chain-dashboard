/**
 * 字段权限全量校验工具
 * @module services/oa/field-permission-validator
 *
 * 校验查看权限 (view_permissions) 是否为每个节点完整声明了所有业务字段的权限。
 * 业务字段从 formSchema.fields 提取（不含 internalFields），表格子字段用点号分隔 key。
 *
 * field_permissions 已固化到代码中，由 TypeScript 编译时保证完整性，无需运行时校验。
 */

import type { FormSchema, WorkflowDef, ViewPermissionsOverride } from './oa.types';

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
 * 校验查看权限配置完整性
 * 与 validateCompleteness 逻辑相同，但入参类型为 ViewPermissionsOverride
 * 当 dataReadRoles 或 dataReadUsers 非空时，额外校验 dataRead 节的完整性
 * @returns valid: 是否完整；missing: 缺失项列表
 */
export function validateViewCompleteness(
  formSchema: FormSchema,
  workflowDef: WorkflowDef,
  viewPermissions: ViewPermissionsOverride | null | undefined,
  dataReadRoles?: string[] | null,
  dataReadUsers?: number[] | null
): { valid: boolean; missing: Array<{ node: string; fields: string[] }> } {
  const businessFields = extractBusinessFields(formSchema);
  const nodeOrders = getConfigurableNodeOrders(workflowDef);
  const missing: Array<{ node: string; fields: string[] }> = [];

  for (const order of nodeOrders) {
    const nodePerms = viewPermissions?.nodes?.[String(order)];

    if (!nodePerms) {
      missing.push({ node: String(order), fields: businessFields });
      continue;
    }

    const missingFields = businessFields.filter(f => !(f in nodePerms));
    if (missingFields.length > 0) {
      missing.push({ node: String(order), fields: missingFields });
    }
  }

  // 当表单配置了 dataReadRoles 或 dataReadUsers 时，校验 dataRead 节完整性
  const hasDataReadConfig = (dataReadRoles && dataReadRoles.length > 0) || (dataReadUsers && dataReadUsers.length > 0);
  if (hasDataReadConfig) {
    const dataReadPerms = viewPermissions?.dataRead;
    if (!dataReadPerms) {
      missing.push({ node: 'dataRead', fields: businessFields });
    } else {
      const missingFields = businessFields.filter(f => !(f in dataReadPerms));
      if (missingFields.length > 0) {
        missing.push({ node: 'dataRead', fields: missingFields });
      }
    }
  }

  return { valid: missing.length === 0, missing };
}
