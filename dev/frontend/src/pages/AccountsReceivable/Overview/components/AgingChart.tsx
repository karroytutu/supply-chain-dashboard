/**
 * 账龄分析柱状图组件
 * 展示4个账龄区间的金额分布
 * 优化PC端和移动端响应式布局
 */
import React, { useState, useEffect } from 'react';
import { Card } from 'antd';
import { Column } from '@ant-design/charts';
import type { AgingAnalysis } from '@/types/accounts-receivable';
import styles from '../index.less';

interface Props {
  data: AgingAnalysis[];
}

// 账龄区间颜色映射
const rangeColorMap: Record<string, string> = {
  '30天内': '#52c41a',
  '30-60天': '#faad14',
  '60-90天': '#fa8c16',
  '90天以上': '#cf1322',
};

const AgingChart: React.FC<Props> = ({ data }) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const config = {
    data,
    xField: 'range',
    yField: 'amount',
    color: ({ range }: { range: string }) => rangeColorMap[range] || '#1890ff',
    columnWidthRatio: isMobile ? 0.5 : 0.6,
    label: {
      position: 'top' as const,
      formatter: (datum: AgingAnalysis) => {
        if (isMobile) {
          return `${(datum.amount / 10000).toFixed(0)}万`;
        }
        return `¥${(datum.amount / 10000).toFixed(1)}万`;
      },
      style: {
        fill: '#595959',
        fontSize: isMobile ? 10 : 12,
      },
    },
    xAxis: {
      label: {
        style: {
          fill: '#595959',
          fontSize: isMobile ? 10 : 12,
        },
        autoRotate: isMobile,
        rotate: isMobile ? 15 : 0,
      },
    },
    yAxis: {
      label: {
        // 移动端隐藏 y 轴 label 节省空间
        formatter: isMobile ? () => '' : (v: number) => `¥${(v / 10000).toFixed(0)}万`,
        style: {
          fill: '#8c8c8c',
          fontSize: 11,
        },
      },
      grid: {
        line: {
          style: {
            stroke: '#f0f0f0',
          },
        },
      },
    },
    tooltip: {
      formatter: (datum: AgingAnalysis) => {
        return {
          name: '金额',
          value: `¥${datum.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`,
        };
      },
    },
    interactions: [{ type: 'element-active' }],
  };

  // 空状态展示
  if (!data || data.length === 0) {
    return (
      <Card title="账龄分析" className={styles.chartCard} bordered={false}>
        <div className={styles.chartEmpty}>
          <div className={styles.emptyIcon}>📊</div>
          <div className={styles.emptyText}>暂无账龄数据</div>
        </div>
      </Card>
    );
  }

  return (
    <Card title="账龄分析" className={styles.chartCard} bordered={false}>
      <div className={styles.chartContainer}>
        <Column {...config} />
      </div>
    </Card>
  );
};

export default AgingChart;
