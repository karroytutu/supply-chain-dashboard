/**
 * 应收账款全景看板 - Mock 数据
 * 基于真实数据源结构设计，后续对接 API 时替换
 */

/** KPI 指标数据（当前数据源为实时查询，暂不支持环比） */
export const KPI_DATA: KpiCardData[] = [
  {
    key: 'totalReceivable',
    title: '应收总额',
    value: 2370000,
    unit: '元',
    valueColor: '#1890ff',
  },
  {
    key: 'overdueAmount',
    title: '逾期总额',
    value: 890000,
    unit: '元',
    valueColor: '#f5222d',
  },
  {
    key: 'customerCount',
    title: '应收客户数',
    value: 156,
    unit: '家',
    valueColor: '#fa8c16',
  },
  {
    key: 'dso',
    title: 'DSO · 应收周转天数',
    value: 42,
    unit: '天',
    valueColor: '#13c2c2',
  },
  {
    key: 'collectingTasks',
    title: '催收中任务',
    value: 28,
    unit: '笔',
    valueColor: '#1890ff',
  },
  {
    key: 'upcomingExpiry',
    title: '即将逾期 · 5天内',
    value: 15,
    unit: '笔',
    valueColor: '#faad14',
    auxiliary: [
      { label: '涉及金额', value: '¥128,500' },
      { label: '涉及客户', value: '8 家' },
    ],
  },
];

/** 催收进度管道数据（横向流向） */
export const PIPELINE_NODES: PipelineNode[] = [
  { status: 'collecting', label: '催收中', count: 28, amount: 356000, color: '#1890ff', pendingRole: 'marketer', upcomingExpiryCount: 5 },
  { status: 'extension', label: '延期', count: 8, amount: 95000, color: '#faad14', pendingRole: 'marketer', upcomingExpiryCount: 3 },
  { status: 'escalated', label: '已升级·经理', count: 8, amount: 112000, color: '#fa8c16', pendingRole: 'supervisor', escalationLevel: 1, upcomingExpiryCount: 2 },
  { status: 'difference_processing', label: '差异处理', count: 5, amount: 67000, color: '#ff4d4f', pendingRole: 'finance', upcomingExpiryCount: 1 },
  { status: 'escalated', label: '已升级·财务', count: 4, amount: 77000, color: '#ff4d4f', pendingRole: 'finance', escalationLevel: 2, upcomingExpiryCount: 4 },
];

/** 诉讼进度统计（数据源：ar_legal_progress 表） */
export const LEGAL_PROGRESS: LegalProgressStats = {
  noticeSent: 6,
  lawsuitFiled: 3,
  lawsuitInProgress: 2,
  lawsuitCompleted: 1,
};

/** 即将逾期客户维度数据（数据源：ar-warning.query getUpcomingWarnings） */
export const UPCOMING_EXPIRY_CUSTOMERS: UpcomingExpiryCustomer[] = [
  { consumerName: '基长艾三批发', billCount: 3, totalAmount: 28500, nearestExpireDate: '2026-06-11', managerUserName: '张晨' },
  { consumerName: '鑫源百货', billCount: 2, totalAmount: 15800, nearestExpireDate: '2026-06-12', managerUserName: '王芳' },
  { consumerName: '福来批发部', billCount: 4, totalAmount: 32000, nearestExpireDate: '2026-06-10', managerUserName: '赵强' },
  { consumerName: '新世纪商贸', billCount: 1, totalAmount: 18500, nearestExpireDate: '2026-06-13', managerUserName: '王芳' },
  { consumerName: '好又多超市', billCount: 2, totalAmount: 12000, nearestExpireDate: '2026-06-14', managerUserName: '陈伟' },
  { consumerName: '百汇批发', billCount: 1, totalAmount: 11200, nearestExpireDate: '2026-06-11', managerUserName: '孙丽' },
  { consumerName: '汇丰商行', billCount: 1, totalAmount: 16000, nearestExpireDate: '2026-06-10', managerUserName: '刘娟' },
  { consumerName: '金源超市', billCount: 1, totalAmount: 6200, nearestExpireDate: '2026-06-15', managerUserName: '陈伟' },
];

