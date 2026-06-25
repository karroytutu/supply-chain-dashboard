/**
 * 字段权限全量校验工具 测试
 * @module services/oa/field-permission-validator.spec
 */

import {
  extractBusinessFields,
  getConfigurableNodeOrders,
  validateCompleteness,
  validateViewCompleteness,
} from './field-permission-validator';
import type { FormSchema, WorkflowDef, FieldPermissionsOverride, ViewPermissionsOverride } from './oa.types';

// =====================================================
// 测试数据构造
// =====================================================

function makeSchema(fields: any[]): FormSchema {
  return { fields: fields as any };
}

function makeWorkflowDef(nodes: any[]): WorkflowDef {
  return { nodes: nodes as any };
}

const sampleSchema = makeSchema([
  { key: 'customerName', label: '客户名称', type: 'text', required: true },
  { key: 'amount', label: '金额', type: 'money', required: true },
  { key: 'remark', label: '备注', type: 'textarea', required: false },
  { key: '_internal', label: '内部字段', type: 'text', required: false },
  { key: 'hiddenField', label: '隐藏字段', type: 'text', required: false, hidden: true },
  { key: 'calcTotal', label: '计算合计', type: 'formula', required: false },
  {
    key: 'lines',
    label: '明细',
    type: 'table',
    required: true,
    children: [
      { key: 'goodsName', label: '商品', type: 'text', required: true },
      { key: 'qty', label: '数量', type: 'number', required: true },
      { key: '_rowId', label: '行ID', type: 'text', required: false },
      { key: 'secretCol', label: '隐藏列', type: 'text', required: false, hidden: true },
    ],
  },
]);

const sampleWorkflow = makeWorkflowDef([
  { order: 1, name: '审批', type: 'approval' },
  { order: 2, name: '办理', type: 'handle' },
  { order: 3, name: '自动节点', type: 'auto' },
  { order: 4, name: '抄送', type: 'cc' },
]);

// =====================================================
// extractBusinessFields
// =====================================================

describe('extractBusinessFields', () => {
  it('提取普通业务字段，排除 _ 前缀、hidden、formula', () => {
    const fields = extractBusinessFields(sampleSchema);
    expect(fields).toContain('customerName');
    expect(fields).toContain('amount');
    expect(fields).toContain('remark');
    expect(fields).not.toContain('_internal');
    expect(fields).not.toContain('hiddenField');
    expect(fields).not.toContain('calcTotal');
  });

  it('提取表格子字段，使用点号分隔 key', () => {
    const fields = extractBusinessFields(sampleSchema);
    expect(fields).toContain('lines.goodsName');
    expect(fields).toContain('lines.qty');
    // 子字段也排除 _ 前缀和 hidden
    expect(fields).not.toContain('lines._rowId');
    expect(fields).not.toContain('lines.secretCol');
  });

  it('表格父字段本身也被提取', () => {
    const fields = extractBusinessFields(sampleSchema);
    expect(fields).toContain('lines');
  });

  it('空 schema 返回空数组', () => {
    expect(extractBusinessFields(makeSchema([]))).toEqual([]);
  });
});

// =====================================================
// getConfigurableNodeOrders
// =====================================================

describe('getConfigurableNodeOrders', () => {
  it('包含发起节点 0 和所有非 auto/cc 节点', () => {
    const orders = getConfigurableNodeOrders(sampleWorkflow);
    expect(orders).toContain(0); // 发起节点
    expect(orders).toContain(1); // approval
    expect(orders).toContain(2); // handle
    expect(orders).not.toContain(3); // auto
    expect(orders).not.toContain(4); // cc
  });

  it('空 workflow 仅包含发起节点', () => {
    const orders = getConfigurableNodeOrders(makeWorkflowDef([]));
    expect(orders).toEqual([0]);
  });
});

// =====================================================
// validateCompleteness
// =====================================================

