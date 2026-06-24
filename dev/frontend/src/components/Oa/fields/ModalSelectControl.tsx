/**
 * 统一弹窗多选控件（modal_select 类型）
 * @module components/Oa/fields/ModalSelectControl
 *
 * 配置驱动的多选弹窗：
 * - 编辑模式：筛选条件区 + 表格搜索 + 分页 + 多选
 * - 只读模式：结构化小表格（编号+金额+合计行），降级到 nameField/detailsField
 *
 * 数据源：searchApi（远程搜索）或 options（固定选项），二选一。
 * 筛选条件、列定义、级联参数全部从 field 配置读取。
 */
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Modal, Table, Input, DatePicker, Select, Space, Button, Typography, message } from 'antd';
import type { ColumnType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { getErpReference, getPurchaseSettlements } from '@/services/api/oa';
import { ERP_SEARCH_API_MAP } from '@/constants/oa-erp';
import { formatCurrency } from '@/utils/format';
import { resolveStoredName } from '../utils/resolveStoredName';
import type { FieldControlProps } from './types';
import type { ModalSelectFilter } from '@/types/oa';

const { Text } = Typography;
const { RangePicker } = DatePicker;

// =====================================================
// 数据获取
// =====================================================

interface FetchParams {
  searchApi: string;
  keyword: string;
  filterValues: Record<string, unknown>;
  cascadeParams?: Record<string, string>;
  formData?: Record<string, unknown>;
  signal: AbortSignal;
  page: number;
  paginated?: boolean;
}

async function fetchModalData(params: FetchParams): Promise<{ records: Record<string, unknown>[]; total: number }> {
  const { searchApi, keyword, filterValues, cascadeParams, formData, signal, page, paginated } = params;

  // 构建通用参数：级联参数 + 筛选参数
  const extraParams: Record<string, string> = {};
  if (cascadeParams && formData) {
    for (const [apiParam, formField] of Object.entries(cascadeParams)) {
      const val = formData[formField];
      if (val != null && val !== '') extraParams[apiParam] = String(val);
    }
  }
  for (const [key, val] of Object.entries(filterValues)) {
    if (val != null && val !== '') extraParams[key] = String(val);
  }
  if (keyword) extraParams.keyword = keyword;

  // purchase_settlements 使用独立的分页 API
  if (searchApi === 'purchase_settlements') {
    const result = await getPurchaseSettlements(
      {
        keyword: keyword || undefined,
        startDate: filterValues.startDate as string | undefined,
        endDate: filterValues.endDate as string | undefined,
        supplierId: filterValues.supplierId as string | undefined,
        page,
        pageSize: 50,
      },
      signal,
    );
    return { records: (result.records || []) as Record<string, unknown>[], total: result.total || 0 };
  }

  // 通用 ERP 参考数据 API
  const erpType = ERP_SEARCH_API_MAP[searchApi];
  if (!erpType) return { records: [], total: 0 };

  const records = await getErpReference(erpType, keyword || undefined, extraParams, signal);
  return { records: (records || []) as Record<string, unknown>[], total: records?.length || 0 };
}

// =====================================================
// 筛选条件渲染
// =====================================================

function renderFilterControl(
  filter: ModalSelectFilter,
  value: unknown,
  onChange: (val: unknown) => void,
  filterOptions: Record<string, { value: string; label: string }[]>,
) {
  const labelStyle: React.CSSProperties = { fontSize: 12, color: '#666', marginBottom: 4 };

  switch (filter.type) {
    case 'keyword':
      return (
        <div key={filter.key} style={{ display: 'flex', flexDirection: 'column' }}>
          {filter.placeholder && <div style={labelStyle}>{filter.placeholder.replace('搜索', '')}</div>}
          <Input.Search
            placeholder={filter.placeholder || '搜索'}
            allowClear
            value={value as string || ''}
            onChange={e => onChange(e.target.value)}
            onSearch={val => onChange(val)}
            style={{ width: 200 }}
          />
        </div>
      );
    case 'date-range': {
      const dates = value as [Dayjs, Dayjs] | null;
      return (
        <div key={filter.key} style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={labelStyle}>{filter.label}</div>
          <RangePicker
            value={dates}
            onChange={onChange as (dates: [Dayjs | null, Dayjs | null] | null) => void}
            presets={[{ label: '近7天', value: [dayjs().subtract(7, 'day'), dayjs()] }]}
            style={{ width: 260 }}
          />
        </div>
      );
    }
    case 'select':
      return (
        <div key={filter.key} style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={labelStyle}>{filter.label}</div>
          <Select
            showSearch
            allowClear
            placeholder={filter.placeholder || `选择${filter.label}`}
            options={filterOptions[filter.key] || []}
            value={value as string | undefined}
            onChange={onChange}
            filterOption={(input, option) =>
              String(option?.label || '').toLowerCase().includes(input.toLowerCase())
            }
            style={{ width: 200 }}
          />
        </div>
      );
    default:
      return null;
  }
}

// =====================================================
// 只读渲染：小表格
// =====================================================

function ReadonlyTable({
  records,
  labelKey,
  amountKey,
}: {
  records: Record<string, unknown>[];
  labelKey: string;
  amountKey?: string;
}) {
  if (records.length === 0) return <Text type="secondary">-</Text>;

  const total = amountKey
    ? records.reduce((s, r) => s + (parseFloat(String(r[amountKey] || 0))), 0)
    : 0;

  return (
    <table style={{ fontSize: 13, borderCollapse: 'collapse', width: '100%' }}>
      <tbody>
        {records.map((r, i) => (
          <tr key={i}>
            <td style={{ padding: '2px 8px 2px 0' }}>{String(r[labelKey] || '-')}</td>
            {amountKey && (
              <td style={{ padding: '2px 0', textAlign: 'right' }}>
                {formatCurrency(r[amountKey] as string | number)}
              </td>
            )}
          </tr>
        ))}
        {amountKey && records.length > 1 && (
          <tr>
            <td style={{ padding: '4px 8px 0 0', fontWeight: 500, borderTop: '1px solid #f0f0f0' }}>
              合计 ({records.length})
            </td>
            <td style={{ padding: '4px 0 0', fontWeight: 500, textAlign: 'right', borderTop: '1px solid #f0f0f0' }}>
              {formatCurrency(total)}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

// =====================================================
// 组件
// =====================================================

const ModalSelectControl: React.FC<FieldControlProps> = ({
  mode, field, value, onChange, formData, resolvedMap,
}) => {
  const { columns = [], valueKey = 'id', labelKey = 'name', amountKey, filters, paginated } = field;

  // 多选值标准化
  const selectedIds: unknown[] = useMemo(() => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value) return value.split(',').map(s => s.trim()).filter(Boolean);
    return [];
  }, [value]);

  const [modalOpen, setModalOpen] = useState(false);
  const [draftKeys, setDraftKeys] = useState<unknown[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, unknown>>({});
  const [keyword, setKeyword] = useState('');
  const [dataSource, setDataSource] = useState<Record<string, unknown>[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterOptions, setFilterOptions] = useState<Record<string, { value: string; label: string }[]>>({});

  const abortRef = useRef<AbortController | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const selectedMapRef = useRef<Map<string, Record<string, unknown>>>(new Map());

  const searchApi = field.searchApi || '';

  // 初始化日期筛选默认值
  useEffect(() => {
    if (!filters) return;
    const defaults: Record<string, unknown> = {};
    for (const f of filters) {
      if (f.type === 'date-range' && f.defaultValue === 'last7days') {
        defaults[`${f.key}_start`] = dayjs().subtract(7, 'day').format('YYYY-MM-DD');
        defaults[`${f.key}_end`] = dayjs().format('YYYY-MM-DD');
        defaults[f.key] = [dayjs().subtract(7, 'day'), dayjs()];
      }
    }
    if (Object.keys(defaults).length > 0) {
      setFilterValues(prev => ({ ...prev, ...defaults }));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 加载 select 类型筛选条件的选项
  useEffect(() => {
    if (!filters) return;
    for (const f of filters) {
      if (f.type === 'select' && f.searchApi) {
        const erpType = ERP_SEARCH_API_MAP[f.searchApi];
        if (erpType) {
          getErpReference(erpType, undefined, undefined).then(items => {
            const opts = (items || []).map(item => {
              const r = item as Record<string, unknown>;
              return { value: String(r.originId || r.id || r.value || ''), label: String(r.name || r.label || '') };
            });
            setFilterOptions(prev => ({ ...prev, [f.key]: opts }));
          }).catch(() => { /* 忽略 */ });
        }
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 构建 API 筛选参数
  const buildApiFilterParams = useCallback((): Record<string, unknown> => {
    const params: Record<string, unknown> = {};
    if (!filters) return params;
    for (const f of filters) {
      const val = filterValues[f.key];
      if (val == null || val === '') continue;
      if (f.type === 'date-range' && Array.isArray(val)) {
        const [start, end] = val as [Dayjs, Dayjs];
        if (start) params.startDate = start.format('YYYY-MM-DD');
        if (end) params.endDate = end.format('YYYY-MM-DD');
      } else if (f.type !== 'keyword') {
        params[f.key] = val;
      }
    }
    return params;
  }, [filters, filterValues]);

  const fetchData = useCallback(async (kw: string, page: number = 1) => {
    if (!searchApi) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setTableLoading(true);
    try {
      const result = await fetchModalData({
        searchApi,
        keyword: kw,
        filterValues: buildApiFilterParams(),
        cascadeParams: field.cascadeParams,
        formData,
        signal: controller.signal,
        page,
        paginated,
      });
      if (!controller.signal.aborted) {
        setDataSource(result.records);
        setTotal(result.total);
        for (const r of result.records) {
          const key = String(r[valueKey]);
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
  }, [searchApi, buildApiFilterParams, field.cascadeParams, formData, valueKey, paginated]);

  const selectedRecords = useMemo(() => {
    return selectedIds
      .map(id => selectedMapRef.current.get(String(id)))
      .filter(Boolean) as Record<string, unknown>[];
  }, [selectedIds]);

  const openModal = () => {
    if (mode !== 'editable') return;
    setDraftKeys([...selectedIds]);
    setKeyword('');
    setCurrentPage(1);
    setModalOpen(true);
    if (searchApi) fetchData('');
  };

  const handleConfirm = () => {
    onChange?.(draftKeys);
    setModalOpen(false);
  };

  const handleFilterChange = (filterKey: string, val: unknown) => {
    setFilterValues(prev => ({ ...prev, [filterKey]: val }));
    setCurrentPage(1);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchData(keyword), 300);
  };

  const handleKeywordSearch = (kw: string) => {
    setKeyword(kw);
    setCurrentPage(1);
    fetchData(kw);
  };

  // 静态选项过滤
  const staticFilteredOptions = useMemo(() => {
    if (!field.options) return [];
    let opts = field.options;
    if (keyword) {
      const kw = keyword.toLowerCase();
      opts = opts.filter(o => String(o.label).toLowerCase().includes(kw));
    }
    return opts;
  }, [field.options, keyword]);

  /** 默认列宽（根据 format 推断） */
  const defaultColWidth = (format?: string) => format === 'money' ? 120 : format === 'date' ? 110 : 150;

  // 表格列定义
  const tableColumns: ColumnType<Record<string, unknown>>[] = useMemo(() => {
    return columns.map(col => ({
      title: col.title,
      dataIndex: col.dataIndex,
      width: col.width || defaultColWidth(col.format),
      ellipsis: col.ellipsis,
      align: col.align,
      render: col.format === 'money'
        ? (v: unknown) => formatCurrency(v as string | number)
        : col.format === 'date'
          ? (v: unknown) => v ? String(v).slice(0, 10) : '-'
          : undefined,
    }));
  }, [columns]); // eslint-disable-line react-hooks/exhaustive-deps

  // 静态选项表格列
  const staticColumns: ColumnType<Record<string, unknown>>[] = useMemo(() => {
    if (field.options) {
      return [{ title: '选项', dataIndex: 'label', width: 200 }];
    }
    return tableColumns;
  }, [field.options, tableColumns]);

  /** 表格横向滚动宽度（列宽之和 + 选择列 50px） */
  const tableScrollX = useMemo(() => {
    const cols = field.options ? staticColumns : tableColumns;
    return cols.reduce((sum, c) => sum + (c.width as number || 150), 0) + 50;
  }, [field.options, tableColumns, staticColumns]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  // ==================== 只读模式 ====================
  if (mode === 'readonly') {
    if (selectedRecords.length === 0 && selectedIds.length === 0) {
      return <Text type="secondary">-</Text>;
    }

    // 优先使用缓存记录
    if (selectedRecords.length > 0) {
      return <ReadonlyTable records={selectedRecords} labelKey={labelKey} amountKey={amountKey} />;
    }

    // 降级：detailsField JSON 解析
    if (field.detailsField && formData?.[field.detailsField]) {
      try {
        const parsed = JSON.parse(String(formData[field.detailsField]));
        if (Array.isArray(parsed) && parsed.length > 0) {
          return <ReadonlyTable records={parsed} labelKey={labelKey} amountKey={amountKey} />;
        }
      } catch { /* 降级到下一步 */ }
    }

    // 降级：nameField
    const storedName = resolveStoredName(field.nameField, formData);
    if (storedName) {
      return (
        <table style={{ fontSize: 13, borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {storedName.split(', ').map((name, i) => (
              <tr key={i}><td style={{ padding: '2px 0' }}>{name}</td></tr>
            ))}
          </tbody>
        </table>
      );
    }

    // 降级：resolvedMap
    if (searchApi && resolvedMap) {
      const erpType = ERP_SEARCH_API_MAP[searchApi];
      if (erpType) {
        return (
          <table style={{ fontSize: 13, borderCollapse: 'collapse', width: '100%' }}>
            <tbody>
              {selectedIds.map((id, i) => (
                <tr key={i}>
                  <td style={{ padding: '2px 0' }}>{resolvedMap[`${erpType}:${id}`] || String(id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      }
    }

    // 最终降级
    return <Text>{Array.isArray(value) ? value.join(', ') : String(value)}</Text>;
  }

  // ==================== 编辑模式 ====================
  const isStaticMode = !!field.options;
  const displayColumns = isStaticMode ? staticColumns : tableColumns;
  const displayDataSource = isStaticMode
    ? staticFilteredOptions.map(o => ({ ...o, [valueKey]: o.value, [labelKey]: o.label }))
    : dataSource;
  const displayTotal = isStaticMode ? staticFilteredOptions.length : total;

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
          <ReadonlyTable records={selectedRecords} labelKey={labelKey} amountKey={amountKey} />
        )}
      </div>
      {selectedIds.length > 0 && (
        <div style={{ marginTop: 4, fontSize: 12, color: '#666' }}>
          已选 {selectedIds.length} 条
        </div>
      )}

      <Modal
        title={field.label || '选择'}
        open={modalOpen}
        width={760}
        onCancel={() => setModalOpen(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>已选 {draftKeys.length} 条{paginated ? `，共 ${total} 条记录` : ''}</span>
            <Space>
              <Button onClick={() => setModalOpen(false)}>取消</Button>
              <Button type="primary" onClick={handleConfirm}>确定</Button>
            </Space>
          </div>
        }
      >
        {/* 筛选条件区 */}
        {filters && filters.length > 0 && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 16,
            padding: '12px 16px',
            background: '#fafafa',
            borderRadius: 6,
            alignItems: 'flex-end',
          }}>
            {filters.map(f => renderFilterControl(f, filterValues[f.key], val => handleFilterChange(f.key, val), filterOptions))}
          </div>
        )}

        <Table<Record<string, unknown>>
          rowKey={valueKey}
          size="small"
          columns={displayColumns}
          dataSource={displayDataSource}
          loading={tableLoading}
          scroll={{ x: tableScrollX, y: 400 }}
          rowSelection={{
            selectedRowKeys: draftKeys.map(String),
            onChange: keys => setDraftKeys(keys),
          }}
          pagination={paginated && !isStaticMode ? {
            current: currentPage,
            pageSize: 50,
            total: displayTotal,
            showSizeChanger: false,
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (page) => {
              setCurrentPage(page);
              fetchData(keyword, page);
            },
          } : false}
        />
      </Modal>
    </>
  );
};

export default ModalSelectControl;
