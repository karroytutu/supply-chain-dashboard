/**
 * 核心客户价值
 * Top 客户列表 + 片区占比
 */

import React from 'react';
import { Card, Progress } from 'antd';
import type { TopCustomerData, DistrictShareItem } from '@/types/sales-analysis';
import styles from './CoreCustomerValue.less';

interface CoreCustomerValueProps {
  topCustomers: TopCustomerData[];
  districtShare: DistrictShareItem[];
}

/** 格式化金额 */
const formatAmount = (value: number): string => `¥${value.toLocaleString()}`;

const CoreCustomerValue: React.FC<CoreCustomerValueProps> = ({ topCustomers, districtShare }) => {
  return (
    <Card className={styles.card} size="small" title={null}>
      <div className={styles.cardTitleRow}>
        <div>
          <h3 className={styles.cardTitle}>核心客户价值</h3>
          <p className={styles.cardSubtitle}>
            识别最值得重点保的客户，以及价值是否集中在少数客户和片区。
          </p>
          <p className={styles.cardInsight}>
            我的 Top 3 客户贡献占我客户销售额 54%，其中华东旗舰店既是高价值客户，也是当前最需要稳住的风险点。
          </p>
        </div>
      </div>
      <ul className={styles.topList}>
        {topCustomers.map((customer) => (
          <li key={customer.name}>
            <div>
              <div className={styles.listName}>{customer.name}</div>
              <div className={styles.listMeta}>
                销售额 {formatAmount(customer.sales)} / 毛利 {formatAmount(customer.profit)}
              </div>
            </div>
            <Progress percent={customer.percentage} showInfo={false} size="small" />
          </li>
        ))}
      </ul>
      <div className={styles.valueSummary}>
        <div className={styles.valueHighlight}>
          <div className={styles.valueHighlightLabel}>核心客户贡献度</div>
          <strong>Top 3 贡献 68%</strong>
          <p className={styles.note}>价值集中在少数重点客户，建议持续关注回款与续单稳定性。</p>
        </div>
        <div className={styles.districtList}>
          {districtShare.map((item) => (
            <div key={item.name} className={styles.districtRow}>
              <span>{item.name}</span>
              <div className={styles.shareBar}>
                <span style={{ width: `${item.percentage}%` }} />
              </div>
              <strong>{item.percentage}%</strong>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};

export default CoreCustomerValue;
