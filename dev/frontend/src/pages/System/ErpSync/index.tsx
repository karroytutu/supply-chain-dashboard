/**
 * ERP 数据同步管理页面
 * 展示 6 个数据源的同步状态 + 强制同步操作 + 同步历史日志
 */
import { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Tag, Button, Table, Space, message, Tooltip, Dropdown } from 'antd';
import {
  ReloadOutlined,
  SyncOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownOutlined,
} from '@ant-design/icons';
import {
  getSyncStatus,
  getSyncLog,
  forceSync,
  resetCircuit,
  triggerFullLoad,
  type SyncStatusItem,
  type SyncLogItem,
  type SyncWindow,
} from '@/services/api/erp-sync';
import { Authorized } from '@/components/Authorized';
import { PERMISSIONS } from '@/constants/permissions';
import styles from './index.less';

/** 熔断器状态 -> Tag 配置 */
const CIRCUIT_CONFIG: Record<string, { color: string; text: string }> = {
  closed: { color: 'green', text: '正常' },
  open: { color: 'red', text: '熔断' },
  'half-open': { color: 'orange', text: '恢复中' },
};

/** 同步日志状态 -> Tag 配置 */
const LOG_STATUS_CONFIG: Record<string, { color: string; text: string }> = {
  success: { color: 'green', text: '成功' },
  failed: { color: 'red', text: '失败' },
  'circuit-open': { color: 'orange', text: '熔断跳过' },
};

/** 计算数据新鲜度文本 */
function getFreshness(lastSuccessAt: string | null): { text: string; isStale: boolean } {
  if (!lastSuccessAt) return { text: '从未同步', isStale: true };
  const diffMs = Date.now() - new Date(lastSuccessAt).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 3) return { text: `${diffMin} 分钟前`, isStale: false };
  if (diffMin < 60) return { text: `${diffMin} 分钟前`, isStale: diffMin > 10 };
  const diffHour = Math.floor(diffMin / 60);
  return { text: `${diffHour} 小时前`, isStale: true };
}

const formatTime = (iso: string | null) => {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  } catch {
    return iso;
  }
};

