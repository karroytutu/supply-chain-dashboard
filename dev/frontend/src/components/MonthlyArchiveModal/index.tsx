import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Table, Spin, Empty } from 'antd';
import type { TablePaginationConfig } from 'antd/es/table';
import { RiseOutlined, FallOutlined } from '@ant-design/icons';
import { getProcurementArchive, type MonthlyArchiveRecord } from '@/services/api/dashboard';
import styles from './index.less';

interface MonthlyArchiveModalProps {
  open: boolean;
  onClose: () => void;
}

const MonthlyArchiveModal: React.FC<MonthlyArchiveModalProps> = ({
  open,
  onClose,
}) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MonthlyArchiveRecord[]>([]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 12,
    total: 0,
  });

  const loadData = useCallback(async (page = 1, pageSize = 12) => {
    setLoading(true);
    try {
      const result = await getProcurementArchive({ page, pageSize });
      if (result.success) {
        setData(result.data);
        setPagination(prev => ({
          ...prev,
          current: result.page,
          pageSize: result.pageSize,
          total: result.total,
        }));
      }
    } catch (error) {
      console.error('[MonthlyArchiveModal] 加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadData(1, pagination.pageSize);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 格式化月份显示
  const formatMonth = (monthStr: string) => {
    const date = new Date(monthStr);
    return `${date.getFullYear()}年${date.getMonth() + 1}月`;
  };

  // 格式化齐全率显示
  const formatAvailabilityRate = (rate: number | null) => {
    if (rate === null) return '-';
    const colorClass = rate < 70 ? styles.rateDanger : rate < 80 ? styles.rateWarning : styles.rateGood;
    return <span className={colorClass}>{rate}%</span>;
  };

  // 格式化周转天数环比显示
  const formatTurnoverTrend = (trend: number | null) => {
    if (trend === null) return '-';
    const isDown = trend < 0;
    const colorClass = isDown ? styles.trendDown : styles.trendUp;
    const Icon = isDown ? FallOutlined : RiseOutlined;
    return (
      <span className={colorClass}>
        <Icon /> {Math.abs(trend)}%
      </span>
    );
  };

  // 表格列定义
  const columns = [
    {
      title: '月份',
      dataIndex: 'archiveMonth',
      key: 'archiveMonth',
      width: 120,
      render: formatMonth,
    },
    {
      title: '战略商品齐全率',
      dataIndex: 'strategicAvailabilityRate',
      key: 'strategicAvailabilityRate',
      width: 140,
      render: formatAvailabilityRate,
    },
    {
      title: '战略商品数',
      dataIndex: 'strategicTotalSku',
      key: 'strategicTotalSku',
      width: 100,
      render: (val: number | null) => val !== null ? `${val}个` : '-',
    },
    {
      title: '库存周转天数',
      dataIndex: 'turnoverDays',
      key: 'turnoverDays',
      width: 120,
      render: (val: number | null) => val !== null ? `${val}天` : '-',
    },
    {
      title: '环比变化',
      dataIndex: 'turnoverTrend',
      key: 'turnoverTrend',
      width: 100,
      render: formatTurnoverTrend,
    },
    {
      title: '存档时间',
      dataIndex: 'archivedAt',
      key: 'archivedAt',
      width: 160,
      render: (val: string) => {
        if (!val) return '-';
        const date = new Date(val);
        return date.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
      },
    },
  ];

  const handleTableChange = (pag: TablePaginationConfig) => {
    loadData(pag.current, pag.pageSize);
  };

  return (
    <Modal
      title="采购绩效月度存档"
      open={open}
      onCancel={onClose}
      footer={null}
      width={800}
      destroyOnClose
    >
      <div className={styles.description}>
        以下为战略商品齐全率和库存周转天数的月度存档数据，用于绩效考核。
      </div>

      <Spin spinning={loading}>
        {data.length === 0 && !loading ? (
          <Empty description="暂无存档数据" />
        ) : (
          <Table
            columns={columns}
            dataSource={data}
            rowKey="id"
            size="small"
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: pagination.total,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => `共 ${total} 条记录`,
            }}
            onChange={handleTableChange}
          />
        )}
      </Spin>

      <div className={styles.footer}>
        <div className={styles.note}>
          * 齐全率显示为月度平均值；环比下降表示周转效率提升（好事）
        </div>
      </div>
    </Modal>
  );
};

export default MonthlyArchiveModal;
