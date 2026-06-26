/**
 * 品类→商品分层表格
 * 列：名称 | 上月目标 | 上月实际 | 上月达成 | 上月环比 | 本月目标 | 预计增长 | 预计环比 | 说明
 */
import React, { useState } from 'react';
import { InputNumber, Input, Button, Tag, Dropdown, Tooltip, Empty } from 'antd';
import { DownOutlined, RightOutlined, PlusOutlined, ScissorOutlined } from '@ant-design/icons';
import type { CustomerTarget, SplitMethod } from '@/types/target-management';
import { useTargetCalculation } from '../../hooks/useTargetCalculation';
import styles from './index.less';

interface CategoryProductTableProps {
  customer: CustomerTarget | null;
  readOnly: boolean;
  onUpdateProduct: (customerId: string, catId: string, prodId: string, field: 'targetAmount' | 'remark', value: number | string, unitPrice: number) => void;
  onSplit: (customerId: string, catId: string, method: SplitMethod, targetAmount: number) => void;
  onAddProduct: (customerId: string, categoryId: string, categoryName: string) => void;
  onAddCategory: (customerId: string) => void;
}

function fmtAmt(n: number): string {
  if (n === 0) return '-';
  if (n >= 10000) return `¥${(n / 10000).toFixed(1)}万`;
  return `¥${n.toLocaleString()}`;
}

function fmtPct(current: number, base: number): { text: string; color: string } {
  if (base === 0 && current === 0) return { text: '-', color: '#999' };
  if (base === 0) return { text: '新增', color: '#52c41a' };
  const pct = ((current - base) / base) * 100;
  const arrow = pct >= 0 ? '↑' : '↓';
  const color = pct >= 0 ? '#52c41a' : '#f5222d';
  return { text: `${arrow}${Math.abs(pct).toFixed(1)}%`, color };
}

function fmtRate(actual: number, target: number): string {
  if (target === 0) return '-';
  return `${((actual / target) * 100).toFixed(1)}%`;
}

