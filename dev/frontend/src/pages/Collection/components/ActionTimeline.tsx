/**
 * 操作历史时间线组件
 * 根据 action_type 显示不同图标和颜色
 */
import React from 'react';
import { Timeline, Empty } from 'antd';
import {
  PhoneOutlined,
  CheckCircleOutlined,
  HourglassOutlined,
  ExclamationCircleOutlined,
  ArrowUpOutlined,
  StopOutlined,
  SendOutlined,
  FileTextOutlined,
  AuditOutlined,
} from '@ant-design/icons';
import type { CollectionAction } from '@/types/ar-collection';

interface ActionTimelineProps {
  /** 操作记录列表 */
  actions: CollectionAction[];
  /** 最多显示条数，0表示全部 */
  maxItems?: number;
}

/** 操作类型配置映射 */
const ACTION_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
  collect: {
    label: '催收跟进',
    color: '#1890ff',
    icon: <PhoneOutlined />,
  },
  verify: {
    label: '核销回款',
    color: '#52c41a',
    icon: <CheckCircleOutlined />,
  },
  confirm_verify: {
    label: '核销确认',
    color: '#52c41a',
    icon: <AuditOutlined />,
  },
  extension: {
    label: '申请延期',
    color: '#722ed1',
    icon: <HourglassOutlined />,
  },
  difference: {
    label: '标记差异',
    color: '#faad14',
    icon: <ExclamationCircleOutlined />,
  },
  resolve_difference: {
    label: '处理差异',
    color: '#faad14',
    icon: <ExclamationCircleOutlined />,
  },
  escalate: {
    label: '升级处理',
    color: '#ff4d4f',
    icon: <ArrowUpOutlined />,
  },
  close: {
    label: '关闭任务',
    color: '#8c8c8c',
    icon: <StopOutlined />,
  },
  send_notice: {
    label: '发送催收函',
    color: '#ff4d4f',
    icon: <SendOutlined />,
  },
  file_lawsuit: {
    label: '提起诉讼',
    color: '#ff4d4f',
    icon: <FileTextOutlined />,
  },
  update_progress: {
    label: '更新进展',
    color: '#1890ff',
    icon: <FileTextOutlined />,
  },
  system: {
    label: '系统操作',
    color: '#8c8c8c',
    icon: <ExclamationCircleOutlined />,
  },
};

/** 格式化时间显示 */
const formatTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hours}:${minutes}`;
};

const ActionTimeline: React.FC<ActionTimelineProps> = ({
  actions,
  maxItems = 0,
}) => {
  if (!actions || actions.length === 0) {
    return <Empty description="暂无操作记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  const displayActions = maxItems > 0 ? actions.slice(0, maxItems) : actions;

  const items = displayActions.map((action) => {
    const config = ACTION_CONFIG[action.actionType] || ACTION_CONFIG.system;
    return {
      color: config.color,
      dot: config.icon,
      children: (
        <div>
          <div style={{ fontWeight: 500 }}>
            <span>{config.label}</span>
            {action.actionResult && (
              <span style={{ marginLeft: 8, color: '#999', fontSize: 12 }}>
                ({action.actionResult})
              </span>
            )}
          </div>
          <div style={{ color: '#666', fontSize: 13, marginTop: 2 }}>
            {action.remark || '-'}
          </div>
          <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
            {formatTime(action.createdAt)} · {action.operatorName}
            {action.operatorRole && ` (${action.operatorRole})`}
          </div>
        </div>
      ),
    };
  });

  return <Timeline items={items} />;
};

export default ActionTimeline;
