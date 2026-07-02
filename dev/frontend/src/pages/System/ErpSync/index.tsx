/**
 * ERP 数据同步管理页面
 * 状态表格 + 可展开子行 + 折叠日志区
 */
import { useState, useEffect, useCallback } from 'react';
import { Card, Tag, Button, Table, Space, message, Tooltip, Collapse } from 'antd';
import {
  ReloadOutlined,
  ThunderboltOutlined,
  RightOutlined,
} from '@ant-design/icons';
import {
  getSyncStatus,
  getSyncLog,
  forceSync,
  resetCircuit,
  type SyncStatusItem,
  type SyncLogItem,
  type SyncWindow,
  type WindowStatusItem,
} from '@/services/api/erp-sync';
import { Authorized } from '@/components/Authorized';
import { PERMISSIONS } from '@/constants/permissions';
import styles from './index.less';

// =====================================================
// 常量与映射
// =====================================================

// 日志表格的名称回退映射（日志 API 不返回 name 字段，仅用于日志展示）
const LOG_SOURCE_NAME_MAP: Record<string, string> = {
  debts: '客户欠款',
  products: '商品档案',
  inventory: '实时库存',
  batch_inventory: '批次库存',
  customers: '客户档案',
  sales: '销售明细',
};

const WINDOW_NAME_MAP: Record<string, string> = {
  hot: '热窗口',
  warm: '温窗口',
  cold: '冷窗口',
  all: '全部历史',
};

const WINDOW_DESC_MAP: Record<string, string> = {
  hot: '近7天',
  warm: '8-60天',
  cold: '60天前',
};

const CIRCUIT_CONFIG: Record<string, { color: string; text: string }> = {
  closed: { color: 'green', text: '正常' },
  open: { color: 'red', text: '熔断' },
  'half-open': { color: 'orange', text: '恢复中' },
};

const LOG_STATUS_CONFIG: Record<string, { color: string; text: string }> = {
  success: { color: 'green', text: '成功' },
  failed: { color: 'red', text: '失败' },
  partial: { color: 'orange', text: '部分成功' },
  'circuit-open': { color: 'orange', text: '熔断跳过' },
};

const SNAPSHOT_INTERVAL_MS = 120_000;

// =====================================================
// 工具函数
// =====================================================

function formatDuration(ms: number | null): string {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const formatTime = (iso: string | null) => {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  } catch {
    return iso;
  }
};

function getRelativeTime(iso: string | null): string {
  if (!iso) return '从未同步';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}小时前`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}天前`;
}

