/**
 * 统一弹窗多选控件（modal_select 类型）
 * @module components/Oa/fields/ModalSelectControl
 *
 * 配置驱动的多选弹窗：
 * - 编辑模式：筛选条件区 + 表格搜索 + 分页 + 多选
 * - 只读模式：结构化小表格（编号+金额+合计行），从 formData._details 自动读取
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
  /** 表单类型定义中的默认查询参数，优先级最低，可被 cascadeParams 和 filterValues 覆盖 */
  defaultQueryParams?: Record<string, string | number | boolean>;
}

async function fetchModalData(params: FetchParams): Promise<{ records: Record<string, unknown>[]; total: number }> {
  const { searchApi, keyword, filterValues, cascadeParams, formData, signal, page, paginated, defaultQueryParams } = params;

  // 构建通用参数：默认参数（最低优先级）→ 级联参数 → 筛选参数 → 关键词
  const extraParams: Record<string, string> = {};
  if (defaultQueryParams) {
    for (const [k, v] of Object.entries(defaultQueryParams)) {
      extraParams[k] = String(v);
    }
  }
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

  // 通用 ERP 参考数据 API（paginated 时传递分页参数）
  const erpType = ERP_SEARCH_API_MAP[searchApi];
  if (!erpType) return { records: [], total: 0 };

  if (paginated) {
    extraParams.page = String(page);
    extraParams.pageSize = '50';
  }
  const result = await getErpReference(erpType, keyword || undefined, extraParams, signal);
  // 分页模式下后端返回 { records, total } 对象而非数组
  if (paginated && result && !Array.isArray(result) && 'records' in (result as object)) {
    const paged = result as { records: Record<string, unknown>[]; total: number };
    return { records: paged.records || [], total: paged.total || 0 };
  }
  const records = (result || []) as Record<string, unknown>[];
  return { records, total: records.length };
}

// =====================================================
// 筛选默认值计算
// =====================================================

/** 根据 filters 配置计算筛选默认值（如 date-range 的 last7days） */
function getFilterDefaults(filters?: ModalSelectFilter[]): Record<string, unknown> {
  if (!filters) return {};
  const defaults: Record<string, unknown> = {};
  for (const f of filters) {
    if (f.type === 'date-range' && f.defaultValue === 'last7days') {
      defaults[f.key] = [dayjs().subtract(7, 'day'), dayjs()];
    }
  }
  return defaults;
}

// =====================================================
// 筛选条件渲染
// =====================================================

