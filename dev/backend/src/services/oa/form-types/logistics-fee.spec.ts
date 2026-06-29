/**
 * 物流装卸费用表单类型定义 测试
 * @module services/oa/form-types/logistics-fee.spec
 */

jest.mock('../../../db/appPool', () => ({
  appQuery: jest.fn().mockResolvedValue({ rows: [] }),
}));

jest.mock('../../erp-client/erp-purchase-settlement.service', () => ({
  getAllocatablePurchaseDetails: jest.fn().mockResolvedValue({ records: [] }),
}));

jest.mock('../user-bank-account.service', () => ({
  saveBankAccount: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../logistics-fee/logistics-fee-callback', () => ({
  handleLogisticsFeeAutoNode: jest.fn(),
  handleLogisticsFeeRejected: jest.fn(),
}));

import {
  LOGISTICS_FEE_TYPE,
  FEE_SUBJECT_MAP,
  logisticsFeeFormType,
} from './logistics-fee';

// =====================================================
// 常量验证
// =====================================================

describe('LOGISTICS_FEE_TYPE', () => {
  it('包含物流费用和装卸费用两种类型', () => {
    expect(LOGISTICS_FEE_TYPE.LOGISTICS).toBe('logistics_fee');
    expect(LOGISTICS_FEE_TYPE.LOADING).toBe('loading_fee');
  });
});

describe('FEE_SUBJECT_MAP', () => {
  it('物流费用对应科目 401', () => {
    expect(FEE_SUBJECT_MAP[LOGISTICS_FEE_TYPE.LOGISTICS].subjectId).toBe(401);
    expect(FEE_SUBJECT_MAP[LOGISTICS_FEE_TYPE.LOGISTICS].subjectName).toBe('物流费用');
  });

  it('装卸费用对应科目 400', () => {
    expect(FEE_SUBJECT_MAP[LOGISTICS_FEE_TYPE.LOADING].subjectId).toBe(400);
    expect(FEE_SUBJECT_MAP[LOGISTICS_FEE_TYPE.LOADING].subjectName).toBe('卸货费');
  });
});

// =====================================================
// 表单定义验证
// =====================================================

describe('logisticsFeeFormType', () => {
  it('基本属性完整', () => {
    expect(logisticsFeeFormType.code).toBe('logistics_fee');
    expect(logisticsFeeFormType.name).toBe('物流装卸费用申请');
    expect(logisticsFeeFormType.category).toBe('supply_chain');
    expect(logisticsFeeFormType.version).toBe(4);
  });

  it('formSchema.fields 非空且包含关键字段', () => {
    const { fields } = logisticsFeeFormType.formSchema;
    expect(fields.length).toBeGreaterThan(0);

    const keys = fields.map(f => f.key);
    expect(keys).toContain('feeSupplierId');
    expect(keys).toContain('settlementIds');
    expect(keys).toContain('feeType');
    expect(keys).toContain('feeLines');
    expect(keys).toContain('feeTotalAmount');
    expect(keys).toContain('attachmentUrls');
    expect(keys).toContain('remark');
    expect(keys).toContain('bankAccountSelector');
    expect(keys).toContain('paymentMode');
    expect(keys).toContain('paymentAmount');
    expect(keys).toContain('paymentSubjectId');
    expect(keys).toContain('paymentReceiptUrls');
  });

  it('支付模式字段包含直接支付和仅登记两个选项', () => {
    const paymentModeField = logisticsFeeFormType.formSchema.fields.find(f => f.key === 'paymentMode');
    expect(paymentModeField).toBeDefined();
    expect(paymentModeField!.required).toBe(true);
    expect(paymentModeField!.defaultValue).toBe('direct_pay');
    expect(paymentModeField!.options).toHaveLength(2);
    const values = paymentModeField!.options!.map(o => o.value);
    expect(values).toContain('direct_pay');
    expect(values).toContain('register');
  });

  it('仅直接支付模式可见的字段配置了 visibleWhen', () => {
    const { fields } = logisticsFeeFormType.formSchema;
    const paymentOnlyFields = ['bankAccountSelector', 'paymentAmount', 'paymentSubjectId', 'paymentReceiptUrls'];
    for (const key of paymentOnlyFields) {
      const field = fields.find(f => f.key === key);
      expect(field).toBeDefined();
      expect(field!.visibleWhen).toEqual(
        expect.objectContaining({ field: 'paymentMode', operator: '==', value: 'direct_pay' })
      );
    }
  });

  it('费用类型字段包含物流和装卸两个选项', () => {
    const feeTypeField = logisticsFeeFormType.formSchema.fields.find(f => f.key === 'feeType');
    expect(feeTypeField).toBeDefined();
    expect(feeTypeField!.options).toHaveLength(2);
    const values = feeTypeField!.options!.map(o => o.value);
    expect(values).toContain('logistics_fee');
    expect(values).toContain('loading_fee');
  });

  it('费用明细表格包含必要的子字段', () => {
    const feeLines = logisticsFeeFormType.formSchema.fields.find(f => f.key === 'feeLines');
    expect(feeLines).toBeDefined();
    expect(feeLines!.type).toBe('table');
    expect(feeLines!.rowLocked).toBe(true);
    expect(feeLines!.children).toBeDefined();
    expect(feeLines!.children!.length).toBeGreaterThan(0);

    const childKeys = feeLines!.children!.map(c => c.key);
    expect(childKeys).toContain('billOrderStr');
    expect(childKeys).toContain('goodsName');
    expect(childKeys).toContain('quantity');
    expect(childKeys).toContain('feeUnitPrice');
    expect(childKeys).toContain('feeAmount');
  });

  it('费用明细表格中 settlementBillStr 为 hidden', () => {
    const feeLines = logisticsFeeFormType.formSchema.fields.find(f => f.key === 'feeLines');
    const settlementBillStr = feeLines!.children!.find(c => c.key === 'settlementBillStr');
    expect(settlementBillStr).toBeDefined();
    expect(settlementBillStr!.hidden).toBe(true);
  });

  it('费用明细表格启用了一键分摊配置', () => {
    const feeLines = logisticsFeeFormType.formSchema.fields.find(f => f.key === 'feeLines');
    expect(feeLines!.allocate).toBeDefined();
    const allocate = feeLines!.allocate!;
    expect(allocate.methods).toEqual(['by_amount', 'by_quantity']);
    expect(allocate.targetField).toBe('feeAmount');
    expect(allocate.amountWeightField).toBe('settleAmount');
    expect(allocate.quantityWeightField).toBe('quantity');
    expect(allocate.derivedFields).toHaveLength(1);
    expect(allocate.derivedFields![0].target).toBe('feeUnitPrice');
    expect(allocate.derivedFields![0].dividend).toBe('feeAmount');
    expect(allocate.derivedFields![0].divisor).toBe('quantity');
    expect(allocate.derivedFields![0].precision).toBe(2);
  });

  it('internalFields 存在且不参与权限配置', () => {
    const internalFields = logisticsFeeFormType.formSchema.internalFields;
    expect(internalFields).toBeDefined();
    expect(internalFields!.length).toBeGreaterThan(0);
    const internalKeys = internalFields!.map(f => f.key);
    expect(internalKeys).toContain('feeSupplierName');
  });

  it('fieldPermissions 三个节点均包含 paymentMode', () => {
    const { nodes } = logisticsFeeFormType.fieldPermissions;
    expect(nodes['0'].paymentMode).toBe('editable');
    expect(nodes['1'].paymentMode).toBe('readonly');
    expect(nodes['2'].paymentMode).toBe('readonly');
  });
});

