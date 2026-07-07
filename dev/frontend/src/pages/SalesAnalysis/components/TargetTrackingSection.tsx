/**
 * 目标追踪板块
 * 整体完成率 + 营销师排名表（10列）+ 四级钻取 + 提成计算
 */
import React, { useState, useMemo } from 'react';
import { Table, Progress, Tag, Card, Statistic } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, WarningOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { TARGET_OVERVIEW, MARKETER_RANKINGS } from '@/constants/salesAnalysis';
import type { MarketerRankRow, MarketerCustomerRow, CustomerCategoryRow, CategoryProductRow } from '@/types/sales-analysis';
import { formatCompactAmount } from '../utils/analysis-helpers';
import { useMobileDetect } from '@/hooks/useMobileDetect';
import styles from './TargetTrackingSection.less';

const TargetTrackingSection: React.FC = () => {
  const isMobile = useMobileDetect();
  const overview = TARGET_OVERVIEW;

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>目标追踪</h2>

      {/* 整体概览卡片 */}
      <div className={styles.overviewGrid}>
        <Card className={styles.overviewCard}>
          <Statistic
            title="整体完成率"
            value={overview.completionRate}
            suffix="%"
            precision={1}
            valueStyle={{ color: overview.completionRate < overview.timeProgress ? '#cf1322' : '#389e0d' }}
          />
        </Card>
        <Card className={styles.overviewCard}>
          <Statistic
            title="时间进度"
            value={overview.timeProgress}
            suffix={`% (${overview.timeProgressDays}/${overview.totalDays}天)`}
            precision={1}
          />
        </Card>
        <Card className={styles.overviewCard}>
          <Statistic
            title="预测月末完成率"
            value={overview.predictedCompletionRate}
            suffix="%"
            precision={1}
            valueStyle={{ color: overview.predictedCompletionRate < 80 ? '#fa8c16' : '#389e0d' }}
          />
        </Card>
        <Card className={styles.overviewCard}>
          <Statistic
            title="差距额"
            value={overview.totalTargetAmount - overview.totalActualAmount}
            prefix="¥"
            formatter={(val) => formatCompactAmount(Number(val))}
            valueStyle={{ color: '#cf1322' }}
          />
        </Card>
      </div>

      {/* 营销师排名表 */}
      {isMobile ? (
        <MobileMarketerCards />
      ) : (
        <DesktopMarketerTable />
      )}
    </section>
  );
};

/** 桌面端：Ant Design Table + 行内展开 */
const DesktopMarketerTable: React.FC = () => {
  const columns: ColumnsType<MarketerRankRow> = useMemo(() => [
    {
      title: '营销师', dataIndex: 'marketerName', width: 90,
      render: (name: string, row: MarketerRankRow) => (
        <span>
          {name}
          {row.isAlert && <WarningOutlined className={styles.alertIcon} />}
        </span>
      ),
    },
    {
      title: '目标额', dataIndex: 'targetAmount', width: 100, align: 'right',
      render: (v: number) => formatCompactAmount(v),
    },
    {
      title: '销售额', dataIndex: 'salesAmount', width: 100, align: 'right',
      render: (v: number) => formatCompactAmount(v),
    },
    {
      title: '完成率', dataIndex: 'completionRate', width: 90, align: 'right',
      render: (v: number) => (
        <span style={{ color: v < 60 ? '#cf1322' : v < 80 ? '#fa8c16' : '#389e0d' }}>
          {v.toFixed(1)}%
        </span>
      ),
    },
    {
      title: '回款额', dataIndex: 'collectionAmount', width: 100, align: 'right',
      render: (v: number) => formatCompactAmount(v),
    },
    {
      title: '回款率', dataIndex: 'collectionRate', width: 80, align: 'right',
      render: (v: number) => (
        <span style={{ color: v < 50 ? '#cf1322' : undefined }}>{v.toFixed(1)}%</span>
      ),
    },
    {
      title: '费用额', dataIndex: 'expenseAmount', width: 100, align: 'right',
      render: (v: number) => formatCompactAmount(v),
    },
    {
      title: '费销比', dataIndex: 'expenseSalesRatio', width: 80, align: 'right',
      render: (v: number) => `${v.toFixed(1)}%`,
    },
    {
      title: '已回款毛利', dataIndex: 'collectedProfit', width: 110, align: 'right',
      render: (v: number) => formatCompactAmount(v),
    },
    {
      title: '预估提成', dataIndex: 'estimatedCommission', width: 100, align: 'right',
      render: (v: number) => (
        <span className={styles.commissionCell}>¥{v.toLocaleString()}</span>
      ),
    },
  ], []);

  return (
    <Table
      columns={columns}
      dataSource={MARKETER_RANKINGS}
      rowKey="marketerId"
      pagination={false}
      size="small"
      scroll={{ x: 1040 }}
      className={styles.marketerTable}
      rowClassName={(row) => row.isAlert ? styles.alertRow : ''}
      expandable={{
        expandedRowRender: (row) => <CustomerDrillDown customers={row.customers} />,
      }}
    />
  );
};

