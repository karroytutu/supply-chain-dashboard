import { useState, useEffect, useCallback } from 'react';
import {
  Table, Card, Button, Input, Space, Tag, Modal, message, Tree, Row, Col, Statistic, Badge,
  Drawer, List, Checkbox, Tabs, Empty, Spin, Tooltip, Popconfirm, Pagination, Dropdown
} from 'antd';
import type { MenuProps } from 'antd';
import type { TreeProps } from 'antd';
import {
  SearchOutlined, PlusOutlined, DeleteOutlined, CheckOutlined, CloseOutlined,
  InboxOutlined, ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, DownOutlined
} from '@ant-design/icons';
import {
  getStrategicProducts, getStrategicProductStats, addStrategicProducts,
  deleteStrategicProduct, confirmStrategicProduct, getCategoryTree, getProductsForSelection
} from '@/services/api/strategic-product';
import type {
  StrategicProduct, StrategicProductStats, CategoryNode, SelectableProduct, StrategicProductStatus
} from '@/types/strategic-product';
import type { PaginatedResult } from '@/types/warning';
import styles from './index.less';

export default function StrategicProductManage() {
  // 列表相关状态
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<StrategicProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<StrategicProductStatus | undefined>();

  // 统计数据
  const [stats, setStats] = useState<StrategicProductStats>({ total: 0, pending: 0, confirmed: 0, rejected: 0 });

  // 品类树相关
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [selectedCategoryPath, setSelectedCategoryPath] = useState<string | undefined>();
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  // 添加商品弹窗相关
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addCategoryTree, setAddCategoryTree] = useState<CategoryNode[]>([]);
  const [selectedAddCategoryPath, setSelectedAddCategoryPath] = useState<string | undefined>();
  const [productsForSelection, setProductsForSelection] = useState<SelectableProduct[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsPage, setProductsPage] = useState(1);
  const [productsPageSize, setProductsPageSize] = useState(10);
  const [productsTotal, setProductsTotal] = useState(0);
  const [productsKeyword, setProductsKeyword] = useState('');

  // 加载统计信息
  const loadStats = async () => {
    try {
      const result = await getStrategicProductStats();
      setStats(result);
    } catch (error) {
      console.error('加载统计信息失败:', error);
    }
  };

  // 加载品类树
  const loadCategoryTree = async () => {
    try {
      const result = await getCategoryTree();
      setCategoryTree(result);
      // 默认展开第一级
      const firstLevelKeys = result.map(node => node.key);
      setExpandedKeys(firstLevelKeys);
    } catch (error) {
      console.error('加载品类树失败:', error);
    }
  };

  // 加载战略商品列表
  const loadStrategicProducts = async () => {
    setLoading(true);
    try {
      const result: PaginatedResult<StrategicProduct> = await getStrategicProducts({
        page,
        pageSize,
        keyword,
        status: statusFilter,
        categoryPath: selectedCategoryPath,
      });
      setDataSource(result.data);
      setTotal(result.total);
    } catch (error) {
      message.error('加载战略商品列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategoryTree();
    loadStats();
  }, []);

  useEffect(() => {
    loadStrategicProducts();
  }, [page, pageSize, statusFilter, selectedCategoryPath]);

  // 品类树选择处理
  const handleCategorySelect: TreeProps['onSelect'] = (selectedKeys) => {
    const categoryPath = selectedKeys[0] as string | undefined;
    setSelectedCategoryPath(categoryPath);
    setPage(1);
  };

  // 搜索
  const handleSearch = () => {
    setPage(1);
    loadStrategicProducts();
  };

  // 打开添加商品弹窗
  const handleOpenAddModal = async () => {
    setAddModalVisible(true);
    setProductsKeyword(''); // 清空搜索关键词
    try {
      const result = await getCategoryTree();
      setAddCategoryTree(result);
    } catch (error) {
      console.error('加载品类树失败:', error);
    }
  };

  // 加载可选商品
  const loadProductsForSelection = async (categoryPath: string, page = 1, pageSize = 10, keyword = '') => {
    setProductsLoading(true);
    try {
      const result = await getProductsForSelection(categoryPath, { page, pageSize, keyword: keyword || undefined });
      console.log('商品列表响应:', result);
      setProductsForSelection(result.data);
      setProductsTotal(result.total);
      setProductsPage(page);
      setProductsPageSize(pageSize);
    } catch (error) {
      console.error('加载商品列表失败:', error);
      setProductsForSelection([]);
      setProductsTotal(0);
    } finally {
      setProductsLoading(false);
    }
  };

  // 添加弹窗品类选择
  const handleAddCategorySelect: TreeProps['onSelect'] = (selectedKeys) => {
    const categoryPath = selectedKeys[0] as string | undefined;
    setSelectedAddCategoryPath(categoryPath);
    setSelectedProductIds([]);
    setProductsKeyword(''); // 清空搜索关键词
    if (categoryPath) {
      loadProductsForSelection(categoryPath, 1, productsPageSize, '');
    } else {
      setProductsForSelection([]);
      setProductsTotal(0);
    }
  };

  // 弹窗商品搜索
  const handleProductsSearch = () => {
    setProductsPage(1);
    // 如果有品类则搜索该品类，否则搜索全部
    loadProductsForSelection(selectedAddCategoryPath || '', 1, productsPageSize, productsKeyword);
  };

  // 商品选择
  const handleProductSelect = (goodsId: string, checked: boolean) => {
    if (checked) {
      setSelectedProductIds([...selectedProductIds, goodsId]);
    } else {
      setSelectedProductIds(selectedProductIds.filter(id => id !== goodsId));
    }
  };

  // 全选本页
  const handleSelectAllPage = () => {
    const pageIds = productsForSelection.map(p => p.goodsId);
    // 合并本页ID，去重
    const newIds = [...new Set([...selectedProductIds, ...pageIds])];
    setSelectedProductIds(newIds);
  };

  // 全选全部
  const handleSelectAll = async () => {
    if (!selectedAddCategoryPath) return;
    
    setProductsLoading(true);
    try {
      // 获取该品类下所有商品ID
      const result = await getProductsForSelection(selectedAddCategoryPath, { page: 1, pageSize: 9999 });
      const allIds = result.data.map(p => p.goodsId);
      setSelectedProductIds(allIds);
      message.success(`已选择全部 ${allIds.length} 个商品`);
    } catch (error) {
      console.error('获取全部商品失败:', error);
      message.error('获取全部商品失败');
    } finally {
      setProductsLoading(false);
    }
  };

  // 取消全选
  const handleClearSelection = () => {
    setSelectedProductIds([]);
  };

  // 全选下拉菜单
  const selectAllMenuItems: MenuProps['items'] = [
    {
      key: 'page',
      label: `全选本页 (${productsForSelection.length} 条)`,
      onClick: handleSelectAllPage,
    },
    {
      key: 'all',
      label: `全选全部 (${productsTotal} 条)`,
      onClick: handleSelectAll,
    },
    {
      type: 'divider',
    },
    {
      key: 'clear',
      label: '取消选择',
      onClick: handleClearSelection,
    },
  ];

  // 确认添加商品
  const handleAddProducts = async () => {
    if (selectedProductIds.length === 0) {
      message.warning('请选择至少一个商品');
      return;
    }
    try {
      const result = await addStrategicProducts({ goodsIds: selectedProductIds });
      // result 格式: { data: { addedCount, skippedCount } }
      const addedCount = result.data?.addedCount ?? result.addedCount ?? 0;
      message.success(`成功添加 ${addedCount} 个战略商品`);
      setAddModalVisible(false);
      setSelectedProductIds([]);
      setSelectedAddCategoryPath(undefined);
      setProductsForSelection([]);
      setProductsKeyword('');
      loadStrategicProducts();
      loadStats();
    } catch (error) {
      message.error('添加失败');
    }
  };

  // 删除战略商品
  const handleDelete = async (id: number) => {
    try {
      await deleteStrategicProduct(id);
      message.success('删除成功');
      loadStrategicProducts();
      loadStats();
    } catch (error) {
      message.error('删除失败');
    }
  };

  // 确认/驳回战略商品
  const handleConfirm = async (record: StrategicProduct, confirmed: boolean) => {
    try {
      await confirmStrategicProduct(record.id, { action: confirmed ? 'confirm' : 'reject' });
      message.success(confirmed ? '确认成功' : '驳回成功');
      loadStrategicProducts();
      loadStats();
    } catch (error) {
      message.error('操作失败');
    }
  };

  // 转换品类树数据为 antd Tree 格式
  const convertToTreeData = (nodes: CategoryNode[]): any[] => {
    return nodes.map(node => ({
      key: node.key,
      title: node.name,
      children: node.children ? convertToTreeData(node.children) : undefined,
    }));
  };

  // 状态标签渲染
  const renderStatusTag = (status: StrategicProductStatus) => {
    const config: Record<StrategicProductStatus, { color: string; text: string }> = {
      pending: { color: 'warning', text: '待确认' },
      confirmed: { color: 'success', text: '已确认' },
      rejected: { color: 'error', text: '已驳回' },
    };
    const { color, text } = config[status];
    return <Tag color={color}>{text}</Tag>;
  };

  // 确认状态渲染
  const renderConfirmStatus = (record: StrategicProduct) => {
    return (
      <Space direction="vertical" size="small">
        <div>
          <span style={{ marginRight: 8 }}>采购主管：</span>
          {record.procurementConfirmed ? (
            <Tag color="green" icon={<CheckOutlined />}>已确认</Tag>
          ) : (
            <Tag color="default">待确认</Tag>
          )}
        </div>
        <div>
          <span style={{ marginRight: 8 }}>营销主管：</span>
          {record.marketingConfirmed ? (
            <Tag color="green" icon={<CheckOutlined />}>已确认</Tag>
          ) : (
            <Tag color="default">待确认</Tag>
          )}
        </div>
      </Space>
    );
  };

  const columns = [
    {
      title: '商品名称',
      dataIndex: 'goodsName',
      key: 'goodsName',
      width: 250,
      ellipsis: true,
    },
    {
      title: '确认状态',
      key: 'confirmStatus',
      width: 160,
      render: renderConfirmStatus,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: renderStatusTag,
    },
    {
      title: '提交时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (text: string) => text ? new Date(text).toLocaleString() : '-',
    },
    {
      title: '确认时间',
      dataIndex: 'confirmedAt',
      key: 'confirmedAt',
      width: 160,
      render: (text: string) => text ? new Date(text).toLocaleString() : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: any, record: StrategicProduct) => (
        <Space>
          {record.status === 'pending' && (
            <>
              <Tooltip title="确认">
                <Button
                  type="link"
                  size="small"
                  icon={<CheckOutlined />}
                  onClick={() => handleConfirm(record, true)}
                />
              </Tooltip>
              <Tooltip title="驳回">
                <Button
                  type="link"
                  size="small"
                  danger
                  icon={<CloseOutlined />}
                  onClick={() => handleConfirm(record, false)}
                />
              </Tooltip>
            </>
          )}
          <Popconfirm
            title="确定要删除该战略商品吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className={styles.container}>
      {/* 左侧品类树 */}
      <div className={styles.sidebar}>
        <Card title="品类筛选" size="small" className={styles.categoryCard}>
          <Tree
            treeData={convertToTreeData(categoryTree)}
            selectedKeys={selectedCategoryPath ? [selectedCategoryPath] : []}
            expandedKeys={expandedKeys}
            onExpand={(keys) => setExpandedKeys(keys as string[])}
            onSelect={handleCategorySelect}
            showLine
          />
        </Card>
      </div>

      {/* 右侧主内容区 */}
      <div className={styles.main}>
        {/* 统计卡片 */}
        <Row gutter={16} className={styles.statsRow}>
          <Col span={6}>
            <Card>
              <Statistic
                title="战略商品总数"
                value={stats.total}
                prefix={<InboxOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="待确认"
                value={stats.pending}
                prefix={<ClockCircleOutlined />}
                valueStyle={{ color: '#faad14' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="已确认"
                value={stats.confirmed}
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="已驳回"
                value={stats.rejected}
                prefix={<CloseCircleOutlined />}
                valueStyle={{ color: '#ff4d4f' }}
              />
            </Card>
          </Col>
        </Row>

        {/* 商品列表 */}
        <Card className={styles.tableCard}>
          <div className={styles.toolbar}>
            <Space>
              <Input
                placeholder="搜索商品名称/编码"
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                onPressEnter={handleSearch}
                style={{ width: 200 }}
                prefix={<SearchOutlined />}
              />
              <Button type="primary" onClick={handleSearch}>搜索</Button>
              <span>状态：</span>
              <Button
                type={statusFilter === undefined ? 'primary' : 'default'}
                size="small"
                onClick={() => setStatusFilter(undefined)}
              >
                全部
              </Button>
              <Button
                type={statusFilter === 'pending' ? 'primary' : 'default'}
                size="small"
                onClick={() => setStatusFilter('pending')}
              >
                待确认
              </Button>
              <Button
                type={statusFilter === 'confirmed' ? 'primary' : 'default'}
                size="small"
                onClick={() => setStatusFilter('confirmed')}
              >
                已确认
              </Button>
              <Button
                type={statusFilter === 'rejected' ? 'primary' : 'default'}
                size="small"
                onClick={() => setStatusFilter('rejected')}
              >
                已驳回
              </Button>
            </Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenAddModal}>
              添加战略商品
            </Button>
          </div>

          <Table
            columns={columns}
            dataSource={dataSource}
            rowKey="id"
            loading={loading}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
              onChange: (p, ps) => {
                setPage(p);
                setPageSize(ps);
              },
            }}
          />
        </Card>
      </div>

      {/* 添加商品弹窗 */}
      <Modal
        title="添加战略商品"
        open={addModalVisible}
        onOk={handleAddProducts}
        onCancel={() => {
          setAddModalVisible(false);
          setSelectedProductIds([]);
          setSelectedAddCategoryPath(undefined);
          setProductsForSelection([]);
          setProductsPage(1);
          setProductsTotal(0);
          setProductsKeyword('');
        }}
        width={900}
        okText="确认添加"
        cancelText="取消"
      >
        <div className={styles.addModalContent}>
          <div className={styles.addModalTree}>
            <div className={styles.treeTitle}>选择品类</div>
            <Tree
              treeData={convertToTreeData(addCategoryTree)}
              selectedKeys={selectedAddCategoryPath ? [selectedAddCategoryPath] : []}
              onSelect={handleAddCategorySelect}
              showLine
            />
          </div>
          <div className={styles.addModalProducts}>
            <div className={styles.productsHeader}>
              <span>选择商品</span>
              <Space>
                <Input
                  placeholder="搜索商品名称"
                  value={productsKeyword}
                  onChange={e => setProductsKeyword(e.target.value)}
                  onPressEnter={handleProductsSearch}
                  style={{ width: 150 }}
                  size="small"
                  prefix={<SearchOutlined />}
                  allowClear
                />
                {productsForSelection.length > 0 && (
                  <Dropdown menu={{ items: selectAllMenuItems }} trigger={['click']}>
                    <Button size="small">
                      {selectedProductIds.length > 0 
                        ? `已选 ${selectedProductIds.length} 条` 
                        : '选择'} <DownOutlined />
                    </Button>
                  </Dropdown>
                )}
              </Space>
            </div>
            <div className={styles.productsList}>
              {productsLoading ? (
                <div className={styles.loadingWrap}>
                  <Spin />
                </div>
              ) : !selectedAddCategoryPath && !productsKeyword ? (
                <Empty description="请选择品类或输入商品名称搜索" />
              ) : productsForSelection.length === 0 ? (
                <Empty description="未找到符合条件的商品" />
              ) : (
                <List
                  dataSource={productsForSelection}
                  renderItem={item => (
                    <List.Item className={styles.productItem}>
                      <Checkbox
                        checked={selectedProductIds.includes(item.goodsId)}
                        onChange={e => handleProductSelect(item.goodsId, e.target.checked)}
                      >
                        <div className={styles.productInfo}>
                          <span className={styles.productName}>{item.goodsName}</span>
                          <span className={styles.productSpec}>{item.specification || '-'}</span>
                        </div>
                      </Checkbox>
                    </List.Item>
                  )}
                />
              )}
            </div>
            {(selectedAddCategoryPath || productsKeyword) && productsTotal > 0 && (
              <div className={styles.paginationWrap}>
                <Pagination
                  current={productsPage}
                  pageSize={productsPageSize}
                  total={productsTotal}
                  showSizeChanger
                  showTotal={total => `共 ${total} 条`}
                  onChange={(page, pageSize) => {
                    loadProductsForSelection(selectedAddCategoryPath || '', page, pageSize, productsKeyword);
                  }}
                  size="small"
                />
              </div>
            )}
            {selectedProductIds.length > 0 && (
              <div className={styles.selectedInfo}>
                已选择 {selectedProductIds.length} 个商品
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
