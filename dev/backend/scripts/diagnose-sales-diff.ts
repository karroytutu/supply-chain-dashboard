/**
 * 销售明细数据差异诊断脚本
 * 逐月对比本地 DB 与 ERP API 的记录数，定位差异来源
 * 用法: npx ts-node scripts/diagnose-sales-diff.ts
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { erpPost } from '../src/services/erp-client/erp-client';
import { getErpDefaults } from '../src/services/erp-client/erp-config';
import { SALES_BUSINESS_ATTR_IDS } from '../src/utils/constants';

const pool = new Pool({
  host: process.env.APP_DB_HOST,
  port: 5432,
  database: process.env.APP_DB_NAME,
  user: process.env.APP_DB_USER,
  password: process.env.APP_DB_PASSWORD,
});

interface MonthResult {
  label: string;
  localCount: number;
  erpTotal: number;
  diff: number;
}

/** 获取 ERP 某月的 total（只请求第一页） */
async function getErpMonthTotal(dateFrom: string, dateTo: string): Promise<number> {
  const { cid, uid } = getErpDefaults();
  const result = await erpPost<any>(
    '/funds-sale/list-sale-detail',
    {
      dimList: [],
      submitTimeFrom: dateFrom,
      submitTimeTo: dateTo,
      goodsIds: [],
      consumerIds: [],
      salesmanIds: [],
      subTypes: [],
      billTypes: [],
      businessAttrIds: [...SALES_BUSINESS_ATTR_IDS],
      tagIds: [],
      orderStateIds: ['APPROVED'],
      settlementStateIds: [],
      brandIds: [],
      categoryIds: [],
      costPriceType: 'MOVE_COST_PRICE',
      areaIds: [],
      groupIds: [],
      gradeIds: [],
      deliverIds: [],
      orderNote: '',
      originStr: '',
      warehouseIds: [],
      submitTimeType: 'settle_time',
      unitDisplayType: 'BASE_UNIT',
      mixPriceUnit: 'PKG_UNIT',
      exportType: 'mergeexport',
      orderBy: '',
      orderType: '',
      signStateIds: [],
      deptIds: [],
      settleConsumerIds: [],
      supplierIds: [],
      defaultSelectedIndex: 0,
      qualityType: '',
      current: 1,
      size: 1,  // 只要 total，不拉数据
      fundsSaleTotalAmountFrom: '',
      fundsSaleTotalAmountTo: '',
      bizCollectorIds: [],
      fuzzySearchGoodsStr: '',
      cid,
      uid,
    },
    {
      pathPrefix: '/toliman/',
      businessType: 'sales_diagnose',
    }
  );
  return result?.data?.total || 0;
}

async function run() {
  console.log('=== 销售明细数据差异诊断 ===\n');

  const now = new Date();
  const beijing = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
  const endYear = beijing.getFullYear();
  const endMon = beijing.getMonth() + 1;

  // 生成月份范围
  const months: { from: string; to: string; label: string }[] = [];
  let year = 2020, month = 1;
  while (year < endYear || (year === endYear && month <= endMon)) {
    const label = `${year}-${String(month).padStart(2, '0')}`;
    const from = `${label}-01`;
    // ERP API 上界包含(<=)，用当月最后一天避免与下月重叠
    const lastDay = new Date(year, month, 0).getDate();
    const to = `${label}-${String(lastDay).padStart(2, '0')}`;
    months.push({ from, to, label });
    month = month === 12 ? 1 : month + 1;
    year = month === 1 ? year + 1 : year;
  }

  console.log(`对比范围: 2020-01 ~ ${endYear}-${String(endMon).padStart(2, '0')} (${months.length} 个月)\n`);

  const results: MonthResult[] = [];
  let totalLocal = 0;
  let totalErp = 0;

  for (let i = 0; i < months.length; i++) {
    const { from, to, label } = months[i];

    // 并行获取本地和 ERP 数据
    // to 是当月最后一天(如 2025-08-31)，加 1 天变成下月 1 号用于 < 比较
    const toDate = new Date(to + 'T00:00:00');
    toDate.setDate(toDate.getDate() + 1);
    const toNext = toDate.toISOString().substring(0, 10);
    const [localResult, erpTotal] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) FROM erp_sales_details WHERE settle_time >= $1 AND settle_time < $2`,
        [from, toNext]
      ),
      getErpMonthTotal(from, to),
    ]);

    const localCount = parseInt(localResult.rows[0].count);
    const diff = localCount - erpTotal;
    totalLocal += localCount;
    totalErp += erpTotal;

    results.push({ label, localCount, erpTotal, diff });

    // 只显示有差异的月份
    if (diff !== 0) {
      console.log(`${label}  本地=${localCount}  ERP=${erpTotal}  差异=${diff > 0 ? '+' : ''}${diff}`);
    }

    // 进度
    if ((i + 1) % 10 === 0) {
      console.log(`... 进度 ${i + 1}/${months.length}`);
    }
  }

  // 汇总
  console.log('\n=== 汇总 ===');
  console.log(`本地总行数: ${totalLocal}`);
  console.log(`ERP 总行数: ${totalErp}`);
  console.log(`总差异: ${totalLocal - totalErp}`);

  // 差异分布
  const diffMonths = results.filter(r => r.diff !== 0);
  if (diffMonths.length === 0) {
    console.log('\n所有月份数据完全一致!');
  } else {
    console.log(`\n有差异的月份: ${diffMonths.length} 个`);
    console.log('差异最大的月份:');
    diffMonths.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    diffMonths.slice(0, 5).forEach(r => {
      console.log(`  ${r.label}  差异=${r.diff > 0 ? '+' : ''}${r.diff} (本地=${r.localCount}, ERP=${r.erpTotal})`);
    });
  }

  await pool.end();
}

run().catch(async (err) => {
  console.error('Fatal:', err.message);
  await pool.end();
});