export default function ErpSync() {
  const [statuses, setStatuses] = useState<SyncStatusItem[]>([]);
  const [logs, setLogs] = useState<SyncLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
    setActionLoading(`sync-${sourceId}`);
    try {
      const result = await forceSync(sourceId, window);
      if (result.success) {
        message.success(`同步完成: 拉取 ${result.recordsFetched} 条, 写入 ${result.recordsUpserted} 条, 耗时 ${result.durationMs}ms`);
      } else {
        message.error(`同步失败: ${result.error || '未知错误'}`);
      }
      await loadStatus();
      await loadLogs();
    } catch (error: any) {
      message.error(error?.message || '同步失败');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetCircuit = async (sourceId: string) => {
    setActionLoading(`reset-${sourceId}`);
    try {
      await resetCircuit(sourceId);
      message.success(`熔断器已重置: ${sourceId}`);
      await loadStatus();
    } catch (error: any) {
      message.error(error?.message || '重置失败');
    } finally {
      setActionLoading(null);
    }
  };

  const handleFullLoad = async (sourceId: string) => {
    setActionLoading(`fullload-${sourceId}`);
    try {
      const result = await triggerFullLoad(sourceId);
      if (result.success) {
        message.success(`全量加载完成: 拉取 ${result.recordsFetched} 条, 写入 ${result.recordsUpserted} 条, 耗时 ${result.durationMs}ms`);
      } else {
        message.error(`全量加载失败: ${result.error || '未知错误'}`);
      }
      await loadStatus();
      await loadLogs();
    } catch (error: any) {
      message.error(error?.message || '全量加载失败');
    } finally {
      setActionLoading(null);
    }
  };

  const renderStatusCard = (item: SyncStatusItem) => {
    const circuit = CIRCUIT_CONFIG[item.circuit_state] || CIRCUIT_CONFIG.closed;
    const freshness = getFreshness(item.last_success_at);

    return (
      <Card
        key={item.source_id}
        title={<Space><SyncOutlined /><span>{item.name}</span></Space>}
        size="small"
        className={styles.statusCard}
      >
        <div className={styles.statusRow}>
          <span className={styles.label}>熔断器：</span>
          <Tag color={circuit.color}>{circuit.text}</Tag>
        </div>
        <div className={styles.statusRow}>
          <span className={styles.label}>本地记录：</span>
          <span>{item.total_records.toLocaleString()} 条</span>
        </div>
        <div className={styles.statusRow}>
          <span className={styles.label}>同步次数：</span>
          <span>{item.total_syncs} 次 / 失败 {item.total_failures} 次</span>
        </div>
        <div className={styles.statusRow}>
          <span className={styles.label}>数据新鲜：</span>
          <span className={`${styles.freshness} ${freshness.isStale ? styles.stale : ''}`}>
            {freshness.text}
          </span>
        </div>
        {item.last_duration_ms && (
          <div className={styles.statusRow}>
            <span className={styles.label}>上次耗时：</span>
            <span>{item.last_duration_ms}ms</span>
          </div>
        )}
        {item.last_error_message && (
          <div className={styles.statusRow}>
            <span className={styles.label}>最近错误：</span>
            <Tooltip title={item.last_error_message}>
              <span style={{ color: '#f5222d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.last_error_message.slice(0, 50)}
              </span>
            </Tooltip>
          </div>
        )}
        {item.source_id === 'sales' && (
          <div className={styles.statusRow}>
            <span className={styles.label}>全量加载：</span>
            {item.full_load_complete
              ? <Tag color="green">已完成</Tag>
              : <Tag color="orange">{item.full_load_checkpoint ? `已加载到 ${item.full_load_checkpoint}` : '未开始'}</Tag>
            }
          </div>
        )}
        <div className={styles.actions}>
          <Authorized permission={PERMISSIONS.SYSTEM.ERP_SYNC.WRITE}>
            {item.source_id === 'sales' ? (
              <Dropdown
                menu={{
                  items: [
                    { key: 'hot', label: '热窗口（近7天）' },
                    { key: 'warm', label: '温窗口（8-30天）' },
                    { key: 'cold', label: '冷窗口（30天前）' },
                    { key: 'all', label: '全部历史' },
                    ...(item.full_load_complete !== true
                      ? [{ key: 'full-load', label: '全量加载历史' }]
                      : []),
                  ],
                  onClick: ({ key }) => {
                    if (key === 'full-load') {
                      handleFullLoad(item.source_id);
                    } else {
                      handleForceSync(item.source_id, key as SyncWindow);
                    }
                  },
                }}
              >
                <Button
                  size="small"
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  loading={actionLoading === `sync-${item.source_id}`}
                >
                  强制同步 <DownOutlined />
                </Button>
              </Dropdown>
            ) : (
              <Button
                size="small"
                type="primary"
                icon={<ThunderboltOutlined />}
                loading={actionLoading === `sync-${item.source_id}`}
                onClick={() => handleForceSync(item.source_id)}
              >
                强制同步
              </Button>
            )}
          </Authorized>
          {item.circuit_state === 'open' && (
            <Authorized permission={PERMISSIONS.SYSTEM.ERP_SYNC.WRITE}>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                loading={actionLoading === `reset-${item.source_id}`}
                onClick={() => handleResetCircuit(item.source_id)}
              >
                重置熔断
              </Button>
            </Authorized>
          )}
        </div>
      </Card>
    );
  };

  const logColumns = [
    {
      title: '数据源',
      dataIndex: 'source_id',
      key: 'source_id',
      width: 100,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
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
      render: (v: number | null) => (v != null ? `${v}ms` : '-'),
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
      <Row gutter={[16, 16]}>
        {statuses.map(item => (
          <Col xs={24} sm={12} md={8} key={item.source_id}>
            {renderStatusCard(item)}
          </Col>
        ))}
      </Row>

      <Card
        title="同步历史"
        size="small"
        style={{ marginTop: 16 }}
        extra={
          <Button size="small" icon={<ReloadOutlined />} onClick={() => loadLogs()}>
            刷新
          </Button>
        }
      >
        <Table
          dataSource={logs}
          columns={logColumns}
          rowKey="id"
          size="small"
          loading={loading}
          pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
        />
      </Card>
    </div>
  );
}
