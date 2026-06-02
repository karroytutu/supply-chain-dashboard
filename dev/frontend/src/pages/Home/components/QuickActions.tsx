/**
 * 快捷操作区组件
 * 展示高频功能入口
 */

import React from 'react';
import {
  FormOutlined,
  PhoneOutlined,
  StarOutlined,
  ShoppingOutlined,
} from '@ant-design/icons';
import styles from './QuickActions.less';

interface QuickAction {
  icon: React.ReactNode;
  label: string;
  desc: string;
  path: string;
}

const ACTIONS: QuickAction[] = [
  {
    icon: <FormOutlined />,
    label: '发起流程',
    desc: '创建新的流程申请',
    path: '/oa/initiate',
  },
  {
    icon: <PhoneOutlined />,
    label: '催收任务',
    desc: '查看催收任务列表',
    path: '/collection/overview',
  },
  {
    icon: <StarOutlined />,
    label: '战略商品',
    desc: '管理战略商品目录',
    path: '/procurement/strategic-products',
  },
  {
    icon: <ShoppingOutlined />,
    label: '退货单管理',
    desc: '查看和处理退货单',
    path: '/procurement/return/orders',
  },
];

interface QuickActionsProps {
  onNavigate: (path: string) => void;
}

const QuickActions: React.FC<QuickActionsProps> = ({ onNavigate }) => (
  <div className={styles.grid}>
    {ACTIONS.map((action) => (
      <div
        className={styles.card}
        key={action.path}
        onClick={() => onNavigate(action.path)}
      >
        <div className={styles.icon}>{action.icon}</div>
        <div className={styles.label}>{action.label}</div>
        <div className={styles.desc}>{action.desc}</div>
      </div>
    ))}
  </div>
);

export default QuickActions;
