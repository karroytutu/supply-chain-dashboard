import React, { useState, useEffect } from 'react';
import { Table, Input, Empty } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  AlertOutlined,
  InboxOutlined,
  ClockCircleOutlined,
  SearchOutlined,
  PauseCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { Product } from '@/types/category';
import { getWarningProducts } from '@/services/api/dashboard';
import styles from './index.less';

// 预警项配置
const WARNING_CONFIG = {
  // 库存预警
  outOfStock: { label: '缺货', color: '#ff4d4f' },
  lowStock: { label: '低库存', color: '#fa8c16' },
  // 库存积压预警
  mildOverstock: { label: '轻度积压', color: '#faad14' },
  moderateOverstock: { label: '中度积压', color: '#fa8c16' },
  seriousOverstock: { label: '严重积压', color: '#ff4d4f' },
  // 临期预警
  expiring7Days: { label: '7天内临期', color: '#ff4d4f' },
  expiring15Days: { label: '15天内临期', color: '#fa8c16' },
  expiring30Days: { label: '30天内临期', color: '#faad14' },
  // 滞销预警
  mildSlowMoving: { label: '轻度滞销', color: '#faad14' },
  moderateSlowMoving: { label: '中度滞销', color: '#fa8c16' },
  seriousSlowMoving: { label: '严重滞销', color: '#ff4d4f' },
};

// 分组配置
const GROUP_CONFIG = {
  stock: { title: '库存预警', icon: <AlertOutlined />, color: '#ff4d4f' },
  overstock: { title: '库存积压预警', icon: <InboxOutlined />, color: '#fa8c16' },
  expiring: { title: '临期预警', icon: <ClockCircleOutlined />, color: '#faad14' },
  slowMoving: { title: '滞销预警', icon: <StopOutlined />, color: '#722ed1' },
};

interface WarningPanelProps {
  stockWarnings: { outOfStock: number; lowStock: number };
  turnoverWarnings: { mildOverstock: number; moderateOverstock: number; seriousOverstock: number };
  expiringWarnings: { within7Days: number; within15Days: number; within30Days: number };
  slowMovingWarnings: { mildSlowMoving: number; moderateSlowMoving: number; seriousSlowMoving: number };
}

