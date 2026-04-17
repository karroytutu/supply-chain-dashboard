import { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import type { ApprovalInstance, FormTypeDefinition } from '@/types/oa-approval';
import { oaApprovalApi } from '@/services/api/oa-approval';

interface DataStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
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
  setPagination: React.Dispatch<React.SetStateAction<{ current: number; pageSize: number; total: number }>>;

  // 统计数据
  stats: DataStats;

  // 操作方法
  loadData: () => Promise<void>;
  handleReset: () => void;
  handleExport: (type: 'excel' | 'pdf' | 'print') => Promise<void>;
}

export function useDataList(): UseDataListReturn {
  // 筛选状态
  const [formTypeCode, setFormTypeCode] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [searchText, setSearchText] = useState('');
  const [applicantName, setApplicantName] = useState('');

  // 数据状态
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<ApprovalInstance[]>([]);
  const [formTypes, setFormTypes] = useState<FormTypeDefinition[]>([]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
  });

  // 统计数据
  const [stats, setStats] = useState<DataStats>({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  });

  // 加载表单类型
  const loadFormTypes = async () => {
    try {
      const res = await oaApprovalApi.getFormTypes();
      setFormTypes(res.data);
    } catch (error) {
      console.error('加载表单类型失败', error);
    }
  };

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        page: pagination.current,
        pageSize: pagination.pageSize,
        formTypeCode,
        status,
        applicantName,
        keyword: searchText,
      };

      if (dateRange) {
        params.startDate = dateRange[0].format('YYYY-MM-DD');
        params.endDate = dateRange[1].format('YYYY-MM-DD');
      }

      const res = await oaApprovalApi.getDataList(params);
      setDataSource(res.data.list);
      setPagination((prev) => ({ ...prev, total: res.data.total }));
    } catch (error) {
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  }, [pagination.current, pagination.pageSize, formTypeCode, status, applicantName, searchText, dateRange]);

  // 加载统计
  const loadStats = async () => {
    try {
      const res = await oaApprovalApi.getStats();
      setStats(res.data);
    } catch (error) {
      console.error('加载统计失败', error);
    }
  };

  useEffect(() => {
    loadFormTypes();
    loadStats();
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
      const res = await oaApprovalApi.exportData(params);

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

  // 重置筛选
  const handleReset = () => {
    setFormTypeCode(undefined);
    setStatus(undefined);
    setDateRange(null);
    setSearchText('');
    setApplicantName('');
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  return {
    formTypeCode, status, dateRange, searchText, applicantName,
    setFormTypeCode, setStatus, setDateRange, setSearchText, setApplicantName,
    loading, dataSource, formTypes, pagination, setPagination,
    stats,
    loadData, handleReset, handleExport,
  };
}
