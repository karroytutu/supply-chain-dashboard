/**
 * 物流装卸费用申请 — 表单类型定义
 * @module services/oa/form-types/logistics-fee
 *
 * 物流/装卸费用申请流程：
 * 1. 仓储/采购发起：选供应商 → 选采购结算单 → 填费用单价 → 自动计算金额
 * 2. 往来会计审批
 * 3. 出纳支付（填实付金额、上传回单、选ERP付款账户）
 * 4. 自动节点：创建供应商费用单 → 付款单 → 费用分摊单
 * 5. 抄送仓储主管
 */

import {
  FormTypeDefinition,
  FormField,
  FormSchema,
  WorkflowNodeDef,
} from '../oa.types';
import { OA_ROLE } from '../oa-role-codes';
import { appQuery } from '../../../db/appPool';
import { createLogger } from '../../../utils/logger';
import { getAllocatablePurchaseDetails } from '../../erp-client/erp-purchase-settlement.service';
import { saveBankAccount } from '../user-bank-account.service';
import {
  handleLogisticsFeeAutoNode,
  handleLogisticsFeeRejected,
} from '../../logistics-fee/logistics-fee-callback';
const log = createLogger('LogisticsFeeForm');

// =====================================================
// 费用类型常量
// =====================================================

export const LOGISTICS_FEE_TYPE = {
  LOGISTICS: 'logistics_fee',
  LOADING: 'loading_fee',
} as const;

/** 费用类型 → ERP 费用科目 subjectId 映射 */
export const FEE_SUBJECT_MAP: Record<string, { subjectId: number; subjectName: string }> = {
  [LOGISTICS_FEE_TYPE.LOGISTICS]: { subjectId: 401, subjectName: '物流费用' },
  [LOGISTICS_FEE_TYPE.LOADING]: { subjectId: 400, subjectName: '卸货费' },
};

// =====================================================
// formSchema
// =====================================================

