/**
 * 催收进度环形图组件
 * 展示8个催收工作流节点的分布
 * 优化PC端和移动端响应式布局
 */
import React, { useState, useEffect } from 'react';
import { Card, Spin } from 'antd';
import { Pie } from '@ant-design/charts';
import { getArList } from '@/services/api/accounts-receivable';
import type { ArReceivable, ArStatus } from '@/types/accounts-receivable';
import styles from '../index.less';

// 催收状态配置
const collectionStatusConfig: { status: ArStatus; label: string; color: string }[] = [
  { status: 'collecting', label: '营销师催收中', color: '#1890ff' },
  { status: 'pre_warning_2', label: '客户确认延期-待财务审核', color: '#faad14' },
  { status: 'pre_warning_5', label: '客户确认延期-审核通过', color: '#52c41a' },
  { status: 'escalated', label: '营销担保延期-等待回款', color: '#13c2c2' },
  { status: 'resolved', label: '已回款/核销-待出纳核实', color: '#722ed1' },
  { status: 'overdue', label: '营销主管催收中', color: '#eb2f96' },
  { status: 'written_off', label: '财务催收/发函/起诉中', color: '#f5222d' },
  { status: 'synced', label: '已解决', color: '#8c8c8c' },
];

interface ChartData {
  type: string;
  value: number;
  color: string;
}

const CollectionProgress: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ChartData[]>([]);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // 获取所有记录用于统计状态分布
      const result = await getArList({ page: 1, pageSize: 1000 });
      const records = result.list;

      // 统计各状态数量
      const statusCount: Record<string, number> = {};
      records.forEach((item: ArReceivable) => {
        statusCount[item.ar_status] = (statusCount[item.ar_status] || 0) + 1;
      });

      // 构建图表数据
      const chartData = collectionStatusConfig
        .map((config) => ({
          type: config.label,
          value: statusCount[config.status] || 0,
          color: config.color,
        }))
        .filter((item) => item.value > 0);

      setData(chartData);
    } finally {
      setLoading(false);
    }
  };

  const totalCount = data.reduce((sum, item) => sum + item.value, 0);

  const config = {
    data,
    angleField: 'value',
    colorField: 'type',
    color: ({ type }: { type: string }) => {
      const item = data.find((d) => d.type === type);
      return item?.color || '#1890ff';
    },
    radius: isMobile ? 0.85 : 0.8,
    innerRadius: isMobile ? 0.65 : 0.6,
    label: {
      type: 'inner' as const,
      offset: '-50%',
      content: '{value}',
      style: {
        textAlign: 'center' as const,
        fontSize: isMobile ? 10 : 12,
        fill: '#fff',
      },
    },
    statistic: {
      title: {
        style: {
          fontSize: isMobile ? 12 : 14,
          fill: '#8c8c8c',
        },
        formatter: () => '总计',
      },
      content: {
        style: {
          fontSize: isMobile ? 18 : 24,
          fontWeight: 600,
          fill: '#262626',
        },
        formatter: () => totalCount.toString(),
      },
    },
    legend: {
      // 移动端时 legend 位置改为 bottom
      position: isMobile ? 'bottom' : 'right',
      itemSpacing: isMobile ? 8 : 12,
      layout: isMobile ? 'horizontal' : 'vertical',
      itemName: {
        style: {
          fontSize: isMobile ? 10 : 12,
        },
        formatter: (text: string) => {
          // 移动端缩短文本
          if (isMobile && text.length > 6) {
            return text.substring(0, 6) + '...';
          }
          return text;
        },
      },
    },
    interactions: [{ type: 'element-active' }],
  };

  // 空状态
  const renderEmpty = () => (
    <div className={styles.chartEmpty}>
      <div className={styles.emptyIcon}>📈</div>
      <div className={styles.emptyText}>暂无催收数据</div>
    </div>
  );

  return (
    <Card title="催收进度" className={styles.chartCard} bordered={false}>
      <div className={styles.chartContainer}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Spin size="small" />
          </div>
        ) : data.length > 0 ? (
          <Pie {...config} />
        ) : (
          renderEmpty()
        )}
      </div>
    </Card>
  );
};

export default CollectionProgress;
