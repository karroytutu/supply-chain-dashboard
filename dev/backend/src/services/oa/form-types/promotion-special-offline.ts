/**
 * 线下限时特价促销申请 - 表单类型定义
 * @module services/oa/form-types/promotion-special-offline
 *
 * 审批流：利润率分级（≥5%自动 / <5%营销经理 / <0%总经理）→ auto节点创建ERP促销并上架
 */

import { FormTypeDefinition, CallbackResult, OaInstanceRow } from '../oa.types';
import type { FormAccessor } from '../form-accessor';
import { OA_ROLE } from '../oa-role-codes';
import {
  beforeSubmitPromotion,
  onApprovedPromotionSpecialOffline,
} from '../promotion-callback';
import { createSupplierIncomeBill } from '../../erp-client/erp-supplier-income.service';
import { cleanupIncomeBill } from '../../erp-client/erp-cleanup';
import { getErpDefaults } from '../../erp-client/erp-config';
import { getErpMeta } from '../../fixed-asset/erp-meta-utils';
import { beijingDateTime } from '../../../utils/beijingTime';
import { appQuery as query } from '../../../db/appPool';
import { createLogger } from '../../../utils/logger';

const log = createLogger('PromotionSpecial');

/**
 * 线下限时特价促销表单类型定义
 * 商品限时降价销售，支持临期特价配置
 */
