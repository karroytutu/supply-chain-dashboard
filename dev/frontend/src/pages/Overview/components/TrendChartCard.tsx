/**
 * 趋势图表组件
 */

import React from 'react';
import { Card } from 'antd';
import { Line } from '@ant-design/charts';
import { LineChartOutlined } from '@ant-design/icons';
import type { TrendData } from '@/types/overview';
import styles from './TrendChartCard.less';

interface TrendChartCardProps {
  trendData: TrendData | null;
}

const TrendChartCard: React.FC<TrendChartCardProps> = ({ trendData }) => {
  const config = {
    data: (trendData?.data || []).map((item) => ({
      date: item.date.slice(5),
      value: item.availabilityRate,
    })),
    xField: 'date',
    yField: 'value',
    smooth: true,
    point: { size: 4, shape: 'circle' },
    tooltip: {
      formatter: (datum: { value: number }) => ({
        name: '齐全率',
        value: `${datum.value}%`,
      }),
    },
    yAxis: {
      label: {
        formatter: (text: string) => `${text}%`,
      },
    },
    color: '#1890ff',
    height: 250,
  };

  return (
    <Card
      className={styles.chartCard}
      title={
        <span>
          <LineChartOutlined style={{ marginRight: 8 }} />
          近7日齐全率趋势
        </span>
      }
    >
      {trendData?.data && trendData.data.length > 0 ? (
        <Line {...config} />
      ) : (
        <div className={styles.noData}>暂无数据</div>
      )}
    </Card>
  );
};

export default TrendChartCard;
