/**
 * 弹窗多选搜索选择器
 * @module components/Oa/fields/SearchableModalPicker
 *
 * 独立的弹窗多选组件，供 TableFieldRenderer 使用。
 * 包含：远程搜索、筛选条件、分页、跨页选中、树形数据展开、scopeFromField 客户端过滤。
 *
 * 父组件只需控制 open/onConfirm/onCancel，无需关心内部状态管理。
 */
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Modal, Table, Select, Space, Button, message } from 'antd';
import type { ColumnType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { formatCurrency } from '@/utils/format';
import { getErpReference } from '@/services/api/oa';
import { isAbortError } from '@/services/api/request';
import { ERP_SEARCH_API_MAP } from '@/constants/oa-erp';
import { fetchModalData } from '../hooks/useModalFetch';
import { renderFilterControl, getFilterDefaults } from './FilterControls';
import type { FilterConfig, ModalColumnConfig } from '@/types/oa';

// =====================================================
// Props 接口
// =====================================================

export interface SearchableModalPickerProps {
  /** 弹窗标题 */
  title: string;
  /** 是否打开 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 确认回调：返回选中的 key 数组和对应的完整记录 */
  onConfirm: (keys: unknown[], records: Record<string, unknown>[]) => void;
  /** 当前已选中的 key 数组（打开时用于初始化 draft） */
  selectedKeys?: unknown[];
  /** 已选中记录的映射（key -> record），用于打开时预填充 selectedMapRef */
  selectedRecordMap?: Map<string, Record<string, unknown>>;
  /** 初始记录数组（模式一：value = 完整记录数组），用于预填充 selectedMapRef */
  initialRecords?: Record<string, unknown>[];

  // 来自 field 配置
  searchApi?: string;
  columns?: ModalColumnConfig[];
  valueKey?: string;
  labelKey?: string;
  filters?: FilterConfig[];
  paginated?: boolean;
  cascadeParams?: Record<string, string>;
  defaultQueryParams?: Record<string, string | number | boolean>;
  scopeFromField?: string;
  options?: Array<{ value: string | number; label: string }>;
  formData?: Record<string, unknown>;
}

// =====================================================
// 组件
// =====================================================

const SearchableModalPicker: React.FC<SearchableModalPickerProps> = ({
  title,
  open,
  onClose,
  onConfirm,
  selectedKeys = [],
  selectedRecordMap,
  initialRecords,
  searchApi = '',
  columns = [],
  valueKey = 'id',
  labelKey = 'name',
  filters,
  paginated,
  cascadeParams,
  defaultQueryParams,
  scopeFromField,
  options,
  formData,
}) => {
  const [draftKeys, setDraftKeys] = useState<unknown[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, unknown>>({});
  const [keyword, setKeyword] = useState('');
  const [dataSource, setDataSource] = useState<Record<string, unknown>[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterOptions, setFilterOptions] = useState<Record<string, { value: string; label: string }[]>>({});
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const selectedMapRef = useRef<Map<string, Record<string, unknown>>>(new Map());
  const prevPageKeysRef = useRef<Set<string>>(new Set());
  const openFilterDefaultsRef = useRef<Record<string, unknown>>({});

  // ═══ 弹窗打开时初始化状态 ═══
  useEffect(() => {
    if (!open) return;

    // 预填充 selectedMapRef
    // 优先使用 initialRecords（模式一：父组件的 value 就是完整记录数组）
    if (initialRecords && initialRecords.length > 0) {
      for (const r of initialRecords) {
        const key = String(r[valueKey]);
        if (!selectedMapRef.current.has(key)) {
          selectedMapRef.current.set(key, r);
        }
      }
    }
    // 兼容：如果父组件传入了 selectedRecordMap（旧接口），也预填充
    if (selectedRecordMap) {
      selectedRecordMap.forEach((record, key) => {
        if (!selectedMapRef.current.has(key)) {
          selectedMapRef.current.set(key, record);
        }
      });
    }

    setDraftKeys([...selectedKeys]);
    setKeyword('');
    setCurrentPage(1);
    setExpandedRowKeys([]);
    prevPageKeysRef.current = new Set();

    const defaults = getFilterDefaults(filters);
    openFilterDefaultsRef.current = defaults;  // 记录 open 时设定的引用，供 filterValues effect 跳过首次变更
    setFilterValues(defaults);

    // 首次 fetch
    if (searchApi || scopeFromField) {
      fetchDataRef.current('', 1, defaults);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // 初始化日期筛选默认值
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
          }).catch((err) => { console.warn(`加载筛选条件 ${f.key} 选项失败:`, err); });
        }
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 构建 API 筛选参数
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
    // scopeFromField 模式
    if (scopeFromField && formData) {
      const scopeDetails = (formData._details as Record<string, unknown>)?.[scopeFromField];
      let records = (Array.isArray(scopeDetails) ? scopeDetails : []) as Record<string, unknown>[];

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

      if (kw) {
        const kwLower = kw.toLowerCase();
        records = records.filter(r => String(r[labelKey] || '').toLowerCase().includes(kwLower));
      }

      const clientTotal = records.length;
      if (paginated) {
        const start = (page - 1) * 50;
        records = records.slice(start, start + 50);
      }

      setDataSource(records);
      setTotal(clientTotal);
      for (const r of records) {
        const key = String(r[valueKey]);
        if (!selectedMapRef.current.has(key)) selectedMapRef.current.set(key, r);
      }
      return;
    }

    if (!searchApi) return;

    // 级联参数前置校验
    if (cascadeParams && formData) {
      for (const [, formField] of Object.entries(cascadeParams)) {
        const val = formData[formField];
        if (val == null || val === '') { setDataSource([]); setTotal(0); return; }
      }
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setTableLoading(true);
    try {
      const result = await fetchModalData({
        searchApi, keyword: kw, filterValues: buildApiFilterParams(overrideFilters),
        cascadeParams, formData, signal: controller.signal, page, paginated, defaultQueryParams,
      });
      if (!controller.signal.aborted) {
        setDataSource(result.records);
        setTotal(result.total);
        for (const r of result.records) {
          const key = String(r[valueKey]);
          if (!selectedMapRef.current.has(key)) selectedMapRef.current.set(key, r);
        }
      }
    } catch (error: unknown) {
      if (isAbortError(error)) return;
      message.error('获取数据失败');
    } finally {
      if (!controller.signal.aborted) setTableLoading(false);
    }
  }, [searchApi, buildApiFilterParams, cascadeParams, scopeFromField, formData, valueKey, paginated, labelKey, filters, filterValues, defaultQueryParams]);

  // 保存 fetchData 引用以供 useEffect 中 open 回调使用
  const fetchDataRef = useRef(fetchData);
  fetchDataRef.current = fetchData;

  // 数据加载后自动展开所有父节点（树形数据）
  useEffect(() => {
    if (!dataSource.length) return;
    const parentKeys: string[] = [];
    const collectParentKeys = (nodes: Record<string, unknown>[]) => {
      for (const node of nodes) {
        const children = node.children as Record<string, unknown>[] | undefined;
        if (children && children.length > 0) {
          parentKeys.push(String(node[valueKey]));
          collectParentKeys(children);
        }
      }
    };
    collectParentKeys(dataSource);
    setExpandedRowKeys(parentKeys);
  }, [dataSource, valueKey]);

  // 筛选条件变化后自动触发 fetch
  useEffect(() => {
    if (!open) return;
    // 跳过 open effect 设定 defaults 引起的那次 filterValues 变化
    if (filterValues === openFilterDefaultsRef.current) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      if (searchApi || scopeFromField) fetchDataRef.current(keyword);
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchData 通过 fetchDataRef 访问最新引用，无需加入依赖
  }, [filterValues, open, searchApi, scopeFromField, keyword]);

  // 清理
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  // ═══ 事件处理 ═══

  const handleConfirm = () => {
    const confirmedRecords = draftKeys
      .map(key => selectedMapRef.current.get(String(key)))
      .filter(Boolean) as Record<string, unknown>[];
    onConfirm(draftKeys, confirmedRecords);
    onClose();
  };

  const handleFilterChange = (filterKey: string, val: unknown, _skipFetch?: boolean) => {
    setFilterValues(prev => ({ ...prev, [filterKey]: val }));
    setCurrentPage(1);
  };

  const handleKeywordSearch = (kw: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setKeyword(kw);
    setCurrentPage(1);
    fetchDataRef.current(kw);
  };

  // ═══ 表格计算 ═══

  const staticFilteredOptions = useMemo(() => {
    if (!options) return [];
    if (!keyword) return options;
    const kw = keyword.toLowerCase();
    return options.filter(o => String(o.label).toLowerCase().includes(kw));
  }, [options, keyword]);

  const defaultColWidth = (format?: string) => format === 'money' ? 120 : format === 'date' ? 110 : 150;

  const tableColumns: ColumnType<Record<string, unknown>>[] = useMemo(() => {
    return columns.map(col => ({
      title: col.title, dataIndex: col.dataIndex,
      width: col.width || defaultColWidth(col.format),
      ellipsis: col.ellipsis, align: col.align,
      render: col.format === 'money'
        ? (v: unknown) => formatCurrency(v as string | number)
        : col.format === 'date'
          ? (v: unknown) => v ? String(v).slice(0, 10) : '-'
          : undefined,
    }));
  }, [columns]); // eslint-disable-line react-hooks/exhaustive-deps

  const staticColumns: ColumnType<Record<string, unknown>>[] = useMemo(() => {
    if (options) return [{ title: '选项', dataIndex: 'label', width: 200 }];
    return tableColumns;
  }, [options, tableColumns]);

  const isStaticMode = !!options;
  const displayColumns = isStaticMode ? staticColumns : tableColumns;
  const displayDataSource = isStaticMode
    ? staticFilteredOptions.map(o => ({ ...o, [valueKey]: o.value, [labelKey]: o.label }))
    : dataSource;
  const displayTotal = isStaticMode ? staticFilteredOptions.length : total;

  const needScrollX = useMemo(() => {
    const cols = options ? staticColumns : tableColumns;
    return cols.length > 5;
  }, [options, tableColumns, staticColumns]);

  const tableScrollX = useMemo(() => {
    const cols = options ? staticColumns : tableColumns;
    return cols.reduce((sum, c) => sum + (c.width as number || 150), 0) + 50;
  }, [options, tableColumns, staticColumns]);

  const currentPageDataKeys = useMemo(
    () => new Set(displayDataSource.map(r => String((r as Record<string, unknown>)[valueKey]))),
    [displayDataSource, valueKey],
  );
  prevPageKeysRef.current = currentPageDataKeys;

  const handleSelectionChange = useCallback((keys: React.Key[]) => {
    if (!paginated) { setDraftKeys(keys); return; }
    const pageKeys = prevPageKeysRef.current;
    const keptKeys = draftKeys.filter(k => !pageKeys.has(String(k)));
    setDraftKeys([...keptKeys, ...keys]);
  }, [paginated, draftKeys]);

  // ═══ 渲染 ═══

  return (
    <Modal
      title={title}
      open={open}
      width={760}
      onCancel={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>已选 {draftKeys.length} 条{paginated ? `，共 ${total} 条记录` : ''}</span>
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" onClick={handleConfirm}>确定</Button>
          </Space>
        </div>
      }
    >
      {/* 筛选条件区 */}
      {filters && filters.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16,
          padding: '12px 16px', background: '#fafafa', borderRadius: 6, alignItems: 'flex-end',
        }}>
          {filters.map(f => renderFilterControl(
            f, filterValues[f.key],
            (val, skip) => handleFilterChange(f.key, val, skip),
            filterOptions, handleKeywordSearch,
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
        expandable={{
          expandedRowKeys,
          onExpand: (expanded, record) => {
            const key = String(record[valueKey]);
            setExpandedRowKeys(prev =>
              expanded ? [...prev, key] : prev.filter(k => k !== key)
            );
          },
        }}
        rowSelection={{
          selectedRowKeys: draftKeys.map(String),
          onChange: handleSelectionChange,
          getCheckboxProps: (record) => {
            const children = record.children as unknown[] | undefined;
            return { disabled: !!(children && children.length > 0) };
          },
        }}
        pagination={paginated && !isStaticMode ? {
          current: currentPage, pageSize: 50, total: displayTotal,
          showSizeChanger: false, showTotal: (t: number) => `共 ${t} 条`,
          onChange: (page) => { setCurrentPage(page); fetchDataRef.current(keyword, page); },
        } : false}
      />
    </Modal>
  );
};

export default SearchableModalPicker;
