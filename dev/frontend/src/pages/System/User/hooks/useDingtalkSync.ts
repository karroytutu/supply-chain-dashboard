/**
 * 钉钉同步状态 Hook
 * 管理同步 Tab 的数据获取和操作
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  getSyncStatus,
  getSyncLogs,
  triggerFullSync,
  type SyncLogRecord,
  type SyncStatus,
} from '@/services/api/dingtalk-sync';

interface UseDingtalkSyncReturn {
  syncStatus: SyncStatus | null;
  logs: SyncLogRecord[];
  logsTotal: number;
  logsPage: number;
  logsPageSize: number;
  loading: boolean;
  syncing: boolean;
  logStatusFilter: string | undefined;
  logTypeFilter: string | undefined;
  fetchSyncStatus: () => Promise<void>;
  fetchLogs: () => Promise<void>;
  handleTriggerFullSync: () => Promise<{ success: boolean; message?: string }>;
  handleLogsPageChange: (page: number, pageSize: number) => void;
  setLogStatusFilter: (status: string | undefined) => void;
  setLogTypeFilter: (type: string | undefined) => void;
  detailLog: SyncLogRecord | null;
  setDetailLog: (log: SyncLogRecord | null) => void;
}

export function useDingtalkSync(): UseDingtalkSyncReturn {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [logs, setLogs] = useState<SyncLogRecord[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [logsPageSize, setLogsPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [logStatusFilter, setLogStatusFilter] = useState<string | undefined>();
  const [logTypeFilter, setLogTypeFilter] = useState<string | undefined>();
  const [detailLog, setDetailLog] = useState<SyncLogRecord | null>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval>>();

  // 获取同步状态
  const fetchSyncStatus = useCallback(async () => {
    try {
      const res = await getSyncStatus();
      setSyncStatus(res.data);
    } catch {
      // 静默失败
    }
  }, []);

  // 获取同步日志
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSyncLogs({
        page: logsPage,
        pageSize: logsPageSize,
        status: logStatusFilter,
        sync_type: logTypeFilter,
      });
      setLogs(res.data);
      setLogsTotal(res.total);
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
    }
  }, [logsPage, logsPageSize, logStatusFilter, logTypeFilter]);

  // 触发全量同步
  const handleTriggerFullSync = useCallback(async (): Promise<{ success: boolean; message?: string }> => {
    if (syncing) return { success: false, message: '同步进行中' };
    setSyncing(true);
    try {
      await triggerFullSync();
      // 刷新状态和日志
      await fetchSyncStatus();
      await fetchLogs();
      return { success: true };
    } catch (error: any) {
      return { success: false, message: error.message || '同步异常' };
    } finally {
      setSyncing(false);
    }
  }, [syncing, fetchSyncStatus, fetchLogs]);

  // 日志分页变更
  const handleLogsPageChange = useCallback((page: number, pageSize: number) => {
    setLogsPage(page);
    setLogsPageSize(pageSize);
  }, []);

  // 初始化加载同步状态和日志
  useEffect(() => {
    fetchSyncStatus();
    fetchLogs();
  }, [fetchSyncStatus, fetchLogs, logsPage, logsPageSize, logStatusFilter, logTypeFilter]);

  // 如果正在同步，启动轮询
  useEffect(() => {
    if (syncStatus?.is_running) {
      pollingRef.current = setInterval(fetchSyncStatus, 5000);
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = undefined;
      }
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [syncStatus?.is_running, fetchSyncStatus]);

  // 同步完成时刷新日志
  useEffect(() => {
    if (syncStatus && !syncStatus.is_running) {
      fetchLogs();
    }
  }, [syncStatus?.is_running]);

  return {
    syncStatus,
    logs,
    logsTotal,
    logsPage,
    logsPageSize,
    loading,
    syncing,
    logStatusFilter,
    logTypeFilter,
    fetchSyncStatus,
    fetchLogs,
    handleTriggerFullSync,
    handleLogsPageChange,
    setLogStatusFilter,
    setLogTypeFilter,
    detailLog,
    setDetailLog,
  };
}
