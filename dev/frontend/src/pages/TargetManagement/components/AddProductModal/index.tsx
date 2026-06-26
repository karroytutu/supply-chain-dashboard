/**
 * 添加商品弹窗
 * 支持按品类过滤（从品类行打开时只显示该品类商品）
 */
import React, { useState, useMemo } from 'react';
import { Modal, Input, Checkbox, Button, Tag } from 'antd';

interface AvailableProduct {
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  unit: string;
  unitPrice: number;
}

interface AddProductModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (products: Array<{ productId: string; productName: string; categoryId: string; categoryName: string; unit: string; unitPrice: number }>) => void;
  availableProducts: AvailableProduct[];
  customerName: string;
  /** 品类过滤：从品类行打开时传入，只显示该品类的商品 */
  filterCategoryId?: string;
  filterCategoryName?: string;
}

const AddProductModal: React.FC<AddProductModalProps> = ({
  visible, onClose, onSuccess, availableProducts, customerName,
  filterCategoryId, filterCategoryName,
}) => {
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 按品类过滤 + 关键词搜索
  const filtered = useMemo(() => {
    let list = availableProducts;
    if (filterCategoryId) {
      list = list.filter((p) => p.categoryId === filterCategoryId);
    }
    if (keyword) {
      list = list.filter((p) => p.productName.includes(keyword));
    }
    return list;
  }, [availableProducts, filterCategoryId, keyword]);

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
      <Input.Search
        placeholder="搜索商品名称..."
        allowClear
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        style={{ marginBottom: 12 }}
      />
      <div style={{ maxHeight: 360, overflowY: 'auto' }}>
        {grouped.map(([catId, group]) => (
          <div key={catId}>
            {!filterCategoryId && (
              <div style={{ padding: '6px 12px', background: '#fafafa', fontWeight: 600, fontSize: 13 }}>
                {group.categoryName}
                <Tag style={{ marginLeft: 8 }}>{group.products.length}个商品</Tag>
              </div>
            )}
            {group.products.map((product) => (
              <div
                key={product.productId}
                onClick={() => toggleProduct(product.productId)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                  cursor: 'pointer', borderBottom: '1px solid #f5f5f5',
                  background: selected.has(product.productId) ? '#e6f7ff' : 'transparent',
                }}
              >
                <Checkbox checked={selected.has(product.productId)} />
                <span style={{ flex: 1 }}>{product.productName}</span>
                <span style={{ color: '#999', fontSize: 12 }}>¥{product.unitPrice}/{product.unit}</span>
              </div>
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
            暂无可添加的商品
          </div>
        )}
      </div>
      <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>
        已选择: {selected.size} 个商品
      </div>
    </Modal>
  );
};

export default AddProductModal;
