/**
 * 畅销/滞销产品排行榜
 */

import React from 'react';
import { Card, Progress } from 'antd';
import type { RankedProduct } from '@/types/sales-analysis';
import styles from './ProductRanking.less';

interface ProductRankingProps {
  data: RankedProduct[];
}

const ProductRanking: React.FC<ProductRankingProps> = ({ data }) => {
  return (
    <Card className={styles.card} size="small" title={null}>
      <div className={styles.cardTitleRow}>
        <div>
          <h3 className={styles.cardTitle}>畅销 / 滞销产品排行榜</h3>
          <p className={styles.cardSubtitle}>适合首页快速呈现重点推广产品和滞销产品。</p>
        </div>
      </div>
      <ul className={styles.topList}>
        {data.map((product) => (
          <li key={product.name}>
            <div>
              <div className={styles.listName}>{product.name}</div>
              <div className={styles.listMeta}>
                销量 {product.sales.toLocaleString()} / 销售额 ¥{product.salesAmount.toLocaleString()}
              </div>
            </div>
            <Progress
              percent={product.percentage}
              showInfo={false}
              size="small"
              strokeColor={product.isWorst ? '#ff4d4f' : undefined}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
};

export default ProductRanking;