/** 管道节点即将逾期明细（按节点筛选） */
export const PIPELINE_EXPIRY_DETAILS: Record<string, PipelineExpiryDetail[]> = {
  collecting: [
    { billNo: 'XS20260310003', consumerName: '福来批发部', leftAmount: 15600, expireTime: '2026-06-12', daysToExpire: 2, managerUserName: '赵强' },
    { billNo: 'XS20260312001', consumerName: '新世纪商贸', leftAmount: 18500, expireTime: '2026-06-13', daysToExpire: 3, managerUserName: '王芳' },
    { billNo: 'XS20260311018', consumerName: '好又多超市', leftAmount: 7500, expireTime: '2026-06-14', daysToExpire: 4, managerUserName: '陈伟' },
    { billNo: 'XS20260306012', consumerName: '汇丰商行', leftAmount: 16000, expireTime: '2026-06-10', daysToExpire: 0, managerUserName: '刘娟' },
    { billNo: 'XS20260305008', consumerName: '鑫源百货', leftAmount: 8500, expireTime: '2026-06-11', daysToExpire: 1, managerUserName: '王芳' },
  ],
  extension: [
    { billNo: 'XS20260308005', consumerName: '金源超市', leftAmount: 6200, expireTime: '2026-06-15', daysToExpire: 5, managerUserName: '陈伟' },
    { billNo: 'XS20260309007', consumerName: '百汇批发', leftAmount: 11200, expireTime: '2026-06-11', daysToExpire: 1, managerUserName: '孙丽' },
    { billNo: 'XS20260303016', consumerName: '天虹商场', leftAmount: 43000, expireTime: '2026-06-12', daysToExpire: 2, managerUserName: '王芳' },
  ],
};

/** 营销师维度数据 */
export const MARKETER_DATA: MarketerStats[] = [
  { marketerId: 101, marketerName: '张晨', debtCustomerCount: 42, debtAmount: 380000, overdueCustomerCount: 18, overdueAmount: 245000, dso: 38, collectingCount: 8 },
  { marketerId: 102, marketerName: '李洋', debtCustomerCount: 35, debtAmount: 295000, overdueCustomerCount: 15, overdueAmount: 198000, dso: 45, collectingCount: 6 },
  { marketerId: 103, marketerName: '王芳', debtCustomerCount: 28, debtAmount: 230000, overdueCustomerCount: 12, overdueAmount: 156000, dso: 52, collectingCount: 5 },
  { marketerId: 104, marketerName: '赵强', debtCustomerCount: 38, debtAmount: 198000, overdueCustomerCount: 10, overdueAmount: 132000, dso: 35, collectingCount: 4 },
  { marketerId: 105, marketerName: '刘娟', debtCustomerCount: 22, debtAmount: 135000, overdueCustomerCount: 8, overdueAmount: 89000, dso: 41, collectingCount: 3 },
  { marketerId: 106, marketerName: '陈伟', debtCustomerCount: 18, debtAmount: 85000, overdueCustomerCount: 5, overdueAmount: 52000, dso: 28, collectingCount: 2 },
  { marketerId: 107, marketerName: '孙丽', debtCustomerCount: 10, debtAmount: 32000, overdueCustomerCount: 3, overdueAmount: 18000, dso: 22, collectingCount: 0 },
];

/** 营销师选项（用于筛选下拉） */
export const MARKETER_OPTIONS = MARKETER_DATA.map((m) => ({
  value: m.marketerId,
  label: m.marketerName,
}));

