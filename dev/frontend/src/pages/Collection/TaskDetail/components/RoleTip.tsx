/**
 * 角色提示组件
 * 显示当前用户的角色和职责范围
 */
import React from 'react';
import { Tag, Tooltip } from 'antd';
import {
  UserOutlined,
  TeamOutlined,
  AccountBookOutlined,
  AuditOutlined,
  SolutionOutlined,
} from '@ant-design/icons';
import { ROLES } from '@/constants/permissions';
import './RoleTip.less';

interface RoleTipProps {
  /** 用户角色编码 */
  role: string;
  /** 紧凑模式 */
  compact?: boolean;
}

/** 角色配置 */
const ROLE_CONFIG: Record<
  string,
  { label: string; duties: string; escalationPower: string; icon: React.ReactNode; color: string }
> = {
  [ROLES.MARKETER]: {
    label: '营销师',
    duties: '负责日常催收跟进、核销申请、延期申请',
    escalationPower: '可升级至营销主管',
    icon: <UserOutlined />,
    color: 'blue',
  },
  [ROLES.MARKETING_MANAGER]: {
    label: '营销主管',
    duties: '处理升级任务、审批复杂案件',
    escalationPower: '可升级至财务',
    icon: <TeamOutlined />,
    color: 'orange',
  },
  [ROLES.CURRENT_ACCOUNTANT]: {
    label: '往来会计',
    duties: '处理账务差异、核对往来',
    escalationPower: '无升级权限',
    icon: <AccountBookOutlined />,
    color: 'green',
  },
  [ROLES.FINANCE_STAFF]: {
    label: '财务',
    duties: '处理差异、法律催收、发送催收函',
    escalationPower: '已至最高级别',
    icon: <AccountBookOutlined />,
    color: 'green',
  },
  [ROLES.CASHIER]: {
    label: '出纳',
    duties: '核销确认、驳回核销',
    escalationPower: '无升级权限',
    icon: <AuditOutlined />,
    color: 'purple',
  },
  [ROLES.ADMIN]: {
    label: '管理员',
    duties: '拥有全部权限',
    escalationPower: '可执行所有操作',
    icon: <SolutionOutlined />,
    color: 'red',
  },
  [ROLES.MANAGER]: {
    label: '经理',
    duties: '管理数据和报表',
    escalationPower: '可执行大部分操作',
    icon: <TeamOutlined />,
    color: 'gold',
  },
};

// 兼容旧角色编码
const LEGACY_ROLE_MAP: Record<string, string> = {
  marketing_supervisor: ROLES.MARKETING_MANAGER,
  operator: ROLES.MARKETER,
};

const RoleTip: React.FC<RoleTipProps> = ({ role, compact = false }) => {
  // 处理兼容角色编码
  const normalizedRole = LEGACY_ROLE_MAP[role] || role;
  const config = ROLE_CONFIG[normalizedRole];

  if (!config) {
    return null;
  }

  if (compact) {
    return (
      <div className="role-tip-compact">
        <Tag color={config.color} icon={config.icon}>
          {config.label}
        </Tag>
        <Tooltip title={config.duties}>
          <span className="role-duties-compact">{config.duties}</span>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="role-tip">
      <div className="role-header">
        <Tag color={config.color} icon={config.icon} className="role-tag">
          当前角色: {config.label}
        </Tag>
      </div>
      <div className="role-info">
        <div className="info-item">
          <span className="info-label">📋 职责范围:</span>
          <span className="info-value">{config.duties}</span>
        </div>
        <div className="info-item">
          <span className="info-label">⬆️ 升级权限:</span>
          <span className="info-value">{config.escalationPower}</span>
        </div>
      </div>
    </div>
  );
};

export default RoleTip;
