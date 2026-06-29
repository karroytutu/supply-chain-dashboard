/**
 * 线下限时特价促销申请 - 表单类型定义
 * @module services/oa/form-types/promotion-special-offline
 *
 * 审批流：利润率分级（≥5%自动 / <5%营销经理 / <0%总经理）→ auto节点创建ERP促销并上架
 */

import { FormTypeDefinition } from '../oa.types';
import { OA_ROLE } from '../oa-role-codes';
import {
  beforeSubmitPromotion,
  onApprovedPromotionSpecialOffline,
} from '../promotion-callback';

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
  version: 2,

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
    ],
    internalFields: [
      { key: 'promotionId', label: '促销活动ID', type: 'number', required: false },
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
    ],
  },

  beforeSubmit: beforeSubmitPromotion,
  onApproved: onApprovedPromotionSpecialOffline,

  nodeBackfills: [
    {
      nodeOrder: 3,
      description: 'ERP促销活动创建后回填单号',
      formDataFields: ['promotionId', 'promotionNo'],
    },
  ],
};

export default promotionSpecialOfflineFormType;
