/**
 * 同步状态卡片组件
 * 展示最近同步状态和手动触发按钮
 */

import { Card, Button, Space, Statistic, Row, Col, Tag, Tooltip, message } from 'antd';
import {
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { Authorized } from '@/components/Authorized';
import { PERMISSIONS } from '@/constants/permissions';
import type { SyncStatus } from '@/services/api/dingtalk-sync';

interface SyncStatusCardProps {
  syncStatus: SyncStatus | null;
  syncing: boolean;
  onTriggerFullSync: () => Promise<{ success: boolean; message?: string }>;
}

/** 同步类型中文映射 */
const syncTypeMap: Record<string, string> = {
  full: '全量同步',
  department: '部门同步',
  incremental: '增量同步',
};

/** 触发方式中文映射 */
const triggerTypeMap: Record<string, string> = {
  scheduled: '定时触发',
  manual: '手动触发',
};

/** 格式化耗时 */
function formatDuration(ms?: number): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** 格式化时间 */
function formatTime(time?: string): string {
  if (!time) return '-';
  return new Date(time).toLocaleString('zh-CN');
}

export function SyncStatusCard({ syncStatus, syncing, onTriggerFullSync }: SyncStatusCardProps) {
  const isRunning = syncStatus?.is_running || false;
  const lastLog = syncStatus?.last_completed_log;

  const handleSync = async () => {
    const result = await onTriggerFullSync();
    if (result.success) {
      message.success('同步任务已触发');
    } else {
      message.error(result.message || '同步触发失败');
    }
  };

  /** 渲染状态标签 */
  const renderStatusTag = (status?: string) => {
    switch (status) {
      case 'running':
        return <Tag icon={<SyncOutlined spin />} color="processing">运行中</Tag>;
      case 'completed':
        return <Tag icon={<CheckCircleOutlined />} color="success">已完成</Tag>;
      case 'failed':
        return <Tag icon={<CloseCircleOutlined />} color="error">失败</Tag>;
      default:
        return <Tag icon={<ClockCircleOutlined />} color="default">未执行</Tag>;
    }
  };

  return (
    <Card
      title="钉钉同步状态"
      extra={
        <Authorized permission={PERMISSIONS.SYSTEM.SYNC.WRITE}>
          <Button
            type="primary"
            icon={<SyncOutlined spin={syncing || isRunning} />}
            loading={syncing || isRunning}
            onClick={handleSync}
            disabled={isRunning}
          >
            {isRunning ? '同步中...' : '全量同步'}
          </Button>
        </Authorized>
      }
      style={{ marginBottom: 16 }}
    >
      {/* 运行中的同步 */}
      {isRunning && syncStatus.current_log && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={24}>
            <Space>
              {renderStatusTag('running')}
              <span>
                正在执行{syncTypeMap[syncStatus.current_log.sync_type] || '同步'}
                ({triggerTypeMap[syncStatus.current_log.trigger_type] || ''})
              </span>
              <span style={{ color: '#999' }}>
                开始于 {formatTime(syncStatus.current_log.started_at)}
              </span>
            </Space>
          </Col>
        </Row>
      )}

      {/* 最近完成的同步 */}
      {lastLog && (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={24}>
              <Space>
                <span>最近同步:</span>
                {renderStatusTag(lastLog.status)}
                <span>{syncTypeMap[lastLog.sync_type] || lastLog.sync_type}</span>
                <span style={{ color: '#999' }}>
                  {triggerTypeMap[lastLog.trigger_type]} · {formatTime(lastLog.completed_at || lastLog.started_at)}
                </span>
                <Tooltip title={`耗时 ${formatDuration(lastLog.duration_ms)}`}>
                  <Tag>{formatDuration(lastLog.duration_ms)}</Tag>
                </Tooltip>
              </Space>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={4}>
              <Statistic title="新增" value={lastLog.users_created} valueStyle={{ color: '#3f8600' }} />
            </Col>
            <Col span={4}>
              <Statistic title="更新" value={lastLog.users_updated} valueStyle={{ color: '#1890ff' }} />
            </Col>
            <Col span={4}>
              <Statistic title="禁用" value={lastLog.users_disabled} valueStyle={{ color: '#cf1322' }} />
            </Col>
            <Col span={4}>
              <Statistic title="未变更" value={lastLog.users_unchanged} />
            </Col>
            <Col span={4}>
              <Statistic title="部门新建" value={lastLog.depts_created} />
            </Col>
            <Col span={4}>
              <Statistic title="部门更新" value={lastLog.depts_updated} />
            </Col>
          </Row>

          {lastLog.error_message && (
            <div style={{ marginTop: 12, color: '#cf1322', fontSize: 12 }}>
              错误信息: {lastLog.error_message}
            </div>
          )}
        </>
      )}

      {!lastLog && !isRunning && (
        <div style={{ color: '#999', textAlign: 'center', padding: '20px 0' }}>
          暂无同步记录，点击右上角按钮触发首次同步
        </div>
      )}
    </Card>
  );
}
