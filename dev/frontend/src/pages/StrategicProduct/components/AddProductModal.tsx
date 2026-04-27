/**
 * 添加战略商品弹窗组件
 */
import React, { useState, useEffect } from 'react';
import { Modal, Tree, Collapse } from 'antd';
import type { TreeProps } from 'antd';
import type { CategoryNode, SelectableProduct } from '@/types/strategic-product';
import ProductSelectionPanel from './ProductSelectionPanel';
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

/** 转换品类树数据为 antd Tree 格式 */
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
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleOk = async () => {
    await onConfirm();
  };

  const treeData = convertToTreeData(categoryTree);
  const selectedKeys = selectedCategoryPath ? [selectedCategoryPath] : [];

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
        {/* 品类树 */}
        {isMobile ? (
          <Collapse defaultActiveKey={['category']} style={{ marginBottom: 12 }}>
            <Collapse.Panel header="选择品类" key="category">
              <Tree treeData={treeData} selectedKeys={selectedKeys} onSelect={onCategorySelect} showLine />
            </Collapse.Panel>
          </Collapse>
        ) : (
          <div className={styles.addModalTree}>
            <div className={styles.treeTitle}>选择品类</div>
            <Tree treeData={treeData} selectedKeys={selectedKeys} onSelect={onCategorySelect} showLine />
          </div>
        )}

        {/* 商品选择面板 */}
        <ProductSelectionPanel
          products={products}
          selectedProductIds={selectedProductIds}
          loading={loading}
          page={page}
          pageSize={pageSize}
          total={total}
          keyword={keyword}
          hasFilter={!!selectedCategoryPath || !!keyword}
          isMobile={isMobile}
          onKeywordChange={onKeywordChange}
          onSearch={onSearch}
          onProductSelect={onProductSelect}
          onSelectAllPage={onSelectAllPage}
          onSelectAll={onSelectAll}
          onClearSelection={onClearSelection}
          onPaginationChange={onPaginationChange}
        />
      </div>
    </Modal>
  );
};

export default AddProductModal;
