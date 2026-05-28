import React from 'react';
import { Card, Descriptions } from 'antd';
import type { ApprovalDetail } from '@/types/oa-approval';
import { FormFieldRenderer as FieldRenderer } from '@/components/OaApproval';
export { default as ApprovalStatusTag } from '@/components/OaApproval/ApprovalStatusTag';
import { useErpLicenseResolve } from '@/components/OaApproval/hooks/useErpLicenseResolve';
import { checkCondition } from '../../Form/components/ConditionalFieldWrapper';
import LicenseDeferredCard from './LicenseDeferredCard';
import styles from '../index.less';

/** 左侧栏：表单内容（+ 条件性的营业执照补交卡片） */
export const DetailLeftColumn: React.FC<{
  detail: ApprovalDetail;
  resolvedMap: Record<string, string>;
}> = ({ detail, resolvedMap }) => {
  // 动态获取 ERP 客户执照图片 URL（兼容历史审批数据中缺少 _erpLicenseUrls 的情况）
  const { erpLicenseUrls } = useErpLicenseResolve(detail.formSchema, detail.formData);

  return (
  <>
    {/* 客户授信审批通过后，展示营业执照延期补交卡片 */}
    {detail.formTypeCode === 'customer_credit' && (
      <LicenseDeferredCard
        instanceId={detail.id}
        approvalStatus={detail.status}
        applicantId={detail.applicantId}
        customerId={detail.formData?.customerId as number | undefined}
        cardClassName={styles.card}
      />
    )}
    <Card title="表单内容" className={styles.card}>
      <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
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
