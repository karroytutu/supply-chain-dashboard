import React, { useState, useEffect } from 'react';
import { Table, Empty, Tree, Tag, Select, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { TreeProps } from 'antd';
import {
  AlertOutlined,
  InboxOutlined,
  ClockCircleOutlined,
  PauseCircleOutlined,
  StopOutlined,
  StarFilled,
} from '@ant-design/icons';
import type { WarningProduct, StrategicLevel } from '@/types/warning';
import { getWarningProducts, getCategoryTree } from '@/services/api/dashboard';
import type { CategoryTreeNode } from '@/services/api/dashboard';
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

// 战略等级渲染
const renderStrategicLevel = (level?: StrategicLevel) => {
  if (level === 'strategic') {
    return (
      <Tag color="gold" icon={<StarFilled />}>
        战略商品
      </Tag>
    );
  }
  return <Tag>普通商品</Tag>;
};

// 战略等级列配置
const strategicLevelColumn = {
  title: '战略等级',
  key: 'strategicLevel',
  width: 100,
  align: 'center' as const,
  render: (_: unknown, record: WarningProduct) => renderStrategicLevel(record.strategicLevel),
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
  const [products, setProducts] = useState<WarningProduct[]>([]);
  const [loading, setLoading] = useState(false);
  // 分页状态
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 });
  // 品类树相关
  const [categoryTree, setCategoryTree] = useState<CategoryTreeNode[]>([]);
  const [selectedCategoryPath, setSelectedCategoryPath] = useState<string | undefined>();
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  // 战略等级筛选
  const [strategicLevelFilter, setStrategicLevelFilter] = useState<StrategicLevel | undefined>();

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

  // 加载品类树数据
  useEffect(() => {
    const loadCategoryTree = async () => {
      try {
        const tree = await getCategoryTree();
        setCategoryTree(tree);
        // 默认展开第一级
        const firstLevelPaths = tree.map(node => node.categoryPath);
        setExpandedKeys(firstLevelPaths);
      } catch (error) {
        console.error('加载品类树失败:', error);
      }
    };
    loadCategoryTree();
  }, []);

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

  // 根据选中项加载商品数据（服务端分页）
  useEffect(() => {
    if (!selectedKey) {
      setProducts([]);
      setPagination(prev => ({ ...prev, total: 0 }));
      return;
    }

    const loadProducts = async () => {
      setLoading(true);
      try {
        const apiType = warningTypeMap[selectedKey];
        const result = await getWarningProducts(apiType, { page: pagination.page, pageSize: pagination.pageSize });
        let filteredData = result.data || [];

        // 前端按品类筛选（如果后端不支持品类筛选）
        if (selectedCategoryPath) {
          filteredData = filteredData.filter(product => {
            // 根据品类路径筛选
            return product.categoryName?.includes(selectedCategoryPath) ||
                   selectedCategoryPath.includes(product.categoryName);
          });
        }

        // 前端按战略等级筛选
        if (strategicLevelFilter) {
          filteredData = filteredData.filter(product => product.strategicLevel === strategicLevelFilter);
        }

        setProducts(filteredData);
        setPagination(prev => ({ ...prev, total: result.total || 0 }));
      } catch (error) {
        console.error('加载预警商品数据失败:', error);
        setProducts([]);
        setPagination(prev => ({ ...prev, total: 0 }));
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, [selectedKey, pagination.page, pagination.pageSize, selectedCategoryPath, strategicLevelFilter]);

  // 切换预警类型时重置分页和筛选
  const handleSelectedKeyChange = (key: string) => {
    setSelectedKey(key);
    setPagination(prev => ({ ...prev, page: 1 }));
    setSelectedCategoryPath(undefined);
    setStrategicLevelFilter(undefined);
  };

  // 分页变化处理
  const handleTableChange = (page: number, pageSize: number) => {
    setPagination(prev => ({ ...prev, page, pageSize }));
  };

  // 品类树选择处理
  const handleCategorySelect: TreeProps['onSelect'] = (selectedKeys) => {
    const path = selectedKeys[0] as string | undefined;
    setSelectedCategoryPath(path);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  // 战略等级筛选变化
  const handleStrategicLevelChange = (value: StrategicLevel | undefined) => {
    setStrategicLevelFilter(value);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  // 转换品类树数据为 antd Tree 格式
  const convertToTreeData = (nodes: CategoryTreeNode[]): any[] => {
    return nodes.map(node => ({
      key: node.categoryPath,
      title: `${node.name} (${node.value}%)`,
      children: node.children ? convertToTreeData(node.children) : undefined,
    }));
  };

  // 列配置
  const getColumns = (): ColumnsType<WarningProduct> => {
    const stockColumns: ColumnsType<WarningProduct> = [
      { title: '商品名称', dataIndex: 'productName', key: 'productName', width: 200, ellipsis: true },
      strategicLevelColumn,
      {
        title: '库存数量',
        dataIndex: ['stock', 'quantity'],
        key: 'stockQuantity',
        width: 100,
        align: 'right',
        render: (val: number, record: WarningProduct) => (
          <span style={{ fontWeight: 500 }}>{val.toLocaleString()}{record.stock.unitName ? ` ${record.stock.unitName}` : ''}</span>
        ),
      },
      {
        title: '日均销量',
        key: 'avgDailySales',
        width: 100,
        align: 'right',
        render: (_: unknown, record: WarningProduct) => {
          const sales = record.turnover.avgDailySales;
          const unit = record.stock.unitName || '';
          return <span style={{ fontWeight: 500 }}>{sales != null ? `${sales.toFixed(1)} ${unit}` : '-'}</span>;
        },
      },
      {
        title: '可售天数',
        key: 'sellableDays',
        width: 100,
        align: 'right',
        render: (_: unknown, record: WarningProduct) => {
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

    const turnoverColumns: ColumnsType<WarningProduct> = [
      { title: '商品名称', dataIndex: 'productName', key: 'productName', width: 200, ellipsis: true },
      strategicLevelColumn,
      {
        title: '库存数量',
        dataIndex: ['stock', 'quantity'],
        key: 'stockQuantity',
        width: 100,
        align: 'right',
        render: (val: number, record: WarningProduct) => (
          <span style={{ fontWeight: 500 }}>{val.toLocaleString()}{record.stock.unitName ? ` ${record.stock.unitName}` : ''}</span>
        ),
      },
      {
        title: '库存金额',
        dataIndex: ['stock', 'costAmount'],
        key: 'stockCostAmount',
        width: 120,
        align: 'right',
        render: (val: number) => <span style={{ fontWeight: 500 }}>¥{val?.toLocaleString() ?? '-'}</span>,
      },
      {
        title: '日均销量',
        key: 'avgDailySales',
        width: 100,
        align: 'right',
        render: (_: unknown, record: WarningProduct) => {
          const sales = record.turnover.avgDailySales;
          const unit = record.stock.unitName || '';
          return <span style={{ fontWeight: 500 }}>{sales != null ? `${sales.toFixed(1)} ${unit}` : '-'}</span>;
        },
      },
      {
        title: '可售天数',
        key: 'sellableDays',
        width: 100,
        align: 'right',
        render: (_: unknown, record: WarningProduct) => {
          const days = record.turnover.days;
          const color = days > 90 ? '#ff4d4f' : days > 60 ? '#fa541c' : days > 30 ? '#faad14' : '#52c41a';
          return <span style={{ color, fontWeight: 500 }}>{days}天</span>;
        },
      },
    ];

    const expiringColumns: ColumnsType<WarningProduct> = [
      { title: '商品名称', dataIndex: 'productName', key: 'productName', width: 200, ellipsis: true },
      strategicLevelColumn,
      { title: '规格', dataIndex: 'specification', key: 'specification', width: 100, align: 'center' },
      {
        title: '库存数量', dataIndex: ['stock', 'quantity'], key: 'stockQuantity', width: 100, align: 'right',
        render: (val: number) => <span style={{ fontWeight: 500 }}>{val.toLocaleString()}</span>,
      },
      {
        title: '距到期天数', key: 'daysToExpiry', width: 100, align: 'right',
        render: (_: unknown, record: WarningProduct) => {
          const days = record.expiring.daysToExpiry ?? 0;
          const color = days <= 7 ? '#ff4d4f' : days <= 15 ? '#fa8c16' : days <= 30 ? '#faad14' : '#52c41a';
          return <span style={{ color, fontWeight: 500 }}>{days}天</span>;
        },
      },
    ];

    const slowMovingColumns: ColumnsType<WarningProduct> = [
      { title: '商品名称', dataIndex: 'productName', key: 'productName', width: 200, ellipsis: true },
      strategicLevelColumn,
      { title: '规格', dataIndex: 'specification', key: 'specification', width: 100, align: 'center' },
      {
        title: '库存数量', dataIndex: ['stock', 'quantity'], key: 'stockQuantity', width: 100, align: 'right',
        render: (val: number) => <span style={{ fontWeight: 500 }}>{val.toLocaleString()}</span>,
      },
      {
        title: '未销售天数', key: 'daysWithoutSale', width: 100, align: 'right',
        render: (_: unknown, record: WarningProduct) => {
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
        {/* 左侧：预警分类 + 品类树筛选 */}
        <div className={styles.sidebar}>
          {/* 预警分类 */}
          <div className={styles.warningGroups}>
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
                    <span className={styles.groupCount}>{groupTotal}</span>
                  </div>
                  <div className={styles.groupItems}>
                    {group.items.map(item => {
                      const config = WARNING_CONFIG[item.key as keyof typeof WARNING_CONFIG];
                      const isSelected = selectedKey === item.key;
                      return (
                        <div
                          key={item.key}
                          className={`${styles.warningItem} ${isSelected ? styles.selected : ''}`}
                          onClick={() => handleSelectedKeyChange(item.key)}
                        >
                          <span className={styles.itemDot} style={{ backgroundColor: config.color }} />
                          <span className={styles.itemLabel}>{config.label}</span>
                          <span className={styles.itemCount}>{item.count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 品类树筛选 */}
          <div className={styles.categoryFilter}>
            <div className={styles.filterTitle}>品类筛选</div>
            <Tree
              treeData={convertToTreeData(categoryTree)}
              selectedKeys={selectedCategoryPath ? [selectedCategoryPath] : []}
              expandedKeys={expandedKeys}
              onExpand={(keys) => setExpandedKeys(keys as string[])}
              onSelect={handleCategorySelect}
              showLine
              className={styles.categoryTree}
            />
            {selectedCategoryPath && (
              <a className={styles.clearFilter} onClick={() => setSelectedCategoryPath(undefined)}>
                清除筛选
              </a>
            )}
          </div>
        </div>

        {/* 右侧商品明细 */}
        <div className={styles.content}>
          {selectedKey && selectedConfig && (
            <>
              <div className={styles.tableHeader}>
                <div className={styles.tableTitle}>
                  <span className={styles.titleBar} style={{ backgroundColor: selectedConfig.color }} />
                  {selectedConfig.label}商品明细
                  <span className={styles.productCount}>{pagination.total}</span>
                </div>
                <div className={styles.filterBar}>
                  <Space>
                    <span>战略等级：</span>
                    <Select
                      value={strategicLevelFilter}
                      onChange={handleStrategicLevelChange}
                      style={{ width: 120 }}
                      allowClear
                      placeholder="全部"
                    >
                      <Select.Option value="strategic">战略商品</Select.Option>
                      <Select.Option value="normal">普通商品</Select.Option>
                    </Select>
                  </Space>
                </div>
              </div>
              <Table
                columns={getColumns()}
                dataSource={products}
                rowKey="productId"
                loading={loading}
                pagination={{
                  current: pagination.page,
                  pageSize: pagination.pageSize,
                  total: pagination.total,
                  showSizeChanger: true,
                  pageSizeOptions: ['20', '50', '100'],
                  showTotal: (total) => `共 ${total} 条`,
                  onChange: handleTableChange,
                  size: 'small',
                }}
                scroll={{ x: 700 }}
                size="small"
                rowClassName={(record) => record.strategicLevel === 'strategic' ? styles.strategicRow : ''}
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
