import React from 'react';
import { Modal, Table } from 'antd';
import { Line } from '@ant-design/charts';
import type { StrategicMonthlyAvailabilityData, DailyAvailabilityRate } from '@/types/dashboard';
import styles from './index.less';

interface MonthlyAvailabilityModalProps {
  open: boolean;
  onClose: () => void;
  data: StrategicMonthlyAvailabilityData | null | undefined;
}

const MonthlyAvailabilityModal: React.FC<MonthlyAvailabilityModalProps> = ({
  open,
  onClose,
  data,
}) => {
  if (!data) {
    return null;
  }

  // 图表配置
  const chartConfig = {
    data: data.dailyRates || [],
    xField: 'date',
    yField: 'rate',
    smooth: true,
    point: {
      size: 3,
      shape: 'circle',
    },
    yAxis: {
      min: 0,
      max: 100,
      label: {
        formatter: (v: string) => `${v}%`,
      },
    },
    xAxis: {
      label: {
        formatter: (v: string) => v.slice(5), // 只显示 MM-DD
      },
    },
    tooltip: {
      title: 'date',
      formatter: (datum: DailyAvailabilityRate) => ({
        name: '齐全率',
        value: `${datum.rate}%`,
      }),
    },
    color: '#1890ff',
    lineStyle: {
      lineWidth: 2,
    },
    areaStyle: {
      fill: 'l(90) 0:#1890ff40 1:#1890ff00',
    },
  };

  // 表格列定义
  const columns = [
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 120,
      render: (date: string) => date,
    },
    {
      title: '齐全率',
      dataIndex: 'rate',
      key: 'rate',
      width: 100,
      render: (rate: number) => {
        let colorClass = styles.rateGood;
        if (rate < 70) {
          colorClass = styles.rateDanger;
        } else if (rate < 80) {
          colorClass = styles.rateWarning;
        }
        return <span className={colorClass}>{rate}%</span>;
      },
    },
    {
      title: '有库存商品数',
      dataIndex: 'inStockCount',
      key: 'inStockCount',
      width: 120,
      render: (count: number, _record: DailyAvailabilityRate) => {
        const outOfStock = data.totalStrategicSku - count;
        return (
          <span>
            {count}
            {outOfStock > 0 && (
              <span className={styles.outOfStock}>（缺{outOfStock}）</span>
            )}
          </span>
        );
      },
    },
  ];

  return (
    <Modal
      title="战略商品月度齐全率明细"
      open={open}
      onCancel={onClose}
      footer={null}
      width={640}
      destroyOnClose
    >
      {/* 汇总信息 */}
      <div className={styles.summaryRow}>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>月度平均齐全率</div>
          <div className={styles.summaryValue}>
            {data.value}
            <span className={styles.unit}>%</span>
          </div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>战略商品总数</div>
          <div className={styles.summaryValue}>
            {data.totalStrategicSku}
            <span className={styles.unit}>个</span>
          </div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>统计天数</div>
          <div className={styles.summaryValue}>
            {data.daysInMonth}
            <span className={styles.unit}>天</span>
          </div>
        </div>
      </div>

      {/* 趋势图 */}
      <div className={styles.chartSection}>
        <div className={styles.chartTitle}>每日齐全率趋势</div>
        <div className={styles.chartContainer}>
          <Line {...chartConfig} />
        </div>
      </div>

      {/* 明细表格 */}
      <div className={styles.tableSection}>
        <div className={styles.tableTitle}>每日明细数据</div>
        <Table
          columns={columns}
          dataSource={data.dailyRates?.slice().reverse() || []}
          rowKey="date"
          size="small"
          pagination={false}
          scroll={{ y: 200 }}
        />
      </div>
    </Modal>
  );
};

export default MonthlyAvailabilityModal;
