/**
 * 审批发起页共享常量
 */
import React from 'react';
import {
  PayCircleOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  SolutionOutlined,
  BankOutlined,
  // 表单级图标
  MoneyCollectOutlined,
  SafetyCertificateOutlined,
  DeleteOutlined,
  CarOutlined,
  AlertOutlined,
  ThunderboltOutlined,
  ShoppingOutlined,
  UserSwitchOutlined,
  SwapOutlined,
  GiftOutlined,
  AuditOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import type { FormCategory } from '@/types/oa';

/** 分类图标（字号由 .iconCircle CSS 类控制，支持响应式断点覆盖） */
export const CATEGORY_ICONS: Record<FormCategory, React.ReactNode> = {
  finance: <PayCircleOutlined />,
  supply_chain: <ShoppingCartOutlined />,
  marketing: <TeamOutlined />,
  hr: <SolutionOutlined />,
  admin: <BankOutlined />,
};

/**
 * 表单级图标映射（icon 字符串 → React 节点）
 * 优先使用表单自身图标，未匹配时回退到分类图标
 */
export const FORM_ICON_MAP: Record<string, React.ReactNode> = {
  PayCircleOutlined: <PayCircleOutlined />,
  ShoppingCartOutlined: <ShoppingCartOutlined />,
  MoneyCollectOutlined: <MoneyCollectOutlined />,
  SafetyCertificateOutlined: <SafetyCertificateOutlined />,
  DeleteOutlined: <DeleteOutlined />,
  CarOutlined: <CarOutlined />,
  AlertOutlined: <AlertOutlined />,
  ThunderboltOutlined: <ThunderboltOutlined />,
  ShoppingOutlined: <ShoppingOutlined />,
  UserSwitchOutlined: <UserSwitchOutlined />,
  SwapOutlined: <SwapOutlined />,
  GiftOutlined: <GiftOutlined />,
  AuditOutlined: <AuditOutlined />,
  ToolOutlined: <ToolOutlined />,
  TeamOutlined: <TeamOutlined />,
  SolutionOutlined: <SolutionOutlined />,
  BankOutlined: <BankOutlined />,
};

/** 分类色值 */
export const CATEGORY_COLORS: Record<FormCategory, string> = {
  finance: '#faad14',
  supply_chain: '#52c41a',
  marketing: '#eb2f96',
  hr: '#1890ff',
  admin: '#722ed1',
};
