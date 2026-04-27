import React from 'react';
import { Card, Descriptions, Tag } from 'antd';
import type { ApprovalDetail } from '@/types/oa-approval';
import { FormFieldRenderer as FieldRenderer } from '@/components/OaApproval';
import { useErpLicenseResolve } from '@/components/OaApproval/hooks/useErpLicenseResolve';
import { formatDateTime } from '@/utils/format';
import { checkCondition } from '../../Form/components/ConditionalFieldWrapper';
import ErpStatusCard from './ErpStatusCard';
import styles from '../index.less';

/** 审批状态标签 */
export const ApprovalStatusTag: React.FC<{ status: string }> = ({ status }) => {
  const statusMap: Record<string, { color: string; text: string }> = {
    pending: { color: 'processing', text: '审批中' },
    approved: { color: 'success', text: '已通过' },
    rejected: { color: 'error', text: '已驳回' },
    withdrawn: { color: 'default', text: '已撤回' },
    cancelled: { color: 'warning', text: '已取消' },
  };
  const config = statusMap[status] || { color: 'default', text: status };
  return <Tag color={config.color}>{config.text}</Tag>;
};

/** 紧急程度标签 */
export const UrgencyTag: React.FC<{ urgency: string }> = ({ urgency }) => {
  const urgencyMap: Record<string, { color: string; text: string }> = {
    normal: { color: 'default', text: '普通' },
    urgent: { color: 'warning', text: '紧急' },
    very_urgent: { color: 'error', text: '非常紧急' },
  };
  const config = urgencyMap[urgency] || { color: 'default', text: urgency };
  return <Tag color={config.color}>{config.text}</Tag>;
};

/** 左侧栏：基本信息 + ERP 状态 + 表单内容 */
export const DetailLeftColumn: React.FC<{
  detail: ApprovalDetail;
  resolvedMap: Record<string, string>;
}> = ({ detail, resolvedMap }) => {
  // 动态获取 ERP 客户执照图片 URL（兼容历史审批数据中缺少 _erpLicenseUrls 的情况）
  const { erpLicenseUrls } = useErpLicenseResolve(detail.formSchema, detail.formData);

  return (
  <>
    <Card title="基本信息" className={styles.card}>
      <Descriptions column={2} bordered size="small">
        <Descriptions.Item label="申请编号">{detail.instanceNo}</Descriptions.Item>
        <Descriptions.Item label="申请类型">{detail.formTypeName}</Descriptions.Item>
        <Descriptions.Item label="申请人">{detail.applicantName}</Descriptions.Item>
        <Descriptions.Item label="申请部门">{detail.applicantDept || '-'}</Descriptions.Item>
        <Descriptions.Item label="申请时间">{formatDateTime(detail.submittedAt)}</Descriptions.Item>
        <Descriptions.Item label="紧急程度"><UrgencyTag urgency={detail.urgency} /></Descriptions.Item>
        <Descriptions.Item label="审批状态" span={2}>
          <ApprovalStatusTag status={detail.status} />
        </Descriptions.Item>
      </Descriptions>
    </Card>
    {detail.erpMeta && (
      <ErpStatusCard instanceId={detail.id} erpMeta={detail.erpMeta} cardClassName={styles.card} />
    )}
    <Card title="表单内容" className={styles.card}>
      <Descriptions column={2} bordered size="small">
        {detail.formSchema?.fields?.map((field) => {
          const value = detail.formData[field.key];
          if (field.visibleWhen && !checkCondition(field.visibleWhen, detail.formData)) return null;
          if (field.key.startsWith('_')) return null;
          return (
            <Descriptions.Item key={field.key} label={field.label}>
              <FieldRenderer field={field} value={value} formData={detail.formData} resolvedMap={resolvedMap} erpLicenseUrls={erpLicenseUrls} />
            </Descriptions.Item>
          );
        })}
      </Descriptions>
    </Card>
  </>
  );
};
