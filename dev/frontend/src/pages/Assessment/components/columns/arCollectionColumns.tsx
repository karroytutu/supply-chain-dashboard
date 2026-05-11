/**
 * 催收考核表格列定义
 */
import React from 'react';
import { Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';

/** 角色中文映射 */
const ROLE_LABELS: Record<string, string> = {
  marketer: '营销师',
  marketing_manager: '营销经理',
  marketing_supervisor: '营销经理',
};

/** 考核层级映射 */
const TIER_LABELS: Record<string, string> = {
  tier1: '一级考核(3-5天)',
  tier2: '二级考核(5-7天)',
  tier3: '三级考核(7天以上)',
};

/** 状态标签映射 */
export const STATUS_MAP: Record<string, { color: string; text: string }> = {
  pending: { color: 'orange', text: '待处理' },
  confirmed: { color: 'green', text: '已处理' },
  cancelled: { color: 'default', text: '无需考核' },
  appealed: { color: 'purple', text: '申诉中' },
};

/** 获取催收考核列定义 */
export function getArCollectionColumns(): ColumnsType<AssessmentRecord> {
  return [
    {
      title: '业务编号',
      dataIndex: 'sourceNo',
      width: 150,
      render: (text: string) => (
        <span style={{ color: '#1890ff', cursor: 'pointer' }}>{text || '-'}</span>
      ),
    },
    {
      title: '客户名称',
      dataIndex: 'sourceName',
      width: 120,
      ellipsis: true,
    },
    {
      title: '被考核人',
      dataIndex: 'assessmentUserName',
      width: 100,
    },
    {
      title: '角色',
      dataIndex: 'assessmentRole',
      width: 90,
      render: (role: string) => ROLE_LABELS[role] || role,
    },
    {
      title: '考核层级',
      dataIndex: 'ruleType',
      width: 140,
      render: (type: string) => (
        <Tag color="blue">{TIER_LABELS[type] || type}</Tag>
      ),
    },
    {
      title: '超时天数',
      dataIndex: 'overdueDays',
      width: 90,
      align: 'center',
      render: (n: number) => `${n}天`,
    },
    {
      title: '考核金额',
      dataIndex: 'penaltyAmount',
      width: 110,
      align: 'right',
      render: (n: number) => (
        <span style={{ color: '#f5222d' }}>¥{n?.toFixed(2)}</span>
      ),
    },
    {
      title: '处理状态',
      dataIndex: 'status',
      width: 100,
      render: (status: string) => {
        const config = STATUS_MAP[status];
        return config ? <Tag color={config.color}>{config.text}</Tag> : status;
      },
    },
    {
      title: '处理备注',
      dataIndex: 'handleRemark',
      width: 200,
      ellipsis: true,
    },
    {
      title: '计算时间',
      dataIndex: 'calculatedAt',
      width: 160,
      render: (t: string) => t ? dayjs(t).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '处理时间',
      dataIndex: 'handledAt',
      width: 160,
      render: (t: string) => t ? dayjs(t).format('YYYY-MM-DD HH:mm') : '-',
    },
  ];
}
