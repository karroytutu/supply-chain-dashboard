/**
 * 申请状态标签组件
 */
import React from 'react';
import { Tag } from 'antd';
import type { ApplicationStatus } from '@/types/asset';
import { APPLICATION_STATUS_MAP } from '@/types/asset';

interface ApplicationStatusTagProps {
  status: ApplicationStatus;
}

const ApplicationStatusTag: React.FC<ApplicationStatusTagProps> = ({ status }) => {
  const config = APPLICATION_STATUS_MAP[status] || { label: status, color: 'default' };
  return <Tag color={config.color}>{config.label}</Tag>;
};

export default ApplicationStatusTag;
