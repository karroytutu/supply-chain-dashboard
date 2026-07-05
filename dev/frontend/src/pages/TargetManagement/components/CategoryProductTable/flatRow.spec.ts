/**
 * CategoryProductTable 树形数据构建单元测试
 * 验证品类→商品嵌套树形结构的正确性
 */

import { describe, it, expect } from 'vitest';
import type { CategoryTarget, ProductTarget } from '@/types/target-management';

// 复制 TableRow 类型（与组件内定义一致）
interface TableRow {
  key: string;
  rowType: 'category' | 'product';
  categoryId: string;
  categoryName?: string;
  categoryRemark?: string;
  product?: ProductTarget;
  children?: TableRow[];
}

/**
 * 模拟组件内的树形数据构建逻辑
 */
function buildTreeData(categories: CategoryTarget[]): TableRow[] {
  return categories.map((cat) => {
    const childRows: TableRow[] = cat.products.map((p) => ({
      key: `prod-${cat.categoryId}-${p.productId}`,
      rowType: 'product' as const,
      categoryId: cat.categoryId,
      product: p,
    }));

    return {
      key: `cat-${cat.categoryId}`,
      rowType: 'category' as const,
      categoryId: cat.categoryId,
      categoryName: cat.categoryName,
      categoryRemark: cat.remark,
      children: childRows,
    };
  });
}

// 测试数据
const mockProduct: ProductTarget = {
  productId: 'p1',
  productName: '测试商品',
  unit: '箱',
  unitPrice: 100,
  lastMonthTarget: 5000,
  actualAmountLastMonth: 4500,
  actualAmountPrevMonth: 4000,
  grossMarginRate: 0.25,
  targetAmount: 6000,
  remark: '',
  isPlannedNew: false,
};

const mockCategory: CategoryTarget = {
  categoryId: 'cat1',
  categoryName: '饮料',
  targetAmount: 6000,
  actualAmountLastMonth: 4500,
  actualAmountPrevMonth: 4000,
  remark: '重点品类',
  products: [mockProduct, { ...mockProduct, productId: 'p2', productName: '商品B' }],
};

describe('树形数据构建', () => {
  it('单品类 + 2商品 → 1 个顶级行，含 2 个 children', () => {
    const result = buildTreeData([mockCategory]);
    expect(result).toHaveLength(1);
    expect(result[0].rowType).toBe('category');
    expect(result[0].children).toHaveLength(2);
    expect(result[0].children![0].rowType).toBe('product');
    expect(result[0].children![1].rowType).toBe('product');
  });

  it('品类行 key 格式为 cat-{categoryId}', () => {
    const result = buildTreeData([mockCategory]);
    expect(result[0].key).toBe('cat-cat1');
  });

  it('商品行 key 格式为 prod-{categoryId}-{productId}', () => {
    const result = buildTreeData([mockCategory]);
    expect(result[0].children![0].key).toBe('prod-cat1-p1');
    expect(result[0].children![1].key).toBe('prod-cat1-p2');
  });

  it('品类行携带 categoryName 和 categoryRemark', () => {
    const result = buildTreeData([mockCategory]);
    expect(result[0].categoryName).toBe('饮料');
    expect(result[0].categoryRemark).toBe('重点品类');
  });

  it('商品行携带 product 引用', () => {
    const result = buildTreeData([mockCategory]);
    expect(result[0].children![0].product).toBe(mockProduct);
    expect(result[0].children![0].product!.productName).toBe('测试商品');
  });

  it('空品类列表 → 空数组', () => {
    const result = buildTreeData([]);
    expect(result).toHaveLength(0);
  });

  it('品类下无商品 → children 为空数组', () => {
    const emptyCat = { ...mockCategory, products: [] };
    const result = buildTreeData([emptyCat]);
    expect(result).toHaveLength(1);
    expect(result[0].rowType).toBe('category');
    expect(result[0].children).toHaveLength(0);
  });

  it('多品类 → 正确嵌套', () => {
    const cat2: CategoryTarget = {
      ...mockCategory,
      categoryId: 'cat2',
      categoryName: '零食',
      products: [{ ...mockProduct, productId: 'p3' }],
    };
    const result = buildTreeData([mockCategory, cat2]);
    expect(result).toHaveLength(2);
    expect(result[0].children).toHaveLength(2); // cat1: 2 products
    expect(result[1].children).toHaveLength(1); // cat2: 1 product
  });

  it('所有 children 行的 categoryId 与父品类一致', () => {
    const cat2: CategoryTarget = {
      ...mockCategory,
      categoryId: 'cat2',
      products: [{ ...mockProduct, productId: 'p3' }],
    };
    const result = buildTreeData([mockCategory, cat2]);
    expect(result[0].children!.every((r) => r.categoryId === 'cat1')).toBe(true);
    expect(result[1].children!.every((r) => r.categoryId === 'cat2')).toBe(true);
  });
});
