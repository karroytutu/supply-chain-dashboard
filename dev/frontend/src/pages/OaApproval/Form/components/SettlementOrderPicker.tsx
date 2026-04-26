/**
 * 结算单弹窗表格选择器
 * 用于客户授信申请的压单结算单多选，弹窗展示详细信息
 */
import React, { useState, useMemo } from 'react';
import { Modal, Table, Tag, Button, Input, Spin } from 'antd';
import { formatCurrency, formatDate } from '@/utils/format';
import type { ColumnType } from 'antd/es/table';
import styles from './SettlementOrderPicker.less';

/** 结算单原始数据结构 */
interface SettlementRecord {
  id: number;
  bizStr: string;
  bizOrderStr: string;
  totalAmount: string;
  paidAmount?: string;
  leftAmount: string;
  workTime: string;
  [key: string]: unknown;
}

interface SettlementOrderPickerProps {
  options: Array<{ label: string; value: unknown; raw: unknown }>;
  value?: number[];
  onChange?: (value: number[]) => void;
  loading: boolean;
  disabled: boolean;
}

/** 计算已结金额 */
function computeSettledAmount(totalAmount: string, leftAmount: string): string {
  return ((parseFloat(totalAmount) || 0) - (parseFloat(leftAmount) || 0)).toFixed(2);
}

/** 按 bizStr/bizOrderStr 过滤 */
function filterByKeyword(records: SettlementRecord[], keyword: string): SettlementRecord[] {
  if (!keyword.trim()) return records;
  const kw = keyword.toLowerCase();
  return records.filter(
    (r) => r.bizStr?.toLowerCase().includes(kw) || r.bizOrderStr?.toLowerCase().includes(kw)
  );
}

/** 根据 ID 列表查找对应选项 */
function getSelectedRecords(
  options: SettlementOrderPickerProps['options'],
  ids: number[]
): SettlementRecord[] {
  return ids
    .map((id) => options.find((opt) => opt.value === id)?.raw as SettlementRecord | undefined)
    .filter(Boolean) as SettlementRecord[];
}

/** 汇总剩余金额 */
function computeTotalLeftAmount(records: SettlementRecord[]): string {
  return records.reduce((sum, r) => sum + (parseFloat(r.leftAmount) || 0), 0).toFixed(2);
}

/** 表格列定义 */
const TABLE_COLUMNS: ColumnType<SettlementRecord>[] = [
  { title: '结算单号', dataIndex: 'bizStr', width: 180 },
  { title: '订单日期', dataIndex: 'workTime', width: 110, render: (v: string) => formatDate(v) || '-' },
  { title: '订单号', dataIndex: 'bizOrderStr', width: 160 },
  { title: '订单金额', dataIndex: 'totalAmount', width: 120, align: 'right', render: (v: string) => formatCurrency(v) },
  {
    title: '已结金额', key: 'settledAmount', width: 120, align: 'right',
    render: (_, record) => formatCurrency(record.paidAmount ?? computeSettledAmount(record.totalAmount, record.leftAmount)),
  },
  { title: '剩余金额', dataIndex: 'leftAmount', width: 120, align: 'right', render: (v: string) => formatCurrency(v) },
];

const SettlementOrderPicker: React.FC<SettlementOrderPickerProps> = ({
  options, value = [], onChange, loading, disabled,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [draftKeys, setDraftKeys] = useState<number[]>([]);
  const [filterKeyword, setFilterKeyword] = useState('');

  const selectedRecords = useMemo(() => getSelectedRecords(options, value), [options, value]);
  const totalLeft = useMemo(() => computeTotalLeftAmount(selectedRecords), [selectedRecords]);
  const filteredRecords = useMemo(() => {
    const records = options.map((opt) => opt.raw as SettlementRecord);
    return filterByKeyword(records, filterKeyword);
  }, [options, filterKeyword]);

  const openModal = () => { setDraftKeys([...value]); setFilterKeyword(''); setModalOpen(true); };
  const handleConfirm = () => { onChange?.(draftKeys); setModalOpen(false); };
  const handleRemoveTag = (id: number) => onChange?.(value.filter((v) => v !== id));

  return (
    <>
      <div
        className={`${styles.triggerArea} ${disabled ? styles.disabled : ''}`}
        onClick={disabled ? undefined : openModal}
      >
        {loading ? <Spin size="small" /> : value.length === 0 ? (
          <span className={styles.placeholder}>{disabled ? '请先选择客户' : '请选择结算单'}</span>
        ) : (
          <div className={styles.selectedTags}>
            {selectedRecords.map((r) => (
              <Tag key={r.id} closable={!disabled} onClose={() => handleRemoveTag(r.id)}>{r.bizStr}</Tag>
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

      <Modal
        title="选择压单结算单" open={modalOpen} width={920}
        onCancel={() => setModalOpen(false)}
        footer={
          <div className={styles.modalFooter}>
            <span>已选 {draftKeys.length} 条</span>
            <div>
              <Button onClick={() => setModalOpen(false)}>取消</Button>
              <Button type="primary" onClick={handleConfirm} style={{ marginLeft: 8 }}>确定</Button>
            </div>
          </div>
        }
      >
        <Input.Search
          className={styles.modalSearch} placeholder="搜索结算单号或订单号"
          allowClear value={filterKeyword} onChange={(e) => setFilterKeyword(e.target.value)}
        />
        <Table<SettlementRecord>
          rowKey="id" size="small" columns={TABLE_COLUMNS}
          dataSource={filteredRecords} pagination={false} scroll={{ y: 400 }}
          rowSelection={{ selectedRowKeys: draftKeys, onChange: (keys) => setDraftKeys(keys as number[]) }}
        />
      </Modal>
    </>
  );
};

export default SettlementOrderPicker;
