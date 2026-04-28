/**
 * 结算单弹窗表格选择器
 * 用于客户授信申请的压单结算单多选，弹窗展示详细信息
 * 支持服务端分页和搜索，跨页选中保持
 */
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Modal, Table, Tag, Button, Input, message } from 'antd';
import { formatCurrency, formatDate } from '@/utils/format';
import { getSettlementOrdersPaged } from '@/services/api/oa-approval';
import type { ColumnType } from 'antd/es/table';
import styles from './SettlementOrderPicker.less';

/** 结算单原始数据结构 */
interface SettlementRecord {
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
  /** 已选中的结算单 ID 列表 */
  value?: number[];
  /** 选中变更回调 */
  onChange?: (value: number[], labels?: string[]) => void;
  /** 客户 ID，用于查询结算单 */
  consumerId?: string | number;
  /** 是否禁用 */
  disabled: boolean;
  /** 已选中项的缓存数据（来自 ErpFieldRenderer 初始加载的 options） */
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

/** 表格列定义 */
const TABLE_COLUMNS: ColumnType<SettlementRecord>[] = [
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

const PAGE_SIZE = 20;

const SettlementOrderPicker: React.FC<SettlementOrderPickerProps> = ({
  value = [], onChange, consumerId, disabled, cachedOptions = [],
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [draftKeys, setDraftKeys] = useState<number[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [dataSource, setDataSource] = useState<SettlementRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [tableLoading, setTableLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // 已选记录缓存：跨页选中保持，key=bizId, value=record
  // 初始化时从 cachedOptions 和 value 构建
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
      // 确保当前 value 中每项都有对应记录
      for (const opt of cachedOptions) {
        const bizId = (opt.raw as SettlementRecord).bizId;
        if (value.includes(opt.value as number) && !next.has(bizId)) {
          next.set(bizId, opt.raw as SettlementRecord);
        }
      }
      // 清除已不在 value 中的记录
      for (const [bizId] of next) {
        if (!value.includes(bizId)) {
          next.delete(bizId);
        }
      }
      return next;
    });
  }, [value, cachedOptions]);

  // 使用 selectedMap 展示已选中的标签
  const selectedRecords = useMemo(() => {
    return value.map(bizId => selectedMap.get(bizId)).filter(Boolean) as SettlementRecord[];
  }, [value, selectedMap]);

  const totalLeft = useMemo(() => computeTotalLeftAmount(selectedRecords), [selectedRecords]);

  /** 加载分页数据 */
  const fetchData = useCallback(async (page: number, keyword?: string) => {
    if (!consumerId) return;

    // 取消前一次请求
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setTableLoading(true);
    try {
      const result = await getSettlementOrdersPaged({
        consumerId,
        keyword: keyword || undefined,
        page,
        pageSize: PAGE_SIZE,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        const records = result.records as SettlementRecord[];
        setDataSource(records);
        setTotal(result.total);
        // 将当前页数据也加入 selectedMap 缓存（用于标签展示）
        setSelectedMap(prev => {
          const next = new Map(prev);
          for (const r of records) {
            if (!next.has(r.bizId)) {
              next.set(r.bizId, r);
            }
          }
          return next;
        });
      }
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      message.error('获取结算单列表失败');
    } finally {
      if (!controller.signal.aborted) {
        setTableLoading(false);
      }
    }
  }, [consumerId]);

  // 弹窗打开时加载第一页数据
  const openModal = () => {
    setDraftKeys([...value]);
    setSearchKeyword('');
    setCurrentPage(1);
    setModalOpen(true);
    fetchData(1);
  };

  // 弹窗关闭时清理
  const handleClose = () => {
    if (abortRef.current) abortRef.current.abort();
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setModalOpen(false);
  };

  const handleConfirm = () => {
    // 构建已选 bizId 对应的 bizStr 标签列表
    const labels = draftKeys
      .map(bizId => selectedMap.get(bizId)?.bizStr)
      .filter(Boolean) as string[];
    onChange?.(draftKeys, labels);
    setModalOpen(false);
  };

  const handleRemoveTag = (bizId: number) => {
    const newValue = value.filter((v) => v !== bizId);
    const labels = newValue
      .map(vid => selectedMap.get(vid)?.bizStr)
      .filter(Boolean) as string[];
    onChange?.(newValue, labels);
  };

  // 翻页
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchData(page, searchKeyword);
  };

  // 搜索防抖
  const handleSearchChange = (newKeyword: string) => {
    setSearchKeyword(newKeyword);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setCurrentPage(1);
      fetchData(1, newKeyword);
    }, 300);
  };

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  return (
    <>
      <div
        className={`${styles.triggerArea} ${disabled ? styles.disabled : ''}`}
        onClick={disabled ? undefined : openModal}
      >
        {value.length === 0 ? (
          <span className={styles.placeholder}>{disabled ? '请先选择客户' : '请选择结算单'}</span>
        ) : (
          <div className={styles.selectedTags}>
            {selectedRecords.map((r) => (
              <Tag key={r.bizId} closable={!disabled} onClose={() => handleRemoveTag(r.bizId)}>{r.bizStr}</Tag>
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
        title="选择压单结算单" open={modalOpen} width={1080}
        onCancel={handleClose}
        footer={
          <div className={styles.modalFooter}>
            <span>已选 {draftKeys.length} 条，共 {total} 条记录</span>
            <div>
              <Button onClick={handleClose}>取消</Button>
              <Button type="primary" onClick={handleConfirm} style={{ marginLeft: 8 }}>确定</Button>
            </div>
          </div>
        }
      >
        <Input.Search
          className={styles.modalSearch} placeholder="搜索结算单号或订单号"
          allowClear value={searchKeyword} onChange={(e) => handleSearchChange(e.target.value)}
          onSearch={(val) => { setCurrentPage(1); fetchData(1, val); }}
          loading={tableLoading}
        />
        <Table<SettlementRecord>
          rowKey="bizId" size="small" columns={TABLE_COLUMNS}
          dataSource={dataSource}
          scroll={{ y: 400 }}
          loading={tableLoading}
          rowSelection={{
            selectedRowKeys: draftKeys,
            onChange: (keys) => setDraftKeys(keys as number[]),
            // 跨页选中保持：切换页码时不清除已选
          }}
          pagination={{
            current: currentPage,
            pageSize: PAGE_SIZE,
            total,
            showSizeChanger: false,
            showTotal: (t) => `共 ${t} 条`,
            onChange: handlePageChange,
          }}
        />
      </Modal>
    </>
  );
};

export default SettlementOrderPicker;
