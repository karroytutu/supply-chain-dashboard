/**
 * ERP 多选弹窗表格选择器（统一控件）
 * @module components/Oa/fields/ErpMultiSelectModal
 *
 * 所有 ERP 多选控件的统一实现：
 * - 编辑模式：点击外框打开弹窗 → 表格搜索+分页+多选 → 确认
 * - 只读模式：结构化小表格展示（编号+金额）
 *
 * 通过 field.searchApi + 配置适配不同 ERP 数据源。
 */
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Modal, Table, Input, Tag, Space, Button, Typography, message } from 'antd';
import type { ColumnType } from 'antd/es/table';
import { getErpReference } from '@/services/api/oa';
import { getPurchaseSettlements } from '@/services/api/oa';
import { ERP_SEARCH_API_MAP, ERP_LABEL_FIELDS, ERP_VALUE_FIELDS } from '@/constants/oa-erp';
import { formatCurrency } from '@/utils/format';
import type { FieldControlProps } from './types';

const { Text } = Typography;

// =====================================================
// 数据源配置
// =====================================================

/** 每种 ERP 多选类型的列定义和金额字段 */
interface ErpMultiConfig {
  /** 弹窗标题 */
  title: string;
  /** 表格列定义 */
  columns: ColumnType<Record<string, unknown>>[];
  /** 值字段（选中后存储的 ID） */
  valueKey: string;
  /** 显示字段（Tag/小表格主列） */
  labelKey: string;
  /** 金额字段（小表格第二列，可选） */
  amountKey?: string;
  /** 是否使用分页 API（purchase_settlement_multi 专用） */
  paginated?: boolean;
  /** 搜索框占位符 */
  searchPlaceholder?: string;
}

/** 根据 field.type 或 field.searchApi 获取配置 */
function getErpMultiConfig(field: FieldControlProps['field']): ErpMultiConfig | null {
  const searchApi = field.searchApi;
  const erpType = searchApi ? ERP_SEARCH_API_MAP[searchApi] : null;

  // purchase_settlement_multi 使用独立的分页 API
  if (field.type === 'purchase_settlement_multi') {
    return {
      title: '选择采购结算单',
      columns: [
        { title: '单据日期', dataIndex: 'workTime', width: 100, render: (v: unknown) => v ? String(v).slice(0, 10) : '-' },
        { title: '采购单号', dataIndex: 'bizStr', width: 150 },
        { title: '供应商', dataIndex: 'supplierName', width: 160, ellipsis: true },
        { title: '结算金额', dataIndex: 'settleAmount', width: 110, align: 'right', render: (v: unknown) => formatCurrency(v as string | number) },
        { title: '仓库', dataIndex: 'warehouseName', width: 100, ellipsis: true },
      ],
      valueKey: 'billStr',
      labelKey: 'bizStr',
      amountKey: 'settleAmount',
      paginated: true,
      searchPlaceholder: '搜索结算单号/采购单号',
    };
  }

  if (!erpType) return null;

  const labelKey = ERP_LABEL_FIELDS[erpType] || 'name';
  const valueKey = ERP_VALUE_FIELDS[erpType] || 'id';

  // 预付款
  if (erpType === 'prepayments') {
    return {
      title: '选择预付款单',
      columns: [
        { title: '单据编号', dataIndex: 'paidBillStr', width: 160 },
        { title: '金额', dataIndex: 'amount', width: 110, align: 'right', render: (v: unknown) => formatCurrency(v as string | number) },
        { title: '供应商', dataIndex: 'supplierName', width: 160, ellipsis: true },
      ],
      valueKey,
      labelKey,
      amountKey: 'amount',
      searchPlaceholder: '搜索单据编号',
    };
  }

  // 供应商收入单
  if (erpType === 'supplier-incomes') {
    return {
      title: '选择供应商收入单',
      columns: [
        { title: '单据编号', dataIndex: 'billStr', width: 160 },
        { title: '金额', dataIndex: 'amount', width: 110, align: 'right', render: (v: unknown) => formatCurrency(v as string | number) },
      ],
      valueKey,
      labelKey,
      amountKey: 'amount',
      searchPlaceholder: '搜索单据编号',
    };
  }

  // 通用配置（结算单等）
  return {
    title: `选择${field.label || ''}`,
    columns: [
      { title: '编号', dataIndex: labelKey, width: 180 },
    ],
    valueKey,
    labelKey,
    searchPlaceholder: '搜索',
  };
}

