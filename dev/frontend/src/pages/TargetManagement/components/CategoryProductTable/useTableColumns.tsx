/**
 * 品类商品表格 - 列定义 Hook
 * 提取 13 列表格列定义，减少组件文件体积
 */
import { useMemo, useState, useCallback } from 'react';
import { Button, Tag, Tooltip, Popover } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, SplitCellsOutlined, EditOutlined } from '@ant-design/icons';
import type { CustomerTarget, SplitMethod } from '@/types/target-management';
import { formatCompactAmount, formatChangeRate, formatAchievementRate } from '@/utils/format';
import DebouncedInputNumber from '../DebouncedInputNumber';
import SplitPopover from './SplitPopover';
import type { TableRow } from './useTreeData';
import styles from './index.less';

interface UseTableColumnsParams {
  customer: CustomerTarget | null;
  readOnly: boolean;
  onAddProduct: (customerId: number, categoryId: string, categoryName: string) => void;
  onSplit: (customerId: number, catId: string, method: SplitMethod, targetAmount: number) => void;
  onUpdateProduct: (customerId: number, catId: string, prodId: string, field: 'targetAmount' | 'remark', value: number | string) => void;
  onUpdateCategoryRemark: (customerId: number, catId: string, remark: string) => void;
}

export function useTableColumns({
  customer, readOnly, onAddProduct, onSplit, onUpdateProduct, onUpdateCategoryRemark,
}: UseTableColumnsParams) {
  const [splitOpenCatId, setSplitOpenCatId] = useState<string | null>(null);
  const [remarkModal, setRemarkModal] = useState<{
    visible: boolean; customerId: number; catId: string; prodId: string; value: string;
  }>({ visible: false, customerId: 0, catId: '', prodId: '', value: '' });

  const handleRemarkSave = useCallback((cid: number, catId: string, prodId: string, value: string) => {
    prodId ? onUpdateProduct(cid, catId, prodId, 'remark', value) : onUpdateCategoryRemark(cid, catId, value);
  }, [onUpdateProduct, onUpdateCategoryRemark]);

  const columns: ColumnsType<TableRow> = useMemo(() => [
    {
      title: '名称', key: 'name', width: 280, fixed: 'left',
      render: (_: unknown, record: TableRow) => {
        if (record.rowType === 'category') {
          return (
            <span className={styles.colNameCell}>
              <span className={styles.catName}>{record.categoryName}</span>
              {!readOnly && (
                <Tooltip title="添加商品">
                  <Button type="text" size="small" className={styles.addProductIcon}
                    onClick={(e) => { e.stopPropagation(); onAddProduct(customer!.customerId, record.categoryId, record.categoryName!); }}
                    icon={<PlusOutlined />} aria-label="添加商品" />
                </Tooltip>
              )}
            </span>
          );
        }
        const p = record.product!;
        return (
          <span className={styles.colNameCell}>
            <span className={styles.productIndent} />
            {p.productName}
            {p.isPlannedNew && <Tag color="orange" className={styles.newTag}>新</Tag>}
          </span>
        );
      },
    },
    {
      title: '上月目标', key: 'lastMonthTarget', width: 100, align: 'right',
      render: (_: unknown, r: TableRow) => {
        const v = r.rowType === 'category' ? r.agg!.lastMonthTarget : r.product!.lastMonthTarget;
        return <span className={styles.numCell}>{formatCompactAmount(v)}</span>;
      },
    },
    {
      title: '上月实际', key: 'actualLastMonth', width: 100, align: 'right',
      render: (_: unknown, r: TableRow) => {
        const v = r.rowType === 'category' ? r.agg!.actualAmountLastMonth : r.product!.actualAmountLastMonth;
        return <span className={styles.numCell}>{formatCompactAmount(v)}</span>;
      },
    },
    {
      title: '上月达成', key: 'achievement', width: 100, align: 'right',
      render: (_: unknown, r: TableRow) => {
        if (r.rowType === 'category') return <span className={styles.numCell}>{formatAchievementRate(r.agg!.actualAmountLastMonth, r.agg!.lastMonthTarget)}</span>;
        return <span className={styles.numCell}>{formatAchievementRate(r.product!.actualAmountLastMonth, r.product!.lastMonthTarget)}</span>;
      },
    },
    {
      title: '上月环比', key: 'lastMom', width: 100, align: 'right',
      render: (_: unknown, r: TableRow) => {
        if (r.rowType === 'category') return <span className={styles.numCell} style={{ color: r.agg!.lastMom.color }}>{r.agg!.lastMom.text}</span>;
        const mom = formatChangeRate(r.product!.actualAmountLastMonth, r.product!.actualAmountPrevMonth);
        return <span className={styles.numCell} style={{ color: mom.color }}>{mom.text}</span>;
      },
    },
    {
      title: '本月目标', key: 'targetAmount', width: 200, align: 'right',
      render: (_: unknown, r: TableRow) => {
        if (r.rowType === 'category') {
          const agg = r.agg!;
          return (
            <span className={styles.targetCell}>
              <span className={styles.catTotal}>
                {agg.targetAmount > 0 ? formatCompactAmount(agg.targetAmount) : <span className={styles.noTarget}>未设置</span>}
              </span>
              {!readOnly && (
                <Popover
                  content={<SplitPopover customerId={customer!.customerId} catId={r.categoryId} currentTotal={agg.targetAmount} onSplit={onSplit} onClose={() => setSplitOpenCatId(null)} />}
                  trigger="click" placement="bottomRight"
                  open={splitOpenCatId === r.categoryId}
                  onOpenChange={(open) => setSplitOpenCatId(open ? r.categoryId : null)}
                >
                  <Tooltip title="拆分到商品">
                    <Button type="text" size="small" className={styles.splitIcon}
                      icon={<SplitCellsOutlined />} aria-label="拆分"
                      onClick={(e) => e.stopPropagation()} />
                  </Tooltip>
                </Popover>
              )}
            </span>
          );
        }
        const p = r.product!;
        return (
          <span className={styles.targetCell}>
            {readOnly
              ? <span>{formatCompactAmount(p.targetAmount, { zeroAs: '0' })}</span>
              : <DebouncedInputNumber prefix="¥" value={p.targetAmount}
                  onChange={(v) => onUpdateProduct(customer!.customerId, r.categoryId, p.productId, 'targetAmount', v)}
                  size="small" precision={0} step={10000} placeholder="目标" className={styles.targetInput} />}
          </span>
        );
      },
    },
    {
      title: '预计增长', key: 'growth', width: 100, align: 'right',
      render: (_: unknown, r: TableRow) => {
        const g = r.rowType === 'category' ? r.agg!.growth : r.product!.targetAmount - r.product!.actualAmountLastMonth;
        return <span className={`${styles.numCell} ${g > 0 ? styles.positive : g < 0 ? styles.negative : ''}`}>{formatCompactAmount(g)}</span>;
      },
    },
    {
      title: '预计环比', key: 'expectedMom', width: 100, align: 'right',
      render: (_: unknown, r: TableRow) => {
        if (r.rowType === 'category') return <span className={styles.numCell} style={{ color: r.agg!.expectedMom.color }}>{r.agg!.expectedMom.text}</span>;
        const mom = formatChangeRate(r.product!.targetAmount, r.product!.actualAmountLastMonth);
        return <span className={styles.numCell} style={{ color: mom.color }}>{mom.text}</span>;
      },
    },
    {
      title: '毛利率', key: 'grossMarginRate', width: 72, align: 'right',
      render: (_: unknown, r: TableRow) => {
        if (r.rowType === 'category') {
          const a = r.agg!;
          return <span className={styles.numCellSmall}>{a.targetAmount > 0 ? `${(a.estimatedGrossProfit / a.targetAmount * 100).toFixed(1)}%` : '-'}</span>;
        }
        return <span className={styles.numCellSmall}>{r.product!.grossMarginRate > 0 ? `${(r.product!.grossMarginRate * 100).toFixed(1)}%` : '-'}</span>;
      },
    },
    {
      title: '预计毛利', key: 'estimatedGrossProfit', width: 100, align: 'right',
      render: (_: unknown, r: TableRow) => {
        if (r.rowType === 'category') return <span className={styles.numCell}>{formatCompactAmount(Math.round(r.agg!.estimatedGrossProfit * 100) / 100)}</span>;
        return <span className={styles.numCell}>{formatCompactAmount(Math.round(r.product!.targetAmount * r.product!.grossMarginRate * 100) / 100)}</span>;
      },
    },
    {
      title: '基准提成', key: 'baseCommission', width: 72, align: 'right',
      render: (_: unknown, r: TableRow) => {
        const v = r.rowType === 'category' ? r.agg!.commission.baseCommission : r.productCommission!.baseCommission;
        return <span className={styles.numCellSmall}>{formatCompactAmount(v)}</span>;
      },
    },
    {
      title: '增量提成', key: 'incrementCommission', width: 72, align: 'right',
      render: (_: unknown, r: TableRow) => {
        const v = r.rowType === 'category' ? r.agg!.commission.incrementCommission : r.productCommission!.incrementCommission;
        return <span className={styles.numCellSmall}>{formatCompactAmount(v)}</span>;
      },
    },
    {
      title: '说明', key: 'remark', width: 80, align: 'center',
      render: (_: unknown, r: TableRow) => {
        const remark = r.rowType === 'category' ? r.categoryRemark : r.product!.remark;
        const prodId = r.rowType === 'product' ? r.product!.productId : '';
        return (
          <span className={remark ? styles.remarkTrigger : styles.remarkEmpty}
            onClick={(e) => {
              e.stopPropagation();
              setRemarkModal({ visible: true, customerId: customer!.customerId, catId: r.categoryId, prodId, value: remark || '' });
            }}>
            {remark || (readOnly ? '-' : <><EditOutlined /> 填写</>)}
          </span>
        );
      },
    },
  ], [readOnly, splitOpenCatId, customer, onAddProduct, onSplit, onUpdateProduct]);

  return { columns, splitOpenCatId, setSplitOpenCatId, remarkModal, setRemarkModal, handleRemarkSave };
}