describe('validateCompleteness', () => {
  const businessFields = extractBusinessFields(sampleSchema);
  const nodeOrders = getConfigurableNodeOrders(sampleWorkflow);

  it('权限完整时返回 valid=true', () => {
    // 为每个节点完整声明所有业务字段的权限
    const fullPerms: FieldPermissionsOverride = {
      nodes: {
        '0': Object.fromEntries(businessFields.map(f => [f, 'editable'])),
        '1': Object.fromEntries(businessFields.map(f => [f, 'readonly'])),
        '2': Object.fromEntries(businessFields.map(f => [f, 'readonly'])),
      },
    };

    const result = validateCompleteness(sampleSchema, sampleWorkflow, fullPerms);
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it('fieldPermissions 为 null 时返回 valid=false', () => {
    const result = validateCompleteness(sampleSchema, sampleWorkflow, null);
    expect(result.valid).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it('某个节点缺少部分字段权限时报告缺失', () => {
    const partialPerms: FieldPermissionsOverride = {
      nodes: {
        '0': { customerName: 'editable', amount: 'editable' }, // 缺少 remark, lines, lines.goodsName, lines.qty
        '1': Object.fromEntries(businessFields.map(f => [f, 'readonly'])),
        '2': Object.fromEntries(businessFields.map(f => [f, 'readonly'])),
      },
    };

    const result = validateCompleteness(sampleSchema, sampleWorkflow, partialPerms);
    expect(result.valid).toBe(false);

    const node0Missing = result.missing.find(m => m.node === '0');
    expect(node0Missing).toBeDefined();
    expect(node0Missing!.fields).toContain('remark');
    expect(node0Missing!.fields).toContain('lines.goodsName');
  });

  it('整个节点未配置时报告所有字段缺失', () => {
    const emptyPerms: FieldPermissionsOverride = { nodes: {} };
    const result = validateCompleteness(sampleSchema, sampleWorkflow, emptyPerms);
    expect(result.valid).toBe(false);
    expect(result.missing.length).toBe(nodeOrders.length);
  });
});

// =====================================================
// validateViewCompleteness
// =====================================================

describe('validateViewCompleteness', () => {
  const businessFields = extractBusinessFields(sampleSchema);

  it('查看权限完整时返回 valid=true', () => {
    const fullPerms: ViewPermissionsOverride = {
      nodes: {
        '0': Object.fromEntries(businessFields.map(f => [f, 'readonly'])),
        '1': Object.fromEntries(businessFields.map(f => [f, 'readonly'])),
        '2': Object.fromEntries(businessFields.map(f => [f, 'hidden'])),
      },
    };

    const result = validateViewCompleteness(sampleSchema, sampleWorkflow, fullPerms);
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it('viewPermissions 为 null 时返回 valid=false', () => {
    const result = validateViewCompleteness(sampleSchema, sampleWorkflow, null);
    expect(result.valid).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it('某个节点缺少部分字段查看权限时报告缺失', () => {
    const partialPerms: ViewPermissionsOverride = {
      nodes: {
        '0': { customerName: 'readonly', amount: 'hidden' }, // 缺少 remark, lines, lines.goodsName, lines.qty
        '1': Object.fromEntries(businessFields.map(f => [f, 'readonly'])),
        '2': Object.fromEntries(businessFields.map(f => [f, 'hidden'])),
      },
    };

    const result = validateViewCompleteness(sampleSchema, sampleWorkflow, partialPerms);
    expect(result.valid).toBe(false);

    const node0Missing = result.missing.find(m => m.node === '0');
    expect(node0Missing).toBeDefined();
    expect(node0Missing!.fields).toContain('remark');
  });

  it('整个节点未配置时报告所有字段缺失', () => {
    const emptyPerms: ViewPermissionsOverride = { nodes: {} };
    const result = validateViewCompleteness(sampleSchema, sampleWorkflow, emptyPerms);
    expect(result.valid).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it('配置了 dataReadRoles 且 dataRead 完整时返回 valid=true', () => {
    const fullPerms: ViewPermissionsOverride = {
      nodes: {
        '0': Object.fromEntries(businessFields.map(f => [f, 'readonly'])),
        '1': Object.fromEntries(businessFields.map(f => [f, 'readonly'])),
        '2': Object.fromEntries(businessFields.map(f => [f, 'hidden'])),
      },
      dataRead: Object.fromEntries(businessFields.map(f => [f, 'readonly'])),
    };

    const result = validateViewCompleteness(sampleSchema, sampleWorkflow, fullPerms, ['manager', 'admin']);
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it('配置了 dataReadRoles 但缺少 dataRead 节时报告缺失', () => {
    const nodesOnlyPerms: ViewPermissionsOverride = {
      nodes: {
        '0': Object.fromEntries(businessFields.map(f => [f, 'readonly'])),
        '1': Object.fromEntries(businessFields.map(f => [f, 'readonly'])),
        '2': Object.fromEntries(businessFields.map(f => [f, 'hidden'])),
      },
    };

    const result = validateViewCompleteness(sampleSchema, sampleWorkflow, nodesOnlyPerms, ['manager']);
    expect(result.valid).toBe(false);
    const dataReadMissing = result.missing.find(m => m.node === 'dataRead');
    expect(dataReadMissing).toBeDefined();
    expect(dataReadMissing!.fields).toEqual(businessFields);
  });

  it('未配置 dataReadRoles 时不校验 dataRead 节', () => {
    const nodesOnlyPerms: ViewPermissionsOverride = {
      nodes: {
        '0': Object.fromEntries(businessFields.map(f => [f, 'readonly'])),
        '1': Object.fromEntries(businessFields.map(f => [f, 'readonly'])),
        '2': Object.fromEntries(businessFields.map(f => [f, 'hidden'])),
      },
    };

    // 不传 dataReadRoles 参数
    const result = validateViewCompleteness(sampleSchema, sampleWorkflow, nodesOnlyPerms);
    expect(result.valid).toBe(true);
  });
});
