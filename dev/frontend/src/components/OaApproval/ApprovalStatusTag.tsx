import React from 'react';
import { Tag } from 'antd';
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  RollbackOutlined,
  StopOutlined,
} from '@ant-design/icons';

export interface ApprovalStatusTagProps {
  status: string;
  showIcon?: boolean;
}

const statusConfig: Record<
  string,
  { color: string; text: string; icon: React.ReactNode }
> = {
  pending: {
    color: 'processing',
    text: '审批中',
    icon: <ClockCircleOutlined />,
  },
  approved: {
    color: 'success',
    text: '已通过',
    icon: <CheckCircleOutlined />,
  },
  rejected: {
    color: 'error',
    text: '已驳回',
    icon: <CloseCircleOutlined />,
  },
  withdrawn: {
    color: 'default',
    text: '已撤回',
    icon: <RollbackOutlined />,
  },
  cancelled: {
    color: 'warning',
    text: '已取消',
    icon: <StopOutlined />,
  },
};

const ApprovalStatusTag: React.FC<ApprovalStatusTagProps> = ({
  status,
  showIcon = false,
}) => {
  const config = statusConfig[status] || {
    color: 'default',
    text: status,
    icon: null,
  };

  return (
    <Tag color={config.color} icon={showIcon ? config.icon : undefined}>
      {config.text}
    </Tag>
  );
};

export default ApprovalStatusTag;
