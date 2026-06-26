/**
 * 线下满赠促销申请 - 表单类型定义
 * @module services/oa/form-types/promotion-fullgift-offline
 *
 * 支持循环满赠和阶梯满赠两种模式，每种支持固定赠品/任选赠品
 * 审批流：利润率分级（≥5%自动 / <5%营销经理 / <0%总经理）→ auto节点创建ERP促销并上架
 */

import { FormTypeDefinition } from '../oa.types';
import { OA_ROLE } from '../oa-role-codes';
import {
  beforeSubmitPromotion,
  onApprovedPromotionFullGiftOffline,
} from '../promotion-callback';

/** 商品 modal_select 公共配置 */
const GOODS_SELECT_CONFIG = {
  type: 'modal_select' as const,
  required: true,
  searchApi: 'promotion_goods' as const,
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
};

/** 单位选择字段（从 modal_select 带入的 _goodsUnits 中提取选项） */
const UNIT_SELECT = {
  type: 'select' as const,
  required: true,
  optionsFromField: '_goodsUnits' as const,
};

/** 隐藏字段模板 */
const HIDDEN_TEXT = { type: 'text' as const, required: false, hidden: true };

/**
 * 线下满赠促销表单类型定义
 * 消费满额赠送商品
 */
export const promotionFullGiftOfflineFormType: FormTypeDefinition = {
  code: 'promotion_fullgift_offline',
  name: '线下满赠申请',
  icon: 'ShoppingOutlined',
  category: 'marketing',
  sortOrder: 220,
  description: '线下满赠促销活动申请，消费满额赠送商品',
  version: 1,

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
        label: '满赠名称',
        type: 'text',
        required: true,
        maxLength: 30,
        placeholder: '请输入满赠名称',
      },
      {
        key: 'remark',
        label: '备注',
        type: 'textarea',
        required: false,
        maxLength: 500,
      },
      {
        key: 'saleRemark',
        label: '销售备注',
        type: 'textarea',
        required: false,
        maxLength: 100,
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
        type: 'modal_select',
        required: true,
        multiple: true,
        searchApi: 'erp_customers',
        valueKey: 'id',
        labelKey: 'name',
        searchPlaceholder: '搜索客户名称',
        filters: [
          { key: 'keyword', type: 'keyword', placeholder: '搜索客户名称' },
        ],
        columns: [
          { title: '客户名称', dataIndex: 'name' },
          { title: '客户编码', dataIndex: 'consumerCode' },
        ],
        visibleWhen: { field: 'issueRange', operator: '==', value: '2' },
      },

      // ─── 促销方式 ───────────────────────────────────
      {
        key: 'onSaleType',
        label: '促销方式',
        type: 'select',
        required: true,
        defaultValue: 'loop',
        options: [
          { value: 'loop', label: '循环满赠' },
          { value: 'step', label: '阶梯满赠' },
        ],
      },

      // ─── 循环满赠配置 ─────────────────────────────────
      {
        key: 'loopCountLatch',
        label: '主品满赠门槛',
        type: 'number',
        required: true,
        min: 1,
        unit: '计件单位',
        placeholder: '满多少计件单位触发赠送',
        visibleWhen: { field: 'onSaleType', operator: '==', value: 'loop' },
        requiredWhen: { field: 'onSaleType', operator: '==', value: 'loop' },
      },
      // 隐藏字段：实时计算的有效门槛值（公式字段）
      // 循环模式 = loopCountLatch，阶梯模式 = 第一阶梯的 countLatch
      {
        key: '_effectiveLatch',
        label: '有效门槛',
        type: 'formula',
        required: false,
        hidden: true,
        formula: "onSaleType == 'step' ? min(stepRules.countLatch) : loopCountLatch",
      },

      // ─── 主品列表（循环和阶梯共用） ────────────────────────
      {
        key: 'mainGoodsList',
        label: '主品列表',
        type: 'table',
        required: true,
        children: [
          { key: 'goodsId', label: '商品', ...GOODS_SELECT_CONFIG },
          { key: '_goodsName', label: '商品名称', ...HIDDEN_TEXT },
          { key: 'currUnitId', label: '单位ID', ...HIDDEN_TEXT },
          { key: 'currUnitName', label: '单位', ...UNIT_SELECT },
          {
            key: 'onSalePrice',
            label: '促销价',
            type: 'number',
            required: true,
            min: 0.01,
            precision: 2,
          },
          {
            key: 'startingQuantity', label: '起购数量', type: 'number',
            required: false, min: 1,
          },
          {
            key: 'purchaseLimits', label: '限购', type: 'number',
            required: false, min: 1,
          },
          {
            key: 'activeStock', label: '活动数量', type: 'number',
            required: false, min: 1,
          },
          {
            key: 'mustSelect', label: '必选', type: 'select', required: false, defaultValue: 'false',
            options: [{ value: 'true', label: '是' }, { value: 'false', label: '否' }],
          },
          { key: '_costPrice', label: '成本价', type: 'number' as const, required: false, hidden: true },
          { key: '_goodsUnits', label: '可用单位', ...HIDDEN_TEXT },
          { key: '_unitFactor', label: '单位换算系数', type: 'number' as const, required: false, hidden: true, defaultValue: 1 },
        ],
      },

      {
        key: 'loopPresentType',
        label: '赠送方式',
        type: 'select',
        required: true,
        defaultValue: 1,
        options: [
          { value: 1, label: '固定赠品' },
          { value: 0, label: '任选赠品' },
        ],
        visibleWhen: { field: 'onSaleType', operator: '==', value: 'loop' },
        requiredWhen: { field: 'onSaleType', operator: '==', value: 'loop' },
      },
      {
        key: 'loopGiveCount',
        label: '任选数量',
        type: 'number',
        required: true,
        min: 1,
        unit: '件',
        placeholder: '可选几件赠品',
        visibleWhen: [
          { field: 'onSaleType', operator: '==', value: 'loop' },
          { field: 'loopPresentType', operator: '==', value: 0 },
        ],
        requiredWhen: [
          { field: 'onSaleType', operator: '==', value: 'loop' },
          { field: 'loopPresentType', operator: '==', value: 0 },
        ],
      },

      // ─── 循环满赠 - 赠品列表 ─────────────────────────────
      {
        key: 'loopPresents',
        label: '赠品列表',
        type: 'table',
        required: true,
        visibleWhen: { field: 'onSaleType', operator: '==', value: 'loop' },
        requiredWhen: { field: 'onSaleType', operator: '==', value: 'loop' },
        children: [
          { key: 'goodsId', label: '赠品', ...GOODS_SELECT_CONFIG },
          { key: '_goodsName', label: '赠品名称', ...HIDDEN_TEXT },
          { key: 'currUnitId', label: '单位ID', ...HIDDEN_TEXT },
          { key: 'currUnitName', label: '单位', ...UNIT_SELECT },
          { key: 'quantity', label: '数量', type: 'number', required: true, min: 1 },
          {
            key: 'mustSelect', label: '必选', type: 'select', required: false, defaultValue: 'false',
            options: [{ value: 'true', label: '是' }, { value: 'false', label: '否' }],
          },
          { key: '_costPrice', label: '成本价', type: 'number' as const, required: false, hidden: true },
          { key: '_goodsUnits', label: '可用单位', ...HIDDEN_TEXT },
          { key: '_unitFactor', label: '单位换算系数', type: 'number' as const, required: false, hidden: true, defaultValue: 1 },
        ],
      },

      // ─── 阶梯满赠 - 阶梯规则表 ────────────────────────────
      {
        key: 'stepRules',
        label: '阶梯规则',
        type: 'table',
        required: true,
        visibleWhen: { field: 'onSaleType', operator: '==', value: 'step' },
        requiredWhen: { field: 'onSaleType', operator: '==', value: 'step' },
        children: [
          {
            key: 'seq', label: '阶梯', type: 'number', required: false, disabled: true,
            defaultValue: 1,
          },
          {
            key: 'countLatch', label: '满__计件单位', type: 'number', required: true, min: 1,
            placeholder: '门槛数量',
          },
          {
            key: 'giveType', label: '赠送方式', type: 'select', required: true, defaultValue: 1,
            options: [{ value: 1, label: '固定赠品' }, { value: 0, label: '任选赠品' }],
          },
          {
            key: 'giveCount', label: '任选数量', type: 'number', required: false, min: 1, unit: '件',
            placeholder: '可选几件',
          },
          // ─── 阶梯利润率（隐藏公式列，供顶层 min/max 聚合） ───
          {
            key: '_stepMinMargin',
            label: '阶梯最低利润率',
            type: 'formula',
            required: false,
            hidden: true,
            formula: 'countLatch * min(mainGoodsList.onSalePrice) > 0 ? ((countLatch * min(mainGoodsList.onSalePrice - mainGoodsList._costPrice * mainGoodsList._unitFactor) - (giveType == 1 ? filterSum(stepPresents._costPrice * stepPresents._unitFactor * stepPresents.quantity, stepPresents.seq, seq) : filterSumSmallest(stepPresents._costPrice * stepPresents._unitFactor, stepPresents.seq, seq, giveCount, 1))) / (countLatch * min(mainGoodsList.onSalePrice))) * 100 : 0',
            formulaPrecision: 2,
          },
          {
            key: '_stepMaxMargin',
            label: '阶梯最高利润率',
            type: 'formula',
            required: false,
            hidden: true,
            formula: 'countLatch * max(mainGoodsList.onSalePrice) > 0 ? ((countLatch * max(mainGoodsList.onSalePrice - mainGoodsList._costPrice * mainGoodsList._unitFactor) - (giveType == 1 ? filterSum(stepPresents._costPrice * stepPresents._unitFactor * stepPresents.quantity, stepPresents.seq, seq) : filterSumSmallest(stepPresents._costPrice * stepPresents._unitFactor, stepPresents.seq, seq, giveCount))) / (countLatch * max(mainGoodsList.onSalePrice))) * 100 : 0',
            formulaPrecision: 2,
          },
        ],
      },

      // ─── 阶梯满赠 - 赠品表 ────────────────────────────
      {
        key: 'stepPresents',
        label: '阶梯赠品',
        type: 'table',
        required: true,
        visibleWhen: { field: 'onSaleType', operator: '==', value: 'step' },
        requiredWhen: { field: 'onSaleType', operator: '==', value: 'step' },
        children: [
          {
            key: 'seq', label: '对应阶梯', type: 'number', required: true, min: 1,
            placeholder: '阶梯编号',
          },
          { key: 'goodsId', label: '赠品', ...GOODS_SELECT_CONFIG },
          { key: '_goodsName', label: '赠品名称', ...HIDDEN_TEXT },
          { key: 'currUnitId', label: '单位ID', ...HIDDEN_TEXT },
          { key: 'currUnitName', label: '单位', ...UNIT_SELECT },
          { key: 'quantity', label: '数量', type: 'number', required: true, min: 1 },
          {
            key: 'mustSelect', label: '必选', type: 'select', required: false, defaultValue: 'false',
            options: [{ value: 'true', label: '是' }, { value: 'false', label: '否' }],
          },
          { key: '_costPrice', label: '成本价', type: 'number' as const, required: false, hidden: true },
          { key: '_goodsUnits', label: '可用单位', ...HIDDEN_TEXT },
          { key: '_unitFactor', label: '单位换算系数', type: 'number' as const, required: false, hidden: true, defaultValue: 1 },
        ],
      },

      // ─── 利润率区间（循环/阶梯统一：循环内联计算，阶梯取 stepRules 聚合极值） ───
      {
        key: 'minProfitMargin',
        label: '最低利润率',
        type: 'formula',
        required: false,
        formula: "onSaleType == 'step' ? min(stepRules._stepMinMargin) : (_effectiveLatch * min(mainGoodsList.onSalePrice) > 0 ? ((_effectiveLatch * min(mainGoodsList.onSalePrice - mainGoodsList._costPrice * mainGoodsList._unitFactor) - (loopGiveCount > 0 ? sumSmallest(loopPresents._costPrice * loopPresents._unitFactor, loopGiveCount, 1) : sum(loopPresents._costPrice * loopPresents._unitFactor * loopPresents.quantity))) / (_effectiveLatch * min(mainGoodsList.onSalePrice))) * 100 : 0)",
        formulaPrecision: 2,
        suffix: '%',
      },
      {
        key: 'maxProfitMargin',
        label: '最高利润率',
        type: 'formula',
        required: false,
        formula: "onSaleType == 'step' ? max(stepRules._stepMaxMargin) : (_effectiveLatch * max(mainGoodsList.onSalePrice) > 0 ? ((_effectiveLatch * max(mainGoodsList.onSalePrice - mainGoodsList._costPrice * mainGoodsList._unitFactor) - (loopGiveCount > 0 ? sumSmallest(loopPresents._costPrice * loopPresents._unitFactor, loopGiveCount) : sum(loopPresents._costPrice * loopPresents._unitFactor * loopPresents.quantity))) / (_effectiveLatch * max(mainGoodsList.onSalePrice))) * 100 : 0)",
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
  onApproved: onApprovedPromotionFullGiftOffline,

  nodeBackfills: [
    {
      nodeOrder: 3,
      description: 'ERP促销活动创建后回填单号',
      formDataFields: ['promotionId', 'promotionNo'],
    },
  ],
};

export default promotionFullGiftOfflineFormType;
