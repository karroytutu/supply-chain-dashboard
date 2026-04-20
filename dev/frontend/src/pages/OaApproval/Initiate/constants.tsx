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
import type { FormCategory } from '@/types/oa-approval';

/** 分类图标（18px，用于卡片） */
export const CATEGORY_ICONS: Record<FormCategory, React.ReactNode> = {
  finance: <PayCircleOutlined style={{ fontSize: 18 }} />,
  supply_chain: <ShoppingCartOutlined style={{ fontSize: 18 }} />,
  marketing: <TeamOutlined style={{ fontSize: 18 }} />,
  hr: <SolutionOutlined style={{ fontSize: 18 }} />,
  admin: <BankOutlined style={{ fontSize: 18 }} />,
};

/** 分类色值 */
export const CATEGORY_COLORS: Record<FormCategory, string> = {
  finance: '#faad14',
  supply_chain: '#52c41a',
  marketing: '#eb2f96',
  hr: '#1890ff',
  admin: '#722ed1',
};