const CategoryProductTable: React.FC<CategoryProductTableProps> = ({
  customer, readOnly, onUpdateProduct, onSplit, onAddProduct, onAddCategory,
}) => {
  const calc = useTargetCalculation();
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [pendingTargets, setPendingTargets] = useState<Record<string, number>>({});

  if (!customer) {
    return <Empty className={styles.empty} description="请从左侧选择客户" />;
  }

  const toggleCategory = (catId: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      next.has(catId) ? next.delete(catId) : next.add(catId);
      return next;
    });
  };

  const handleCategoryTargetChange = (catId: string, value: number) => {
    setPendingTargets((prev) => ({ ...prev, [catId]: value }));
  };

  const getCategoryDisplayTarget = (catId: string, aggAmount: number): number | undefined => {
    return pendingTargets[catId] || aggAmount || undefined;
  };

  const splitMenu = (customerId: string, catId: string) => ({
    items: [
      { key: 'by_proportion', label: '按历史销售占比拆分', onClick: () => onSplit(customerId, catId, 'by_proportion', pendingTargets[catId] || 0) },
      { key: 'even', label: '平均分摊', onClick: () => onSplit(customerId, catId, 'even', pendingTargets[catId] || 0) },
    ],
  });

  // 品类行数据计算
  const calcCatRow = (cat: typeof customer.categories[0]) => {
    const agg = calc.getCategoryAggregates(cat);
    const lastMom = fmtPct(agg.actualAmountLastMonth, agg.actualAmountPrevMonth);
    const curTarget = pendingTargets[cat.categoryId] || agg.targetAmount;
    const growth = curTarget - agg.actualAmountLastMonth;
    const expectedMom = fmtPct(curTarget, agg.actualAmountLastMonth);
    return { agg, lastMom, curTarget, growth, expectedMom };
  };

  return (
    <div className={styles.table}>
      {/* 表头 */}
      <div className={styles.thead}>
        <span className={styles.colName}>名称</span>
        <span className={styles.colNum}>上月目标</span>
        <span className={styles.colNum}>上月实际</span>
        <span className={styles.colNum}>上月达成</span>
        <span className={styles.colNum}>上月环比</span>
        <span className={styles.colTarget}>本月目标</span>
        <span className={styles.colNum}>预计增长</span>
        <span className={styles.colNum}>预计环比</span>
        <span className={styles.colRemark}>说明</span>
      </div>

      {/* 数据行 */}
      {customer.categories.map((cat) => {
        const { agg, lastMom, curTarget, growth, expectedMom } = calcCatRow(cat);
        const isExpanded = expandedCats.has(cat.categoryId);

        return (
          <React.Fragment key={cat.categoryId}>
            {/* 品类行 */}
            <div className={styles.categoryRow}>
              <span className={styles.colName}>
                <span onClick={() => toggleCategory(cat.categoryId)} className={styles.catNameWrap}>
                  {isExpanded ? <DownOutlined className={styles.expandIcon} /> : <RightOutlined className={styles.expandIcon} />}
                  <span className={styles.catName}>{cat.categoryName}</span>
                </span>
                {!readOnly && (
                  <Tooltip title="添加商品">
                    <button className={styles.addProductIcon} onClick={() => onAddProduct(customer.customerId, cat.categoryId, cat.categoryName)}>
                      <PlusOutlined />
                    </button>
                  </Tooltip>
                )}
              </span>
              <span className={styles.colNum}>{fmtAmt(agg.lastMonthTarget)}</span>
              <span className={styles.colNum}>{fmtAmt(agg.actualAmountLastMonth)}</span>
              <span className={styles.colNum}>{fmtRate(agg.actualAmountLastMonth, agg.lastMonthTarget)}</span>
              <span className={styles.colNum} style={{ color: lastMom.color }}>{lastMom.text}</span>
              <span className={styles.colTarget}>
                <InputNumber
                  prefix="¥"
                  value={getCategoryDisplayTarget(cat.categoryId, agg.targetAmount)}
                  onChange={(v) => handleCategoryTargetChange(cat.categoryId, v || 0)}
                  disabled={readOnly}
                  size="small"
                  precision={0}
                  step={10000}
                  placeholder="品类目标"
                  className={styles.targetInput}
                />
                {!readOnly && (
                  <Dropdown menu={splitMenu(customer.customerId, cat.categoryId)}>
                    <Button size="small" className={styles.splitBtn}>
                      <ScissorOutlined /> 拆分 <DownOutlined style={{ fontSize: 10 }} />
                    </Button>
                  </Dropdown>
                )}
              </span>
              <span className={`${styles.colNum} ${growth > 0 ? styles.positive : growth < 0 ? styles.negative : ''}`}>{fmtAmt(growth)}</span>
              <span className={styles.colNum} style={{ color: expectedMom.color }}>{expectedMom.text}</span>
              <span className={styles.colRemark} />
            </div>

            {/* 商品行 */}
            {isExpanded && cat.products.map((product) => {
              const pLastMom = fmtPct(product.actualAmountLastMonth, product.actualAmountPrevMonth);
              const pGrowth = product.targetAmount - product.actualAmountLastMonth;
              const pExpectedMom = fmtPct(product.targetAmount, product.actualAmountLastMonth);

              return (
                <div key={product.productId} className={styles.productRow}>
                  <span className={styles.colName}>
                    <span className={styles.productIndent} />
                    {product.productName}
                    <span className={styles.unit}>({product.unit})</span>
                    {product.isPlannedNew && <Tag color="orange" className={styles.newTag}>新</Tag>}
                  </span>
                  <span className={styles.colNum}>{fmtAmt(product.lastMonthTarget)}</span>
                  <span className={styles.colNum}>{fmtAmt(product.actualAmountLastMonth)}</span>
                  <span className={styles.colNum}>{fmtRate(product.actualAmountLastMonth, product.lastMonthTarget)}</span>
                  <span className={styles.colNum} style={{ color: pLastMom.color }}>{pLastMom.text}</span>
                  <span className={styles.colTarget}>
                    {readOnly ? (
                      <span>{fmtAmt(product.targetAmount)}</span>
                    ) : (
                      <InputNumber
                        prefix="¥"
                        value={product.targetAmount || undefined}
                        onChange={(v) => onUpdateProduct(customer.customerId, cat.categoryId, product.productId, 'targetAmount', v || 0, product.unitPrice)}
                        size="small"
                        precision={0}
                        step={10000}
                        placeholder="目标"
                        className={styles.targetInput}
                      />
                    )}
                  </span>
                  <span className={`${styles.colNum} ${pGrowth > 0 ? styles.positive : pGrowth < 0 ? styles.negative : ''}`}>{fmtAmt(pGrowth)}</span>
                  <span className={styles.colNum} style={{ color: pExpectedMom.color }}>{pExpectedMom.text}</span>
                  <span className={styles.colRemark}>
                    {readOnly ? (
                      <span className={styles.remarkText}>{product.remark || '-'}</span>
                    ) : (
                      <Input
                        value={product.remark}
                        onChange={(e) => onUpdateProduct(customer.customerId, cat.categoryId, product.productId, 'remark', e.target.value, product.unitPrice)}
                        placeholder="填写目标说明..."
                        maxLength={100}
                        size="small"
                        className={styles.remarkInput}
                      />
                    )}
                  </span>
                </div>
              );
            })}
          </React.Fragment>
        );
      })}

      {/* 添加品类按钮 */}
      {!readOnly && (
        <div className={styles.addRow}>
          <Button type="dashed" icon={<PlusOutlined />} onClick={() => onAddCategory(customer.customerId)}>
            添加品类
          </Button>
        </div>
      )}
    </div>
  );
};

export default CategoryProductTable;
