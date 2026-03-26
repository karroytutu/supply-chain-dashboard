/**
 * WarningPanel 配置常量
 */
import React from 'react';
import {
  AlertOutlined,
  InboxOutlined,
  ClockCircleOutlined,
  PauseCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';

// 预警项配置
export const WARNING_CONFIG = {
  // 库存预警
  outOfStock: { label: '缺货', color: '#ff4d4f' },
  lowStock: { label: '低库存', color: '#fa8c16' },
  // 库存积压预警
  mildOverstock: { label: '轻度积压', color: '#faad14' },
  moderateOverstock: { label: '中度积压', color: '#fa8c16' },
  seriousOverstock: { label: '严重积压', color: '#ff4d4f' },
  // 临期预警
  expiring7Days: { label: '7天内临期', color: '#ff4d4f' },
  expiring15Days: { label: '15天内临期', color: '#fa8c16' },
  expiring30Days: { label: '30天内临期', color: '#faad14' },
  // 滞销预警
  mildSlowMoving: { label: '轻度滞销', color: '#faad14' },
  moderateSlowMoving: { label: '中度滞销', color: '#fa8c16' },
  seriousSlowMoving: { label: '严重滞销', color: '#ff4d4f' },
};

// 分组配置
export const GROUP_CONFIG = {
  stock: { title: '库存预警', icon: <AlertOutlined />, color: '#ff4d4f' },
  overstock: { title: '库存积压预警', icon: <InboxOutlined />, color: '#fa8c16' },
  expiring: { title: '临期预警', icon: <ClockCircleOutlined />, color: '#faad14' },
  slowMoving: { title: '滞销预警', icon: <StopOutlined />, color: '#722ed1' },
};

// 前端预警类型到后端API类型的映射
export const warningTypeMap: Record<string, string> = {
  // 库存预警
  outOfStock: 'out_of_stock',
  lowStock: 'low_stock',
  // 库存积压预警
  mildOverstock: 'mild_overstock',
  moderateOverstock: 'moderate_overstock',
  seriousOverstock: 'serious_overstock',
  // 临期预警
  expiring7Days: 'expiring_7',
  expiring15Days: 'expiring_15',
  expiring30Days: 'expiring_30',
  // 滞销预警
  mildSlowMoving: 'mild_slow_moving',
  moderateSlowMoving: 'moderate_slow_moving',
  seriousSlowMoving: 'serious_slow_moving',
};
