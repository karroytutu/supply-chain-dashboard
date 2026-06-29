/**
 * 线下组合搭赠促销申请 - 表单类型定义
 * @module services/oa/form-types/promotion-combined-offline
 *
 * 审批流：利润率分级（≥5%自动 / <5%营销经理 / <0%总经理）→ auto节点创建ERP促销并上架
 */

import { FormTypeDefinition } from '../oa.types';
import { OA_ROLE } from '../oa-role-codes';
import {
  beforeSubmitPromotion,
  onApprovedPromotionCombinedOffline,
} from '../promotion-callback';

/**
 * 线下组合搭赠促销表单类型定义
 * 购买主品后赠送赠品
 */
export const promotionCombinedOfflineFormType: FormTypeDefinition = {
  code: 'promotion_combined_offline',
  name: '线下组合搭赠申请',
  icon: 'GiftOutlined',
  category: 'marketing',
  sortOrder: 200,
  description: '线下组合搭赠促销活动申请，购买主品赠送赠品',
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
        label: '搭赠名称',
        type: 'text',
        required: true,
        maxLength: 30,
        placeholder: '请输入搭赠名称',
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

      // ─── 促销规则 ───────────────────────────────────
      {
        key: 'limitCountPerClient',
        label: '单客限购',
        type: 'number',
        required: false,
        min: 1,
        unit: '组',
        placeholder: '每位客户限购组数',
      },
      {
        key: 'totalCount',
        label: '活动数量',
        type: 'number',
        required: false,
        min: 1,
        unit: '组',
        placeholder: '不填则不限量',
      },
      {
        key: 'goodsType',
        label: '主品方式',
        type: 'select',
        required: true,
        defaultValue: 1,
        options: [
          { value: 1, label: '固定主品' },
          { value: 0, label: '任选主品' },
        ],
      },
      {
        key: 'goodsCount',
        label: '任选主品数',
        type: 'number',
        required: true,
        min: 1,
        unit: '种',
        placeholder: '可选几种主品',
        visibleWhen: { field: 'goodsType', operator: '==', value: 0 },
        requiredWhen: { field: 'goodsType', operator: '==', value: 0 },
      },
      {
        key: 'presentType',
        label: '赠品方式',
        type: 'select',
        required: true,
        defaultValue: 1,
        options: [
          { value: 1, label: '固定赠品' },
          { value: 0, label: '任选赠品' },
        ],
      },
      {
        key: 'giftCount',
        label: '任选赠品数',
        type: 'number',
        required: true,
        min: 1,
        unit: '种',
        placeholder: '可选几种赠品',
        visibleWhen: { field: 'presentType', operator: '==', value: 0 },
        requiredWhen: { field: 'presentType', operator: '==', value: 0 },
      },

      // ─── 主品列表 ───────────────────────────────────
      {
        key: 'goodsList',
        label: '主品列表',
        type: 'table',
        required: true,
        statField: [
          { componentId: 'onSalePrice', label: '促销价合计' },
          { componentId: 'quantity', label: '数量合计' },
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
            key: 'onSalePrice',
            label: '促销价',
            type: 'number',
            required: true,
            min: 0.01,
            precision: 2,
            placeholder: '直接填写价格',
          },
          {
            key: 'quantity',
            label: '数量',
            type: 'number',
            required: true,
            min: 1,
          },
          {
            key: 'mustSelect',
            label: '必选',
            type: 'select',
            required: false,
            defaultValue: 'false',
            options: [
              { value: 'true', label: '是' },
              { value: 'false', label: '否' },
            ],
            visibleWhen: { field: 'goodsType', operator: '==' as const, value: 0 },
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

      // ─── 赠品列表 ───────────────────────────────────
      {
        key: 'presentList',
        label: '赠品列表',
        type: 'table',
        required: true,
        statField: [
          { componentId: 'quantity', label: '数量合计' },
        ],
        children: [
          {
            key: 'goodsId',
            label: '赠品',
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
            label: '赠品名称',
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
            key: 'quantity',
            label: '数量',
            type: 'number',
            required: true,
            min: 1,
          },
          {
            key: 'mustSelect',
            label: '必选',
            type: 'select',
            required: false,
            defaultValue: 'false',
            options: [
              { value: 'true', label: '是' },
              { value: 'false', label: '否' },
            ],
            visibleWhen: { field: 'presentType', operator: '==' as const, value: 0 },
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

      // ─── 利润展示（formula 只读） ───────────────────────────
      {
        key: '_comboRevenue',
        label: '组合收入',
        type: 'formula',
        required: false,
        formula: 'sum(goodsList.onSalePrice * goodsList.quantity)',
        formulaPrecision: 2,
        hidden: true,
      },
      {
        key: '_comboCost',
        label: '组合成本',
        type: 'formula',
        required: false,
        formula: 'sum(goodsList._costPrice * goodsList._unitFactor * goodsList.quantity) + sum(presentList._costPrice * presentList._unitFactor * presentList.quantity)',
        formulaPrecision: 2,
        hidden: true,
      },
      // ─── 利润率区间（固定模式下最低=最高；任选模式下展示区间） ───
      // 【业务说明】任选模式（goodsType=0）的利润计算逻辑：
      //   - 客户从主品列表中挑选 goodsCount 种商品，每种各取一件
      //   - 收入按单件价格计算，不乘以 quantity（与固定模式的 sum(price*qty) 不同）
      //   - 最低利润率 = 最悲观场景：收入取最低的 N 个价格，成本取最高的 N 个成本
      //   - 最高利润率 = 最乐观场景：收入取最高的 N 个价格，成本取最低的 N 个成本
      //   - 赠品成本同理：最低利润用 sumSmallest(..., max=1) 取最贵，最高利润取最便宜
      //   - 固定模式（goodsType=1）时 goodsCount=0，退化为 _comboRevenue 和 sum(cost*qty)
      {
        key: 'minProfitMargin',
        label: '最低利润率',
        type: 'formula',
        required: false,
        formula: '(goodsCount > 0 ? sumSmallest(goodsList.onSalePrice, goodsCount) : _comboRevenue) > 0 ? (((goodsCount > 0 ? sumSmallest(goodsList.onSalePrice, goodsCount) : _comboRevenue) - (goodsCount > 0 ? sumSmallest(goodsList._costPrice * goodsList._unitFactor, goodsCount, 1) : sum(goodsList._costPrice * goodsList._unitFactor * goodsList.quantity)) - (giftCount > 0 ? sumSmallest(presentList._costPrice * presentList._unitFactor, giftCount, 1) : sum(presentList._costPrice * presentList._unitFactor * presentList.quantity))) / (goodsCount > 0 ? sumSmallest(goodsList.onSalePrice, goodsCount) : _comboRevenue)) * 100 : 0',
        formulaPrecision: 2,
        suffix: '%',
      },
      {
        key: 'maxProfitMargin',
        label: '最高利润率',
        type: 'formula',
        required: false,
        formula: '(goodsCount > 0 ? sumSmallest(goodsList.onSalePrice, goodsCount, 1) : _comboRevenue) > 0 ? (((goodsCount > 0 ? sumSmallest(goodsList.onSalePrice, goodsCount, 1) : _comboRevenue) - (goodsCount > 0 ? sumSmallest(goodsList._costPrice * goodsList._unitFactor, goodsCount) : sum(goodsList._costPrice * goodsList._unitFactor * goodsList.quantity)) - (giftCount > 0 ? sumSmallest(presentList._costPrice * presentList._unitFactor, giftCount) : sum(presentList._costPrice * presentList._unitFactor * presentList.quantity))) / (goodsCount > 0 ? sumSmallest(goodsList.onSalePrice, goodsCount, 1) : _comboRevenue)) * 100 : 0',
        formulaPrecision: 2,
        suffix: '%',
      },
    ],
    // 系统内部字段：不参与权限配置和前端渲染
    internalFields: [
      { key: 'promotionId', label: '促销活动ID', type: 'number', required: false },
    ],
  },

  workflowDef: {
    nodes: [
      // 条件节点1：利润率 < 5% 且 ≥ 0% → 营销经理审批
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
      // 条件节点2：利润率 < 0% → 总经理审批
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
      // 自动节点：审批通过后创建ERP促销活动并上架
      {
        order: 3,
        name: '创建ERP促销活动',
        type: 'auto',
      },
    ],
  },

  beforeSubmit: beforeSubmitPromotion,
  onApproved: onApprovedPromotionCombinedOffline,

  nodeBackfills: [
    {
      nodeOrder: 3,
      description: 'ERP促销活动创建后回填单号',
      formDataFields: ['promotionId', 'promotionNo'],
    },
  ],
  fieldPermissions: {
    nodes: {
      "0": { "name": "editable", "remark": "editable", "giftCount": "editable", "goodsList": "editable", "goodsType": "editable", "goodsCount": "editable", "issueRange": "editable", "saleRemark": "editable", "totalCount": "editable", "presentList": "editable", "presentType": "editable", "promotionNo": "readonly", "clientIdList": "editable", "clientAreaIds": "editable", "promotionPeriod": "editable", "clientIdList.name": "readonly", "goodsList.goodsId": "readonly", "goodsList.quantity": "readonly", "limitCountPerClient": "editable", "presentList.goodsId": "readonly", "goodsList.mustSelect": "readonly", "presentList.quantity": "readonly", "goodsList.onSalePrice": "readonly", "goodsList.currUnitName": "readonly", "presentList.mustSelect": "readonly", "presentList.currUnitName": "readonly", "clientIdList.consumerCode": "readonly" },
      "1": { "name": "readonly", "remark": "readonly", "giftCount": "readonly", "goodsList": "readonly", "goodsType": "readonly", "goodsCount": "readonly", "issueRange": "readonly", "saleRemark": "readonly", "totalCount": "readonly", "presentList": "readonly", "presentType": "readonly", "promotionNo": "readonly", "clientIdList": "readonly", "clientAreaIds": "readonly", "promotionPeriod": "readonly", "clientIdList.name": "readonly", "goodsList.goodsId": "readonly", "goodsList.quantity": "readonly", "limitCountPerClient": "readonly", "presentList.goodsId": "readonly", "goodsList.mustSelect": "readonly", "presentList.quantity": "readonly", "goodsList.onSalePrice": "readonly", "goodsList.currUnitName": "readonly", "presentList.mustSelect": "readonly", "presentList.currUnitName": "readonly", "clientIdList.consumerCode": "readonly" },
      "2": { "name": "readonly", "remark": "readonly", "giftCount": "readonly", "goodsList": "readonly", "goodsType": "readonly", "goodsCount": "readonly", "issueRange": "readonly", "saleRemark": "readonly", "totalCount": "readonly", "presentList": "readonly", "presentType": "readonly", "promotionNo": "readonly", "clientIdList": "readonly", "clientAreaIds": "readonly", "promotionPeriod": "readonly", "clientIdList.name": "readonly", "goodsList.goodsId": "readonly", "goodsList.quantity": "readonly", "limitCountPerClient": "readonly", "presentList.goodsId": "readonly", "goodsList.mustSelect": "readonly", "presentList.quantity": "readonly", "goodsList.onSalePrice": "readonly", "goodsList.currUnitName": "readonly", "presentList.mustSelect": "readonly", "presentList.currUnitName": "readonly", "clientIdList.consumerCode": "readonly" }
    },
  },
};

export default promotionCombinedOfflineFormType;
