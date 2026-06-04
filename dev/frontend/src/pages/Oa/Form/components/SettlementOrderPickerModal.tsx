/**
 * 结算单弹窗选择面板
 * 包含搜索、表格和分页，支持跨页选中
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Modal, Table, Button, Input, message } from 'antd';
import { getSettlementOrdersPaged } from '@/services/api/oa';
import { type SettlementRecord, TABLE_COLUMNS, PAGE_SIZE } from './SettlementOrderPicker';
import styles from './SettlementOrderPicker.less';

interface SettlementOrderPickerModalProps {
  open: boolean;
  consumerId?: string | number;
  /** 初始选中的 bizId 列表 */
  initialKeys: number[];
  /** 已选记录缓存 */
  selectedMap: Map<number, SettlementRecord>;
  /** 更新已选记录缓存 */
  onSelectedMapUpdate: (updater: (prev: Map<number, SettlementRecord>) => Map<number, SettlementRecord>) => void;
  onConfirm: (keys: number[]) => void;
  onClose: () => void;
}

const SettlementOrderPickerModal: React.FC<SettlementOrderPickerModalProps> = ({
  open, consumerId, initialKeys, selectedMap, onSelectedMapUpdate, onConfirm, onClose,
}) => {
  const [draftKeys, setDraftKeys] = useState<number[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [dataSource, setDataSource] = useState<SettlementRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [tableLoading, setTableLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  /** 加载分页数据 */
  const fetchData = useCallback(async (page: number, keyword?: string) => {
    if (!consumerId) return;

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
        // 将当前页数据加入缓存
        onSelectedMapUpdate(prev => {
          const next = new Map(prev);
          for (const r of records) {
            if (!next.has(r.bizId)) next.set(r.bizId, r);
          }
          return next;
        });
      }
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      message.error('获取结算单列表失败');
    } finally {
      if (!controller.signal.aborted) setTableLoading(false);
    }
  }, [consumerId, onSelectedMapUpdate]);

  // 弹窗打开时初始化并加载数据
  useEffect(() => {
    if (open) {
      setDraftKeys([...initialKeys]);
      setSearchKeyword('');
      setCurrentPage(1);
      fetchData(1);
    }
    return () => {
      if (!open) {
        if (abortRef.current) abortRef.current.abort();
        if (searchTimer.current) clearTimeout(searchTimer.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖稳定无需重复触发
  }, [open]);

  const handleClose = () => {
    if (abortRef.current) abortRef.current.abort();
    if (searchTimer.current) clearTimeout(searchTimer.current);
    onClose();
  };

  const handleConfirm = () => {
    onConfirm(draftKeys);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchData(page, searchKeyword);
  };

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
    <Modal
      title="选择压单结算单" open={open} width={1080}
      className={styles.settlementModal}
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
      <div className={styles.tableWrapper}>
        <Table<SettlementRecord>
          rowKey="bizId" size="small" columns={TABLE_COLUMNS}
          dataSource={dataSource}
          scroll={{ x: 800 }}
          loading={tableLoading}
          rowSelection={{
            selectedRowKeys: draftKeys,
            onChange: (keys) => setDraftKeys(keys as number[]),
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
      </div>
    </Modal>
  );
};

export default SettlementOrderPickerModal;