export const promotionSpecialOfflineFormType: FormTypeDefinition = {
  code: 'promotion_special_offline',
  name: '线下限时特价申请',
  icon: 'ThunderboltOutlined',
  category: 'marketing',
  sortOrder: 210,
  description: '线下限时特价促销活动申请，商品限时降价销售',
  version: 4,

  formSchema: {
    fields: [
      // ─── 基本信息 ───────────────────────────────────
      {
        key: 'promotionNo',
        label: '活动方案单号',
        type: 'text',
        required: false,
        disabled: true,
        visibleWhen: { field: 'promotionNo', operator: 'not_empty' },
      },
      {
        key: 'name',
        label: '特价名称',
        type: 'text',
        required: true,
        maxLength: 30,
        placeholder: '请输入特价名称',
      },
      {
        key: 'remark',
        label: '备注',
        type: 'textarea',
        required: false,
        maxLength: 500,
        placeholder: '请输入备注（可选）',
      },
      {
        key: 'saleRemark',
        label: '销售备注',
        type: 'textarea',
        required: false,
        maxLength: 100,
        placeholder: '带入销售订单商品明细备注（可选）',
      },
      {
        key: 'promotionPeriod',
        label: '促销周期',
        type: 'date-range',
        required: true,
      },
      {
        key: 'issueRange',
        label: '参与客户',
        type: 'select',
        required: true,
        options: [
          { value: '1', label: '按片区指定' },
          { value: '2', label: '指定客户' },
        ],
      },
      {
        key: 'clientAreaIds',
        label: '片区选择',
        type: 'tree_select',
        required: true,
        treeSearchApi: 'erp_areas_tree',
        valueKey: 'id',
        labelKey: 'name',
        searchPlaceholder: '搜索片区',
        visibleWhen: { field: 'issueRange', operator: '==', value: '1' },
      },
      {
        key: 'clientIdList',
        label: '客户选择',
        type: 'table',
        required: true,
        multiple: true,
        searchApi: 'erp_customers',
        valueKey: 'id',
        labelKey: 'name',
        searchPlaceholder: '搜索客户名称',
        columns: [
          { title: '客户名称', dataIndex: 'name' },
          { title: '客户编码', dataIndex: 'consumerCode' },
        ],
        filters: [
          { key: 'keyword', type: 'keyword', placeholder: '搜索客户名称' },
        ],
        children: [
          { key: 'name', label: '客户名称', type: 'text', required: false, disabled: true },
          { key: 'consumerCode', label: '客户编码', type: 'text', required: false, disabled: true },
        ],
        visibleWhen: { field: 'issueRange', operator: '==', value: '2' },
      },

      // ─── 特价商品列表 ─────────────────────────────────
      {
        key: 'goodsList',
        label: '特价商品列表',
        type: 'table',
        required: true,
        statField: [
          { componentId: 'onSalePrice', label: '促销价合计' },
          { componentId: 'activeStock', label: '活动数量合计' },
        ],
        children: [
          {
            key: 'goodsId',
            label: '商品',
            type: 'select',
            required: true,
            searchApi: 'promotion_goods',
            valueKey: 'goodsId',
            labelKey: 'name',
            nameField: '_goodsName',
            searchPlaceholder: '搜索商品名称/品牌',
            columns: [
              { title: '商品名称', dataIndex: 'name' },
              { title: '品牌', dataIndex: 'brandName' },
              { title: '成本价', dataIndex: 'costPrice', format: 'money' as const, align: 'right' as const },
            ],
            autoFill: {
              currUnitId: 'units.0.id',
              currUnitName: 'units.0.id',
              _costPrice: 'costPrice',
              _goodsUnits: 'units',
              _goodsName: 'name',
              _unitFactor: 'units.0.factor',
            },
          },
          {
            key: '_goodsName',
            label: '商品名称',
            type: 'text',
            required: false,
            hidden: true,
          },
          {
            key: 'currUnitId',
            label: '单位ID',
            type: 'text',
            required: false,
            hidden: true,
          },
          {
            key: 'currUnitName',
            label: '单位',
            type: 'select',
            required: true,
            optionsFromField: '_goodsUnits',
          },
          {
            key: 'qualifiedNum',
            label: '起购数量',
            type: 'number',
            required: false,
            min: 1,
            placeholder: '最低购买数量',
          },
          {
            key: 'onSalePrice',
            label: '促销价',
            type: 'number',
            required: true,
            min: 0.01,
            precision: 2,
          },
          {
            key: 'onSalePriceMin',
            label: '最低促销价',
            type: 'number',
            required: false,
            min: 0.01,
            precision: 2,
          },
          {
            key: 'activeStock',
            label: '活动数量',
            type: 'number',
            required: false,
            min: 1,
            placeholder: '不填则不限量',
          },
          // 行内公式：单件利润额
          {
            key: '_profitAmount',
            label: '单件利润额',
            type: 'formula',
            required: false,
            formula: '(onSalePriceMin > 0 ? onSalePriceMin : onSalePrice) - _costPrice * _unitFactor',
            formulaPrecision: 2,
          },
          // 行内公式：单件利润率
          {
            key: '_profitMargin',
            label: '单件利润率',
            type: 'formula',
            required: false,
            formula: '(onSalePriceMin > 0 ? onSalePriceMin : onSalePrice) > 0 ? (((onSalePriceMin > 0 ? onSalePriceMin : onSalePrice) - _costPrice * _unitFactor) / (onSalePriceMin > 0 ? onSalePriceMin : onSalePrice)) * 100 : 0',
            formulaPrecision: 2,
            suffix: '%',
          },
          // ─── 临期阶梯定价（分组表头） ───
          {
            key: 'nearExpiryDays1',
            label: '第1级 天数门槛',
            type: 'number',
            required: false,
            min: 1,
            unit: '天',
            placeholder: '如 30',
            columnGroup: '临期阶梯定价（天数递减，售价递减）',
            columnGroupTip: '选填',
          },
          {
            key: 'nearExpiryPrice1',
            label: '第1级 售价',
            type: 'number',
            required: false,
            min: 0.01,
            precision: 2,
            placeholder: '如 10.00',
            columnGroup: '临期阶梯定价（天数递减，售价递减）',
          },
          {
            key: 'nearExpiryDays2',
            label: '第2级 天数门槛',
            type: 'number',
            required: false,
            min: 1,
            unit: '天',
            placeholder: '如 15',
            columnGroup: '临期阶梯定价（天数递减，售价递减）',
          },
          {
            key: 'nearExpiryPrice2',
            label: '第2级 售价',
            type: 'number',
            required: false,
            min: 0.01,
            precision: 2,
            columnGroup: '临期阶梯定价（天数递减，售价递减）',
          },
          {
            key: 'nearExpiryDays3',
            label: '第3级 天数门槛',
            type: 'number',
            required: false,
            min: 1,
            unit: '天',
            placeholder: '如 7',
            columnGroup: '临期阶梯定价（天数递减，售价递减）',
          },
          {
            key: 'nearExpiryPrice3',
            label: '第3级 售价',
            type: 'number',
            required: false,
            min: 0.01,
            precision: 2,
            placeholder: '如 5.00',
            columnGroup: '临期阶梯定价（天数递减，售价递减）',
          },
          {
            key: '_costPrice',
            label: '成本价',
            type: 'number',
            required: false,
            hidden: true,
          },
          {
            key: '_goodsUnits',
            label: '可用单位',
            type: 'text',
            required: false,
            hidden: true,
          },
          {
            key: '_unitFactor',
            label: '单位换算系数',
            type: 'number',
            required: false,
            hidden: true,
            defaultValue: 1,
          },
        ],
      },

      // ─── 利润率（所有商品行中最低的） ───
      {
        key: 'minProfitMargin',
        label: '最低利润率',
        type: 'formula',
        required: false,
        formula: 'min(goodsList._profitMargin)',
        formulaPrecision: 2,
        suffix: '%',
      },
      // ─── 供应商承担区 ────────────────────────────────
      {
        key: 'supplierBorne', label: '是否需要供应商承担', type: 'select' as const, required: true,
        options: [{ value: 'yes', label: '是' }, { value: 'no', label: '否' }], defaultValue: 'no',
      },
      {
        key: 'supplierId', label: '供应商', type: 'select' as const, required: true,
        searchApi: 'erp_suppliers' as const, nameField: '_supplierName',
        autoFill: { _supplierName: 'name' },
        visibleWhen: { field: 'supplierBorne', operator: '==' as const, value: 'yes' },
      },
      { key: '_supplierName', label: '供应商名称', type: 'text' as const, required: false, hidden: true },
      {
        key: 'supplierAmount', label: '供应商承担金额', type: 'money' as const, required: true, upper: true,
        visibleWhen: { field: 'supplierBorne', operator: '==' as const, value: 'yes' },
      },
      {
        key: 'incomeCategoryId', label: '收入类别', type: 'select' as const, required: true,
        searchApi: 'erp_income_categories' as const, nameField: '_incomeCategoryName',
        autoFill: { _incomeCategoryName: 'name' },
        visibleWhen: { field: 'supplierBorne', operator: '==' as const, value: 'yes' },
      },
      { key: '_incomeCategoryName', label: '收入类别名称', type: 'text' as const, required: false, hidden: true },
      {
        key: 'supplierConfirmScreenshot', label: '供应商确认截图', type: 'upload' as const,
        required: false, maxCount: 5,
        visibleWhen: { field: 'supplierBorne', operator: '==' as const, value: 'yes' },
      },
      {
        key: '_supplierIncomeBillStr', label: '供应商收入单号', type: 'text' as const,
        required: false, disabled: true,
        visibleWhen: { field: 'supplierBorne', operator: '==' as const, value: 'yes' },
      },
    ],
    internalFields: [
      { key: 'promotionId', label: '促销活动ID', type: 'number', required: false },
      { key: '_supplierIncomeBillId', label: '供应商收入单ID', type: 'number', required: false },
    ],
  },

  workflowDef: {
    nodes: [
      {
        order: 1,
        name: '营销经理审批',
        type: 'approval',
        handler: { roleCode: OA_ROLE.MARKETING_MGR },
        signMode: 'or',
        condition: {
          field: 'minProfitMargin',
          operator: '<',
          value: 5,
        },
      },
      {
        order: 2,
        name: '总经理审批',
        type: 'approval',
        handler: { roleCode: OA_ROLE.GM },
        signMode: 'or',
        condition: {
          field: 'minProfitMargin',
          operator: '<',
          value: 0,
        },
      },
      {
        order: 3,
        name: '创建ERP促销活动',
        type: 'auto',
      },
      {
        order: 4, name: '采购审批', type: 'handle',
        handler: { roleCode: OA_ROLE.PROCUREMENT_MGR }, signMode: 'or',
        condition: { field: 'supplierBorne', operator: '==' as const, value: 'yes' },
      },
      { order: 5, name: '创建供应商收入单', type: 'auto' },
    ],
  },

  beforeSubmit: beforeSubmitPromotion,
  onApproved: handlePromotionSpecialAutoNode,
  onRejected: handlePromotionSpecialRejected,

  beforeApprove: (nodeOrder, form) => {
    const errors: string[] = [];
    if (nodeOrder === 4 && form.getString('supplierBorne') === 'yes') {
      if (!form.getRaw('supplierId')) errors.push('供应商不能为空');
      if (!form.getString('_supplierName')) errors.push('供应商名称不能为空');
      const supplierAmount = form.getNumber('supplierAmount');
      if (!supplierAmount || supplierAmount <= 0) errors.push('供应商承担金额必须大于0');
      if (!form.getRaw('incomeCategoryId')) errors.push('收入类别不能为空');
      if (!form.getString('_incomeCategoryName')) errors.push('收入类别名称不能为空');
    }
    return errors;
  },

  nodeBackfills: [
    {
      nodeOrder: 3,
      description: 'ERP促销活动创建后回填单号',
      formDataFields: ['promotionId', 'promotionNo'],
    },
    {
      nodeOrder: 5,
      description: '供应商收入单创建后回填单号',
      erpMetaFields: ['supplierIncomeBillId', 'supplierIncomeBillStr'],
      formDataFields: ['_supplierIncomeBillStr', '_supplierIncomeBillId'],
    },
  ],
  fieldPermissions: {
    nodes: {
      "0": { "name": "editable", "remark": "editable", "goodsList": "editable", "issueRange": "editable", "saleRemark": "editable", "promotionNo": "readonly", "clientIdList": "editable", "clientAreaIds": "editable", "promotionPeriod": "editable", "clientIdList.name": "readonly", "goodsList.goodsId": "readonly", "goodsList.activeStock": "readonly", "goodsList.onSalePrice": "readonly", "goodsList.currUnitName": "readonly", "goodsList.qualifiedNum": "readonly", "goodsList.onSalePriceMin": "readonly", "clientIdList.consumerCode": "readonly", "goodsList.nearExpiryDays1": "readonly", "goodsList.nearExpiryDays2": "readonly", "goodsList.nearExpiryDays3": "readonly", "goodsList.nearExpiryPrice1": "readonly", "goodsList.nearExpiryPrice2": "readonly", "goodsList.nearExpiryPrice3": "readonly", "supplierBorne": "editable", "supplierId": "hidden", "supplierAmount": "hidden", "incomeCategoryId": "hidden", "supplierConfirmScreenshot": "editable" },
      "1": { "name": "readonly", "remark": "readonly", "goodsList": "readonly", "issueRange": "readonly", "saleRemark": "readonly", "promotionNo": "readonly", "clientIdList": "readonly", "clientAreaIds": "readonly", "promotionPeriod": "readonly", "clientIdList.name": "readonly", "goodsList.goodsId": "readonly", "goodsList.activeStock": "readonly", "goodsList.onSalePrice": "readonly", "goodsList.currUnitName": "readonly", "goodsList.qualifiedNum": "readonly", "goodsList.onSalePriceMin": "readonly", "clientIdList.consumerCode": "readonly", "goodsList.nearExpiryDays1": "readonly", "goodsList.nearExpiryDays2": "readonly", "goodsList.nearExpiryDays3": "readonly", "goodsList.nearExpiryPrice1": "readonly", "goodsList.nearExpiryPrice2": "readonly", "goodsList.nearExpiryPrice3": "readonly", "supplierBorne": "readonly", "supplierId": "readonly", "supplierAmount": "readonly", "incomeCategoryId": "readonly", "supplierConfirmScreenshot": "readonly" },
      "2": { "name": "readonly", "remark": "readonly", "goodsList": "readonly", "issueRange": "readonly", "saleRemark": "readonly", "promotionNo": "readonly", "clientIdList": "readonly", "clientAreaIds": "readonly", "promotionPeriod": "readonly", "clientIdList.name": "readonly", "goodsList.goodsId": "readonly", "goodsList.activeStock": "readonly", "goodsList.onSalePrice": "readonly", "goodsList.currUnitName": "readonly", "goodsList.qualifiedNum": "readonly", "goodsList.onSalePriceMin": "readonly", "clientIdList.consumerCode": "readonly", "goodsList.nearExpiryDays1": "readonly", "goodsList.nearExpiryDays2": "readonly", "goodsList.nearExpiryDays3": "readonly", "goodsList.nearExpiryPrice1": "readonly", "goodsList.nearExpiryPrice2": "readonly", "goodsList.nearExpiryPrice3": "readonly", "supplierBorne": "readonly", "supplierId": "readonly", "supplierAmount": "readonly", "incomeCategoryId": "readonly", "supplierConfirmScreenshot": "readonly" },
      "4": { "name": "readonly", "remark": "readonly", "goodsList": "readonly", "issueRange": "readonly", "saleRemark": "readonly", "promotionNo": "readonly", "clientIdList": "readonly", "clientAreaIds": "readonly", "promotionPeriod": "readonly", "clientIdList.name": "readonly", "goodsList.goodsId": "readonly", "goodsList.activeStock": "readonly", "goodsList.onSalePrice": "readonly", "goodsList.currUnitName": "readonly", "goodsList.qualifiedNum": "readonly", "goodsList.onSalePriceMin": "readonly", "clientIdList.consumerCode": "readonly", "goodsList.nearExpiryDays1": "readonly", "goodsList.nearExpiryDays2": "readonly", "goodsList.nearExpiryDays3": "readonly", "goodsList.nearExpiryPrice1": "readonly", "goodsList.nearExpiryPrice2": "readonly", "goodsList.nearExpiryPrice3": "readonly", "supplierBorne": "readonly", "supplierId": "editable", "supplierAmount": "editable", "incomeCategoryId": "editable", "supplierConfirmScreenshot": "readonly" }
    },
  },
};

