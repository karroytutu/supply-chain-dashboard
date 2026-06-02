/**
 * 营业执照延期补交卡片
 * 在流程详情页左栏显示，提示营销员补交营业执照
 */
import React, { useState, useEffect } from 'react';
import { Card, Tag, Descriptions, Button, Alert, Space, Typography } from 'antd';
import {
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import type { LicenseDeferredRecord, LicenseDeferredStatus } from '@/services/api/oa';
import { getLicenseDeferredByInstance } from '@/services/api/oa';
import { usePermission } from '@/hooks/usePermission';
import { formatDateTime } from '@/utils/format';
import SupplementLicenseModal from './SupplementLicenseModal';

const { Text } = Typography;

/** 状态配置 */
const statusConfig: Record<LicenseDeferredStatus, { color: string; icon: React.ReactNode; label: string }> = {
  pending: { color: 'processing', icon: <ClockCircleOutlined />, label: '待补交' },
  reminded: { color: 'warning', icon: <ClockCircleOutlined />, label: '已提醒' },
  overdue: { color: 'error', icon: <ExclamationCircleOutlined />, label: '已逾期' },
  completed: { color: 'success', icon: <CheckCircleOutlined />, label: '已补交' },
};

interface LicenseDeferredCardProps {
  instanceId: number;
  /** 审批状态，仅 approved 时才显示此卡片 */
  approvalStatus: string;
  /** 申请人ID */
  applicantId?: number;
  /** 客户ID（补交上传时需要） */
  customerId?: number;
  /** 卡片样式类名 */
  cardClassName?: string;
}

const LicenseDeferredCard: React.FC<LicenseDeferredCardProps> = ({
  instanceId,
  approvalStatus,
  applicantId,
  customerId,
  cardClassName,
}) => {
  const { currentUser } = usePermission();
  const [deferredRecord, setDeferredRecord] = useState<LicenseDeferredRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  // 加载延期补交记录
  useEffect(() => {
    if (approvalStatus !== 'approved') return;
    let cancelled = false;
    setLoading(true);
    getLicenseDeferredByInstance(instanceId)
      .then((data) => {
        if (!cancelled) setDeferredRecord(data);
      })
      .catch(() => {
        // 没有延期记录是正常情况（申请时已上传执照）
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [instanceId, approvalStatus]);

  // 审批未通过时不显示
  if (approvalStatus !== 'approved') return null;
  // 正在加载时不显示
  if (loading) return null;
  // 没有延期记录时不显示（说明申请时已上传执照）
  if (!deferredRecord) return null;

  const config = statusConfig[deferredRecord.status];
  const isCompleted = deferredRecord.status === 'completed';
  const isOverdue = deferredRecord.status === 'overdue';
  // 仅申请人自己可以补交
  const canSupplement = !isCompleted && currentUser?.id === applicantId;

  const handleSupplementSuccess = () => {
    setModalVisible(false);
    // 刷新延期记录
    getLicenseDeferredByInstance(instanceId).then(setDeferredRecord);
  };

  return (
    <>
      <Card
        title={
          <Space>
            <ExclamationCircleOutlined style={{ color: isOverdue ? '#f5222d' : '#faad14' }} />
            <span>营业执照补交</span>
          </Space>
        }
        className={cardClassName}
        extra={
          canSupplement ? (
            <Button
              type="primary"
              size="small"
              icon={<UploadOutlined />}
              onClick={() => setModalVisible(true)}
            >
              补交上传
            </Button>
          ) : null
        }
      >
        {/* 逾期警告 */}
        {isOverdue && (
          <Alert
            message="营业执照已逾期未补交"
            description={`已逾期 ${deferredRecord.overdueDays} 天，累计考核金额 ${deferredRecord.penaltyAmount} 元，请尽快上传营业执照以停止考核。`}
            type="error"
            showIcon
            style={{ marginBottom: 12 }}
          />
        )}

        {/* 即将到期提醒 */}
        {!isCompleted && !isOverdue && deferredRecord.remainingDays !== undefined && deferredRecord.remainingDays <= 2 && (
          <Alert
            message="营业执照即将到期"
            description={`剩余 ${deferredRecord.remainingDays} 天，请尽快补交。`}
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
          />
        )}

        <Descriptions column={1} size="small">
          <Descriptions.Item label="补交状态">
            <Tag icon={config.icon} color={config.color}>{config.label}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="截止时间">
            <Text type={isOverdue ? 'danger' : undefined}>
              {formatDateTime(deferredRecord.deadline)}
            </Text>
          </Descriptions.Item>
          {!isCompleted && deferredRecord.remainingDays !== undefined && (
            <Descriptions.Item label="剩余天数">
              <Text type={deferredRecord.remainingDays <= 2 ? 'danger' : 'warning'}>
                {deferredRecord.remainingDays} 天
              </Text>
            </Descriptions.Item>
          )}
          {isOverdue && (
            <>
              <Descriptions.Item label="逾期天数">
                <Text type="danger">{deferredRecord.overdueDays} 天</Text>
              </Descriptions.Item>
              <Descriptions.Item label="累计考核金额">
                <Text type="danger">{deferredRecord.penaltyAmount} 元</Text>
              </Descriptions.Item>
            </>
          )}
          {isCompleted && deferredRecord.completedAt && (
            <Descriptions.Item label="补交时间">
              {formatDateTime(deferredRecord.completedAt)}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {canSupplement && (
        <SupplementLicenseModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          onSuccess={handleSupplementSuccess}
          instanceId={instanceId}
          customerId={customerId!}
        />
      )}
    </>
  );
};

export default LicenseDeferredCard;
