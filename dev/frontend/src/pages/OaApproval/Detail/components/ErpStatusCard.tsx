import React from 'react';
import { Card, Tag, Descriptions, Button } from 'antd';
import {
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import type { ErpMeta } from '@/types/oa-approval';

interface ErpStatusCardProps {
  instanceId: number;
  erpMeta: ErpMeta;
  cardClassName?: string;
}

/** ERP 处理状态配置 */
const erpStatusConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  pending: { color: 'default', icon: <SyncOutlined />, label: '待处理' },
  paying: { color: 'processing', icon: <LoadingOutlined />, label: '付款中' },
  purchasing: { color: 'processing', icon: <LoadingOutlined />, label: '采购中' },
  storing: { color: 'processing', icon: <LoadingOutlined />, label: '入库中' },
  completed: { color: 'success', icon: <CheckCircleOutlined />, label: '已完成' },
  erp_failed: { color: 'error', icon: <CloseCircleOutlined />, label: '处理失败' },
};

const ErpStatusCard: React.FC<ErpStatusCardProps> = ({ instanceId, erpMeta, cardClassName }) => {
  const config = erpStatusConfig[erpMeta.status] || {
    color: 'default',
    icon: <SyncOutlined />,
    label: erpMeta.status,
  };

  return (
    <Card title="ERP 处理状态" className={cardClassName}>
      <Descriptions column={1} size="small">
        <Descriptions.Item label="处理状态">
          <Tag icon={config.icon} color={config.color}>{config.label}</Tag>
        </Descriptions.Item>
        {erpMeta.applicationNo && (
          <Descriptions.Item label="ERP 单号">{erpMeta.applicationNo}</Descriptions.Item>
        )}
        <Descriptions.Item label="重试次数">{erpMeta.retries || 0}</Descriptions.Item>
      </Descriptions>
    </Card>
  );
};

export default ErpStatusCard;
