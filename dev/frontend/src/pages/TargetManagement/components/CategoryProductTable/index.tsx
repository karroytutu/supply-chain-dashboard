/**
 * 品类→商品分层表格
 * 列：名称 | 上月目标 | 上月实际 | 上月达成 | 上月环比 | 本月目标 | 预计增长 | 预计环比 | 说明
 */
import React, { useState, useRef } from 'react';
import { Input, Button, Tag, Dropdown, Tooltip, Empty, Modal, InputNumber } from 'antd';
import { DownOutlined, RightOutlined, PlusOutlined, ScissorOutlined } from '@ant-design/icons';
import type { CustomerTarget, CategoryTarget, SplitMethod } from '@/types/target-management';
import { formatCompactAmount, formatChangeRate, formatAchievementRate } from '@/utils/format';
import DebouncedInputNumber from '../DebouncedInputNumber';
import styles from './index.less';

interface CategoryProductTableProps {
  customer: CustomerTarget | null;
  readOnly: boolean;
  getCategoryAggregates: (category: CategoryTarget) => { targetAmount: number; lastMonthTarget: number; actualAmountLastMonth: number; actualAmountPrevMonth: number };
  onUpdateProduct: (customerId: number, catId: string, prodId: string, field: 'targetAmount' | 'remark', value: number | string, unitPrice: number) => void;
  onSplit: (customerId: number, catId: string, method: SplitMethod, targetAmount: number) => void;
  onAddProduct: (customerId: number, categoryId: string, categoryName: string) => void;
  onAddCategory: (customerId: number) => void;
}

