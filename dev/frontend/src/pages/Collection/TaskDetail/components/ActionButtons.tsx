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
} from '@ant-design/icons';
import { usePermission } from '@/hooks/usePermission';
import { ROLES } from '@/constants/permissions';
import type { CollectionTask } from '@/types/ar-collection';
import type { ModalType } from '../hooks/useTaskDetail';

interface ActionButtonsProps {
  task: CollectionTask;
  onAction: (type: ModalType) => void;
  onConfirmVerify: () => void;
  confirmVerifyLoading?: boolean;
}

const ActionButtons: React.FC<ActionButtonsProps> = ({ task, onAction, onConfirmVerify, confirmVerifyLoading }) => {
  const { hasRole, hasAnyRole } = usePermission();

  const { status, escalationLevel } = task;

  /** 营销师/运营人员视角: 催收中/延期中/差异处理 */
  const isCollectorView =
    hasAnyRole([ROLES.MARKETER, ROLES.OPERATOR]) &&
    ['collecting', 'extension', 'difference_processing'].includes(status);

  /** 营销主管视角(含旧角色 marketing_supervisor): 已升级 + level=1 时显示升级至财务按钮 */
  const isSupervisorView =
    hasAnyRole([ROLES.MARKETING_MANAGER, ROLES.MARKETING_SUPERVISOR]) &&
    status === 'escalated' &&
    escalationLevel === 1;

  /** 财务人员视角(含往来会计): 差异处理 或 (已升级 + level=2) */
  const isFinanceView =
    hasAnyRole([ROLES.CURRENT_ACCOUNTANT, ROLES.FINANCE_STAFF]) &&
    (status === 'difference_processing' || (status === 'escalated' && escalationLevel === 2));

  /** 出纳视角: 待核销 */
  const isCashierView = hasRole(ROLES.CASHIER) && status === 'pending_verify';

  /** 管理员/营销主管可见所有按钮 */
  const isAdmin = hasAnyRole([ROLES.ADMIN, ROLES.MARKETING_MANAGER, ROLES.MARKETING_SUPERVISOR]);

  const renderCollectorButtons = () => (
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

  const renderSupervisorButtons = () => (
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
    </div>
  );

  const renderFinanceButtons = () => (
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
    </div>
  );

  const renderCashierButtons = () => (
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

  // 按优先级渲染对应角色按钮
  if (isCashierView) return renderCashierButtons();
  if (isFinanceView) return renderFinanceButtons();
  if (isCollectorView) return renderCollectorButtons();

  // 管理员/营销主管使用营销师按钮组作为默认，escalated level=1 时使用升级至财务按钮组
  if (isAdmin && !['verified', 'closed'].includes(status)) {
    if (isSupervisorView) return renderSupervisorButtons();
    return renderCollectorButtons();
  }

  return null;
};

export default ActionButtons;