const logisticsFeeFormSchema: FormSchema = {
  fields: [
    // ═══ 区域一：基础信息 ═══
    {
      key: 'feeSupplierId',
      label: '费用供应商',
      type: 'select',
      required: true,
      searchApi: 'erp_suppliers',
      autoFill: { feeSupplierName: 'name' },
      nameField: 'feeSupplierName',
    },

    {
      key: 'settlementIds',
      label: '采购结算单',
      type: 'modal_select',
      required: true,
      multiple: true,
      searchApi: 'purchase_settlements',
      valueKey: 'billStr',
      labelKey: 'bizStr',
      amountKey: 'settleAmount',
      paginated: true,
      columns: [
        { title: '单据日期', dataIndex: 'workTime', format: 'date' as const },
        { title: '采购单号', dataIndex: 'bizStr' },
        { title: '供应商', dataIndex: 'supplierName', ellipsis: true },
        { title: '结算金额', dataIndex: 'settleAmount', format: 'money' as const, align: 'right' as const },
        { title: '仓库', dataIndex: 'warehouseName', ellipsis: true },
      ],
      filters: [
        { type: 'keyword' as const, key: 'bizStr', placeholder: '搜索采购单号' },
        { type: 'date-range' as const, key: 'dateRange', label: '单据日期', defaultValue: 'last7days' },
        { type: 'select' as const, key: 'supplierId', label: '供应商', searchApi: 'erp_suppliers' },
      ],
    },

    {
      key: 'feeType',
      label: '费用类型',
      type: 'select',
      required: true,
      options: [
        { value: LOGISTICS_FEE_TYPE.LOGISTICS, label: '物流费用' },
        { value: LOGISTICS_FEE_TYPE.LOADING, label: '装卸费用' },
      ],
    },

    // ═══ 区域二：费用明细表格 ═══
    {
      key: 'feeLines',
      label: '费用明细',
      type: 'table',
      required: true,
      // 行数据由“选采购结算单”自动填充，禁止手动添加/删除行
      rowLocked: true,
      // 一键分摊：输入总金额后按比例分摊到每行费用金额，自动反算费用单价
      allocate: {
        methods: ['by_amount', 'by_quantity'],
        targetField: 'feeAmount',          // 分摊结果写入「费用金额」
        amountWeightField: 'settleAmount', // 按金额：以「结算金额」为权重
        quantityWeightField: 'quantity',   // 按数量：以「数量」为权重
        derivedFields: [{                  // 自动反算「费用单价」= 费用金额 ÷ 数量
          target: 'feeUnitPrice',
          dividend: 'feeAmount',
          divisor: 'quantity',
          precision: 2,
        }],
      },
      children: [
        { key: 'billOrderStr', label: '采购单号', type: 'text', required: false, disabled: true },
        { key: 'goodsName', label: '商品名称', type: 'text', required: false, disabled: true },
        { key: 'quantity', label: '数量', type: 'number', required: false, disabled: true },
        { key: 'currUnitName', label: '单位', type: 'text', required: false, disabled: true },
        { key: 'settleAmount', label: '结算金额', type: 'money', required: false, disabled: true },
        { key: 'feeUnitPrice', label: '费用单价', type: 'money', required: true },
        { key: 'feeAmount', label: '费用金额', type: 'money', required: false, disabled: true },
        // 系统数据：结算单号保留用于 beforeSubmit 查询可分摊明细（hidden，不参与权限配置）
        { key: 'settlementBillStr', label: '结算单号', type: 'text', required: false, hidden: true },
      ],
    },

    {
      key: 'feeTotalAmount',
      label: '费用总额',
      type: 'money',
      required: false,
      disabled: true,
      upper: true,
    },

    // ═══ 区域三：附件与备注 ═══
    {
      key: 'attachmentUrls',
      label: '附件',
      type: 'upload',
      required: false,
      maxCount: 5,
    },
    {
      key: 'remark',
      label: '备注',
      type: 'textarea',
      required: false,
      maxLength: 500,
      placeholder: '请输入备注（可选）',
    },

    // ═══ 区域四：银行账户信息 ═══
    // 收款银行账户组件（内联列表），value 为 { accountName, accountNumber, bankName, branchName } 对象
    {
      key: 'bankAccountSelector',
      label: '收款银行账户',
      type: 'bank_account_selector',
      required: true,
    },

    // ═══ 出纳支付环节字段（handle 节点可编辑） ═══
    {
      key: 'paymentAmount',
      label: '实付金额',
      type: 'money',
      required: false,
      upper: true,
    },
    {
      key: 'paymentSubjectId',
      label: '付款账户',
      type: 'select',
      required: true,
      searchApi: 'erp_payment_accounts' as const,
      nameField: '_paymentSubjectName',
      autoFill: { _paymentSubjectName: 'name' },
    },
    { key: '_paymentSubjectName', label: '付款账户名称', type: 'text', required: false, hidden: true },
    {
      key: 'paymentReceiptUrls',
      label: '付款回单',
      type: 'upload',
      required: false,
      maxCount: 5,
    },

    // ═══ 系统回填字段（auto 节点执行后自动填入，只读） ═══
    { key: '_expenditureBillStr', label: '费用单号', type: 'text', required: false, disabled: true },
    { key: '_paidBillStr', label: '付款单号', type: 'text', required: false, disabled: true },
    { key: '_allocationBillStr', label: '分摊单号', type: 'text', required: false, disabled: true },

  ],
  // 系统数据：不参与权限配置和前端渲染
  internalFields: [
    { key: 'feeSupplierName', label: '供应商名称', type: 'text', required: false },
    { key: '_duplicateWarning', label: '防重提示', type: 'text', required: false },
    { key: '_settlementLineItems', label: '结算单行项JSON', type: 'text', required: false },
  ],
};

// =====================================================
// workflowDef（静态预定义，运行时条件触发）
// =====================================================

const logisticsFeeWorkflowDef: { nodes: WorkflowNodeDef[] } = {
  nodes: [
    // 节点1: 往来会计审批
    {
      order: 1,
      name: '往来会计审批',
      type: 'approval',
      handler: { roleCode: OA_ROLE.ACCOUNTANT },
      signMode: 'or',
    },
    // 节点2: 出纳支付（操作型节点，仅付款字段可编辑）
    {
      order: 2,
      name: '出纳支付',
      type: 'handle',
      handler: { roleCode: OA_ROLE.CASHIER },
      signMode: 'or',
    },
    // 节点3: 创建供应商费用单 (auto)
    {
      order: 3,
      name: '创建供应商费用单',
      type: 'auto',
    },
    // 节点4: 创建供应商付款单 (auto)
    {
      order: 4,
      name: '创建供应商付款单',
      type: 'auto',
    },
    // 节点5: 创建费用分摊单 (auto)
    {
      order: 5,
      name: '创建费用分摊单',
      type: 'auto',
    },
    // 节点6: 抄送仓储主管 (cc)
    {
      order: 6,
      name: '抄送仓储主管',
      type: 'cc',
      ccRoles: [OA_ROLE.WAREHOUSE_MGR],
    },
  ],
};

// =====================================================
// beforeSubmit：提交前数据增强
// =====================================================

