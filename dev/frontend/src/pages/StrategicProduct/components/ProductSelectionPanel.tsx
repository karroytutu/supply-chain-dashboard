/**
 * 商品选择面板组件
 * 用于战略商品添加弹窗中的商品列表展示与选择
 */

import React from 'react';
import { List, Checkbox, Input, Space, Dropdown, Button, Empty, Spin, Pagination } from 'antd';
import { SearchOutlined, DownOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import type { SelectableProduct } from '@/types/strategic-product';
import styles from '../index.less';

interface ProductSelectionPanelProps {
  products: SelectableProduct[];
  selectedProductIds: string[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  keyword: string;
  hasFilter: boolean;
  isMobile: boolean;
  onKeywordChange: (keyword: string) => void;
  onSearch: () => void;
  onProductSelect: (goodsId: string, checked: boolean) => void;
  onSelectAllPage: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onPaginationChange: (page: number, pageSize: number) => void;
}

const ProductSelectionPanel: React.FC<ProductSelectionPanelProps> = ({
  products,
  selectedProductIds,
  loading,
  page,
  pageSize,
  total,
  keyword,
  hasFilter,
  isMobile,
  onKeywordChange,
  onSearch,
  onProductSelect,
  onSelectAllPage,
  onSelectAll,
  onClearSelection,
  onPaginationChange,
}) => {
  const selectAllMenuItems: MenuProps['items'] = [
    { key: 'page', label: `全选本页 (${products.length} 条)`, onClick: onSelectAllPage },
    { key: 'all', label: `全选全部 (${total} 条)`, onClick: onSelectAll },
    { type: 'divider' },
    { key: 'clear', label: '取消选择', onClick: onClearSelection },
  ];

  return (
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
          <div className={styles.loadingWrap}><Spin /></div>
        ) : !hasFilter ? (
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

      {hasFilter && total > 0 && (
        <div className={styles.paginationWrap}>
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            showSizeChanger
            showTotal={t => `共 ${t} 条`}
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
  );
};

export default ProductSelectionPanel;
