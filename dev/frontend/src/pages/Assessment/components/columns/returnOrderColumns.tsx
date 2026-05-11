/**
 * 退货考核表格列定义
 */
import React from 'react';
import { Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { STATUS_MAP } from './arCollectionColumns';

/** 退货考核角色中文映射 */
const ROLE_LABELS: Record<string, string> = {
  procurement_manager: '采购主管',
  marketing_manager: '营销经理',
  warehouse_manager: '仓储主管',
  warehouse_keeper: '仓储员',
  logistics_manager: '物流经理',
  marketer: '营销师',
  marketing_supervisor: '营销经理',
};

/** 退货考核类型映射 */
const RULE_TYPE_LABELS: Record<string, string> = {
  procurement_confirm_timeout: '采购确认超时',
  marketing_sales_timeout: '营销销售超时',
  return_expire_insufficient: '退货保质期不足',
  erp_entry_timeout: 'ERP录入超时',
  warehouse_execute_timeout: '仓储执行超时',
};

/** 获取退货考核列定义 */
export function getReturnOrderColumns(): ColumnsType<AssessmentRecord> {
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
      title: '商品名称',
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
      title: '角色',
      dataIndex: 'assessmentRole',
      width: 90,
      render: (role: string) => ROLE_LABELS[role] || role,
    },
    {
      title: '考核类型',
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
      title: '计算时间',
      dataIndex: 'calculatedAt',
      width: 160,
      render: (t: string) => t ? dayjs(t).format('YYYY-MM-DD HH:mm') : '-',
    },
  ];
}
