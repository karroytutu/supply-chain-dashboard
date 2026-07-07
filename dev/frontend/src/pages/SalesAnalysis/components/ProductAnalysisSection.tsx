/**
 * 商品分析板块
 * 指标卡 + 四象限 + 品类排行 + Top商品 + 库存健康度 + 联动明细表
 */
import React, { useState, useMemo, useCallback } from 'react';
import { Segmented, Tag, Card } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import QuadrantView from './QuadrantView';
import LinkedDataTable from './LinkedDataTable';
import {
  PRODUCT_METRICS,
  PRODUCT_QUADRANT_CONFIG,
  PRODUCT_QUADRANT_STATS,
  CATEGORY_SALES,
  TOP_PRODUCTS,
  INVENTORY_HEALTH,
  PRODUCT_DETAILS,
} from '@/constants/salesAnalysis';
import { formatCompactAmount } from '../utils/analysis-helpers';
import { useMobileDetect } from '@/hooks/useMobileDetect';
import styles from './ProductAnalysisSection.less';

type SortDimension = 'salesAmount' | 'salesVolume' | 'profitAmount';

const ProductAnalysisSection: React.FC = () => {
  const isMobile = useMobileDetect();
  const [sortDim, setSortDim] = useState<SortDimension>('salesAmount');
  const [filterState, setFilterState] = useState<{ label: string; filterFn: (r: any) => boolean } | null>(null);

  const handleQuadrantClick = useCallback((key: string) => {
    const cfg = PRODUCT_QUADRANT_CONFIG.find((c) => c.key === key);
    if (!cfg) return;
    setFilterState({
      label: cfg.label,
      filterFn: (r) => r.quadrant === key,
    });
  }, []);

  const handleClearFilter = useCallback(() => setFilterState(null), []);

  const handleCategoryClick = useCallback((categoryName: string) => {
    setFilterState({
      label: `${categoryName}`,
      filterFn: (r) => r.categoryName === categoryName,
    });
  }, []);

  const sortedTopProducts = useMemo(() => {
    return [...TOP_PRODUCTS].sort((a, b) => (b[sortDim] as number) - (a[sortDim] as number));
  }, [sortDim]);

  // 明细表列配置
  const detailColumns: any[] = useMemo(() => [
    { key: 'productName', title: '商品名', dataIndex: 'productName', width: 140 },
    { key: 'categoryName', title: '品类', dataIndex: 'categoryName', width: 80, mobileVisible: true },
    { key: 'salesVolume', title: '销量', dataIndex: 'salesVolume', width: 80, align: 'right', sortable: true, mobileVisible: true },
    { key: 'salesAmount', title: '销售额', dataIndex: 'salesAmount', width: 100, align: 'right', sortable: true, mobileVisible: true, render: (v: any) => formatCompactAmount(v as number) },
    { key: 'profitAmount', title: '毛利额', dataIndex: 'profitAmount', width: 90, align: 'right', sortable: true, mobileVisible: true, render: (v: any) => formatCompactAmount(v as number) },
    { key: 'inventory', title: '库存量', dataIndex: 'inventory', width: 80, align: 'right', sortable: true, mobileVisible: false },
    { key: 'momChange', title: '环比', dataIndex: 'momChange', width: 70, align: 'right', sortable: true, mobileVisible: true,
      render: (v: any) => {
        const val = v as number;
        return <span style={{ color: val >= 0 ? '#389e0d' : '#cf1322' }}>{val >= 0 ? '+' : ''}{val.toFixed(1)}%</span>;
      },
    },
  ], []);

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>商品分析</h2>

      {/* 商品核心指标 */}
      <div className={styles.metricsRow}>
        {PRODUCT_METRICS.map((m) => (
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

      {/* 商品四象限 */}
      <div className={styles.subSection}>
        <h3 className={styles.subTitle}>商品价值分层</h3>
        <QuadrantView
          configs={PRODUCT_QUADRANT_CONFIG}
          stats={PRODUCT_QUADRANT_STATS}
          onQuadrantClick={handleQuadrantClick}
          compact={isMobile}
        />
      </div>

      {/* 品类排行 + Top 商品 */}
      <div className={styles.twoCol}>
        <div className={styles.subSection}>
          <h3 className={styles.subTitle}>品类销售排行</h3>
          <div className={styles.barList}>
            {CATEGORY_SALES.map((d) => (
              <div
                key={d.categoryId}
                className={styles.barItem}
                onClick={() => handleCategoryClick(d.categoryName)}
                role="button"
                tabIndex={0}
              >
                <span className={styles.barLabel}>{d.categoryName}</span>
                <div className={styles.barTrack}>
                  <span className={styles.barFill} style={{ width: `${d.salesPercentage}%` }} />
                </div>
                <span className={styles.barMeta}>{formatCompactAmount(d.salesAmount)} · {d.salesPercentage}%</span>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.subSection}>
          <div className={styles.subHeader}>
            <h3 className={styles.subTitle}>Top 商品排行</h3>
            <Segmented
              options={[
                { label: '销售额', value: 'salesAmount' },
                { label: '销量', value: 'salesVolume' },
                { label: '毛利额', value: 'profitAmount' },
              ]}
              value={sortDim}
              onChange={(v) => setSortDim(v as SortDimension)}
              size="small"
            />
          </div>
          <div className={styles.topList}>
            {sortedTopProducts.map((p, idx) => (
              <div key={p.productId} className={styles.topItem}>
                <span className={styles.topRank}>{idx + 1}</span>
                <span className={styles.topName}>{p.productName}</span>
                <span className={styles.topValue}>
                  {sortDim === 'salesVolume' ? p[sortDim] : formatCompactAmount(p[sortDim] as number)}
                </span>
                <span className={styles.topMeta}>{p.categoryName}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 库存健康度 */}
      <div className={styles.subSection}>
        <h3 className={styles.subTitle}>库存健康度</h3>
        <div className={styles.twoCol}>
          <div>
            <h4 className={styles.healthLabel}>
              <Tag color="error">缺货</Tag> Top {INVENTORY_HEALTH.filter((h) => h.type === 'shortage').length}
            </h4>
            {INVENTORY_HEALTH.filter((h) => h.type === 'shortage').map((h) => (
              <div key={h.productId} className={styles.healthItem}>
                <span className={styles.healthName}>{h.productName}</span>
                <span className={styles.healthMeta}>库存 {h.inventory} · 月销 {h.salesVolume}</span>
                <Tag color="volcano" className={styles.healthTag}>{h.severityLabel}</Tag>
              </div>
            ))}
          </div>
          <div>
            <h4 className={styles.healthLabel}>
              <Tag color="warning">积压</Tag> Top {INVENTORY_HEALTH.filter((h) => h.type === 'overstock').length}
            </h4>
            {INVENTORY_HEALTH.filter((h) => h.type === 'overstock').map((h) => (
              <div key={h.productId} className={styles.healthItem}>
                <span className={styles.healthName}>{h.productName}</span>
                <span className={styles.healthMeta}>库存 {h.inventory} · 月销 {h.salesVolume}</span>
                <Tag color="orange" className={styles.healthTag}>{h.severityLabel}</Tag>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 联动明细表 */}
      <div className={styles.subSection}>
        <h3 className={styles.subTitle}>商品明细</h3>
        <LinkedDataTable
          columns={detailColumns}
          dataSource={PRODUCT_DETAILS}
          rowKey="productId"
          filterState={filterState}
          onClearFilter={handleClearFilter}
          searchPlaceholder="搜索商品名..."
          searchFields={['productName']}
          pageSize={20}
        />
      </div>
    </section>
  );
};

export default ProductAnalysisSection;
