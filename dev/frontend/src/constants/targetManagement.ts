/**
 * 目标管理模块 - 模拟数据
 * 原型阶段使用，包含营销师、客户、品类、商品的完整目标数据树
 */
import type { Marketer, CustomerTarget, TargetStatus, StatusConfig } from '@/types/target-management';

/** 营销师列表 */
export const MARKETERS: Marketer[] = [
  { id: 'm1', name: '张三' },
  { id: 'm2', name: '李四' },
  { id: 'm3', name: '王五' },
];

/** 状态配置映射 */
export const STATUS_CONFIG: Record<TargetStatus, StatusConfig> = {
  draft: { label: '草稿', color: '#faad14', tagColor: 'gold' },
  pending: { label: '审批中', color: '#1890ff', tagColor: 'blue' },
  approved: { label: '已通过', color: '#52c41a', tagColor: 'green' },
  rejected: { label: '已驳回', color: '#f5222d', tagColor: 'red' },
};

/** 可添加的计划开发客户池 */
export const AVAILABLE_CUSTOMERS = [
  { customerId: 'new_c1', customerName: '华美达酒店', industry: '餐饮行业', status: '未合作' },
  { customerId: 'new_c2', customerName: '百联集团', industry: '零售行业', status: '未合作' },
  { customerId: 'new_c3', customerName: '永辉超市', industry: '零售行业', status: '已合作' },
  { customerId: 'new_c4', customerName: '大润发', industry: '零售行业', status: '已合作' },
  { customerId: 'new_c5', customerName: '家乐福', industry: '零售行业', status: '未合作' },
  { customerId: 'new_c6', customerName: '锦江之星', industry: '酒店行业', status: '未合作' },
  { customerId: 'new_c7', customerName: '盒马鲜生', industry: '新零售', status: '已合作' },
  { customerId: 'new_c8', customerName: '叮咚买菜', industry: '新零售', status: '未合作' },
];

/** 可添加的商品池 */
export const AVAILABLE_PRODUCTS = [
  { productId: 'new_p1', productName: '薯片烧烤味', categoryId: 'cat1', categoryName: '休闲食品', unit: '箱', unitPrice: 85 },
  { productId: 'new_p2', productName: '饼干巧克力味', categoryId: 'cat1', categoryName: '休闲食品', unit: '箱', unitPrice: 62 },
  { productId: 'new_p3', productName: '果冻混合口味', categoryId: 'cat1', categoryName: '休闲食品', unit: '箱', unitPrice: 45 },
  { productId: 'new_p4', productName: '虾条番茄味', categoryId: 'cat2', categoryName: '膨化食品', unit: '箱', unitPrice: 55 },
  { productId: 'new_p5', productName: '薯片麻辣味', categoryId: 'cat2', categoryName: '膨化食品', unit: '箱', unitPrice: 88 },
  { productId: 'new_p6', productName: '可乐经典装', categoryId: 'cat3', categoryName: '饮料', unit: '箱', unitPrice: 42 },
  { productId: 'new_p7', productName: '果汁鲜橙味', categoryId: 'cat3', categoryName: '饮料', unit: '箱', unitPrice: 58 },
  { productId: 'new_p8', productName: '坚果混合装', categoryId: 'cat4', categoryName: '坚果炒货', unit: '箱', unitPrice: 120 },
  { productId: 'new_p9', productName: '瓜子原味', categoryId: 'cat4', categoryName: '坚果炒货', unit: '箱', unitPrice: 35 },
];

