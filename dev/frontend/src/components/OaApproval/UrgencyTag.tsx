import React from 'react';
import { Tag, Badge } from 'antd';
import {
  AlertOutlined,
  ExclamationCircleOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';

export interface UrgencyTagProps {
  urgency: string;
  showIcon?: boolean;
  mode?: 'tag' | 'badge';
}

const urgencyConfig: Record<
  string,
  { color: string; text: string; icon: React.ReactNode; badgeStatus: 'default' | 'warning' | 'error' }
> = {
  normal: {
    color: 'default',
    text: '普通',
    icon: <MinusCircleOutlined />,
    badgeStatus: 'default',
  },
  urgent: {
    color: 'warning',
    text: '紧急',
    icon: <ExclamationCircleOutlined />,
    badgeStatus: 'warning',
  },
  very_urgent: {
    color: 'error',
    text: '非常紧急',
    icon: <AlertOutlined />,
    badgeStatus: 'error',
  },
};

const UrgencyTag: React.FC<UrgencyTagProps> = ({
  urgency,
  showIcon = false,
  mode = 'tag',
}) => {
  const config = urgencyConfig[urgency] || {
    color: 'default',
    text: urgency,
    icon: null,
    badgeStatus: 'default' as const,
  };

  if (mode === 'badge') {
    return (
      <Badge
        status={config.badgeStatus}
        text={config.text}
      />
    );
  }

  return (
    <Tag color={config.color} icon={showIcon ? config.icon : undefined}>
      {config.text}
    </Tag>
  );
};

export default UrgencyTag;
