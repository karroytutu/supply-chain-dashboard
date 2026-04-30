/**
 * 操作按钮组
 * 根据角色和任务状态显示不同的操作按钮
 * 移动端自适应屏幕宽度
 */
import React from 'react';
import { Button } from 'antd';
import {
  CheckCircleOutlined,
  HourglassOutlined,
  ExclamationCircleOutlined,
  ArrowUpOutlined,
  CloseCircleOutlined,
  SendOutlined,
  FileTextOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import { usePermission } from '@/hooks/usePermission';
import { ROLES, PERMISSIONS } from '@/constants/permissions';
import { Authorized } from '@/components/Authorized';
import type { CollectionTask } from '@/types/ar-collection';
import type { ModalType } from '../hooks/useTaskDetail';

interface ActionButtonsProps {
  task: CollectionTask;
  onAction: (type: ModalType) => void;
  onConfirmVerify: () => void;
  confirmVerifyLoading?: boolean;
}

type ViewType = 'collector' | 'supervisor' | 'finance' | 'cashier';

/** 营销师/运营人员视角 */
function isCollectorView(hasAnyRole: (roles: string[]) => boolean, status: string): boolean {
  return hasAnyRole([ROLES.MARKETER, ROLES.OPERATOR]) &&
    ['collecting', 'extension', 'difference_processing'].includes(status);
}

/** 财务人员视角(含往来会计) */
function isFinanceView(
  hasAnyRole: (roles: string[]) => boolean,
  status: string,
  level: number,
): boolean {
  if (!hasAnyRole([ROLES.CURRENT_ACCOUNTANT, ROLES.FINANCE_STAFF])) return false;
  return status === 'difference_processing' || (status === 'escalated' && level === 2);
}

/** 营销主管视角(含旧角色 marketing_supervisor) */
function isSupervisorView(
  hasAnyRole: (roles: string[]) => boolean,
  status: string,
  level: number,
): boolean {
  return hasAnyRole([ROLES.MARKETING_MANAGER, ROLES.MARKETING_SUPERVISOR]) &&
    status === 'escalated' && level === 1;
}

/** 判断当前应显示的按钮组 */
function getActiveView(
  hasRole: (role: string) => boolean,
  hasAnyRole: (roles: string[]) => boolean,
  status: string,
  escalationLevel: number,
): ViewType | null {
  if (hasRole(ROLES.CASHIER) && status === 'pending_verify') return 'cashier';
  if (isFinanceView(hasAnyRole, status, escalationLevel)) return 'finance';
  if (isCollectorView(hasAnyRole, status)) return 'collector';

  const isAdmin = hasAnyRole([ROLES.ADMIN, ROLES.MARKETING_MANAGER, ROLES.MARKETING_SUPERVISOR]);
  if (isAdmin && !['verified', 'closed'].includes(status)) {
    return isSupervisorView(hasAnyRole, status, escalationLevel) ? 'supervisor' : 'collector';
  }

  return null;
}

/** 营销师按钮组 */
const CollectorButtons: React.FC<ActionButtonsProps> = ({ onAction }) => (
  <div className="action-bar">
    <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => onAction('verify')}>
      <span className="btn-text-full">核销回款</span>
      <span className="btn-text-short">核销</span>
    </Button>
    <Button icon={<HourglassOutlined />} onClick={() => onAction('extension')}>
      <span className="btn-text-full">申请延期</span>
      <span className="btn-text-short">延期</span>
    </Button>
    <Button icon={<ExclamationCircleOutlined />} onClick={() => onAction('difference')}>
      <span className="btn-text-full">标记差异</span>
      <span className="btn-text-short">差异</span>
    </Button>
    <Button danger icon={<ArrowUpOutlined />} onClick={() => onAction('escalate')}>
      <span className="btn-text-full">升级处理</span>
      <span className="btn-text-short">升级</span>
    </Button>
  </div>
);

