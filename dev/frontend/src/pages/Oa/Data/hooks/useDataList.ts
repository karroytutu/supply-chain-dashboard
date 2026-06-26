import { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import type { ApprovalInstance, FormTypeDefinition } from '@/types/oa';
import { oaApi } from '@/services/api/oa';
import { createLogger } from '../../../../utils/logger';
const log = createLogger('OaData');

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

  // 加载表单类型
  const loadFormTypes = async () => {
    try {
      const res = await oaApi.getFormTypes();
      setFormTypes(res.data);
    } catch (error) {
      log.error('加载表单类型失败', error);
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

      const res = await oaApi.getDataList(params);
      setDataSource(res.data.list);
      setPagination((prev) => ({ ...prev, total: res.data.total }));
    } catch (error) {
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖稳定无需重复触发
  }, [pagination.current, pagination.pageSize, formTypeCode, status, applicantName, searchText, dateRange]);

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
    loadData, handleReset, handleExport,
  };
}
