/**
 * 用户/部门字段统一控件（user + dept）
 * 始终只读展示名称
 */
import React from 'react';
import { Typography } from 'antd';
import type { FieldControlProps } from './types';

const { Text } = Typography;

const UserFieldControl: React.FC<FieldControlProps> = ({ value }) => {
  if (value === null || value === undefined || value === '') {
    return <Text type="secondary">-</Text>;
  }
  return <Text>{(value as { name?: string })?.name || String(value)}</Text>;
};

export default UserFieldControl;