/** 张三的客户目标数据 */
const zhangSanCustomers: CustomerTarget[] = [
  {
    customerId: 'c1', customerName: '张三商贸', isPlannedNew: false,
    marketerId: 'm1', marketerName: '张三',
    categories: [
      {
        categoryId: 'cat1', categoryName: '休闲食品',
        targetAmount: 0,
        actualAmountLastMonth: 380000, actualAmountPrevMonth: 350000,
        products: [
          { productId: 'p1', productName: '薯片原味', unit: '箱', unitPrice: 85, targetAmount: 0, lastMonthTarget: 120000, actualAmountLastMonth: 120000, actualAmountPrevMonth: 100000, remark: '', isPlannedNew: false },
          { productId: 'p2', productName: '果冻混合口味', unit: '箱', unitPrice: 62, targetAmount: 0, lastMonthTarget: 80000, actualAmountLastMonth: 80000, actualAmountPrevMonth: 90000, remark: '', isPlannedNew: false },
          { productId: 'p3', productName: '饼干巧克力味', unit: '箱', unitPrice: 55, targetAmount: 0, lastMonthTarget: 100000, actualAmountLastMonth: 100000, actualAmountPrevMonth: 85000, remark: '', isPlannedNew: false },
          { productId: 'p4', productName: '坚果礼盒', unit: '箱', unitPrice: 120, targetAmount: 0, lastMonthTarget: 80000, actualAmountLastMonth: 80000, actualAmountPrevMonth: 75000, remark: '', isPlannedNew: false },
        ],
      },
      {
        categoryId: 'cat2', categoryName: '膨化食品',
        targetAmount: 0,
        actualAmountLastMonth: 170000, actualAmountPrevMonth: 160000,
        products: [
          { productId: 'p5', productName: '虾条番茄味', unit: '箱', unitPrice: 55, targetAmount: 0, lastMonthTarget: 95000, actualAmountLastMonth: 95000, actualAmountPrevMonth: 88000, remark: '', isPlannedNew: false },
          { productId: 'p6', productName: '薯片麻辣味', unit: '箱', unitPrice: 88, targetAmount: 0, lastMonthTarget: 75000, actualAmountLastMonth: 75000, actualAmountPrevMonth: 72000, remark: '', isPlannedNew: false },
        ],
      },
    ],
  },
  {
    customerId: 'c2', customerName: '李四超市', isPlannedNew: false,
    marketerId: 'm1', marketerName: '张三',
    categories: [
      {
        categoryId: 'cat3', categoryName: '饮料',
        targetAmount: 0,
        actualAmountLastMonth: 200000, actualAmountPrevMonth: 180000,
        products: [
          { productId: 'p7', productName: '可乐经典装', unit: '箱', unitPrice: 42, targetAmount: 0, lastMonthTarget: 120000, actualAmountLastMonth: 120000, actualAmountPrevMonth: 108000, remark: '', isPlannedNew: false },
          { productId: 'p8', productName: '果汁鲜橙味', unit: '箱', unitPrice: 58, targetAmount: 0, lastMonthTarget: 80000, actualAmountLastMonth: 80000, actualAmountPrevMonth: 72000, remark: '', isPlannedNew: false },
        ],
      },
      {
        categoryId: 'cat1', categoryName: '休闲食品',
        targetAmount: 0,
        actualAmountLastMonth: 120000, actualAmountPrevMonth: 115000,
        products: [
          { productId: 'p9', productName: '薯片原味', unit: '箱', unitPrice: 85, targetAmount: 0, lastMonthTarget: 68000, actualAmountLastMonth: 68000, actualAmountPrevMonth: 65000, remark: '', isPlannedNew: false },
          { productId: 'p10', productName: '饼干巧克力味', unit: '箱', unitPrice: 55, targetAmount: 0, lastMonthTarget: 52000, actualAmountLastMonth: 52000, actualAmountPrevMonth: 50000, remark: '', isPlannedNew: false },
        ],
      },
    ],
  },
  {
    customerId: 'c3', customerName: '王五便利', isPlannedNew: false,
    marketerId: 'm1', marketerName: '张三',
    categories: [
      {
        categoryId: 'cat4', categoryName: '坚果炒货',
        targetAmount: 0,
        actualAmountLastMonth: 150000, actualAmountPrevMonth: 140000,
        products: [
          { productId: 'p11', productName: '坚果混合装', unit: '箱', unitPrice: 120, targetAmount: 0, lastMonthTarget: 96000, actualAmountLastMonth: 96000, actualAmountPrevMonth: 89600, remark: '', isPlannedNew: false },
          { productId: 'p12', productName: '瓜子原味', unit: '箱', unitPrice: 35, targetAmount: 0, lastMonthTarget: 54000, actualAmountLastMonth: 54000, actualAmountPrevMonth: 50400, remark: '', isPlannedNew: false },
        ],
      },
    ],
  },
  {
    customerId: 'c4', customerName: '华美达酒店', isPlannedNew: true,
    marketerId: 'm1', marketerName: '张三',
    categories: [],
  },
  {
    customerId: 'c5', customerName: '百联集团', isPlannedNew: true,
    marketerId: 'm1', marketerName: '张三',
    categories: [
      {
        categoryId: 'cat3', categoryName: '饮料',
        targetAmount: 0,
        actualAmountLastMonth: 0, actualAmountPrevMonth: 0,
        products: [
          { productId: 'p13', productName: '可乐经典装', unit: '箱', unitPrice: 42, targetAmount: 0, lastMonthTarget: 0, actualAmountLastMonth: 0, actualAmountPrevMonth: 0, remark: '', isPlannedNew: true },
        ],
      },
    ],
  },
];