/** 营销主管按钮组 */
const SupervisorButtons: React.FC<ActionButtonsProps> = ({ onAction }) => (
  <div className="action-bar">
    <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => onAction('verify')}>
      <span className="btn-text-full">核销回款</span>
      <span className="btn-text-short">核销</span>
    </Button>
    <Button icon={<HourglassOutlined />} onClick={() => onAction('extension')}>
      <span className="btn-text-full">申请延期</span>
      <span className="btn-text-short">延期</span>
    </Button>
    <Button icon={<ExclamationCircleOutlined />} onClick={() => onAction('difference')}>
      <span className="btn-text-full">标记差异</span>
      <span className="btn-text-short">差异</span>
    </Button>
    <Button danger icon={<ArrowUpOutlined />} onClick={() => onAction('escalate')}>
      <span className="btn-text-full">升级至财务</span>
      <span className="btn-text-short">升级</span>
    </Button>
    <Authorized permission={PERMISSIONS.FINANCE.AR.ROLLBACK}>
      <Button icon={<RollbackOutlined />} onClick={() => onAction('rollback')}>
        <span className="btn-text-full">退回营销师</span>
        <span className="btn-text-short">退回</span>
      </Button>
    </Authorized>
  </div>
);

/** 财务按钮组 */
const FinanceButtons: React.FC<ActionButtonsProps> = ({ onAction }) => (
  <div className="action-bar">
    <Button
      type="primary"
      icon={<ExclamationCircleOutlined />}
      onClick={() => onAction('resolveDifference')}
    >
      <span className="btn-text-full">处理差异</span>
      <span className="btn-text-short">差异</span>
    </Button>
    <Button icon={<SendOutlined />} onClick={() => onAction('sendNotice')}>
      <span className="btn-text-full">发送催收函</span>
      <span className="btn-text-short">发函</span>
    </Button>
    <Button danger icon={<FileTextOutlined />} onClick={() => onAction('lawsuit')}>
      <span className="btn-text-full">提起诉讼</span>
      <span className="btn-text-short">诉讼</span>
    </Button>
    <Authorized permission={PERMISSIONS.FINANCE.AR.ROLLBACK}>
      <Button icon={<RollbackOutlined />} onClick={() => onAction('rollback')}>
        <span className="btn-text-full">退回营销主管</span>
        <span className="btn-text-short">退回</span>
      </Button>
    </Authorized>
  </div>
);

/** 出纳按钮组 */
const CashierButtons: React.FC<ActionButtonsProps> = ({ onAction, onConfirmVerify, confirmVerifyLoading }) => (
  <div className="action-bar">
    <Button type="primary" icon={<CheckCircleOutlined />} onClick={onConfirmVerify} loading={confirmVerifyLoading}>
      <span className="btn-text-full">确认核销</span>
      <span className="btn-text-short">确认</span>
    </Button>
    <Button danger icon={<CloseCircleOutlined />} onClick={() => onAction('rejectVerify')}>
      <span className="btn-text-full">驳回核销</span>
      <span className="btn-text-short">驳回</span>
    </Button>
  </div>
);

const VIEW_RENDERERS: Record<ViewType, React.FC<ActionButtonsProps>> = {
  cashier: CashierButtons,
  finance: FinanceButtons,
  supervisor: SupervisorButtons,
  collector: CollectorButtons,
};

const ActionButtons: React.FC<ActionButtonsProps> = ({ task, onAction, onConfirmVerify, confirmVerifyLoading }) => {
  const { hasRole, hasAnyRole } = usePermission();
  const activeView = getActiveView(hasRole, hasAnyRole, task.status, task.escalationLevel);
  if (!activeView) return null;
  const ViewComponent = VIEW_RENDERERS[activeView];
  return <ViewComponent task={task} onAction={onAction} onConfirmVerify={onConfirmVerify} confirmVerifyLoading={confirmVerifyLoading} />;
};

export default ActionButtons;
