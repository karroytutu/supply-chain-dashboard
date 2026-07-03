/**
 * 考核中心统一表格列定义
 * 仅包含所有考核类型共有的字段，不显示类型特有列
 */
import React from 'react';
import { Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import AppealStatusTag from '../AppealStatusTag';

// 与 variables.less 中的设计令牌保持一致
const COLOR = {
  primary: '#1890ff',       // @primary-color
  serious: '#ff4d4f',       // @warning-serious (>=7天超时、考核金额)
  alert: '#fa8c16',         // @warning-color-dark (>=5天超时)
  attention: '#faad14',     // @warning-color (3-4天超时)
} as const;

/** 超时天数颜色分级阈值 */
const OVERDUE_SERIOUS_DAYS = 7;   // 严重：红色
const OVERDUE_ALERT_DAYS = 5;     // 警告：橙色
const OVERDUE_ATTENTION_DAYS = 3; // 注意：黄色

/** 状态标签映射 */
export const STATUS_MAP: Record<string, { color: string; text: string }> = {
  pending: { color: 'orange', text: '待处理' },
  confirmed: { color: 'green', text: '已处理' },
  cancelled: { color: 'default', text: '无需考核' },
  appealed: { color: 'purple', text: '申诉中' },
};

/** 所有考核规则类型中文映射（合并三套） */
const RULE_TYPE_LABELS: Record<string, string> = {
  // 退货考核
  procurement_confirm_timeout: '采购确认超时',
  marketing_sales_timeout: '营销销售超时',
  return_expire_insufficient: '退货保质期不足',
  erp_entry_timeout: 'ERP录入超时',
  warehouse_execute_timeout: '仓储执行超时',
  // OA节点超时
  node_timeout: '节点超时',
  // 执照考核
  license_timeout: '执照补交超时',
};

/** 获取统一考核表格列定义 */
export function getUnifiedColumns(): ColumnsType<AssessmentRecord> {
  return [
    {
      title: '业务编号',
      dataIndex: 'sourceNo',
      width: 200,
      render: (text: string, record: AssessmentRecord) => {
        if (!text) return '-';
        if (record.oaInstanceId) {
          return (
            <a
              onClick={() => window.open(`/oa/detail/${record.oaInstanceId}`, '_blank')}
              style={{ color: COLOR.primary }}
            >
              {text}
            </a>
          );
        }
        return <span>{text}</span>;
      },
    },
    {
      title: '关联名称',
      dataIndex: 'sourceName',
      width: 150,
      ellipsis: true,
    },
    {
      title: '被考核人',
      dataIndex: 'assessmentUserName',
      width: 100,
    },
    {
      title: '考核规则',
      dataIndex: 'ruleType',
      width: 140,
      render: (type: string) => (
        <Tag color="blue">{RULE_TYPE_LABELS[type] || type}</Tag>
      ),
    },
    {
      title: '超时天数',
      dataIndex: 'overdueDays',
      width: 90,
      align: 'center',
      render: (n: number) => {
        const color = n >= OVERDUE_SERIOUS_DAYS ? COLOR.serious
          : n >= OVERDUE_ALERT_DAYS ? COLOR.alert
          : n >= OVERDUE_ATTENTION_DAYS ? COLOR.attention
          : undefined;
        return <span style={color ? { color } : undefined}>{n}天</span>;
      },
    },
    {
      title: '考核金额',
      dataIndex: 'penaltyAmount',
      width: 110,
      align: 'right',
      render: (n: number) => (
        <span style={{ color: COLOR.serious }}>¥{n?.toFixed(2)}</span>
      ),
    },
    {
      title: '处理状态',
      dataIndex: 'status',
      width: 100,
      render: (status: string, record: AssessmentRecord) => {
        if (status === 'appealed') {
          return <AppealStatusTag record={record} />;
        }
        const config = STATUS_MAP[status];
        return config ? <Tag color={config.color}>{config.text}</Tag> : status;
      },
    },
    {
      title: '计算时间',
      dataIndex: 'calculatedAt',
      width: 160,
      render: (t: string) => t ? dayjs(t).format('YYYY-MM-DD HH:mm') : '-',
    },
  ];
}
