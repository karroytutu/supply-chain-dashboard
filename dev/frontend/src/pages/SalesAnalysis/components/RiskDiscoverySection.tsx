/**
 * 问题发现板块
 * 4 个风险分类全部同时展示，2x2 网格布局
 */
import React from 'react';
import { Tag } from 'antd';
import { WarningOutlined, AlertOutlined, InfoCircleOutlined, DollarOutlined } from '@ant-design/icons';
import { RISK_CATEGORIES } from '@/constants/salesAnalysis';
import type { RiskCategory, RiskItem } from '@/types/sales-analysis';
import styles from './RiskDiscoverySection.less';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  customer: <WarningOutlined className={styles.iconWarn} />,
  collection: <AlertOutlined className={styles.iconAlert} />,
  product: <InfoCircleOutlined className={styles.iconInfo} />,
  expense: <DollarOutlined className={styles.iconExpense} />,
};

const CATEGORY_COLORS: Record<string, string> = {
  customer: '#ff4d4f',
  collection: '#faad14',
  product: '#1677ff',
  expense: '#722ed1',
};

const RiskDiscoverySection: React.FC = () => {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>问题发现</h2>
      <div className={styles.categoryGrid}>
        {RISK_CATEGORIES.map((cat) => (
          <CategoryCard key={cat.key} category={cat} />
        ))}
      </div>
    </section>
  );
};

interface CategoryCardProps {
  category: RiskCategory;
}

const CategoryCard: React.FC<CategoryCardProps> = ({ category }) => {
  const totalCount = category.items.reduce((sum, item) => sum + item.count, 0);
  const color = CATEGORY_COLORS[category.key] || '#666';

  return (
    <div className={styles.categoryCard}>
      <div className={styles.categoryHeader}>
        <div className={styles.categoryTitle}>
          <span className={styles.categoryIcon}>{CATEGORY_ICONS[category.key]}</span>
          <span>{category.label}</span>
        </div>
        <Tag
          style={{ backgroundColor: color, color: '#fff', border: 'none' }}
          className={styles.totalTag}
        >
          {totalCount}
        </Tag>
      </div>
      <div className={styles.itemList}>
        {category.items.map((item) => (
          <RiskItemRow key={item.key} item={item} accentColor={color} />
        ))}
      </div>
    </div>
  );
};

interface RiskItemRowProps {
  item: RiskItem;
  accentColor: string;
}

const RiskItemRow: React.FC<RiskItemRowProps> = ({ item, accentColor }) => {
  return (
    <div className={styles.itemRow}>
      <div className={styles.itemMain}>
        <span className={styles.itemLabel}>{item.label}</span>
        <span className={styles.itemCount} style={{ color: accentColor }}>
          {item.count}
          <span className={styles.itemUnit}>{item.unit}</span>
        </span>
      </div>
      <div className={styles.itemMeta}>
        {item.meta.map((m) => (
          <div key={m.label} className={styles.metaRow}>
            <span className={styles.metaLabel}>{m.label}</span>
            <span className={styles.metaValue}>{m.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RiskDiscoverySection;