/** 移动端：卡片布局 */
const MobileMarketerCards: React.FC = () => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className={styles.mobileCards}>
      {MARKETER_RANKINGS.map((m) => (
        <div
          key={m.marketerId}
          className={`${styles.mobileCard} ${m.isAlert ? styles.alertCard : ''}`}
          onClick={() => setExpandedId(expandedId === m.marketerId ? null : m.marketerId)}
        >
          <div className={styles.mobileCardHeader}>
            <span className={styles.mobileName}>
              {m.marketerName}
              {m.isAlert && <Tag color="error" className={styles.alertTag}>异常</Tag>}
            </span>
            <span className={styles.mobileRate} style={{
              color: m.completionRate < 60 ? '#cf1322' : m.completionRate < 80 ? '#fa8c16' : '#389e0d'
            }}>
              {m.completionRate.toFixed(1)}%
            </span>
          </div>
          <div className={styles.mobileCardBody}>
            <span>销售额 {formatCompactAmount(m.salesAmount)}</span>
            <span>提成 ¥{m.estimatedCommission.toLocaleString()}</span>
          </div>
          {expandedId === m.marketerId && (
            <div className={styles.mobileExpanded}>
              <div className={styles.mobileDetailRow}><span>目标额</span><span>{formatCompactAmount(m.targetAmount)}</span></div>
              <div className={styles.mobileDetailRow}><span>回款额</span><span>{formatCompactAmount(m.collectionAmount)}</span></div>
              <div className={styles.mobileDetailRow}><span>回款率</span><span>{m.collectionRate.toFixed(1)}%</span></div>
              <div className={styles.mobileDetailRow}><span>费用额</span><span>{formatCompactAmount(m.expenseAmount)}</span></div>
              <div className={styles.mobileDetailRow}><span>费销比</span><span>{m.expenseSalesRatio.toFixed(1)}%</span></div>
              <div className={styles.mobileDetailRow}><span>已回款毛利</span><span>{formatCompactAmount(m.collectedProfit)}</span></div>
              <CustomerDrillDown customers={m.customers} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

/** 客户钻取（四级：营销师 -> 客户 -> 品类 -> 商品） */
const CustomerDrillDown: React.FC<{ customers: MarketerCustomerRow[] }> = ({ customers }) => {
  if (!customers.length) return <div className={styles.emptyHint}>暂无客户数据</div>;

  return (
    <div className={styles.drillDown}>
      {customers.map((c) => (
        <DrillDownLevel key={c.customerId} name={c.customerName} target={c.targetAmount} actual={c.actualAmount} rate={c.completionRate} gap={c.gap}>
          {c.categories.map((cat) => (
            <DrillDownLevel key={cat.categoryId} name={cat.categoryName} target={cat.targetAmount} actual={cat.actualAmount} rate={cat.completionRate} gap={cat.gap} isChild>
              {cat.products.map((p) => (
                <DrillDownLevel key={p.productId} name={p.productName} target={p.targetAmount} actual={p.actualAmount} rate={p.completionRate} gap={p.gap} isLeaf />
              ))}
            </DrillDownLevel>
          ))}
        </DrillDownLevel>
      ))}
    </div>
  );
};

interface DrillDownLevelProps {
  name: string;
  target: number;
  actual: number;
  rate: number;
  gap: number;
  isChild?: boolean;
  isLeaf?: boolean;
  children?: React.ReactNode;
}

const DrillDownLevel: React.FC<DrillDownLevelProps> = ({ name, target, actual, rate, gap, isChild, isLeaf, children }) => {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = !isLeaf && children;

  return (
    <div className={`${styles.drillItem} ${isChild ? styles.drillChild : ''}`}>
      <div
        className={styles.drillRow}
        onClick={() => hasChildren && setExpanded(!expanded)}
        style={{ cursor: hasChildren ? 'pointer' : 'default' }}
      >
        <span className={styles.drillName}>
          {hasChildren && <span className={styles.expandIcon}>{expanded ? '▼' : '▶'}</span>}
          {name}
        </span>
        <span className={styles.drillTarget}>{formatCompactAmount(target)}</span>
        <span className={styles.drillActual}>{formatCompactAmount(actual)}</span>
        <span className={styles.drillRate} style={{
          color: rate < 60 ? '#cf1322' : rate < 80 ? '#fa8c16' : '#389e0d'
        }}>
          {rate.toFixed(1)}%
        </span>
        <span className={styles.drillGap}>
          {gap >= 0 ? `-${formatCompactAmount(gap)}` : `+${formatCompactAmount(Math.abs(gap))}`}
        </span>
      </div>
      {expanded && children && <div className={styles.drillChildren}>{children}</div>}
    </div>
  );
};

export default TargetTrackingSection;
