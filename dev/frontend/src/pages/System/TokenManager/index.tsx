/**
 * Token 管理页面
 * 展示三系统 (ERP/WMS/B2B) Token 状态 + 操作按钮 + 操作日志
 */
import { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Tag, Button, Table, Space, message, Tooltip } from 'antd';
import {
  ReloadOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import {
  getTokenStatus,
  getTokenLogs,
  triggerErpLogin,
  triggerWmsLogin,
  triggerB2bExchange,
  verifyToken,
  type AllTokensStatus,
  type TokenStatusInfo,
  type TokenOperationLog,
} from '@/services/api/token-manager';
import { Authorized } from '@/components/Authorized';
import { PERMISSIONS } from '@/constants/permissions';
import WmsSmsModal from './components/WmsSmsModal';
import styles from './index.less';

/** 状态 → Tag 颜色映射 */
const STATUS_CONFIG: Record<string, { color: string; text: string }> = {
  success: { color: 'green', text: '有效' },
  failed: { color: 'red', text: '失败' },
  expired: { color: 'red', text: '已过期' },
  pending_sms: { color: 'orange', text: '等待验证码' },
  none: { color: 'default', text: '未登录' },
};

/** 日志操作类型 → 中文映射 */
const OPERATION_LABEL: Record<string, string> = {
  login: '登录',
  exchange: '兑换',
  verify: '验证',
  refresh: '刷新',
  invalidate: '失效',
};

/** 日志状态 → 中文 + 颜色映射 */
const LOG_STATUS_CONFIG: Record<string, { text: string; color: string }> = {
  success: { text: '成功', color: 'green' },
  failed: { text: '失败', color: 'red' },
  pending: { text: '处理中', color: 'orange' },
};

/** 将日志详情 JSON 转为可读中文 */
function formatDetail(detail: Record<string, unknown> | null): string {
  if (!detail || Object.keys(detail).length === 0) return '-';

  const parts: string[] = [];
  if (detail.error) parts.push(`错误：${detail.error}`);
  if (detail.message) parts.push(`信息：${detail.message}`);
  if (detail.name) {
    parts.push(`操作员：${detail.name}${detail.mid ? `（ID:${detail.mid}）` : ''}`);
  }

  // 兜底：未识别的字段仍然展示原始 JSON
  if (parts.length === 0) return JSON.stringify(detail);
  return parts.join('；');
}

export default function TokenManager() {
  const [status, setStatus] = useState<AllTokensStatus | null>(null);
  const [logs, setLogs] = useState<TokenOperationLog[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [smsModalVisible, setSmsModalVisible] = useState(false);
  const [logPage, setLogPage] = useState(1);

  const loadStatus = useCallback(async () => {
    try {
      const data = await getTokenStatus();
      setStatus(data);
      // 自动弹出 SMS Modal
      if (data.wms.needsSms && data.wms.status === 'pending_sms') {
        setSmsModalVisible(true);
      }
    } catch {
      // ignore
    }
  }, []);

  const loadLogs = useCallback(async (page = 1) => {
    try {
      const result = await getTokenLogs({ page, pageSize: 20 });
      setLogs(result.data || []);
      setLogTotal(result.total || 0);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadStatus(), loadLogs(1)]).finally(() => setLoading(false));
  }, [loadStatus, loadLogs]);

  /** 触发操作 */
  const handleAction = async (
    key: string,
    action: () => Promise<any>,
    successMsg: string,
  ) => {
    setActionLoading(key);
    try {
      const result = await action();
      if (result?.needsSms) {
        setSmsModalVisible(true);
        message.info(result.message || '需要短信验证码');
      } else {
        message.success(successMsg);
      }
      // 刷新状态和日志
      await loadStatus();
      await loadLogs(1);
    } catch (error: any) {
      message.error(error?.message || '操作失败');
    } finally {
      setActionLoading(null);
    }
  };

  /** 验证 Token */
  const handleVerify = async (system: 'erp' | 'wms' | 'b2b') => {
    setActionLoading(`verify-${system}`);
    try {
      const result = await verifyToken(system);
      if (result.valid) {
        message.success(`${system.toUpperCase()} Token 有效`);
      } else {
        message.warning(`${system.toUpperCase()} Token 无效或已过期`);
      }
    } catch (error: any) {
      message.error(error?.message || '验证失败');
    } finally {
      setActionLoading(null);
    }
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return '-';
    try {
      return new Date(iso).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    } catch {
      return iso;
    }
  };

  /** 渲染状态卡片 */
  const renderStatusCard = (
    title: string,
    icon: React.ReactNode,
    info: TokenStatusInfo | undefined,
    actions: React.ReactNode,
  ) => {
    const cfg = STATUS_CONFIG[info?.status || 'none'] || STATUS_CONFIG.none;
    return (
      <Card
        title={<Space>{icon}<span>{title}</span></Space>}
        size="small"
        className={styles.statusCard}
      >
        <div className={styles.statusRow}>
          <span className={styles.label}>状态：</span>
          <Tag color={cfg.color}>{cfg.text}</Tag>
        </div>
        <div className={styles.statusRow}>
          <span className={styles.label}>最近更新：</span>
          <span>{formatTime(info?.updatedAt || null)}</span>
        </div>
        <div className={styles.statusRow}>
          <span className={styles.label}>最近登录：</span>
          <span>{formatTime(info?.lastLoginAt || null)}</span>
        </div>
        <div className={styles.actions}>{actions}</div>
      </Card>
    );
  };

  const logColumns = [
    {
      title: '系统',
      dataIndex: 'system',
      key: 'system',
      width: 80,
      render: (v: string) => <Tag>{v.toUpperCase()}</Tag>,
    },
    {
      title: '操作',
      dataIndex: 'operation',
      key: 'operation',
      width: 80,
      render: (v: string) => OPERATION_LABEL[v] || v,
    },
    {
      title: '结果',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (v: string) => {
        const cfg = LOG_STATUS_CONFIG[v] || { text: v, color: 'default' };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: '耗时',
      dataIndex: 'duration_ms',
      key: 'duration_ms',
      width: 80,
      render: (v: number | null) => (v ? `${(v / 1000).toFixed(1)}s` : '-'),
    },
    {
      title: '详情',
      dataIndex: 'detail',
      key: 'detail',
      ellipsis: true,
      render: (v: Record<string, unknown> | null) => {
        if (!v) return '-';
        const text = formatDetail(v);
        return <Tooltip title={JSON.stringify(v, null, 2)}>{text}</Tooltip>;
      },
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (v: string) => formatTime(v),
    },
  ];

  return (
    <div className="page-scroll">
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          {renderStatusCard(
            'ERP 云管家',
            <SafetyCertificateOutlined style={{ color: '#1890ff' }} />,
            status?.erp,
            <Space size="small" wrap>
              <Authorized permission={PERMISSIONS.SYSTEM.TOKEN.WRITE}>
                <Button
                  size="small"
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  loading={actionLoading === 'erp-login'}
                  onClick={() => handleAction('erp-login', triggerErpLogin, 'ERP 登录任务已启动')}
                >
                  登录
                </Button>
              </Authorized>
              <Button
                size="small"
                icon={<SyncOutlined />}
                loading={actionLoading === 'verify-erp'}
                onClick={() => handleVerify('erp')}
              >
                验证
              </Button>
            </Space>,
          )}
        </Col>
        <Col xs={24} md={8}>
          {renderStatusCard(
            'WMS 仓储',
            <SafetyCertificateOutlined style={{ color: '#52c41a' }} />,
            status?.wms,
            <Space size="small" wrap>
              <Authorized permission={PERMISSIONS.SYSTEM.TOKEN.WRITE}>
                <Button
                  size="small"
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  loading={actionLoading === 'wms-login'}
                  onClick={() => handleAction('wms-login', () => triggerWmsLogin(), 'WMS 登录成功')}
                >
                  登录
                </Button>
              </Authorized>
              <Button
                size="small"
                icon={<SyncOutlined />}
                loading={actionLoading === 'verify-wms'}
                onClick={() => handleVerify('wms')}
              >
                验证
              </Button>
            </Space>,
          )}
        </Col>
        <Col xs={24} md={8}>
          {renderStatusCard(
            'B2B 店管家',
            <SafetyCertificateOutlined style={{ color: '#faad14' }} />,
            status?.b2b,
            <Space size="small" wrap>
              <Authorized permission={PERMISSIONS.SYSTEM.TOKEN.WRITE}>
                <Button
                  size="small"
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  loading={actionLoading === 'b2b-exchange'}
                  disabled={!status?.erp?.hasToken || status?.erp?.status !== 'success'}
                  onClick={() => handleAction('b2b-exchange', triggerB2bExchange, 'B2B Token 兑换成功')}
                >
                  兑换
                </Button>
              </Authorized>
              <Button
                size="small"
                icon={<SyncOutlined />}
                loading={actionLoading === 'verify-b2b'}
                onClick={() => handleVerify('b2b')}
              >
                验证
              </Button>
            </Space>,
          )}
        </Col>
      </Row>

      <Card
        title="操作日志"
        size="small"
        style={{ marginTop: 16 }}
        extra={
          <Button size="small" icon={<ReloadOutlined />} onClick={() => loadLogs(logPage)}>
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
          pagination={{
            current: logPage,
            pageSize: 20,
            total: logTotal,
            onChange: (p) => { setLogPage(p); loadLogs(p); },
            showTotal: (t) => `共 ${t} 条`,
          }}
        />
      </Card>

      <WmsSmsModal
        visible={smsModalVisible}
        onClose={() => setSmsModalVisible(false)}
        onSuccess={() => { setSmsModalVisible(false); loadStatus(); loadLogs(1); }}
      />
    </div>
  );
}