/** 李四的客户目标数据 */
const liSiCustomers: CustomerTarget[] = [
  {
    customerId: 'c6', customerName: '家乐福', isPlannedNew: false,
    marketerId: 'm2', marketerName: '李四',
    categories: [
      {
        categoryId: 'cat1', categoryName: '休闲食品',
        targetAmount: 0,
        actualAmountLastMonth: 420000, actualAmountPrevMonth: 390000,
        products: [
          { productId: 'p14', productName: '薯片原味', unit: '箱', unitPrice: 85, targetAmount: 0, lastMonthTarget: 180000, actualAmountLastMonth: 180000, actualAmountPrevMonth: 165000, remark: '', isPlannedNew: false },
          { productId: 'p15', productName: '果冻混合口味', unit: '箱', unitPrice: 62, targetAmount: 0, lastMonthTarget: 130000, actualAmountLastMonth: 130000, actualAmountPrevMonth: 125000, remark: '', isPlannedNew: false },
          { productId: 'p16', productName: '饼干巧克力味', unit: '箱', unitPrice: 55, targetAmount: 0, lastMonthTarget: 110000, actualAmountLastMonth: 110000, actualAmountPrevMonth: 100000, remark: '', isPlannedNew: false },
        ],
      },
      {
        categoryId: 'cat2', categoryName: '膨化食品',
        targetAmount: 0,
        actualAmountLastMonth: 180000, actualAmountPrevMonth: 170000,
        products: [
          { productId: 'p17', productName: '虾条番茄味', unit: '箱', unitPrice: 55, targetAmount: 0, lastMonthTarget: 100000, actualAmountLastMonth: 100000, actualAmountPrevMonth: 95000, remark: '', isPlannedNew: false },
          { productId: 'p18', productName: '薯片麻辣味', unit: '箱', unitPrice: 88, targetAmount: 0, lastMonthTarget: 80000, actualAmountLastMonth: 80000, actualAmountPrevMonth: 75000, remark: '', isPlannedNew: false },
        ],
      },
    ],
  },
  {
    customerId: 'c7', customerName: '盒马鲜生', isPlannedNew: false,
    marketerId: 'm2', marketerName: '李四',
    categories: [
      {
        categoryId: 'cat4', categoryName: '坚果炒货',
        targetAmount: 0,
        actualAmountLastMonth: 280000, actualAmountPrevMonth: 260000,
        products: [
          { productId: 'p19', productName: '坚果混合装', unit: '箱', unitPrice: 120, targetAmount: 0, lastMonthTarget: 180000, actualAmountLastMonth: 180000, actualAmountPrevMonth: 168000, remark: '', isPlannedNew: false },
          { productId: 'p20', productName: '瓜子原味', unit: '箱', unitPrice: 35, targetAmount: 0, lastMonthTarget: 100000, actualAmountLastMonth: 100000, actualAmountPrevMonth: 92000, remark: '', isPlannedNew: false },
        ],
      },
    ],
  },
  {
    customerId: 'c8', customerName: '锦江之星', isPlannedNew: true,
    marketerId: 'm2', marketerName: '李四',
    categories: [],
  },
];

