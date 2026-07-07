/**
 * 问题发现板块模拟数据 - 4 个风险分类
 */
import type { RiskCategory } from '@/types/sales-analysis';

export const RISK_CATEGORIES: RiskCategory[] = [
  {
    key: 'customer',
    label: '客户问题',
    shortLabel: '客户',
    items: [
      {
        key: 'order_decline',
        label: '订单下滑客户',
        count: 19,
        unit: '家',
        meta: [
          { label: '环比下降>20%', value: 14 },
          { label: '连续两期下滑', value: 5 },
        ],
      },
      {
        key: 'no_order_long',
        label: '长期未下单客户',
        count: 17,
        unit: '家',
        meta: [
          { label: '超30天未下单', value: 12 },
          { label: '超60天未下单', value: 5 },
        ],
      },
      {
        key: 'visit_insufficient',
        label: '拜访不足客户',
        count: 34,
        unit: '家',
        meta: [
          { label: 'A/B类超9天未拜访', value: 22 },
          { label: '拜访频次低于目标', value: 12 },
        ],
      },
      {
        key: 'category_missing',
        label: '品类缺失客户',
        count: 33,
        unit: '家',
        meta: [
          { label: '品类低于同类60%', value: 21 },
          { label: '扩品空间>5类', value: 12 },
        ],
      },
    ],
  },
  {
    key: 'collection',
    label: '回款问题',
    shortLabel: '回款',
    items: [
      {
        key: 'overdue',
        label: '逾期未回款客户',
        count: 23,
        unit: '家',
        meta: [
          { label: '逾期30天内', value: 12 },
          { label: '逾期60天内', value: 7 },
          { label: '逾期90天以上', value: 4 },
        ],
      },
      {
        key: 'aging_long',
        label: '账龄过长客户',
        count: 8,
        unit: '家',
        meta: [
          { label: '账龄>120天', value: 5 },
          { label: '账龄>180天', value: 3 },
        ],
      },
      {
        key: 'ar_high',
        label: '应收余额过高客户',
        count: 6,
        unit: '家',
        meta: [
          { label: '应收>50万', value: 4 },
          { label: '应收>100万', value: 2 },
        ],
      },
    ],
  },
  {
    key: 'product',
    label: '产品/库存问题',
    shortLabel: '产品',
    items: [
      {
        key: 'slow_moving',
        label: '滞销商品',
        count: 15,
        unit: '个',
        meta: [
          { label: '30天零销售', value: 9 },
          { label: '库存积压>60天', value: 6 },
        ],
      },
      {
        key: 'shortage',
        label: '缺货商品',
        count: 5,
        unit: '个',
        meta: [
          { label: '有订单无库存', value: 3 },
          { label: '库存低于安全线', value: 2 },
        ],
      },
    ],
  },
  {
    key: 'expense',
    label: '费用/利润问题',
    shortLabel: '费用',
    items: [
      {
        key: 'expense_ratio_high',
        label: '费销比异常客户',
        count: 12,
        unit: '家',
        meta: [
          { label: '费销比>15%', value: 8 },
          { label: '费销比>20%', value: 4 },
        ],
      },
      {
        key: 'loss_customer',
        label: '亏损客户',
        count: 3,
        unit: '家',
        meta: [
          { label: '毛利为负', value: 2 },
          { label: '扣除费用后亏损', value: 1 },
        ],
      },
      {
        key: 'expense_growth',
        label: '费用增速过快',
        count: 1,
        unit: '项',
        meta: [
          { label: '费用增速>销售增速', value: '本月费用+6.8% vs 销售+8.5%' },
        ],
      },
    ],
  },
];