/** 催收状态标签映射 */
export const STATUS_LABEL_MAP: Record<CollectionTaskStatus, { label: string; color: string }> = {
  collecting: { label: '催收中', color: 'blue' },
  difference_processing: { label: '差异处理', color: 'orange' },
  extension: { label: '延期', color: 'gold' },
  escalated: { label: '已升级', color: 'red' },
  closed: { label: '已关闭', color: 'default' },
};

/** 应收账款明细数据 */
export const DETAIL_DATA: ArDetailRow[] = [
  { id: 1, billNo: 'XS20260301001', consumerName: '基长艾三批发', billTypeName: '销售订单', totalAmount: 28500, leftAmount: 20800, billOrderTime: '2026-03-01', expireTime: '2026-05-15', overdueDays: 26, agingBucket: '1-30天', creditLimit: 50000, status: 'collecting', managerUserName: '张晨' },
  { id: 2, billNo: 'XS20260228015', consumerName: '恒达商贸', billTypeName: '销售订单', totalAmount: 45000, leftAmount: 45000, billOrderTime: '2026-02-28', expireTime: '2026-04-20', overdueDays: 51, agingBucket: '31-60天', creditLimit: 80000, status: 'escalated', escalationLevel: 1, managerUserName: '李洋' },
  { id: 3, billNo: 'XS20260305008', consumerName: '鑫源百货', billTypeName: '销售订单', totalAmount: 12800, leftAmount: 8500, billOrderTime: '2026-03-05', expireTime: '2026-06-08', overdueDays: 2, agingBucket: '1-30天', creditLimit: 30000, status: 'collecting', managerUserName: '王芳' },
  { id: 4, billNo: 'XS20260215022', consumerName: '万家乐超市', billTypeName: '销售订单', totalAmount: 67000, leftAmount: 52000, billOrderTime: '2026-02-15', expireTime: '2026-03-30', overdueDays: 72, agingBucket: '61-90天', creditLimit: 100000, status: 'escalated', escalationLevel: 2, managerUserName: '张晨' },
  { id: 5, billNo: 'XS20260310003', consumerName: '福来批发部', billTypeName: '销售订单', totalAmount: 15600, leftAmount: 15600, billOrderTime: '2026-03-10', expireTime: '2026-06-12', overdueDays: 0, agingBucket: '未逾期', creditLimit: 40000, status: 'collecting', managerUserName: '赵强' },
  { id: 6, billNo: 'XS20260302019', consumerName: '盛达食品', billTypeName: '销售订单', totalAmount: 33000, leftAmount: 21000, billOrderTime: '2026-03-02', expireTime: '2026-05-25', overdueDays: 16, agingBucket: '1-30天', creditLimit: 60000, status: 'difference_processing', managerUserName: '刘娟' },
  { id: 7, billNo: 'XS20260120011', consumerName: '永辉商行', billTypeName: '销售订单', totalAmount: 89000, leftAmount: 89000, billOrderTime: '2026-01-20', expireTime: '2026-03-01', overdueDays: 101, agingBucket: '90天以上', creditLimit: 120000, status: 'escalated', escalationLevel: 2, managerUserName: '李洋' },
  { id: 8, billNo: 'XS20260308005', consumerName: '金源超市', billTypeName: '销售订单', totalAmount: 9800, leftAmount: 6200, billOrderTime: '2026-03-08', expireTime: '2026-06-10', overdueDays: 0, agingBucket: '未逾期', creditLimit: 25000, status: 'extension', managerUserName: '陈伟' },
  { id: 9, billNo: 'XS20260225033', consumerName: '大成批发', billTypeName: '销售订单', totalAmount: 56000, leftAmount: 42000, billOrderTime: '2026-02-25', expireTime: '2026-05-01', overdueDays: 40, agingBucket: '31-60天', creditLimit: 70000, status: 'collecting', managerUserName: '张晨' },
  { id: 10, billNo: 'XS20260312001', consumerName: '新世纪商贸', billTypeName: '销售订单', totalAmount: 18500, leftAmount: 18500, billOrderTime: '2026-03-12', expireTime: '2026-06-15', overdueDays: 0, agingBucket: '未逾期', creditLimit: 35000, status: 'collecting', managerUserName: '王芳' },
  { id: 11, billNo: 'XS20260210028', consumerName: '利达贸易', billTypeName: '销售订单', totalAmount: 72000, leftAmount: 55000, billOrderTime: '2026-02-10', expireTime: '2026-03-15', overdueDays: 87, agingBucket: '61-90天', creditLimit: 90000, status: 'escalated', escalationLevel: 1, managerUserName: '赵强' },
  { id: 12, billNo: 'XS20260306012', consumerName: '汇丰商行', billTypeName: '销售订单', totalAmount: 24000, leftAmount: 16000, billOrderTime: '2026-03-06', expireTime: '2026-06-05', overdueDays: 5, agingBucket: '1-30天', creditLimit: 45000, status: 'collecting', managerUserName: '刘娟' },
  { id: 13, billNo: 'XS20260222009', consumerName: '鑫盛超市', billTypeName: '销售订单', totalAmount: 38000, leftAmount: 28000, billOrderTime: '2026-02-22', expireTime: '2026-04-10', overdueDays: 61, agingBucket: '61-90天', creditLimit: 55000, status: 'closed', managerUserName: '李洋' },
  { id: 14, billNo: 'XS20260309007', consumerName: '百汇批发', billTypeName: '销售订单', totalAmount: 11200, leftAmount: 11200, billOrderTime: '2026-03-09', expireTime: '2026-06-11', overdueDays: 0, agingBucket: '未逾期', creditLimit: 20000, status: 'extension', managerUserName: '孙丽' },
  { id: 15, billNo: 'XS20260301025', consumerName: '华润万家', billTypeName: '销售订单', totalAmount: 95000, leftAmount: 72000, billOrderTime: '2026-03-01', expireTime: '2026-05-20', overdueDays: 21, agingBucket: '1-30天', creditLimit: 150000, status: 'collecting', managerUserName: '张晨' },
  { id: 16, billNo: 'XS20260115003', consumerName: '中百仓储', billTypeName: '销售订单', totalAmount: 128000, leftAmount: 96000, billOrderTime: '2026-01-15', expireTime: '2026-02-28', overdueDays: 102, agingBucket: '90天以上', creditLimit: 200000, status: 'closed', managerUserName: '李洋' },
  { id: 17, billNo: 'XS20260311018', consumerName: '好又多超市', billTypeName: '销售订单', totalAmount: 7500, leftAmount: 7500, billOrderTime: '2026-03-11', expireTime: '2026-06-13', overdueDays: 0, agingBucket: '未逾期', creditLimit: 15000, status: 'collecting', managerUserName: '陈伟' },
  { id: 18, billNo: 'XS20260228041', consumerName: '美宜佳', billTypeName: '销售订单', totalAmount: 42000, leftAmount: 31000, billOrderTime: '2026-02-28', expireTime: '2026-05-08', overdueDays: 33, agingBucket: '31-60天', creditLimit: 65000, status: 'difference_processing', managerUserName: '赵强' },
  { id: 19, billNo: 'XS20260303016', consumerName: '天虹商场', billTypeName: '销售订单', totalAmount: 58000, leftAmount: 43000, billOrderTime: '2026-03-03', expireTime: '2026-05-28', overdueDays: 13, agingBucket: '1-30天', creditLimit: 80000, status: 'extension', managerUserName: '王芳' },
  { id: 20, billNo: 'XS20260218007', consumerName: '苏果超市', billTypeName: '销售订单', totalAmount: 35000, leftAmount: 25000, billOrderTime: '2026-02-18', expireTime: '2026-04-05', overdueDays: 66, agingBucket: '61-90天', creditLimit: 50000, status: 'closed', managerUserName: '刘娟' },
];

/** 数据更新时间 */
export const UPDATED_AT = '2026-06-10 14:30:00';
