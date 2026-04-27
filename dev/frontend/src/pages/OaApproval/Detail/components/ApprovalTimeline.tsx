import React from 'react';
import { Timeline, Tag, Empty } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SwapOutlined,
  ClockCircleOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';
import type { ApprovalAction } from '@/types/oa-approval';
import { formatDateTime } from '@/utils/format';

interface ApprovalTimelineProps {
  actions: ApprovalAction[];
}

/** 操作类型对应的图标和颜色 */
const actionConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  approve: { icon: <CheckCircleOutlined />, color: 'green', label: '通过' },
  reject: { icon: <CloseCircleOutlined />, color: 'red', label: '驳回' },
  transfer: { icon: <SwapOutlined />, color: 'orange', label: '转交' },
  withdraw: { icon: <MinusCircleOutlined />, color: 'default', label: '撤回' },
  submit: { icon: <CheckCircleOutlined />, color: 'blue', label: '提交' },
};

const ApprovalTimeline: React.FC<ApprovalTimelineProps> = ({ actions }) => {
  if (!actions || actions.length === 0) {
    return <Empty description="暂无审批记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  return (
    <Timeline
      items={actions.map((action) => {
        const config = actionConfig[action.actionType] || {
          icon: <ClockCircleOutlined />,
          color: 'gray',
          label: action.actionType,
        };

        return {
          dot: config.icon,
          color: config.color,
          children: (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Tag color={config.color}>{config.label}</Tag>
                <span>{action.operatorName || action.actionUserName || '系统'}</span>
                <span style={{ color: '#999', fontSize: 12 }}>
                  {formatDateTime(action.actionAt || action.createdAt)}
                </span>
              </div>
              {action.comment && (
                <div style={{ marginTop: 4, color: '#666', paddingLeft: 4 }}>{action.comment}</div>
              )}
            </div>
          ),
        };
      })}
    />
  );
};

export default ApprovalTimeline;