function renderFilterControl(
  filter: ModalSelectFilter,
  value: unknown,
  onChange: (val: unknown, skipFetch?: boolean) => void,
  filterOptions: Record<string, { value: string; label: string }[]>,
  onKeywordSearch?: (val: string) => void,
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
            onChange={e => onChange(e.target.value, true)}
            onSearch={val => { onChange(val); onKeywordSearch?.(val); }}
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
            onChange={(val) => onChange(val)}
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
  mode, field, value, onChange, formData, fakeForm,
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
  // 记录当前页数据的 key 集合，用于跨页选中时区分"当前页"与"其他页"的选中项
  const prevPageKeysRef = useRef<Set<string>>(new Set());
  // 标记是否跳过下一次 filterValues 变化触发的自动 fetch（openModal 已自行处理）
  const skipNextFilterFetchRef = useRef(false);

  const searchApi = field.searchApi || '';

  // 初始化日期筛选默认值（组件挂载时）
  useEffect(() => {
    const defaults = getFilterDefaults(filters);
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

  // 构建 API 筛选参数（可接受外部传入的筛选值源，用于 openModal 首次调用时 state 尚未提交的场景）
  const buildApiFilterParams = useCallback((source?: Record<string, unknown>): Record<string, unknown> => {
    const values = source || filterValues;
    const params: Record<string, unknown> = {};
    if (!filters) return params;
    for (const f of filters) {
      const val = values[f.key];
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

  const fetchData = useCallback(async (kw: string, page: number = 1, overrideFilters?: Record<string, unknown>) => {
    // ═══ scopeFromField 模式：从另一字段的已选记录中客户端筛选 ═══
    if (field.scopeFromField && formData) {
      const scopeDetails = (formData._details as Record<string, unknown>)?.[field.scopeFromField];
      let records = (Array.isArray(scopeDetails) ? scopeDetails : []) as Record<string, unknown>[];

      // 客户端日期筛选
      if (filters) {
        for (const f of filters) {
          if (f.type === 'date-range') {
            const dates = filterValues[f.key] as [Dayjs, Dayjs] | null;
            if (dates && dates[0] && dates[1]) {
              const start = dates[0].format('YYYY-MM-DD');
              const end = dates[1].format('YYYY-MM-DD');
              records = records.filter(r => {
                const d = String(r.workTime || '').slice(0, 10);
                return d >= start && d <= end;
              });
            }
          }
        }
      }

      // 客户端关键词搜索
      if (kw) {
        const kwLower = kw.toLowerCase();
        records = records.filter(r =>
          String(r[labelKey] || '').toLowerCase().includes(kwLower)
        );
      }

      // 客户端分页
      const clientTotal = records.length;
      if (paginated) {
        const start = (page - 1) * 50;
        records = records.slice(start, start + 50);
      }

      setDataSource(records);
      setTotal(clientTotal);
      for (const r of records) {
        const key = String(r[valueKey]);
        if (!selectedMapRef.current.has(key)) {
          selectedMapRef.current.set(key, r);
        }
      }
      return;
    }

    if (!searchApi) return;

    // 级联参数前置校验：上游字段（如客户）为空时不发请求，避免后端返回 400
    if (field.cascadeParams && formData) {
      for (const [, formField] of Object.entries(field.cascadeParams)) {
        const val = formData[formField];
        if (val == null || val === '') {
          setDataSource([]);
          setTotal(0);
          return;
        }
      }
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setTableLoading(true);
    try {
      const result = await fetchModalData({
        searchApi,
        keyword: kw,
        filterValues: buildApiFilterParams(overrideFilters),
        cascadeParams: field.cascadeParams,
        formData,
        signal: controller.signal,
        page,
        paginated,
        defaultQueryParams: field.defaultQueryParams,
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
  }, [searchApi, buildApiFilterParams, field.cascadeParams, field.scopeFromField, formData, valueKey, paginated, labelKey, filters, filterValues]);

  const selectedRecords = useMemo(() => {
    return selectedIds
      .map(id => selectedMapRef.current.get(String(id)))
      .filter(Boolean) as Record<string, unknown>[];
  }, [selectedIds]);

  // 从 _details 读取持久化记录（控件重建后 selectedMapRef 为空时的兜底）
  // 用户在弹窗中确认选择时，系统已将完整记录（ID+名称等）存入 formData._details[field.key]
  const detailsRecords = useMemo(() => {
    if (selectedIds.length === 0) return [];
    const detailsData = (formData as Record<string, unknown> | undefined)?._details as Record<string, unknown> | undefined;
    const records = detailsData?.[field.key] as Record<string, unknown>[] | undefined;
    return records || [];
  }, [selectedIds, formData, field.key]);

  const openModal = () => {
    if (mode !== 'editable') return;

    // scopeFromField 前置校验：上游字段无选中数据时提示
    if (field.scopeFromField && formData) {
      const scopeDetails = (formData._details as Record<string, unknown>)?.[field.scopeFromField];
      if (!Array.isArray(scopeDetails) || scopeDetails.length === 0) {
        message.warning('请先选择单据后再操作');
        return;
      }
    }

    // 级联参数前置校验：上游字段为空时给出友好提示，阻止打开空弹窗
    if (field.cascadeParams && formData) {
      for (const [, formField] of Object.entries(field.cascadeParams)) {
        const val = formData[formField];
        if (val == null || val === '') {
          message.warning('请先选择客户后再选择单据');
          return;
        }
      }
    }

    setDraftKeys([...selectedIds]);
    setKeyword('');
    setCurrentPage(1);
    prevPageKeysRef.current = new Set();
    // 重置为筛选默认值（如近7天日期），而非清空为空对象
    const defaults = getFilterDefaults(filters);
    // 标记跳过 useEffect 的自动 fetch（本函数已直接调用 fetchData）
    skipNextFilterFetchRef.current = true;
    setFilterValues(defaults);
    setModalOpen(true);
    // 首次 fetch 直接传入默认值（setFilterValues 异步，state 尚未提交）
    if (searchApi || field.scopeFromField) fetchData('', 1, defaults);
  };

  const handleConfirm = () => {
    onChange?.(draftKeys);

    // 自动持久化：将选中记录的完整数据存入 formData._details[field.key]
    // 供详情页只读渲染 + auto 节点回调 + beforeSubmit 计算共用
    if (fakeForm) {
      const confirmedRecords = draftKeys
        .map(key => selectedMapRef.current.get(String(key)))
        .filter(Boolean);
      const existingDetails = (fakeForm.getFieldValue('_details') as Record<string, unknown>) || {};
      if (confirmedRecords.length > 0) {
        fakeForm.setFieldsValue({
          _details: { ...existingDetails, [field.key]: confirmedRecords },
        });
      } else {
        // 清空选择时移除对应记录
        const { [field.key]: _, ...rest } = existingDetails;
        fakeForm.setFieldsValue({ _details: rest });
      }
    }

    setModalOpen(false);
  };

  const handleFilterChange = (filterKey: string, val: unknown, skipFetch?: boolean) => {
    setFilterValues(prev => ({ ...prev, [filterKey]: val }));
    setCurrentPage(1);
    // keyword 类型只更新存储值，不触发 fetch（由 onSearch 回车/点击触发）
    // 非 keyword 类型的 fetch 由下方 useEffect 在 filterValues 提交后自动触发
  };

  const handleKeywordSearch = (kw: string) => {
    // 清除可能存在的延时定时器，避免 onChange 触发的空关键词请求取消正确请求
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setKeyword(kw);
    setCurrentPage(1);
    fetchData(kw);
  };

  // 筛选条件变化后自动触发 fetch（使用 useEffect 确保读到最新 state，避免闭包陈旧引用）
  useEffect(() => {
    if (!modalOpen) return;
    // openModal 已直接调用 fetchData，跳过本次自动触发
    if (skipNextFilterFetchRef.current) {
      skipNextFilterFetchRef.current = false;
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      if (searchApi || field.scopeFromField) fetchData(keyword);
    }, 300);
  }, [filterValues, modalOpen, searchApi, field.scopeFromField, fetchData, keyword]);

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

  /** 列数较多（>5）时启用横向滚动，否则自适应容器宽度 */
  const needScrollX = useMemo(() => {
    const cols = field.options ? staticColumns : tableColumns;
    return cols.length > 5;
  }, [field.options, tableColumns, staticColumns]);

  /** 表格横向滚动宽度（列宽之和 + 选择列 50px），仅在列数>5时使用 */
  const tableScrollX = useMemo(() => {
    const cols = field.options ? staticColumns : tableColumns;
    return cols.reduce((sum, c) => sum + (c.width as number || 150), 0) + 50;
  }, [field.options, tableColumns, staticColumns]);

  // 编辑模式变量（提前计算以满足 Hooks 规则）
  const isStaticMode = !!field.options;
  const displayColumns = isStaticMode ? staticColumns : tableColumns;
  const displayDataSource = isStaticMode
    ? staticFilteredOptions.map(o => ({ ...o, [valueKey]: o.value, [labelKey]: o.label }))
    : dataSource;
  const displayTotal = isStaticMode ? staticFilteredOptions.length : total;

  // 同步当前页数据的 key 集合（用于跨页选中合并）
  const currentPageDataKeys = useMemo(
    () => new Set(displayDataSource.map(r => String((r as Record<string, unknown>)[valueKey]))),
    [displayDataSource, valueKey],
  );
  prevPageKeysRef.current = currentPageDataKeys;

  /**
   * 跨页选中合并：Ant Design Table 的 onChange 只返回当前页 dataSource 中的选中 key，
   * 需要手动保留其他页的已选 key，避免翻页全选后丢失之前页的选中项。
   */
  const handleSelectionChange = useCallback((keys: React.Key[]) => {
    if (!paginated) {
      setDraftKeys(keys);
      return;
    }
    const pageKeys = prevPageKeysRef.current;
    // 保留不在当前页数据中的 key（来自其他页的选中项）
    const keptKeys = draftKeys.filter(k => !pageKeys.has(String(k)));
    setDraftKeys([...keptKeys, ...keys]);
  }, [paginated, draftKeys]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  // ==================== 只读模式 ====================
  if (mode === 'readonly') {
    // 从 formData._details 读取自动持久化的记录数据
    const detailsData = (formData as Record<string, unknown> | undefined)?._details as Record<string, unknown> | undefined;
    const records = detailsData?.[field.key] as Record<string, unknown>[] | undefined;

    if (records && records.length > 0) {
      return <ReadonlyTable records={records} labelKey={labelKey} amountKey={amountKey} />;
    }

    // 内存缓存（编辑态同一会话内可用）
    if (selectedRecords.length > 0) {
      return <ReadonlyTable records={selectedRecords} labelKey={labelKey} amountKey={amountKey} />;
    }

    if (selectedIds.length === 0) {
      return <Text type="secondary">-</Text>;
    }

    // 最终降级：显示原始 ID
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
          // 显示优先级：selectedRecords（内存缓存）→ detailsRecords（持久化兜底）→ 原始 ID
          <ReadonlyTable
            records={selectedRecords.length > 0 ? selectedRecords : detailsRecords.length > 0 ? detailsRecords : selectedIds.map(id => ({ [valueKey]: id }))}
            labelKey={selectedRecords.length > 0 ? labelKey : detailsRecords.length > 0 ? labelKey : valueKey}
            amountKey={amountKey}
          />
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
            {filters.map(f => renderFilterControl(
              f, filterValues[f.key],
              (val, skip) => handleFilterChange(f.key, val, skip),
              filterOptions,
              handleKeywordSearch,
            ))}
          </div>
        )}

        <Table<Record<string, unknown>>
          rowKey={(record) => String(record[valueKey])}
          size="small"
          columns={displayColumns}
          dataSource={displayDataSource}
          loading={tableLoading}
          scroll={{ ...(needScrollX ? { x: tableScrollX } : {}), y: 400 }}
          rowSelection={{
            selectedRowKeys: draftKeys.map(String),
            onChange: handleSelectionChange,
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