const WarningPanel: React.FC<WarningPanelProps> = ({
  stockWarnings,
  turnoverWarnings,
  expiringWarnings,
  slowMovingWarnings,
}) => {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  // 前端预警类型到后端API类型的映射
  const warningTypeMap: Record<string, string> = {
    // 库存预警
    outOfStock: 'out_of_stock',
    lowStock: 'low_stock',
    // 库存积压预警
    mildOverstock: 'mild_overstock',
    moderateOverstock: 'moderate_overstock',
    seriousOverstock: 'serious_overstock',
    // 临期预警
    expiring7Days: 'expiring_7',
    expiring15Days: 'expiring_15',
    expiring30Days: 'expiring_30',
    // 滞销预警
    mildSlowMoving: 'mild_slow_moving',
    moderateSlowMoving: 'moderate_slow_moving',
    seriousSlowMoving: 'serious_slow_moving',
  };

  // 构建预警分组数据
  const warningGroups = [
    {
      key: 'stock',
      items: [
        { key: 'outOfStock', count: stockWarnings.outOfStock },
        { key: 'lowStock', count: stockWarnings.lowStock },
      ].filter(item => item.count > 0),
    },
    {
      key: 'overstock',
      items: [
        { key: 'mildOverstock', count: turnoverWarnings.mildOverstock },
        { key: 'moderateOverstock', count: turnoverWarnings.moderateOverstock },
        { key: 'seriousOverstock', count: turnoverWarnings.seriousOverstock },
      ].filter(item => item.count > 0),
    },
    {
      key: 'expiring',
      items: [
        { key: 'expiring7Days', count: expiringWarnings.within7Days },
        { key: 'expiring15Days', count: expiringWarnings.within15Days },
        { key: 'expiring30Days', count: expiringWarnings.within30Days },
      ].filter(item => item.count > 0),
    },
    {
      key: 'slowMoving',
      items: [
        { key: 'mildSlowMoving', count: slowMovingWarnings.mildSlowMoving },
        { key: 'moderateSlowMoving', count: slowMovingWarnings.moderateSlowMoving },
        { key: 'seriousSlowMoving', count: slowMovingWarnings.seriousSlowMoving },
      ].filter(item => item.count > 0),
    },
  ];

  // 计算总预警数
  const totalWarnings = warningGroups.reduce(
    (sum, group) => sum + group.items.reduce((s, item) => s + item.count, 0),
    0
  );

  // 默认选中第一个有数据的预警项
  useEffect(() => {
    if (!selectedKey && totalWarnings > 0) {
      for (const group of warningGroups) {
        if (group.items.length > 0) {
          setSelectedKey(group.items[0].key);
          break;
        }
      }
    }
  }, [totalWarnings]);

  // 根据选中项加载商品数据
  useEffect(() => {
    if (!selectedKey) {
      setProducts([]);
      setFilteredProducts([]);
      return;
    }

    const loadProducts = async () => {
      setLoading(true);
      try {
        const apiType = warningTypeMap[selectedKey];
        const result = await getWarningProducts(apiType);
        // result 是分页结果，需要访问 result.data 获取数组
        const productList = Array.isArray(result.data) ? result.data : (Array.isArray(result) ? result : []);
        setProducts(productList);
        setFilteredProducts(productList);
        setSearchText('');
      } catch (error) {
        console.error('加载预警商品数据失败:', error);
        setProducts([]);
        setFilteredProducts([]);
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, [selectedKey]);

  // 搜索过滤
  useEffect(() => {
    if (!searchText) {
      setFilteredProducts(products);
      return;
    }
    const filtered = products.filter(
      p =>
        p.productCode.toLowerCase().includes(searchText.toLowerCase()) ||
        p.productName.toLowerCase().includes(searchText.toLowerCase())
    );
    setFilteredProducts(filtered);
  }, [searchText, products]);

  // 列配置
  const getColumns = (): ColumnsType<Product> => {
    const stockColumns: ColumnsType<Product> = [
      { title: '商品名称', dataIndex: 'productName', key: 'productName', width: 200, ellipsis: true },
      { title: '规格', dataIndex: 'specification', key: 'specification', width: 100, align: 'center' },
      {
        title: '库存数量', dataIndex: ['stock', 'quantity'], key: 'stockQuantity', width: 100, align: 'right',
        render: (val: number) => (
          <span style={{ color: val === 0 ? '#ff4d4f' : val < 100 ? '#fa8c16' : undefined, fontWeight: 500 }}>
            {val.toLocaleString()}
          </span>
        ),
      },
      {
        title: '可售天数', key: 'sellableDays', width: 100, align: 'right',
        render: (_: unknown, record: Product) => {
          const days = record.turnover.days;
          const color = record.availability.status === 'out_of_stock' ? '#ff4d4f'
            : days <= 7 ? '#fa8c16'
            : days <= 15 ? '#fadb14'
            : '#52c41a';
          return (
            <span style={{ color, fontWeight: 500 }}>
              {record.availability.status === 'out_of_stock' ? '缺货' : `${days}天`}
            </span>
          );
        },
      },
    ];

    const turnoverColumns: ColumnsType<Product> = [
      { title: '商品名称', dataIndex: 'productName', key: 'productName', width: 200, ellipsis: true },
      { title: '规格', dataIndex: 'specification', key: 'specification', width: 100, align: 'center' },
      {
        title: '库存数量', dataIndex: ['stock', 'quantity'], key: 'stockQuantity', width: 100, align: 'right',
        render: (val: number) => <span style={{ fontWeight: 500 }}>{val.toLocaleString()}</span>,
      },
      {
        title: '周转天数', key: 'turnoverDays', width: 100, align: 'right',
        render: (_: unknown, record: Product) => {
          const days = record.turnover.days;
          const color = days > 90 ? '#ff4d4f' : days > 60 ? '#fa541c' : days > 30 ? '#faad14' : days > 15 ? '#1890ff' : '#52c41a';
          return <span style={{ color, fontWeight: 500 }}>{days}天</span>;
        },
      },
    ];

    const expiringColumns: ColumnsType<Product> = [
      { title: '商品名称', dataIndex: 'productName', key: 'productName', width: 200, ellipsis: true },
      { title: '规格', dataIndex: 'specification', key: 'specification', width: 100, align: 'center' },
      {
        title: '库存数量', dataIndex: ['stock', 'quantity'], key: 'stockQuantity', width: 100, align: 'right',
        render: (val: number) => <span style={{ fontWeight: 500 }}>{val.toLocaleString()}</span>,
      },
      {
        title: '距到期天数', key: 'daysToExpiry', width: 100, align: 'right',
        render: (_: unknown, record: Product) => {
          const days = record.expiring.daysToExpiry;
          const color = days <= 7 ? '#ff4d4f' : days <= 15 ? '#fa8c16' : days <= 30 ? '#faad14' : '#52c41a';
          return <span style={{ color, fontWeight: 500 }}>{days}天</span>;
        },
      },
    ];

    const slowMovingColumns: ColumnsType<Product> = [
      { title: '商品名称', dataIndex: 'productName', key: 'productName', width: 200, ellipsis: true },
      { title: '规格', dataIndex: 'specification', key: 'specification', width: 100, align: 'center' },
      {
        title: '库存数量', dataIndex: ['stock', 'quantity'], key: 'stockQuantity', width: 100, align: 'right',
        render: (val: number) => <span style={{ fontWeight: 500 }}>{val.toLocaleString()}</span>,
      },
      {
        title: '未销售天数', key: 'daysWithoutSale', width: 100, align: 'right',
        render: (_: unknown, record: Product) => {
          const days = record.slowMoving?.daysWithoutSale ?? 0;
          const color = days > 30 ? '#ff4d4f' : days > 15 ? '#fa8c16' : '#faad14';
          return <span style={{ color, fontWeight: 500 }}>{days}天</span>;
        },
      },
    ];

    if (['outOfStock', 'lowStock'].includes(selectedKey || '')) return stockColumns;
    if (['mildOverstock', 'moderateOverstock', 'seriousOverstock'].includes(selectedKey || '')) return turnoverColumns;
    if (['mildSlowMoving', 'moderateSlowMoving', 'seriousSlowMoving'].includes(selectedKey || '')) return slowMovingColumns;
    if (['expiring7Days', 'expiring15Days', 'expiring30Days'].includes(selectedKey || '')) return expiringColumns;
    return [];
  };

  const getSelectedConfig = () => selectedKey ? WARNING_CONFIG[selectedKey as keyof typeof WARNING_CONFIG] : null;

  if (totalWarnings === 0) {
    return (
      <div className={styles.warningPanel}>
        <div className={styles.emptyState}>
          <PauseCircleOutlined style={{ fontSize: 32, color: '#52c41a' }} />
          <span className={styles.emptyText}>暂无预警</span>
        </div>
      </div>
    );
  }

  const selectedConfig = getSelectedConfig();

  return (
    <div className={styles.warningPanel}>
      {/* 头部 */}
      <div className={styles.panelHeader}>
        <AlertOutlined className={styles.alertIcon} />
        <span className={styles.panelTitle}>预警监控</span>
        <span className={styles.totalCount}>共 {totalWarnings} 项</span>
      </div>

      {/* 左右分栏主体 */}
      <div className={styles.panelBody}>
        {/* 左侧预警分类 */}
        <div className={styles.sidebar}>
          {warningGroups.map(group => {
            const groupConfig = GROUP_CONFIG[group.key as keyof typeof GROUP_CONFIG];
            if (group.items.length === 0) return null;
            const groupTotal = group.items.reduce((s, item) => s + item.count, 0);
            return (
              <div key={group.key} className={styles.warningGroup}>
                <div className={styles.groupHeader}>
                  <span className={styles.groupIcon} style={{ color: groupConfig.color }}>
                    {groupConfig.icon}
                  </span>
                  <span className={styles.groupTitle}>{groupConfig.title}</span>
                  <span className={styles.groupCount}>{groupTotal}件</span>
                </div>
                <div className={styles.groupItems}>
                  {group.items.map(item => {
                    const config = WARNING_CONFIG[item.key as keyof typeof WARNING_CONFIG];
                    const isSelected = selectedKey === item.key;
                    return (
                      <div
                        key={item.key}
                        className={`${styles.warningItem} ${isSelected ? styles.selected : ''}`}
                        onClick={() => setSelectedKey(item.key)}
                      >
                        <span className={styles.itemDot} style={{ backgroundColor: config.color }} />
                        <span className={styles.itemLabel}>{config.label}</span>
                        <span className={styles.itemCount}>{item.count}件</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* 右侧商品明细 */}
        <div className={styles.content}>
          {selectedKey && selectedConfig && (
            <>
              <div className={styles.tableHeader}>
                <div className={styles.tableTitle}>
                  <span className={styles.titleBar} style={{ backgroundColor: selectedConfig.color }} />
                  {selectedConfig.label}商品明细
                  <span className={styles.productCount}>{filteredProducts.length}件</span>
                </div>
                <Input
                  placeholder="搜索商品名称"
                  prefix={<SearchOutlined />}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  allowClear
                  style={{ width: 200 }}
                  size="small"
                />
              </div>
              <Table
                columns={getColumns()}
                dataSource={filteredProducts}
                rowKey="productId"
                loading={loading}
                pagination={{
                  defaultPageSize: 20,
                  showSizeChanger: true,
                  pageSizeOptions: ['20', '50', '100'],
                  showTotal: (total) => `共 ${total} 条`,
                  size: 'small',
                }}
                scroll={{ x: 500 }}
                size="small"
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无商品数据" /> }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default WarningPanel;
