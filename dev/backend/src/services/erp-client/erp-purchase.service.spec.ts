/**
 * createPaidBill 单元测试
 * 重点验证 preAllocateAmount（预付款分摊）在不同付款模式下的计算正确性
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('./erp-client', () => ({
  erpPost: jest.fn().mockResolvedValue({ data: { id: 1, billStr: 'YF-test-001' } }),
  erpGet: jest.fn(),
  extractErpData: jest.fn((r: any) => r),
}));
jest.mock('./erp-config', () => ({
  getErpDefaults: () => ({ cid: '10008421', uid: '1', defaultSalesmanId: 1, defaultDeptId: 1, defaultPaymentSubjectId: 1 }),
  getErpConfig: () => ({ baseUrl: 'https://test.com', cid: '10008421', uid: '1' }),
}));
jest.mock('crypto', () => ({
  randomUUID: () => 'test-uuid',
  createHash: () => ({ update: () => ({ digest: () => 'test-hash' }) }),
}));

import { createPaidBill } from './erp-purchase.service';
import { erpPost } from './erp-client';
import type { CreatePaidBillInput } from './erp-purchase.types';

const mockErpPost = erpPost as jest.MockedFunction<typeof erpPost>;

function getLastErpPayload(): any {
  const lastCall = mockErpPost.mock.calls[mockErpPost.mock.calls.length - 1];
  // erpPost(path, payload, options)
  return lastCall?.[1];
}

const baseInput: CreatePaidBillInput = {
  traderId: 396,
  salesmanId: 1,
  deptId: 1,
  workTime: '2026-06-28 21:38:32',
  note: 'OA: OA202606291183',
  paymentDetails: [{ paymentAmount: '7.00', subjectId: 14 }],
  invoiceList: [
    { bizId: 5239, bizType: 'FUNDS_PURCHASE', leftAmount: '3370', paidAmount: '3370', discountAmount: '0' },
    { bizId: 5240, bizType: 'FUNDS_PURCHASE', leftAmount: '2245.2', paidAmount: '2245.2', discountAmount: '0.2' },
    { bizId: 5318, bizType: 'FUNDS_PURCHASE', leftAmount: '3262', paidAmount: '3262', discountAmount: '0' },
    { bizId: 5319, bizType: 'FUNDS_PURCHASE', leftAmount: '1398', paidAmount: '1000', discountAmount: '0' },
  ],
  wipeOffAmount: '0.2',
  prepayList: [
    { paidBillId: 80950, paidBillStr: 'YF260527000001', writeOffAmount: '9870', leftAmount: '11288.4000000000', wipeOffAmount: '0' },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createPaidBill - preAllocateAmount 分摊', () => {

  it('混合付款（银行+预付）：按顺序分配 preAllocateAmount', async () => {
    await createPaidBill(baseInput, 'test-idem-key');

    const payload = getLastErpPayload();
    const invoices = payload.writeOffInfo.invoiceList;

    // 按顺序分配：预付总额 9870
    // 第1条 net=3370-0=3370, allocate=min(3370, 9870)=3370, remaining=6500
    // 第2条 net=2245.2-0.2=2245, allocate=min(2245, 6500)=2245, remaining=4255
    // 第3条 net=3262-0=3262, allocate=min(3262, 4255)=3262, remaining=993
    // 第4条 net=1000-0=1000, allocate=min(1000, 993)=993, remaining=0
    expect(invoices[0].preAllocateAmount).toBe('3370');
    expect(invoices[1].preAllocateAmount).toBe('2245');
    expect(invoices[2].preAllocateAmount).toBe('3262');
    expect(invoices[3].preAllocateAmount).toBe('993');

    // 分摊总和 = prepayList writeOffAmount
    const total = invoices.reduce((s: number, inv: any) => s + parseFloat(inv.preAllocateAmount), 0);
    expect(total).toBe(9870);
  });

  it('混合付款：totalAmount = bank + wipeOff', async () => {
    await createPaidBill(baseInput, 'test-idem-key');

    const payload = getLastErpPayload();
    // bank=7, wipeOff=0.2, totalAmount=7.2
    expect(payload.totalAmount).toBe('7.2');
  });

  it('纯后付款（无 prepayList）：preAllocateAmount 全部为 0', async () => {
    const input: CreatePaidBillInput = {
      ...baseInput,
      paymentDetails: [{ paymentAmount: '9877', subjectId: 14 }],
      wipeOffAmount: '0',
      prepayList: undefined,
      invoiceList: baseInput.invoiceList.map(inv => ({
        ...inv,
        paidAmount: String(parseFloat(inv.leftAmount)),
        discountAmount: '0',
      })),
    };

    await createPaidBill(input, 'test-idem-key');

    const payload = getLastErpPayload();
    const invoices = payload.writeOffInfo.invoiceList;
    invoices.forEach((inv: any) => {
      expect(inv.preAllocateAmount).toBe('0');
    });
  });

  it('纯预付款核销（无 paymentDetails）：preAllocateAmount = netAmount', async () => {
    const input: CreatePaidBillInput = {
      ...baseInput,
      paymentDetails: [],
      wipeOffAmount: '0',
      invoiceList: [
        { bizId: 5239, bizType: 'FUNDS_PURCHASE', leftAmount: '3370', paidAmount: '3370', discountAmount: '0' },
        { bizId: 5240, bizType: 'FUNDS_PURCHASE', leftAmount: '2245', paidAmount: '2245', discountAmount: '0' },
      ],
      prepayList: [
        { paidBillId: 80950, paidBillStr: 'YF-test', writeOffAmount: '5615', leftAmount: '10000', wipeOffAmount: '0' },
      ],
    };

    await createPaidBill(input, 'test-idem-key');

    const payload = getLastErpPayload();
    const invoices = payload.writeOffInfo.invoiceList;

    // 第1条 net=3370, allocate=3370, remaining=2245
    // 第2条 net=2245, allocate=2245, remaining=0
    expect(invoices[0].preAllocateAmount).toBe('3370');
    expect(invoices[1].preAllocateAmount).toBe('2245');

    const total = invoices.reduce((s: number, inv: any) => s + parseFloat(inv.preAllocateAmount), 0);
    expect(total).toBe(5615);
  });

  it('预付额不足以覆盖所有明细：后面的明细 preAllocateAmount 为 0', async () => {
    const input: CreatePaidBillInput = {
      ...baseInput,
      paymentDetails: [{ paymentAmount: '7000', subjectId: 14 }],
      wipeOffAmount: '0',
      invoiceList: [
        { bizId: 1, bizType: 'FUNDS_PURCHASE', leftAmount: '5000', paidAmount: '5000', discountAmount: '0' },
        { bizId: 2, bizType: 'FUNDS_PURCHASE', leftAmount: '5000', paidAmount: '5000', discountAmount: '0' },
      ],
      prepayList: [
        { paidBillId: 1, paidBillStr: 'YF-small', writeOffAmount: '3000', leftAmount: '10000', wipeOffAmount: '0' },
      ],
    };

    await createPaidBill(input, 'test-idem-key');

    const payload = getLastErpPayload();
    const invoices = payload.writeOffInfo.invoiceList;

    // 第1条 net=5000, allocate=min(5000, 3000)=3000, remaining=0
    // 第2条 net=5000, allocate=0 (remaining=0)
    expect(invoices[0].preAllocateAmount).toBe('3000');
    expect(invoices[1].preAllocateAmount).toBe('0');
  });
});
