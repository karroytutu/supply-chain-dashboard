import { customerCreditFormType } from './customer-credit';

describe('customerCreditFormType', () => {
  const fields = customerCreditFormType.formSchema.fields;

  it('holdSettlementOrders 字段配置 detailsField 和 nameField', () => {
    const field = fields.find(f => f.key === 'holdSettlementOrders');
    expect(field).toBeDefined();
    expect(field!.nameField).toBe('_holdSettlementOrderNames');
    expect(field!.detailsField).toBe('_holdSettlementOrderDetails');
  });

  it('holdSettlementOrders 在 creditType=hold_order 时可见', () => {
    const field = fields.find(f => f.key === 'holdSettlementOrders');
    expect(field!.visibleWhen).toEqual(
      expect.objectContaining({ field: 'creditType', operator: '==', value: 'hold_order' })
    );
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
