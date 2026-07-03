/**
 * ERP 收付款单统一服务
 * 封装 /paid/save-and-approve 接口的通用调用逻辑，
 * 供供应商付款单（erp-paid-bill）和客户收款单（erp-customer-receipt）共用
 * @domain 结算 (Settlement)
 * @module services/erp-client/erp-payment-bill.service
 */
import { erpPost, extractErpData } from './erp-client';
import { getErpDefaults } from './erp-config';

/** 收付款单核销行项（通用格式） */
export interface PaymentBillInvoiceItem {
  bizId: number;
  bizType: string;
  paidAmount: string;
  leftAmount: string;
  discountAmount?: string;
  /** 预付款分摊金额（供应商付款单使用，收款单固定为 '0'） */
  preAllocateAmount?: string;
  note?: string;
  originNote?: string;
  /** 品牌预付分摊（收款单使用，供应商付款单不需要） */
  brandPreAmount?: string;
  /** 奖励分摊（收款单使用，供应商付款单不需要） */
  bonusPreAmount?: string;
}

/** 收付款单预付款核销行项 */
export interface PaymentBillPrepayItem {
  paidBillId: number;
  paidBillStr: string;
  writeOffAmount: string;
  leftAmount: string;
  wipeOffAmount: string;
}

/** 收付款单统一请求参数 */
export interface SubmitPaymentBillParams {
  paymentDirection: 'IN' | 'OUT';
  traderType: 'STORE' | 'SUPPLIER';
  type: 'RECEIVE' | 'PAID';
  traderId: number | string;
  /** 收款单场景 consumerId = traderId，付款单场景不需要 */
  consumerId?: number;
  salesmanId: number;
  deptId: number;
  operatorId?: string | number;
  workTime: string;
  arrivalTime?: string;
  note?: string;
  totalAmount: string;
  wipeOffAmount?: string;
  paymentDetails: Array<{ paymentAmount: string; subjectId: number }>;
  invoiceList: PaymentBillInvoiceItem[];
  prepayList?: PaymentBillPrepayItem[];
  /** 收款单特有：自动收款标记 */
  ifAutoCollect?: boolean;
  ifAutoCollectBill?: boolean;
}

/** 收付款单统一响应 */
export interface SubmitPaymentBillResponse {
  id: number;
  paidBillStr: string;
  state: string;
}

/**
 * 统一提交收付款单并审核
 * POST /saas/pro/paid/save-and-approve
 *
 * 供应商付款单：paymentDirection='OUT', traderType='SUPPLIER', type='PAID'
 * 客户收款单：paymentDirection='IN', traderType='STORE', type='RECEIVE'
 */
export async function submitPaymentBill(
  params: SubmitPaymentBillParams,
  idemKey?: string,
  businessType?: string
): Promise<SubmitPaymentBillResponse> {
  const { cid, uid } = getErpDefaults();

  const body: Record<string, unknown> = {
    traderId: params.traderId,
    salesmanId: params.salesmanId,
    deptId: params.deptId,
    workTime: params.workTime,
    arrivalTime: params.arrivalTime ?? params.workTime,
    note: params.note || '',
    paymentDetails: params.paymentDetails,
    paymentDirection: params.paymentDirection,
    traderType: params.traderType,
    type: params.type,
    totalAmount: params.totalAmount,
    wipeOffAmount: params.wipeOffAmount || '0',
    writeOffInfo: {
      invoiceList: params.invoiceList.map(item => ({
        bizId: item.bizId,
        bizType: item.bizType,
        paidAmount: item.paidAmount,
        discountAmount: item.discountAmount || '0',
        preAllocateAmount: item.preAllocateAmount || '0',
        leftAmount: item.leftAmount,
        note: item.note || '',
        originNote: item.originNote || '',
        brandPreAmount: item.brandPreAmount || '0',
        bonusPreAmount: item.bonusPreAmount || '0',
      })),
      prepayList: params.prepayList || [],
    },
    cid,
    uid,
    time: Date.now(),
  };

  // 收款单特有字段
  if (params.consumerId !== undefined) body.consumerId = params.consumerId;
  if (params.operatorId !== undefined) body.operatorId = String(params.operatorId);
  if (params.ifAutoCollect !== undefined) body.ifAutoCollect = params.ifAutoCollect;
  if (params.ifAutoCollectBill !== undefined) body.ifAutoCollectBill = params.ifAutoCollectBill;
  if (params.type === 'RECEIVE') {
    // 与原 createCustomerReceipt 保持兼容：ERP 对收款单有强校验
    body.prePaidAmount = '0';
    body.imgIds = [];
    body.useBrandPreList = [];
    body.bonusPreAmount = null;
  }

  const response = await erpPost<unknown>(
    '/paid/save-and-approve',
    body,
    {
      pathPrefix: '/saas/pro/',
      businessType: businessType || 'payment_bill_submit',
      headers: idemKey ? { idemkey: idemKey } : undefined,
    }
  );

  const data = extractErpData<SubmitPaymentBillResponse>(response);
  if (!data?.id) {
    throw new Error(`创建收付款单失败: ${JSON.stringify(response)}`);
  }

  return {
    id: data.id,
    paidBillStr: data.paidBillStr,
    state: data.state || 'APPROVED',
  };
}