// =====================================================
// workflowDef 验证
// =====================================================

describe('logisticsFeeFormType.workflowDef', () => {
  const { nodes } = logisticsFeeFormType.workflowDef;

  it('包含 6 个节点', () => {
    expect(nodes).toHaveLength(6);
  });

  it('节点顺序正确', () => {
    expect(nodes[0].order).toBe(1);
    expect(nodes[1].order).toBe(2);
    expect(nodes[2].order).toBe(3);
    expect(nodes[3].order).toBe(4);
    expect(nodes[4].order).toBe(5);
    expect(nodes[5].order).toBe(6);
  });

  it('节点1为往来会计审批(approval)', () => {
    expect(nodes[0].name).toBe('往来会计审批');
    expect(nodes[0].type).toBe('approval');
  });

  it('节点2为出纳支付(handle，仅直接支付模式)', () => {
    expect(nodes[1].name).toBe('出纳支付');
    expect(nodes[1].type).toBe('handle');
    expect(nodes[1].condition).toEqual(
      expect.objectContaining({ field: 'paymentMode', value: 'direct_pay' })
    );
  });

  it('节点4为auto节点（仅直接支付模式创建付款单）', () => {
    expect(nodes[3].type).toBe('auto');
    expect(nodes[3].name).toBe('创建供应商付款单');
    expect(nodes[3].condition).toEqual(
      expect.objectContaining({ field: 'paymentMode', value: 'direct_pay' })
    );
  });

  it('节点3和节点5为无条件auto节点', () => {
    expect(nodes[2].type).toBe('auto');
    expect(nodes[2].name).toBe('创建供应商费用单');
    expect(nodes[2].condition).toBeUndefined();
    expect(nodes[4].type).toBe('auto');
    expect(nodes[4].name).toBe('创建费用分摊单');
    expect(nodes[4].condition).toBeUndefined();
  });

  it('节点6为抄送仓储主管(cc)', () => {
    expect(nodes[5].type).toBe('cc');
    expect(nodes[5].name).toBe('抄送仓储主管');
  });
});

// =====================================================
// beforeSubmit 验证
// =====================================================

describe('logisticsFeeFormType.beforeSubmit', () => {
  it('beforeSubmit 函数已定义', () => {
    expect(logisticsFeeFormType.beforeSubmit).toBeDefined();
    expect(typeof logisticsFeeFormType.beforeSubmit).toBe('function');
  });

  it('onApproved 回调已定义', () => {
    expect(logisticsFeeFormType.onApproved).toBeDefined();
  });

  it('onRejected 回调已定义', () => {
    expect(logisticsFeeFormType.onRejected).toBeDefined();
  });
});
