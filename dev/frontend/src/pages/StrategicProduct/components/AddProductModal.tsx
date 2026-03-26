/**
 * 添加战略商品弹窗组件
 */
import React, { useState, useEffect } from 'react';
import { Modal, Tree, Input, Space, List, Checkbox, Dropdown, Button, Empty, Spin, Pagination, Collapse } from 'antd';
import { SearchOutlined, DownOutlined } from '@ant-design/icons';
import type { TreeProps, MenuProps } from 'antd';
import type { CategoryNode, SelectableProduct } from '@/types/strategic-product';
import styles from '../index.less';

interface AddProductModalProps {
  visible: boolean;
  categoryTree: CategoryNode[];
  selectedCategoryPath?: string;
  products: SelectableProduct[];
  selectedProductIds: string[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  keyword: string;
  onClose: () => void;
  onCategorySelect: TreeProps['onSelect'];
  onKeywordChange: (keyword: string) => void;
  onSearch: () => void;
  onProductSelect: (goodsId: string, checked: boolean) => void;
  onSelectAllPage: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onConfirm: () => Promise<boolean>;
  onPaginationChange: (page: number, pageSize: number) => void;
}

/**
 * 转换品类树数据为 antd Tree 格式
 */
const convertToTreeData = (nodes: CategoryNode[]): any[] => {
  return nodes.map(node => ({
    key: node.key,
    title: node.name,
    children: node.children ? convertToTreeData(node.children) : undefined,
  }));
};

const AddProductModal: React.FC<AddProductModalProps> = ({
  visible,
  categoryTree,
  selectedCategoryPath,
  products,
  selectedProductIds,
  loading,
  page,
  pageSize,
  total,
  keyword,
  onClose,
  onCategorySelect,
  onKeywordChange,
  onSearch,
  onProductSelect,
  onSelectAllPage,
  onSelectAll,
  onClearSelection,
  onConfirm,
  onPaginationChange,
}) => {
  // 移动端判断
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 全选下拉菜单
  const selectAllMenuItems: MenuProps['items'] = [
    {
      key: 'page',
      label: `全选本页 (${products.length} 条)`,
      onClick: onSelectAllPage,
    },
    {
      key: 'all',
      label: `全选全部 (${total} 条)`,
      onClick: onSelectAll,
    },
    {
      type: 'divider',
    },
    {
      key: 'clear',
      label: '取消选择',
      onClick: onClearSelection,
    },
  ];

  const handleOk = async () => {
    await onConfirm();
  };

  return (
    <Modal
      title="添加战略商品"
      open={visible}
      onOk={handleOk}
      onCancel={onClose}
      width={isMobile ? '100%' : 900}
      style={isMobile ? { top: 0, margin: 0, maxWidth: '100vw', height: '100vh' } : undefined}
      bodyStyle={isMobile ? { height: 'calc(100vh - 110px)', overflow: 'auto' } : undefined}
      okText="确认添加"
      cancelText="取消"
    >
      <div className={styles.addModalContent} style={isMobile ? { flexDirection: 'column', height: '100%' } : undefined}>
        {/* 移动端：品类树放在折叠面板中 */}
        {isMobile ? (
          <Collapse defaultActiveKey={['category']} style={{ marginBottom: 12 }}>
            <Collapse.Panel header="选择品类" key="category">
              <Tree
                treeData={convertToTreeData(categoryTree)}
                selectedKeys={selectedCategoryPath ? [selectedCategoryPath] : []}
                onSelect={onCategorySelect}
                showLine
              />
            </Collapse.Panel>
          </Collapse>
        ) : (
          <div className={styles.addModalTree}>
            <div className={styles.treeTitle}>选择品类</div>
            <Tree
              treeData={convertToTreeData(categoryTree)}
              selectedKeys={selectedCategoryPath ? [selectedCategoryPath] : []}
              onSelect={onCategorySelect}
              showLine
            />
          </div>
        )}
        <div className={styles.addModalProducts} style={isMobile ? { flex: 1, minHeight: 0 } : undefined}>
          <div className={styles.productsHeader}>
            <span>选择商品</span>
            <Space size="small" wrap>
              <Input
                placeholder="搜索商品名称"
                value={keyword}
                onChange={e => onKeywordChange(e.target.value)}
                onPressEnter={onSearch}
                style={{ width: isMobile ? '100%' : 150 }}
                size="small"
                prefix={<SearchOutlined />}
                allowClear
              />
              {products.length > 0 && (
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
            {loading ? (
              <div className={styles.loadingWrap}>
                <Spin />
              </div>
            ) : !selectedCategoryPath && !keyword ? (
              <Empty description="请选择品类或输入商品名称搜索" />
            ) : products.length === 0 ? (
              <Empty description="未找到符合条件的商品" />
            ) : (
              <List
                dataSource={products}
                renderItem={item => (
                  <List.Item className={styles.productItem}>
                    <Checkbox
                      checked={selectedProductIds.includes(item.goodsId)}
                      onChange={e => onProductSelect(item.goodsId, e.target.checked)}
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
          {(selectedCategoryPath || keyword) && total > 0 && (
            <div className={styles.paginationWrap}>
              <Pagination
                current={page}
                pageSize={pageSize}
                total={total}
                showSizeChanger
                showTotal={total => `共 ${total} 条`}
                onChange={onPaginationChange}
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
  );
};

export default AddProductModal;
