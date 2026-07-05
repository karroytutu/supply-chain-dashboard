/**
 * 添加商品弹窗
 * 支持按品类过滤（从品类行打开时只显示该品类商品）
 */
import React, { useState, useMemo } from 'react';
import { Modal, Input, Checkbox, Button, Segmented } from 'antd';
import styles from './index.less';

interface AvailableProduct {
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  unit: string;
  unitPrice: number;
  hasStock: boolean;
}

type StockFilter = 'all' | 'inStock' | 'outOfStock';

const STOCK_OPTIONS = [
  { label: '全部', value: 'all' as StockFilter },
  { label: '有库存', value: 'inStock' as StockFilter },
  { label: '无库存', value: 'outOfStock' as StockFilter },
];

interface AddProductModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (products: Array<{ productId: string; productName: string; categoryId: string; categoryName: string; unit: string; unitPrice: number }>) => void;
  availableProducts: AvailableProduct[];
  /** 已在目标列表中的商品 ID，弹窗中不展示 */
  existingProductIds: Set<string>;
  customerName: string;
  /** 品类过滤：从品类行打开时传入，只显示该品类商品 */
  filterCategoryId?: string;
  filterCategoryName?: string;
}

const AddProductModal: React.FC<AddProductModalProps> = ({
  visible, onClose, onSuccess, availableProducts, existingProductIds, customerName,
  filterCategoryId, filterCategoryName,
}) => {
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');

  // 排除已有商品 + 品类过滤 + 库存过滤 + 关键词搜索
  const filtered = useMemo(() => {
    let list = availableProducts.filter((p) => !existingProductIds.has(p.productId));
    if (filterCategoryId) {
      list = list.filter((p) => p.categoryId === filterCategoryId || p.categoryId.endsWith('/' + filterCategoryId));
    }
    if (stockFilter === 'inStock') {
      list = list.filter((p) => p.hasStock);
    } else if (stockFilter === 'outOfStock') {
      list = list.filter((p) => !p.hasStock);
    }
    if (keyword) {
      list = list.filter((p) => p.productName.includes(keyword));
    }
    return list;
  }, [availableProducts, existingProductIds, filterCategoryId, stockFilter, keyword]);

  // 分组展示
  const grouped = useMemo(() => {
    const map = new Map<string, { categoryName: string; products: AvailableProduct[] }>();
    for (const p of filtered) {
      if (!map.has(p.categoryId)) {
        map.set(p.categoryId, { categoryName: p.categoryName, products: [] });
      }
      map.get(p.categoryId)!.products.push(p);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const toggleProduct = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleProduct(id);
    }
  };

  const handleOk = () => {
    const result = availableProducts.filter((p) => selected.has(p.productId));
    onSuccess(result.map((p) => ({
      productId: p.productId, productName: p.productName,
      categoryId: p.categoryId, categoryName: p.categoryName,
      unit: p.unit, unitPrice: p.unitPrice,
    })));
    reset();
  };

  const reset = () => {
    setSelected(new Set());
    setKeyword('');
    setStockFilter('all');
  };

  const handleClose = () => { reset(); onClose(); };

  const title = filterCategoryName
    ? `添加「${filterCategoryName}」商品到「${customerName}」`
    : `添加商品到「${customerName}」`;

  return (
    <Modal
      title={title}
      open={visible}
      onCancel={handleClose}
      width={520}
      footer={[
        <Button key="cancel" onClick={handleClose}>取消</Button>,
        <Button key="ok" type="primary" disabled={selected.size === 0} onClick={handleOk}>
          确认添加 ({selected.size})
        </Button>,
      ]}
    >
      <div className={styles.filterRow}>
        <Segmented
          options={STOCK_OPTIONS}
          value={stockFilter}
          onChange={(v) => setStockFilter(v as StockFilter)}
          size="small"
        />
        <Input.Search
          placeholder="搜索商品名称..."
          allowClear
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          size="small"
          style={{ flex: 1 }}
        />
      </div>
      <div className={styles.listContainer}>
        {grouped.map(([catId, group]) => (
          <div key={catId}>
            <div className={styles.groupHeader}>
              {group.categoryName}
              <span className={styles.groupCount}>{group.products.length}个商品</span>
            </div>
            {group.products.map((product) => {
              const isSelected = selected.has(product.productId);
              return (
                <div
                  key={product.productId}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onClick={() => toggleProduct(product.productId)}
                  onKeyDown={(e) => handleKeyDown(e, product.productId)}
                  className={`${styles.listItem} ${isSelected ? styles.listItemSelected : ''}`}
                >
                  <Checkbox checked={isSelected} />
                  <span className={styles.itemName}>{product.productName}</span>
                  <span className={styles.itemPrice}>¥{product.unitPrice}/{product.unit}</span>
                </div>
              );
            })}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className={styles.empty}>暂无可添加的商品</div>
        )}
      </div>
      <div className={styles.footer}>
        已选择: {selected.size} 个商品
      </div>
    </Modal>
  );
};

export default AddProductModal;
