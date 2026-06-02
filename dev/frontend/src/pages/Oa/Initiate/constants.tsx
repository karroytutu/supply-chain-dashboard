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

/** 分类色值 */
export const CATEGORY_COLORS: Record<FormCategory, string> = {
  finance: '#faad14',
  supply_chain: '#52c41a',
  marketing: '#eb2f96',
  hr: '#1890ff',
  admin: '#722ed1',
};
