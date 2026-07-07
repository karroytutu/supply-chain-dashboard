/**
 * 客户分析板块
 * 指标卡 + 四象限 + Top排行 + 渠道/片区分布 + 集中度 + 新老结构 + 品类渗透 + 联动明细表
 */
import React, { useState, useMemo, useCallback } from 'react';
import { Segmented, Statistic, Card } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import QuadrantView from './QuadrantView';
import LinkedDataTable from './LinkedDataTable';
import {
  CUSTOMER_METRICS,
  CUSTOMER_QUADRANT_CONFIG,
  CUSTOMER_QUADRANT_STATS,
  TOP_CUSTOMERS,
  CHANNEL_DISTRIBUTION,
  DISTRICT_DISTRIBUTION,
  CUSTOMER_CONCENTRATION,
  CUSTOMER_STRUCTURE_DATA,
  CATEGORY_PENETRATION,
  CUSTOMER_DETAILS,
} from '@/constants/salesAnalysis';
import { formatCompactAmount } from '../utils/analysis-helpers';
import { useMobileDetect } from '@/hooks/useMobileDetect';
import styles from './CustomerAnalysisSection.less';

type SortDimension = 'salesAmount' | 'profitAmount' | 'collectionAmount' | 'categoryCount';

const CustomerAnalysisSection: React.FC = () => {
  const isMobile = useMobileDetect();
  const [sortDim, setSortDim] = useState<SortDimension>('salesAmount');
  const [filterState, setFilterState] = useState<{ label: string; filterFn: (r: any) => boolean } | null>(null);

  const handleQuadrantClick = useCallback((key: string) => {
    const cfg = CUSTOMER_QUADRANT_CONFIG.find((c) => c.key === key);
    if (!cfg) return;
    setFilterState({
      label: cfg.label,
      filterFn: (r) => r.quadrant === key,
    });
  }, []);

  const handleClearFilter = useCallback(() => setFilterState(null), []);

  const sortedTopCustomers = useMemo(() => {
    return [...TOP_CUSTOMERS].sort((a, b) => (b[sortDim] as number) - (a[sortDim] as number));
  }, [sortDim]);

  // 明细表列配置
  const detailColumns: any[] = useMemo(() => [
    { key: 'customerName', title: '客户名', dataIndex: 'customerName', width: 120, sortable: false },
    { key: 'channel', title: '渠道', dataIndex: 'channel', width: 80, mobileVisible: true },
    { key: 'district', title: '片区', dataIndex: 'district', width: 70, mobileVisible: false },
    { key: 'marketerName', title: '营销师', dataIndex: 'marketerName', width: 70, mobileVisible: true },
    { key: 'salesAmount', title: '销售额', dataIndex: 'salesAmount', width: 100, align: 'right', sortable: true, render: (v: any) => formatCompactAmount(v as number) },
    { key: 'profitAmount', title: '毛利额', dataIndex: 'profitAmount', width: 90, align: 'right', sortable: true, mobileVisible: true, render: (v: any) => formatCompactAmount(v as number) },
    { key: 'collectionAmount', title: '回款额', dataIndex: 'collectionAmount', width: 90, align: 'right', sortable: true, mobileVisible: true, render: (v: any) => formatCompactAmount(v as number) },
    { key: 'orderCount', title: '下单次数', dataIndex: 'orderCount', width: 80, align: 'right', sortable: true, mobileVisible: false },
    { key: 'categoryCount', title: '品类数', dataIndex: 'categoryCount', width: 70, align: 'right', sortable: true, mobileVisible: true },
    { key: 'momChange', title: '环比', dataIndex: 'momChange', width: 70, align: 'right', sortable: true, mobileVisible: true,
      render: (v: any) => {
        const val = v as number;
        return <span style={{ color: val >= 0 ? '#389e0d' : '#cf1322' }}>{val >= 0 ? '+' : ''}{val.toFixed(1)}%</span>;
      },
    },
  ], []);

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>客户分析</h2>

      {/* 客户核心指标 */}
      <div className={styles.metricsRow}>
        {CUSTOMER_METRICS.map((m) => (
          <div key={m.key} className={styles.metricCard}>
            <div className={styles.metricLabel}>{m.label}</div>
            <div className={styles.metricValue}>
              {m.valueType === 'percent' ? `${m.value}%` : m.valueType === 'count' ? m.value : formatCompactAmount(m.value)}
            </div>
            <div className={styles.metricMom} style={{ color: m.momChange >= 0 ? '#389e0d' : '#cf1322' }}>
              {m.momChange >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
              {Math.abs(m.momChange)}%
            </div>
          </div>
        ))}
      </div>

      {/* 四象限 */}
      <div className={styles.subSection}>
        <h3 className={styles.subTitle}>客户价值分层</h3>
        <QuadrantView
          configs={CUSTOMER_QUADRANT_CONFIG}
          stats={CUSTOMER_QUADRANT_STATS}
          onQuadrantClick={handleQuadrantClick}
          compact={isMobile}
        />
      </div>

      {/* Top 客户排行 */}
      <div className={styles.subSection}>
        <div className={styles.subHeader}>
          <h3 className={styles.subTitle}>Top 客户排行</h3>
          <Segmented
            options={[
              { label: '销售额', value: 'salesAmount' },
              { label: '毛利额', value: 'profitAmount' },
              { label: '回款额', value: 'collectionAmount' },
              { label: '品类数', value: 'categoryCount' },
            ]}
            value={sortDim}
            onChange={(v) => setSortDim(v as SortDimension)}
            size="small"
          />
        </div>
        <div className={styles.topList}>
          {sortedTopCustomers.map((c, idx) => (
            <div key={c.customerId} className={styles.topItem}>
              <span className={styles.topRank}>{idx + 1}</span>
              <span className={styles.topName}>{c.customerName}</span>
              <span className={styles.topValue}>{formatCompactAmount(c[sortDim] as number)}</span>
              <span className={styles.topMeta}>{c.marketerName} · {c.districtName}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 渠道 + 片区分布 */}
      <div className={styles.twoCol}>
        <div className={styles.subSection}>
          <h3 className={styles.subTitle}>渠道分布</h3>
          <div className={styles.barList}>
            {CHANNEL_DISTRIBUTION.map((d) => (
              <div key={d.label} className={styles.barItem}>
                <span className={styles.barLabel}>{d.label}</span>
                <div className={styles.barTrack}>
                  <span className={styles.barFill} style={{ width: `${d.salesPercentage}%` }} />
                </div>
                <span className={styles.barMeta}>{d.count}家 · {d.salesPercentage}%</span>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.subSection}>
          <h3 className={styles.subTitle}>片区分布</h3>
          <div className={styles.barList}>
            {DISTRICT_DISTRIBUTION.map((d) => (
              <div key={d.label} className={styles.barItem}>
                <span className={styles.barLabel}>{d.label}</span>
                <div className={styles.barTrack}>
                  <span className={styles.barFill} style={{ width: `${d.salesPercentage}%` }} />
                </div>
                <span className={styles.barMeta}>{d.count}家 · {d.salesPercentage}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 集中度 + 新老结构 + 品类渗透 */}
      <div className={styles.threeCol}>
        <Card className={styles.infoCard} size="small">
          <Statistic title="Top 5 客户占比" value={CUSTOMER_CONCENTRATION.top5Percentage} suffix="%" precision={1} />
          <Statistic title="Top 10 客户占比" value={CUSTOMER_CONCENTRATION.top10Percentage} suffix="%" precision={1} />
        </Card>
        <Card className={styles.infoCard} size="small">
          <Statistic title="新增客户" value={CUSTOMER_STRUCTURE_DATA.newCustomerCount} suffix="家" />
          <div className={styles.infoSub}>销售额 {formatCompactAmount(CUSTOMER_STRUCTURE_DATA.newCustomerSales)}</div>
          <Statistic title="存量客户" value={CUSTOMER_STRUCTURE_DATA.existingCustomerCount} suffix="家" />
        </Card>
        <Card className={styles.infoCard} size="small">
          <Statistic title="平均品类数" value={CATEGORY_PENETRATION.avgCategoryCount} precision={1} />
          <div className={styles.infoSub}>低于平均: {CATEGORY_PENETRATION.belowAvgCount} / {CATEGORY_PENETRATION.totalCustomers} 家</div>
        </Card>
      </div>

      {/* 联动明细表 */}
      <div className={styles.subSection}>
        <h3 className={styles.subTitle}>客户明细</h3>
        <LinkedDataTable
          columns={detailColumns}
          dataSource={CUSTOMER_DETAILS}
          rowKey="customerId"
          filterState={filterState}
          onClearFilter={handleClearFilter}
          searchPlaceholder="搜索客户名..."
          searchFields={['customerName']}
          pageSize={20}
        />
      </div>
    </section>
  );
};

export default CustomerAnalysisSection;
