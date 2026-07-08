import { customerCreditFormType } from './customer-credit';

describe('customerCreditFormType', () => {
  const fields = customerCreditFormType.formSchema.fields;

  it('holdSettlementOrders 字段不配置 detailsField/nameField，由控件层自动持久化', () => {
    const field = fields.find(f => f.key === 'holdSettlementOrders');
    expect(field).toBeDefined();
    // SSOT: detailsField 已从类型定义中移除，主字段即唯一数据源
    expect((field as any).detailsField).toBeUndefined();
    expect((field as any).nameField).toBeUndefined();
  });

  it('holdSettlementOrders 在 creditType=hold_order 且 customer 已填写时可见', () => {
    const field = fields.find(f => f.key === 'holdSettlementOrders');
    const vw = field!.visibleWhen;
    // visibleWhen 是 AND 条件数组
    expect(Array.isArray(vw)).toBe(true);
    const conditions = vw as Array<{ field: string; operator: string; value?: unknown }>;
    expect(conditions).toContainEqual({ field: 'creditType', operator: '==', value: 'hold_order' });
    expect(conditions).toContainEqual({ field: 'customer', operator: 'not_empty' });
  });

  it('包含关键必填字段', () => {
    const customerField = fields.find(f => f.key === 'customer');
    const creditTypeField = fields.find(f => f.key === 'creditType');
    expect(customerField).toBeDefined();
    expect(customerField!.required).toBe(true);
    expect(creditTypeField).toBeDefined();
    expect(creditTypeField!.required).toBe(true);
  });

  it('customer 字段 nameField 使用 _ 前缀，确保 form.validateFields() 可返回', () => {
    const field = fields.find(f => f.key === 'customer');
    expect(field).toBeDefined();
    expect(field!.nameField).toBe('_customerName');
  });
});