/** 王五的客户目标数据 */
const wangWuCustomers: CustomerTarget[] = [
  {
    customerId: 'c9', customerName: '永辉超市', isPlannedNew: false,
    marketerId: 'm3', marketerName: '王五',
    categories: [
      {
        categoryId: 'cat3', categoryName: '饮料',
        targetAmount: 0,
        actualAmountLastMonth: 320000, actualAmountPrevMonth: 300000,
        products: [
          { productId: 'p21', productName: '可乐经典装', unit: '箱', unitPrice: 42, targetAmount: 0, lastMonthTarget: 180000, actualAmountLastMonth: 180000, actualAmountPrevMonth: 168000, remark: '', isPlannedNew: false },
          { productId: 'p22', productName: '果汁鲜橙味', unit: '箱', unitPrice: 58, targetAmount: 0, lastMonthTarget: 140000, actualAmountLastMonth: 140000, actualAmountPrevMonth: 132000, remark: '', isPlannedNew: false },
        ],
      },
      {
        categoryId: 'cat1', categoryName: '休闲食品',
        targetAmount: 0,
        actualAmountLastMonth: 200000, actualAmountPrevMonth: 190000,
        products: [
          { productId: 'p23', productName: '薯片原味', unit: '箱', unitPrice: 85, targetAmount: 0, lastMonthTarget: 110000, actualAmountLastMonth: 110000, actualAmountPrevMonth: 105000, remark: '', isPlannedNew: false },
          { productId: 'p24', productName: '饼干巧克力味', unit: '箱', unitPrice: 55, targetAmount: 0, lastMonthTarget: 90000, actualAmountLastMonth: 90000, actualAmountPrevMonth: 85000, remark: '', isPlannedNew: false },
        ],
      },
    ],
  },
  {
    customerId: 'c10', customerName: '大润发', isPlannedNew: false,
    marketerId: 'm3', marketerName: '王五',
    categories: [
      {
        categoryId: 'cat2', categoryName: '膨化食品',
        targetAmount: 0,
        actualAmountLastMonth: 220000, actualAmountPrevMonth: 200000,
        products: [
          { productId: 'p25', productName: '虾条番茄味', unit: '箱', unitPrice: 55, targetAmount: 0, lastMonthTarget: 120000, actualAmountLastMonth: 120000, actualAmountPrevMonth: 110000, remark: '', isPlannedNew: false },
          { productId: 'p26', productName: '薯片麻辣味', unit: '箱', unitPrice: 88, targetAmount: 0, lastMonthTarget: 100000, actualAmountLastMonth: 100000, actualAmountPrevMonth: 90000, remark: '', isPlannedNew: false },
        ],
      },
    ],
  },
  {
    customerId: 'c11', customerName: '叮咚买菜', isPlannedNew: true,
    marketerId: 'm3', marketerName: '王五',
    categories: [],
  },
];

/** 全部客户目标数据（按营销师分组） */
export const ALL_CUSTOMER_TARGETS: CustomerTarget[] = [
  ...zhangSanCustomers,
  ...liSiCustomers,
  ...wangWuCustomers,
];

/** 默认目标状态 */
export const DEFAULT_STATUS: TargetStatus = 'draft';

/** 默认当前用户角色（原型演示用） */
export const DEFAULT_USER_ROLE = 'marketer' as const;

/** 默认当前营销师ID */
export const DEFAULT_MARKETER_ID = 'm1';