const CategoryProductTable: React.FC<CategoryProductTableProps> = ({
  customer, readOnly, getCategoryAggregates, onUpdateProduct, onSplit, onAddProduct, onAddCategory,
}) => {
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const splitAmountRef = useRef<Record<string, number>>({});

  if (!customer) {
    return (
      <div className={styles.table}>
        <Empty className={styles.empty} description="请从左侧选择客户" />
      </div>
    );
  }

  const toggleCategory = (catId: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      next.has(catId) ? next.delete(catId) : next.add(catId);
      return next;
    });
  };

  // 拆分弹窗：输入目标金额后选择拆分方式
  const showSplitDialog = (customerId: number, catId: string, currentTotal: number) => {
    let amount = currentTotal;
    Modal.confirm({
      title: '拆分品类目标到商品',
      content: (
        <div style={{ marginTop: 12 }}>
          <div style={{ marginBottom: 8, color: '#666' }}>输入目标总额，将拆分到各商品行：</div>
          <InputNumber
            prefix="¥"
            defaultValue={currentTotal}
            onChange={(v) => { amount = v || 0; }}
            style={{ width: '100%' }}
            precision={0}
            step={10000}
            placeholder="品类目标总额"
          />
        </div>
      ),
      okText: '按比例拆分',
      cancelText: '取消',
      onOk: () => onSplit(customerId, catId, 'by_proportion', amount),
      cancelButtonProps: { style: { display: 'none' } },
      footer: (_, { OkBtn, CancelBtn }) => (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <CancelBtn />
          <Button onClick={() => { onSplit(customerId, catId, 'even', amount); Modal.destroyAll(); }}>平均分摊</Button>
          <OkBtn />
        </div>
      ),
    });
  };

  // 品类行数据计算
  const calcCatRow = (cat: typeof customer.categories[0]) => {
    const agg = getCategoryAggregates(cat);
    const lastMom = formatChangeRate(agg.actualAmountLastMonth, agg.actualAmountPrevMonth);
    const growth = agg.targetAmount - agg.actualAmountLastMonth;
    const expectedMom = formatChangeRate(agg.targetAmount, agg.actualAmountLastMonth);
    return { agg, lastMom, growth, expectedMom };
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
        const { agg, lastMom, growth, expectedMom } = calcCatRow(cat);
        const isExpanded = expandedCats.has(cat.categoryId);

        return (
          <React.Fragment key={cat.categoryId}>
            {/* 品类行 */}
            <div className={styles.categoryRow}>
              <span className={styles.colName}>
                <span
                  onClick={() => toggleCategory(cat.categoryId)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCategory(cat.categoryId); } }}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  className={styles.catNameWrap}
                >
                  {isExpanded ? <DownOutlined className={styles.expandIcon} /> : <RightOutlined className={styles.expandIcon} />}
                  <span className={styles.catName}>{cat.categoryName}</span>
                </span>
                {!readOnly && (
                  <Tooltip title="添加商品">
                    <Button type="text" size="small" className={styles.addProductIcon} onClick={() => onAddProduct(customer.customerId, cat.categoryId, cat.categoryName)} icon={<PlusOutlined />} aria-label="添加商品" />
                  </Tooltip>
                )}
              </span>
              <span className={styles.colNum}>{formatCompactAmount(agg.lastMonthTarget)}</span>
              <span className={styles.colNum}>{formatCompactAmount(agg.actualAmountLastMonth)}</span>
              <span className={styles.colNum}>{formatAchievementRate(agg.actualAmountLastMonth, agg.lastMonthTarget)}</span>
              <span className={styles.colNum} style={{ color: lastMom.color }}>{lastMom.text}</span>
              <span className={styles.colTarget}>
                <span className={styles.catTotal}>
                  {agg.targetAmount > 0 ? formatCompactAmount(agg.targetAmount) : <span className={styles.noTarget}>未设置</span>}
                </span>
                {!readOnly && (
                  <Button size="small" className={styles.splitBtn} onClick={() => showSplitDialog(customer.customerId, cat.categoryId, agg.targetAmount)}>
                    <ScissorOutlined /> 拆分
                  </Button>
                )}
              </span>
              <span className={`${styles.colNum} ${growth > 0 ? styles.positive : growth < 0 ? styles.negative : ''}`}>{formatCompactAmount(growth)}</span>
              <span className={styles.colNum} style={{ color: expectedMom.color }}>{expectedMom.text}</span>
              <span className={styles.colRemark} />
            </div>

            {/* 商品行 */}
            {isExpanded && cat.products.map((product) => {
              const pLastMom = formatChangeRate(product.actualAmountLastMonth, product.actualAmountPrevMonth);
              const pGrowth = product.targetAmount - product.actualAmountLastMonth;
              const pExpectedMom = formatChangeRate(product.targetAmount, product.actualAmountLastMonth);

              return (
                <div key={product.productId} className={styles.productRow}>
                  <span className={styles.colName}>
                    <span className={styles.productIndent} />
                    {product.productName}
                    <span className={styles.unit}>({product.unit})</span>
                    {product.isPlannedNew && <Tag color="orange" className={styles.newTag}>新</Tag>}
                  </span>
                  <span className={styles.colNum}>{formatCompactAmount(product.lastMonthTarget)}</span>
                  <span className={styles.colNum}>{formatCompactAmount(product.actualAmountLastMonth)}</span>
                  <span className={styles.colNum}>{formatAchievementRate(product.actualAmountLastMonth, product.lastMonthTarget)}</span>
                  <span className={styles.colNum} style={{ color: pLastMom.color }}>{pLastMom.text}</span>
                  <span className={styles.colTarget}>
                    {readOnly ? (
                      <span>{formatCompactAmount(product.targetAmount, { zeroAs: '0' })}</span>
                    ) : (
                      <DebouncedInputNumber
                        prefix="¥"
                        value={product.targetAmount}
                        onChange={(v) => onUpdateProduct(customer.customerId, cat.categoryId, product.productId, 'targetAmount', v, product.unitPrice)}
                        size="small"
                        precision={0}
                        step={10000}
                        placeholder="目标"
                        className={styles.targetInput}
                      />
                    )}
                  </span>
                  <span className={`${styles.colNum} ${pGrowth > 0 ? styles.positive : pGrowth < 0 ? styles.negative : ''}`}>{formatCompactAmount(pGrowth)}</span>
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

export default React.memo(CategoryProductTable);
