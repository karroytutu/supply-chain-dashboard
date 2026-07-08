import { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useSearchParams } from 'umi';
import type { ApprovalInstance, ApprovalStatus, FormTypeDefinition } from '@/types/oa';
import { oaApi } from '@/services/api/oa';
import { createLogger } from '../../../../utils/logger';
const log = createLogger('OaData');

/** 合法的审批状态枚举，用于 URL 参数防御性校验 */
const VALID_STATUSES: ReadonlySet<string> = new Set<ApprovalStatus>([
  'pending', 'processing', 'approved', 'rejected', 'erp_failed', 'cancelled', 'withdrawn',
]);

/** 从 URL 参数安全解析 Dayjs 日期，无效值返回 null */
function safeParseDate(val: string | null): Dayjs | null {
  if (!val) return null;
  const d = dayjs(val, 'YYYY-MM-DD', true);
  return d.isValid() ? d : null;
}

/** 从 URL 参数安全解析正整数页码，无效值返回 1 */
function safeParsePage(val: string | null): number {
  if (!val) return 1;
  const n = parseInt(val, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** 从 URL 参数安全解析 pageSize，无效值返回 20 */
function safeParsePageSize(val: string | null): number {
  if (!val) return 20;
  const n = parseInt(val, 10);
  return Number.isFinite(n) && n >= 1 && n <= 100 ? n : 20;
}

interface UseDataListReturn {
  // 筛选状态
  formTypeCode: string | undefined;
  status: string | undefined;
  dateRange: [Dayjs, Dayjs] | null;
  searchText: string;
  applicantName: string;
  setFormTypeCode: (val: string | undefined) => void;
  setStatus: (val: string | undefined) => void;
  setDateRange: (val: [Dayjs, Dayjs] | null) => void;
  setSearchText: (val: string) => void;
  setApplicantName: (val: string) => void;

  // 数据状态
  loading: boolean;
  dataSource: ApprovalInstance[];
  formTypes: FormTypeDefinition[];
  pagination: { current: number; pageSize: number; total: number };

  // 操作方法
  loadData: () => Promise<void>;
  handleReset: () => void;
  handleExport: (type: 'excel' | 'pdf' | 'print') => Promise<void>;
  setPage: (page: number, pageSize: number) => void;
}

export function useDataList(): UseDataListReturn {
  const [searchParams, setSearchParams] = useSearchParams();

  // ── 从 URL 读取筛选状态（带防御性校验） ──
  const formTypeCode = searchParams.get('formType') || undefined;
  const statusRaw = searchParams.get('status');
  const status = statusRaw && VALID_STATUSES.has(statusRaw) ? statusRaw : undefined;
  // 日期：保留原始字符串用于 API 参数和 useCallback 依赖（避免每次渲染生成新数组引用）
  const startDateStr = searchParams.get('startDate') || '';
  const endDateStr = searchParams.get('endDate') || '';
  const dateStart = safeParseDate(searchParams.get('startDate'));
  const dateEnd = safeParseDate(searchParams.get('endDate'));
  const dateRange: [Dayjs, Dayjs] | null = dateStart && dateEnd ? [dateStart, dateEnd] : null;
  const searchText = searchParams.get('keyword') || '';
  const applicantName = searchParams.get('applicant') || '';

  // ── 分页从 URL 读取 ──
  const currentPage = safeParsePage(searchParams.get('page'));
  const pageSize = safeParsePageSize(searchParams.get('pageSize'));

  /** 更新 URL 参数（保留其他参数） */
  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next: Record<string, string> = {};
      searchParams.forEach((v, k) => { next[k] = v; });
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') {
          delete next[key];
        } else {
          next[key] = value;
        }
      });
      setSearchParams(next);
    },
    [searchParams, setSearchParams],
  );

  // ── setter 函数（写 URL） ──
  const setFormTypeCode = useCallback((val: string | undefined) => {
    updateParams({ formType: val ?? null, page: '1' });
  }, [updateParams]);

  const setStatus = useCallback((val: string | undefined) => {
    updateParams({ status: val ?? null, page: '1' });
  }, [updateParams]);

  const setDateRange = useCallback((val: [Dayjs, Dayjs] | null) => {
    updateParams({
      startDate: val ? val[0].format('YYYY-MM-DD') : null,
      endDate: val ? val[1].format('YYYY-MM-DD') : null,
      page: '1',
    });
  }, [updateParams]);

  const setSearchText = useCallback((val: string) => {
    updateParams({ keyword: val || null, page: '1' });
  }, [updateParams]);

  const setApplicantName = useCallback((val: string) => {
    updateParams({ applicant: val || null, page: '1' });
  }, [updateParams]);

  // ── 数据状态（非 URL，保留 useState） ──
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<ApprovalInstance[]>([]);
  const [formTypes, setFormTypes] = useState<FormTypeDefinition[]>([]);
  const [pagination, setPagination] = useState({
    current: currentPage,
    pageSize,
    total: 0,
  });

  // 同步 URL 分页参数到 pagination state（URL 变化时驱动）
  useEffect(() => {
    setPagination(prev => ({
      ...prev,
      current: currentPage,
      pageSize,
    }));
  }, [currentPage, pageSize]);

  // 加载表单类型
  const loadFormTypes = async () => {
    try {
      const res = await oaApi.getFormTypes();
      setFormTypes(res.data);
    } catch (error) {
      log.error('加载表单类型失败', error);
    }
  };

  // 加载数据（分页直接从 URL 读取，避免中间 state 导致瞬态不一致）
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        page: currentPage,
        pageSize,
        formTypeCode,
        status,
        applicantName,
        keyword: searchText,
      };

      if (startDateStr && endDateStr) {
        params.startDate = startDateStr;
        params.endDate = endDateStr;
      }

      const res = await oaApi.getDataList(params);
      setDataSource(res.data.list);
      setPagination((prev) => ({ ...prev, total: res.data.total }));
    } catch (error) {
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖稳定无需重复触发
  }, [currentPage, pageSize, formTypeCode, status, applicantName, searchText, startDateStr, endDateStr]);

  useEffect(() => {
    loadFormTypes();
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 导出处理
  const handleExport = async (type: 'excel' | 'pdf' | 'print') => {
    const params = {
      formTypeCode: formTypeCode || undefined,
      status: status || undefined,
      applicantName: applicantName || undefined,
      keyword: searchText || undefined,
      exportType: type,
      startDate: dateRange ? dateRange[0].format('YYYY-MM-DD') : undefined,
      endDate: dateRange ? dateRange[1].format('YYYY-MM-DD') : undefined,
    };

    try {
      message.loading({ content: '正在导出...', key: 'export' });
      const res = await oaApi.exportData(params);

      if (type === 'print') {
        const printWindow = window.open('', '_blank');
        if (printWindow && res.data.html) {
          printWindow.document.write(res.data.html);
          printWindow.document.close();
          printWindow.print();
        }
      } else {
        if (res.data.url) {
          window.open(res.data.url, '_blank');
        }
      }
      message.success({ content: '导出成功', key: 'export' });
    } catch (error) {
      message.error({ content: '导出失败', key: 'export' });
    }
  };

  // 重置筛选（清空所有 URL 参数）
  const handleReset = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  // 分页变更写入 URL
  const setPage = useCallback((page: number, newPageSize: number) => {
    updateParams({ page: String(page), pageSize: String(newPageSize) });
  }, [updateParams]);

  return {
    formTypeCode, status, dateRange, searchText, applicantName,
    setFormTypeCode, setStatus, setDateRange, setSearchText, setApplicantName,
    loading, dataSource, formTypes, pagination,
    loadData, handleReset, handleExport, setPage,
  };
}