// =====================================================
// 数据获取
// =====================================================

async function fetchErpData(
  config: ErpMultiConfig,
  searchApi: string,
  keyword: string,
  cascadeValue: unknown,
  signal: AbortSignal,
  page: number = 1,
): Promise<{ records: Record<string, unknown>[]; total: number }> {
  // purchase_settlement_multi 使用独立的分页 API
  if (config.paginated) {
    const result = await getPurchaseSettlements(
      { keyword: keyword || undefined, page, pageSize: 50 },
      signal,
    );
    return { records: (result.records || []) as Record<string, unknown>[], total: result.total || 0 };
  }

  // 通用 ERP 参考数据 API
  const erpType = ERP_SEARCH_API_MAP[searchApi];
  if (!erpType) return { records: [], total: 0 };

  const extraParams: Record<string, string> = {};
  if (cascadeValue) {
    extraParams.consumerId = String(cascadeValue);
  }

  const records = await getErpReference(erpType, keyword || undefined, extraParams, signal);
  return { records: (records || []) as Record<string, unknown>[], total: records?.length || 0 };
}

// =====================================================
// 组件
// =====================================================

const ErpMultiSelectModal: React.FC<FieldControlProps> = ({
  mode, field, value, onChange, formData, resolvedMap,
}) => {
  const config = useMemo(() => getErpMultiConfig(field), [field]);

  // 多选值标准化
  const selectedIds: unknown[] = useMemo(() => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value) return value.split(',').map(s => s.trim()).filter(Boolean);
    return [];
  }, [value]);

  const [modalOpen, setModalOpen] = useState(false);
  const [draftKeys, setDraftKeys] = useState<unknown[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [dataSource, setDataSource] = useState<Record<string, unknown>[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  const abortRef = useRef<AbortController | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  /** 已选记录缓存 */
  const selectedMapRef = useRef<Map<string, Record<string, unknown>>>(new Map());

  const cascadeValue = field.cascadeFrom ? formData?.[field.cascadeFrom] : undefined;
  const searchApi = field.searchApi || '';

  const fetchData = useCallback(async (keyword: string, page: number = 1) => {
    if (!config || !searchApi) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setTableLoading(true);
    try {
      const result = await fetchErpData(config, searchApi, keyword, cascadeValue, controller.signal, page);
      if (!controller.signal.aborted) {
        setDataSource(result.records);
        setTotal(result.total);
        // 缓存当前页数据
        for (const r of result.records) {
          const key = String(r[config.valueKey]);
          if (!selectedMapRef.current.has(key)) {
            selectedMapRef.current.set(key, r);
          }
        }
      }
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      message.error('获取数据失败');
    } finally {
      if (!controller.signal.aborted) setTableLoading(false);
    }
  }, [config, searchApi, cascadeValue]);

  /** 已选记录 */
  const selectedRecords = useMemo(() => {
    if (!config) return [];
    return selectedIds
      .map(id => selectedMapRef.current.get(String(id)))
      .filter(Boolean) as Record<string, unknown>[];
  }, [selectedIds, config]);

  const openModal = () => {
    if (mode !== 'editable' || !config) return;
    setDraftKeys([...selectedIds]);
    setSearchKeyword('');
    setCurrentPage(1);
    setModalOpen(true);
    fetchData('');
  };

  const handleConfirm = () => {
    onChange?.(draftKeys);
    setModalOpen(false);
  };

  const handleSearch = (kw: string) => {
    setSearchKeyword(kw);
    setCurrentPage(1);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchData(kw, 1), 300);
  };

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  if (!config) {
    return <Text type="secondary">-</Text>;
  }

  // ==================== 只读模式：结构化小表格 ====================
  if (mode === 'readonly') {
    if (selectedRecords.length === 0 && selectedIds.length === 0) {
      return <Text type="secondary">-</Text>;
    }

    // 优先使用缓存记录渲染
    if (selectedRecords.length > 0) {
      return (
        <table style={{ fontSize: 13, borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {selectedRecords.map((r, i) => (
              <tr key={i}>
                <td style={{ padding: '2px 8px 2px 0' }}>{String(r[config.labelKey] || r[config.valueKey])}</td>
                {config.amountKey && (
                  <td style={{ padding: '2px 0', textAlign: 'right' }}>{formatCurrency(r[config.amountKey] as string | number)}</td>
                )}
              </tr>
            ))}
            {config.amountKey && selectedRecords.length > 1 && (
              <tr>
                <td style={{ padding: '4px 8px 0 0', fontWeight: 500, borderTop: '1px solid #f0f0f0' }}>
                  合计 ({selectedRecords.length})
                </td>
                <td style={{ padding: '4px 0 0', fontWeight: 500, textAlign: 'right', borderTop: '1px solid #f0f0f0' }}>
                  {formatCurrency(selectedRecords.reduce((s, r) => s + (parseFloat(String(r[config.amountKey!] || 0))), 0))}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      );
    }

    // 降级：使用 resolvedMap 或原始值
    const erpType = searchApi ? ERP_SEARCH_API_MAP[searchApi] : null;
    if (erpType) {
      return (
        <div>
          {selectedIds.map((id, i) => {
            const cacheKey = `${erpType}:${id}`;
            const label = resolvedMap?.[cacheKey] || String(id);
            return <Tag key={i}>{label}</Tag>;
          })}
        </div>
      );
    }
    return <Text>{Array.isArray(value) ? value.join(', ') : String(value)}</Text>;
  }

  // ==================== 编辑模式 ====================
  return (
    <>
      <div
        style={{
          minHeight: 32,
          border: '1px solid #d9d9d9',
          borderRadius: 6,
          padding: '4px 8px',
          cursor: 'pointer',
          background: '#fff',
        }}
        onClick={openModal}
      >
        {selectedIds.length === 0 ? (
          <span style={{ color: '#bfbfbf' }}>请选择</span>
        ) : (
          <table style={{ fontSize: 13, borderCollapse: 'collapse', width: '100%' }}>
            <tbody>
              {selectedRecords.map((r, i) => (
                <tr key={i}>
                  <td style={{ padding: '2px 8px 2px 0' }}>{String(r[config.labelKey] || r[config.valueKey])}</td>
                  {config.amountKey && (
                    <td style={{ padding: '2px 0', textAlign: 'right' }}>{formatCurrency(r[config.amountKey] as string | number)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {selectedIds.length > 0 && (
        <div style={{ marginTop: 4, fontSize: 12, color: '#666' }}>
          已选 {selectedIds.length} 条
        </div>
      )}

      <Modal
        title={config.title}
        open={modalOpen}
        width={720}
        onCancel={() => setModalOpen(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>已选 {draftKeys.length} 条，共 {total} 条记录</span>
            <Space>
              <Button onClick={() => setModalOpen(false)}>取消</Button>
              <Button type="primary" onClick={handleConfirm}>确定</Button>
            </Space>
          </div>
        }
      >
        <Input.Search
          placeholder={config.searchPlaceholder || '搜索'}
          allowClear
          value={searchKeyword}
          onChange={e => handleSearch(e.target.value)}
          onSearch={val => fetchData(val)}
          style={{ marginBottom: 12, maxWidth: 300 }}
        />
        <Table<Record<string, unknown>>
          rowKey={config.valueKey}
          size="small"
          columns={config.columns}
          dataSource={dataSource}
          loading={tableLoading}
          scroll={{ y: 400 }}
          rowSelection={{
            selectedRowKeys: draftKeys.map(String),
            onChange: keys => setDraftKeys(keys),
          }}
          pagination={config.paginated ? {
            current: currentPage,
            pageSize: 50,
            total,
            showSizeChanger: false,
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (page) => {
              setCurrentPage(page);
              fetchData(searchKeyword, page);
            },
          } : false}
        />
      </Modal>
    </>
  );
};

export default ErpMultiSelectModal;