function getNextSyncForSnapshot(lastSuccessAt: string | null): string {
  if (!lastSuccessAt) return '-';
  const next = new Date(lastSuccessAt).getTime() + SNAPSHOT_INTERVAL_MS;
  const diffMs = next - Date.now();
  if (diffMs <= 0) return '即将执行';
  const diffSec = Math.ceil(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}秒后`;
  return `${Math.ceil(diffSec / 60)}分钟后`;
}

/**
 * 获取当前北京时间的日期和时间组件
 * 后端调度器使用 Asia/Shanghai 时区，前端推算下次同步时间也需基于北京时间
 */
function getBeijingNow(): { dayOfWeek: number; hour: number; day: number; month: number; year: number } {
  // 使用 Intl.DateTimeFormat 获取北京时间的各组件，避免依赖浏览器本地时区
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dayOfWeek: weekdayMap[get('weekday')] ?? 0,
    hour: parseInt(get('hour'), 10) % 24,
    day: parseInt(get('day'), 10),
    month: parseInt(get('month'), 10) - 1, // 0-indexed，与 Date.getMonth() 一致
    year: parseInt(get('year'), 10),
  };
}

function getNextWarmSync(): string {
  const { dayOfWeek, hour } = getBeijingNow();

  let daysUntilMonday = (8 - dayOfWeek) % 7; // 周一=0, 周二=6, 周日=1

  // 周一且已过 03:00 -> 等下周一
  if (daysUntilMonday === 0 && hour >= 3) daysUntilMonday = 7;

  if (daysUntilMonday === 0) return '今天 03:00';
  if (daysUntilMonday === 1) return '明天 03:00';
  return `${daysUntilMonday}天后 (周一 03:00)`;
}

function getNextColdSync(): string {
  const { day, hour, month, year } = getBeijingNow();
  if (day === 1 && hour < 4) return '今天 04:00';
  if (day < 15 || (day === 15 && hour < 4)) return `${15 - day}天后 (15号 04:00)`;
  // 使用 Date.UTC 计算天数差，完全避免浏览器本地时区干扰
  const todayMidnight = Date.UTC(year, month, day);
  const nextMonthTs = Date.UTC(year, month + 1, 1);
  const diffDays = Math.ceil((nextMonthTs - todayMidnight) / 86400000);
  return `${diffDays}天后 (下月1号 04:00)`;
}

/** 获取销售明细各窗口的下次同步推算 */
function getWindowNextSync(windowType: string, lastSuccessAt: string | null): string {
  switch (windowType) {
    case 'hot': return getNextSyncForSnapshot(lastSuccessAt);
    case 'warm': return getNextWarmSync();
    case 'cold': return getNextColdSync();
    default: return '-';
  }
}

/** 兜底生成全部3个窗口行（后端未返回的窗口也显示，保证操作按钮可用） */
function ensureAllWindows(windows: WindowStatusItem[]): WindowStatusItem[] {
  const existing = new Map(windows.map(w => [w.window, w]));
  const allWindows: WindowStatusItem[] = (['hot', 'warm', 'cold'] as const).map(w =>
    existing.get(w) || {
      window: w as 'hot' | 'warm' | 'cold',
      last_success_at: null,
      last_duration_ms: null,
      last_status: null,
      total_records: 0,
    }
  );
  return allWindows;
}

/** 获取销售明细父行的"上次同步"（取所有窗口中最近一次） */
function getLatestWindowSync(item: SyncStatusItem): { time: string | null; relative: string } {
  const ws = ensureAllWindows(item.windows_status || []);
  let latest: string | null = null;
  for (const w of ws) {
    if (w.last_success_at) {
      if (!latest || new Date(w.last_success_at).getTime() > new Date(latest).getTime()) {
        latest = w.last_success_at;
      }
    }
  }
  // fallback to item.last_success_at if no window data
  const final = latest || item.last_success_at;
  return { time: final, relative: getRelativeTime(final) };
}

/** 计算销售明细所有窗口的数据总量合计 */
function getWindowTotalSum(windows: WindowStatusItem[]): number {
  return ensureAllWindows(windows).reduce((sum, w) => sum + (w.total_records || 0), 0);
}

// =====================================================
// 组件
// =====================================================

export default function ErpSync() {
  const [statuses, setStatuses] = useState<SyncStatusItem[]>([]);
  const [logs, setLogs] = useState<SyncLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingKeys, setActionLoadingKeys] = useState<Set<string>>(new Set());

  const addActionLoading = (key: string) => {
    setActionLoadingKeys(prev => new Set(prev).add(key));
  };
  const removeActionLoading = (key: string) => {
    setActionLoadingKeys(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const loadStatus = useCallback(async () => {
    try {
      const data = await getSyncStatus();
      setStatuses(data);
    } catch { /* ignore */ }
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      const data = await getSyncLog({ limit: 50 });
      setLogs(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadStatus(), loadLogs()]).finally(() => setLoading(false));
  }, [loadStatus, loadLogs]);

  const handleForceSync = async (sourceId: string, window?: SyncWindow) => {
    const key = `sync-${sourceId}-${window || 'default'}`;
    addActionLoading(key);
    try {
      const result = await forceSync(sourceId, window);
      if (result.success) {
        message.success(`同步完成: 拉取 ${result.recordsFetched} 条, 写入 ${result.recordsUpserted} 条, 耗时 ${formatDuration(result.durationMs)}`);
      } else {
        message.error(`同步失败: ${result.error || '未知错误'}`);
      }
      await loadStatus();
      await loadLogs();
    } catch (error: any) {
      message.error(error?.message || '同步失败');
    } finally {
      removeActionLoading(key);
    }
  };

  const handleResetCircuit = async (sourceId: string) => {
    const key = `reset-${sourceId}`;
    addActionLoading(key);
    try {
      await resetCircuit(sourceId);
      message.success(`熔断器已重置: ${sourceId}`);
      await loadStatus();
    } catch (error: any) {
      message.error(error?.message || '重置失败');
    } finally {
      removeActionLoading(key);
    }
  };

  // ---- 主表格列定义 ----

  const columns = [
    {
      title: '数据集',
      dataIndex: 'source_id',
      key: 'source_id',
      width: 140,
      render: (_v: string, record: any) => <span style={{ fontWeight: 500 }}>{record.name || record.source_id}</span>,
    },
    {
      title: '状态',
      dataIndex: 'circuit_state',
      key: 'circuit_state',
      width: 80,
      render: (v: string) => {
        const cfg = CIRCUIT_CONFIG[v] || CIRCUIT_CONFIG.closed;
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: '数据总量',
      dataIndex: 'total_records',
      key: 'total_records',
      width: 110,
      render: (v: number, record: SyncStatusItem) => {
        if (record.source_id === 'sales') {
          const sum = getWindowTotalSum(record.windows_status || []);
          return sum > 0 ? `${sum.toLocaleString()} 条` : '-';
        }
        return `${v.toLocaleString()} 条`;
      },
    },
    {
      title: '上次同步',
      key: 'last_sync',
      width: 240,
      render: (_: unknown, record: SyncStatusItem) => {
        const isSales = record.source_id === 'sales';
        const syncInfo = isSales
          ? getLatestWindowSync(record)
          : { time: record.last_success_at, relative: getRelativeTime(record.last_success_at) };
        return (
          <div>
            <span className={styles.syncTime}>
              {formatTime(syncInfo.time)}
            </span>
            <span className={styles.relativeTime}>({syncInfo.relative})</span>
          </div>
        );
      },
    },
    {
      title: '下次同步',
      key: 'next_sync',
      width: 140,
      render: (_: unknown, record: SyncStatusItem) => {
        if (record.source_id === 'sales') return '-';
        return getNextSyncForSnapshot(record.last_success_at);
      },
    },
    {
      title: '耗时',
      dataIndex: 'last_duration_ms',
      key: 'last_duration_ms',
      width: 80,
      render: (v: number | null) => formatDuration(v),
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_: unknown, record: SyncStatusItem) => {
        if (record.source_id === 'sales') return <span style={{ color: '#999' }}>-</span>;
        return (
          <Authorized permission={PERMISSIONS.SYSTEM.ERP_SYNC.WRITE}>
            <Button
              size="small"
              type="primary"
              icon={<ThunderboltOutlined />}
              loading={actionLoadingKeys.has(`sync-${record.source_id}-default`)}
              onClick={() => handleForceSync(record.source_id)}
            >
              强制同步
            </Button>
          </Authorized>
        );
      },
    },
  ];

  // ---- 展开行：窗口子表格 ----

  const windowColumns = [
    {
      title: '窗口',
      key: 'window',
      width: 140,
      render: (_: unknown, record: WindowStatusItem) => (
        <span style={{ paddingLeft: 8 }}>
          <span style={{ fontWeight: 500 }}>{WINDOW_NAME_MAP[record.window] || record.window}</span>
          <span className={styles.windowDesc}>
            ({WINDOW_DESC_MAP[record.window] || ''})
          </span>
        </span>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 80,
      render: () => <span style={{ color: '#999' }}>-</span>,
    },
    {
      title: '数据总量',
      dataIndex: 'total_records',
      key: 'total_records',
      width: 110,
      render: (v: number) => v > 0 ? `${v.toLocaleString()} 条` : '-',
    },
    {
      title: '上次同步',
      key: 'last_sync',
      width: 240,
      render: (_: unknown, record: WindowStatusItem) => {
        return (
          <div>
            <span className={styles.syncTime}>
              {formatTime(record.last_success_at)}
            </span>
            <span className={styles.relativeTime}>({getRelativeTime(record.last_success_at)})</span>
          </div>
        );
      },
    },
    {
      title: '下次同步',
      key: 'next_sync',
      width: 140,
      render: (_: unknown, record: WindowStatusItem) => (
        <span className={styles.nextSync}>
          {getWindowNextSync(record.window, record.last_success_at)}
        </span>
      ),
    },
    {
      title: '耗时',
      key: 'duration',
      width: 80,
      render: (_: unknown, record: WindowStatusItem) => formatDuration(record.last_duration_ms),
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_: unknown, record: WindowStatusItem) => (
        <Authorized permission={PERMISSIONS.SYSTEM.ERP_SYNC.WRITE}>
          <Button
            size="small"
            type="primary"
            icon={<ThunderboltOutlined />}
            loading={actionLoadingKeys.has(`sync-sales-${record.window}`)}
            onClick={() => handleForceSync('sales', record.window as SyncWindow)}
          >
            强制同步
          </Button>
        </Authorized>
      ),
    },
  ];

  const expandedRowRender = (record: SyncStatusItem) => {
    const windows = ensureAllWindows(record.windows_status || []);
    return (
      <div className={styles.expandTable}>
        <Table
          dataSource={windows}
          columns={windowColumns}
          rowKey="window"
          size="small"
          pagination={false}
          showHeader={false}
        />
      </div>
    );
  };

  // ---- 日志表格列 ----

  const logColumns = [
    {
      title: '数据源',
      dataIndex: 'source_id',
      key: 'source_id',
      width: 90,
      render: (v: string) => LOG_SOURCE_NAME_MAP[v] || v,
    },
    {
      title: '窗口',
      dataIndex: 'sync_window',
      key: 'sync_window',
      width: 80,
      render: (v: string | null) => v ? WINDOW_NAME_MAP[v] || v : '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (v: string) => {
        const cfg = LOG_STATUS_CONFIG[v] || { color: 'default', text: v };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: '拉取',
      dataIndex: 'records_fetched',
      key: 'records_fetched',
      width: 70,
    },
    {
      title: '写入',
      dataIndex: 'records_upserted',
      key: 'records_upserted',
      width: 70,
    },
    {
      title: '变更',
      dataIndex: 'records_changed',
      key: 'records_changed',
      width: 70,
    },
    {
      title: '耗时',
      dataIndex: 'duration_ms',
      key: 'duration_ms',
      width: 80,
      render: (v: number | null) => formatDuration(v),
    },
    {
      title: '错误',
      dataIndex: 'error_message',
      key: 'error_message',
      ellipsis: true,
      render: (v: string | null) => v ? (
        <Tooltip title={v}>
          <span style={{ color: '#f5222d' }}>{v.slice(0, 60)}</span>
        </Tooltip>
      ) : '-',
    },
    {
      title: '时间',
      dataIndex: 'started_at',
      key: 'started_at',
      width: 170,
      render: (v: string) => formatTime(v),
    },
  ];

  return (
    <div className={`page-scroll ${styles.page}`}>
      <Card
        size="small"
        title="数据同步状态"
        extra={
          <Space>
            {statuses.some(s => s.circuit_state === 'open') && (
              <Authorized permission={PERMISSIONS.SYSTEM.ERP_SYNC.WRITE}>
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  loading={actionLoadingKeys.has('reset-all-circuits')}
                  onClick={async () => {
                    const key = 'reset-all-circuits';
                    addActionLoading(key);
                    try {
                      const openCircuits = statuses.filter(s => s.circuit_state === 'open');
                      const results = await Promise.allSettled(
                        openCircuits.map(s => resetCircuit(s.source_id))
                      );
                      const failed = results.filter(r => r.status === 'rejected').length;
                      if (failed === 0) {
                        message.success(`已重置 ${openCircuits.length} 个熔断器`);
                      } else {
                        message.warning(`${openCircuits.length - failed} 个重置成功，${failed} 个失败`);
                      }
                      await loadStatus();
                    } catch (err: any) {
                      message.error(err?.message || '重置熔断器失败');
                    } finally {
                      removeActionLoading(key);
                    }
                  }}
                >
                  重置所有熔断
                </Button>
              </Authorized>
            )}
            <Button size="small" icon={<ReloadOutlined />} onClick={() => { loadStatus(); loadLogs(); }}>
              刷新
            </Button>
          </Space>
        }
      >
        <Table
          dataSource={statuses}
          columns={columns}
          rowKey="source_id"
          size="small"
          loading={loading}
          pagination={false}
          expandable={{
            expandedRowRender,
            rowExpandable: (record) => record.source_id === 'sales',
            expandIcon: ({ expanded, onExpand, record }) =>
              record.source_id === 'sales' ? (
                <RightOutlined
                  className={styles.expandIcon}
                  rotate={expanded ? 90 : 0}
                  onClick={(e) => onExpand(record, e)}
                />
              ) : null,
          }}
        />
      </Card>

      <Collapse
        className={styles.logSection}
        ghost
        expandIcon={({ isActive }) => <RightOutlined rotate={isActive ? 90 : 0} />}
        items={[{
          key: 'log',
          label: <span style={{ fontWeight: 500 }}>同步历史</span>,
          children: (
            <Table
              dataSource={logs}
              columns={logColumns}
              rowKey="id"
              size="small"
              pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
            />
          ),
        }]}
      />
    </div>
  );
}
