/**
 * 结算单弹窗表格选择器
 * 用于客户授信申请的压单结算单多选，弹窗展示详细信息
 * 支持服务端分页和搜索，跨页选中保持
 */
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Tag, Button } from 'antd';
import { formatCurrency, formatDate } from '@/utils/format';
import type { ColumnType } from 'antd/es/table';
import SettlementOrderPickerModal from './SettlementOrderPickerModal';
import styles from './SettlementOrderPicker.less';

/** 结算单原始数据结构 */
export interface SettlementRecord {
  id: number;
  /** 结算单业务ID（update-hoard API 使用此ID标记压单） */
  bizId: number;
  bizStr: string;
  bizOrderStr: string;
  totalAmount: string;
  paidAmount?: string;
  leftAmount: string;
  workTime: string;
  [key: string]: unknown;
}

interface SettlementOrderPickerProps {
  value?: number[];
  onChange?: (value: number[], labels?: string[], records?: SettlementRecord[]) => void;
  consumerId?: string | number;
  disabled: boolean;
  cachedOptions?: Array<{ label: string; value: unknown; raw: unknown }>;
}

/** 计算已结金额 */
function computeSettledAmount(totalAmount: string, leftAmount: string): string {
  return ((parseFloat(totalAmount) || 0) - (parseFloat(leftAmount) || 0)).toFixed(2);
}

/** 汇总剩余金额 */
function computeTotalLeftAmount(records: SettlementRecord[]): string {
  return records.reduce((sum, r) => sum + (parseFloat(r.leftAmount) || 0), 0).toFixed(2);
}

/** 表格列定义（共享给 Modal 组件） */
export const TABLE_COLUMNS: ColumnType<SettlementRecord>[] = [
  { title: '结算单号', dataIndex: 'bizStr', width: 180 },
  { title: '订单日期', dataIndex: 'workTime', width: 110, render: (v: string) => formatDate(v) || '-' },
  { title: '订单号', dataIndex: 'bizOrderStr', width: 160 },
  { title: '订单备注', dataIndex: 'bizOrderNote', width: 140, ellipsis: true, render: (v: string) => v || '-' },
  { title: '订单金额', dataIndex: 'totalAmount', width: 120, align: 'right', render: (v: string) => formatCurrency(v) },
  {
    title: '已结金额', key: 'settledAmount', width: 120, align: 'right',
    render: (_, record) => formatCurrency(record.paidAmount ?? computeSettledAmount(record.totalAmount, record.leftAmount)),
  },
  { title: '剩余金额', dataIndex: 'leftAmount', width: 120, align: 'right', render: (v: string) => formatCurrency(v) },
];

export const PAGE_SIZE = 20;

const SettlementOrderPicker: React.FC<SettlementOrderPickerProps> = ({
  value = [], onChange, consumerId, disabled, cachedOptions = [],
}) => {
  const [modalOpen, setModalOpen] = useState(false);

  // 已选记录缓存：跨页选中保持
  const [selectedMap, setSelectedMap] = useState<Map<number, SettlementRecord>>(() => {
    const map = new Map<number, SettlementRecord>();
    for (const opt of cachedOptions) {
      if (value.includes(opt.value as number)) {
        const raw = opt.raw as SettlementRecord;
        map.set(raw.bizId, raw);
      }
    }
    return map;
  });

  // 当外部 value 或 cachedOptions 变化时同步 selectedMap
  useEffect(() => {
    setSelectedMap(prev => {
      const next = new Map(prev);
      for (const opt of cachedOptions) {
        const bizId = (opt.raw as SettlementRecord).bizId;
        if (value.includes(opt.value as number) && !next.has(bizId)) {
          next.set(bizId, opt.raw as SettlementRecord);
        }
      }
      for (const [bizId] of next) {
        if (!value.includes(bizId)) next.delete(bizId);
      }
      return next;
    });
  }, [value, cachedOptions]);

  const selectedRecords = useMemo(() => {
    return value.map(bizId => selectedMap.get(bizId)).filter(Boolean) as SettlementRecord[];
  }, [value, selectedMap]);

  const totalLeft = useMemo(() => computeTotalLeftAmount(selectedRecords), [selectedRecords]);

  const handleSelectedMapUpdate = useCallback(
    (updater: (prev: Map<number, SettlementRecord>) => Map<number, SettlementRecord>) => {
      setSelectedMap(updater);
    }, []
  );

  const handleConfirm = (draftKeys: number[]) => {
    const records = draftKeys
      .map(bizId => selectedMap.get(bizId))
      .filter(Boolean) as SettlementRecord[];
    const labels = records.map(r => r.bizStr);
    onChange?.(draftKeys, labels, records);
    setModalOpen(false);
  };

  const handleRemoveTag = (bizId: number) => {
    const newValue = value.filter((v) => v !== bizId);
    const records = newValue
      .map(vid => selectedMap.get(vid))
      .filter(Boolean) as SettlementRecord[];
    const labels = records.map(r => r.bizStr);
    onChange?.(newValue, labels, records);
  };

  return (
    <>
      <div
        className={`${styles.triggerArea} ${disabled ? styles.disabled : ''}`}
        onClick={disabled ? undefined : () => setModalOpen(true)}
      >
        {value.length === 0 ? (
          <span className={styles.placeholder}>{disabled ? '请先选择客户' : '请选择结算单'}</span>
        ) : (
          <div className={styles.selectedTags}>
            {selectedRecords.map((r) => (
              <Tag key={r.bizId} closable={!disabled} onClose={() => handleRemoveTag(r.bizId)}>{r.bizStr} ({formatCurrency(r.leftAmount)})</Tag>
            ))}
          </div>
        )}
        {!disabled && <Button type="link" size="small" className={styles.selectBtn}>选择</Button>}
      </div>
      {value.length > 0 && (
        <div className={styles.summary}>
          已选 {value.length} 单，剩余金额合计 {formatCurrency(totalLeft)}
        </div>
      )}

      <SettlementOrderPickerModal
        open={modalOpen}
        consumerId={consumerId}
        initialKeys={value}
        selectedMap={selectedMap}
        onSelectedMapUpdate={handleSelectedMapUpdate}
        onConfirm={handleConfirm}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
};

export default SettlementOrderPicker;
