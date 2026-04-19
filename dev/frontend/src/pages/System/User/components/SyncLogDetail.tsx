/**
 * 同步日志详情 Drawer 组件
 * 展示单条同步日志的完整信息
 */

import { Drawer, Descriptions, Tag, Divider } from 'antd';
import {
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import type { SyncLogRecord } from '@/services/api/dingtalk-sync';

interface SyncLogDetailProps {
  visible: boolean;
  log: SyncLogRecord | null;
  onClose: () => void;
}

const syncTypeMap: Record<string, string> = {
  full: '全量同步',
  department: '部门同步',
  incremental: '增量同步',
};

const triggerTypeMap: Record<string, string> = {
  scheduled: '定时触发',
  manual: '手动触发',
};

function formatDuration(ms?: number): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(time?: string): string {
  if (!time) return '-';
  return new Date(time).toLocaleString('zh-CN');
}

function renderStatusTag(status: string) {
  switch (status) {
    case 'running':
      return <Tag icon={<SyncOutlined spin />} color="processing">运行中</Tag>;
    case 'completed':
      return <Tag icon={<CheckCircleOutlined />} color="success">已完成</Tag>;
    case 'failed':
      return <Tag icon={<CloseCircleOutlined />} color="error">失败</Tag>;
    default:
      return <Tag>{status}</Tag>;
  }
}

export function SyncLogDetail({ visible, log, onClose }: SyncLogDetailProps) {
  if (!log) return null;

  return (
    <Drawer
      title="同步日志详情"
      width={520}
      open={visible}
      onClose={onClose}
    >
      {/* 基本信息 */}
      <Descriptions column={2} size="small">
        <Descriptions.Item label="同步类型">
          {syncTypeMap[log.sync_type] || log.sync_type}
        </Descriptions.Item>
        <Descriptions.Item label="触发方式">
          {triggerTypeMap[log.trigger_type] || log.trigger_type}
        </Descriptions.Item>
        <Descriptions.Item label="状态">
          {renderStatusTag(log.status)}
        </Descriptions.Item>
        <Descriptions.Item label="耗时">
          {formatDuration(log.duration_ms)}
        </Descriptions.Item>
        <Descriptions.Item label="开始时间" span={2}>
          {formatTime(log.started_at)}
        </Descriptions.Item>
        <Descriptions.Item label="完成时间" span={2}>
          {formatTime(log.completed_at)}
        </Descriptions.Item>
      </Descriptions>

      <Divider orientation="left" style={{ fontSize: 14 }}>用户统计</Divider>

      <Descriptions column={2} size="small">
        <Descriptions.Item label="钉钉用户总数">
          {log.total_dingtalk_users}
        </Descriptions.Item>
        <Descriptions.Item label="本地用户总数">
          {log.total_local_users}
        </Descriptions.Item>
        <Descriptions.Item label="新增用户">
          <span style={{ color: '#3f8600' }}>{log.users_created}</span>
        </Descriptions.Item>
        <Descriptions.Item label="更新用户">
          <span style={{ color: '#1890ff' }}>{log.users_updated}</span>
        </Descriptions.Item>
        <Descriptions.Item label="禁用用户">
          <span style={{ color: '#cf1322' }}>{log.users_disabled}</span>
        </Descriptions.Item>
        <Descriptions.Item label="未变更用户">
          {log.users_unchanged}
        </Descriptions.Item>
      </Descriptions>

      <Divider orientation="left" style={{ fontSize: 14 }}>部门统计</Divider>

      <Descriptions column={2} size="small">
        <Descriptions.Item label="同步部门数">
          {log.depts_synced}
        </Descriptions.Item>
        <Descriptions.Item label="新建部门">
          {log.depts_created}
        </Descriptions.Item>
        <Descriptions.Item label="更新部门">
          {log.depts_updated}
        </Descriptions.Item>
      </Descriptions>

      {log.error_message && (
        <>
          <Divider orientation="left" style={{ fontSize: 14 }}>错误信息</Divider>
          <div style={{ color: '#cf1322', whiteSpace: 'pre-wrap', fontSize: 13 }}>
            {log.error_message}
          </div>
        </>
      )}
    </Drawer>
  );
}