// =====================================================
// auto 节点分发 + 供应商收入单创建
// =====================================================

async function handlePromotionSpecialAutoNode(
  instance: OaInstanceRow,
  form: FormAccessor
): Promise<CallbackResult | void> {
  const nodeResult = await query<{ node_order: number }>(
    `SELECT node_order FROM oa_approval_nodes
     WHERE instance_id = $1 AND node_type = 'auto' AND status = 'processing'
     ORDER BY node_order LIMIT 1`,
    [instance.id]
  );
  const nodeOrder = nodeResult.rows[0]?.node_order;
  log.info(`[限时特价] auto节点执行: instanceId=${instance.id}, nodeOrder=${nodeOrder}`);
  switch (nodeOrder) {
    case 3: return onApprovedPromotionSpecialOffline(instance, form);
    case 5: return handleCreateSupplierIncomeSpecial(instance, form);
    default:
      log.warn(`[限时特价] 未知的auto节点: nodeOrder=${nodeOrder}`);
  }
}

async function handleCreateSupplierIncomeSpecial(
  instance: OaInstanceRow,
  form: FormAccessor
): Promise<CallbackResult | void> {
  if (form.getString('supplierBorne') !== 'yes') return;
  const { defaultSalesmanId, defaultDeptId, defaultDeptName } = getErpDefaults();
  const supplierAmount = form.getNumber('supplierAmount') ?? 0;
  const result = await createSupplierIncomeBill(
    {
      traderType: 'SUPPLIER', traderId: form.getString('supplierId') ?? '',
      traderName: form.getString('_supplierName') ?? '',
      totalAmount: String(supplierAmount),
      details: [{ id: 1, subjectId: form.getNumber('incomeCategoryId') ?? 0,
        subjectName: form.getString('_incomeCategoryName') ?? '',
        deptId: defaultDeptId, deptName: defaultDeptName,
        taxRadio: 0, taxAmount: '', noTaxAmount: supplierAmount.toFixed(2),
        paymentAmount: supplierAmount }],
      salesmanId: defaultSalesmanId, deptId: defaultDeptId,
      workTime: beijingDateTime(),
      note: [instance.instance_no, form.getString('remark')].filter(Boolean).join('+'),
    },
    `sb-income-${instance.id}-5`, instance.id
  );
  return {
    erpMeta: { supplierIncomeBillId: result.id, supplierIncomeBillStr: result.billStr },
    formData: { _supplierIncomeBillStr: result.billStr, _supplierIncomeBillId: result.id },
  };
}

async function handlePromotionSpecialRejected(
  instance: OaInstanceRow, _form: FormAccessor
): Promise<void> {
  const erpMeta = getErpMeta(instance);
  const supplierIncomeBillId = erpMeta?.responseData?.supplierIncomeBillId as number;
  if (supplierIncomeBillId) {
    try {
      await cleanupIncomeBill(supplierIncomeBillId);
      log.info(`[限时特价] 供应商收入单已清理: billId=${supplierIncomeBillId}`);
    } catch (e) {
      const msg = `取消供应商收入单失败(billId=${supplierIncomeBillId}): ${e instanceof Error ? e.message : e}`;
      log.error(`[限时特价] ${msg}`);
      throw new Error(`限时特价促销回滚失败: ${msg}`);
    }
  }
}

export default promotionSpecialOfflineFormType;