async function beforeSubmitLogisticsFee(
  formData: Record<string, unknown>,
  userId: number
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  // 1. 获取可分摊采购明细行项（含 bizDetailId + amount）
  // 此数据是 auto 节点5（创建费用分摊单）的必需前置数据，获取失败必须阻断提交
  const settlementIds = formData.settlementIds as string[];
  if (settlementIds?.length) {
    // 从 feeLines 中提取结算单号列表
    const feeLines = (formData.feeLines as Array<Record<string, unknown>>) || [];
    const billStrSet = new Set<string>();
    const supplierIdSet = new Set<string>();
    for (const line of feeLines) {
      if (line.settlementBillStr) billStrSet.add(line.settlementBillStr as string);
    }
    // 供应商ID从 feeSupplierId 获取
    if (formData.feeSupplierId) {
      supplierIdSet.add(String(formData.feeSupplierId));
    }

    const billStrs = Array.from(billStrSet);
    const supplierIds = Array.from(supplierIdSet);

    // 查询可分摊明细（按结算单号 + 供应商）
    const lineItems: Array<{ bizDetailId: number; amount: string; goodsName: string; settlementBillStr: string }> = [];

    for (const billStr of billStrs) {
      const details = await getAllocatablePurchaseDetails({
        billStr,
        supplierIdList: supplierIds,
      });
      for (const d of details.records) {
        lineItems.push({
          bizDetailId: d.id,
          amount: d.amount,
          goodsName: d.goodsName,
          settlementBillStr: d.billStr,
        });
      }
    }

    result._settlementLineItems = JSON.stringify(lineItems);
  }

  // 2. 防重检测已迁移至通用查重引擎（duplicateCheck 配置）

  // 3. 保存银行账户到用户历史记录
  try {
    const bankAccount = formData.bankAccountSelector as {
      accountName: string;
      accountNumber: string;
      bankName: string;
      branchName?: string;
    } | undefined;

    if (bankAccount?.accountName && bankAccount?.accountNumber && bankAccount?.bankName) {
      await saveBankAccount(userId, {
        accountName: bankAccount.accountName,
        accountNumber: bankAccount.accountNumber,
        bankName: bankAccount.bankName,
        branchName: bankAccount.branchName,
      });
    }
  } catch (err) {
    log.warn('保存银行账户历史失败:', err instanceof Error ? err.message : err);
    // 不影响提交流程
  }

  return result;
}

// =====================================================
// 表单类型定义
// =====================================================

export const logisticsFeeFormType: FormTypeDefinition = {
  code: 'logistics_fee',
  name: '物流装卸费用申请',
  icon: 'CarOutlined',
  category: 'supply_chain',
  sortOrder: 60,
  description: '申请支付物流费用、装卸费用，审批通过后自动创建ERP费用单、付款单和费用分摊单',
  version: 2,

  formSchema: logisticsFeeFormSchema,
  workflowDef: logisticsFeeWorkflowDef,

  /** 仅仓储主管和采购主管可发起 */
  allowedRoles: [OA_ROLE.WAREHOUSE_MGR, OA_ROLE.PROCUREMENT_MGR],

  /** 提交前：获取可分摊明细 + 保存银行账户（防重已迁移至通用引擎） */
  beforeSubmit: beforeSubmitLogisticsFee,

  /** 通用查重配置：同费用类型 + 同结算单 = 重复 */
  duplicateCheck: {
    matchFields: ['feeType', 'settlementIds'],
    includeStatuses: ['processing', 'approved'],
    displayFields: ['feeType', 'feeTotalAmount'],
    subjectLabel: '该结算单',
  },

  /** auto 节点回填声明 */
  nodeBackfills: [
    {
      nodeOrder: 3,
      description: '出纳支付后系统自动创建供应商费用单',
      erpMetaFields: ['expenditureBillId', 'expenditureBillStr', 'expenditureTotalAmount'],
      formDataFields: ['_expenditureBillStr'],
    },
    {
      nodeOrder: 4,
      description: '系统自动创建供应商付款单（核销费用单）',
      erpMetaFields: ['paidBillId', 'paidBillStr'],
      formDataFields: ['_paidBillStr'],
    },
    {
      nodeOrder: 5,
      description: '系统自动创建费用分摊单',
      erpMetaFields: ['allocationBillId', 'allocationBillStr'],
      formDataFields: ['_allocationBillStr'],
    },
  ],

  /** auto节点回调：创建供应商费用单/付款单/费用分摊单 */
  onApproved: handleLogisticsFeeAutoNode,

  /** 驳回回滚：反向取消已创建的 ERP 单据 */
  onRejected: handleLogisticsFeeRejected,
};
