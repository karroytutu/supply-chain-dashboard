/**
 * 通用四象限视图组件
 * 通过 props 接收维度配置，客户分析和商品分析复用
 */
import React from 'react';
import { Tag } from 'antd';
import type { QuadrantConfig, QuadrantStat } from '@/types/sales-analysis';
import styles from './QuadrantView.less';

interface QuadrantViewProps {
  /** 四象限配置 */
  configs: QuadrantConfig[];
  /** 四象限统计数据 */
  stats: QuadrantStat[];
  /** 点击象限回调 */
  onQuadrantClick?: (key: string) => void;
  /** 紧凑模式（移动端） */
  compact?: boolean;
}

const QuadrantView: React.FC<QuadrantViewProps> = ({ configs, stats, onQuadrantClick, compact }) => {
  const getStat = (key: string) => stats.find((s) => s.key === key);

  return (
    <div className={`${styles.quadrantGrid} ${compact ? styles.compact : ''}`}>
      {configs.map((cfg) => {
        const stat = getStat(cfg.key);
        return (
          <div
            key={cfg.key}
            className={`${styles.quadrantCard} ${styles[cfg.key]}`}
            onClick={() => onQuadrantClick?.(cfg.key)}
            role="button"
            tabIndex={0}
          >
            <div className={styles.cardTop}>
              <span className={styles.cardLabel}>{cfg.label}</span>
              <Tag color={cfg.tagColor}>{cfg.tagText}</Tag>
            </div>
            <div className={styles.cardCount}>{stat?.count ?? 0}</div>
            <div className={styles.cardFooter}>
              <span>占比 {stat?.percentage ?? '-'}</span>
              <span>销售 {stat?.salesPercentage ?? '-'}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default QuadrantView;
