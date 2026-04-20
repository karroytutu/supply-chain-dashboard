/**
 * ERP处理状态卡片
 * 展示审批关联的ERP处理进度、错误信息和重试操作
 */
import React, { useState } from 'react';
import { Card, Descriptions, Button, Tag, Alert, message } from 'antd';
import { RedoOutlined } from '@ant-design/icons';
import type { ErpMeta } from '@/types/oa-approval';
import { oaApprovalApi } from '@/services/api/oa-approval';

/** ERP处理状态标签 */
const ErpStatusTag: React.FC<{ status: ErpMeta['status'] }> = ({ status }) => {
  const statusMap: Record<string, { color: string; text: string }> = {
    pending: { color: 'default', text: '待处理' },
    paying: { color: 'processing', text: '支付中' },
    purchasing: { color: 'processing', text: '采购中' },
    storing: { color: 'processing', text: '入库中' },
    completed: { color: 'success', text: '已完成' },
    erp_failed: { color: 'error', text: 'ERP处理失败' },
  };
  const config = statusMap[status] || { color: 'default', text: status };
  return <Tag color={config.color}>{config.text}</Tag>;
};

interface ErpStatusCardProps {
  instanceId: number;
  erpMeta: ErpMeta;
  cardClassName?: string;
}

const ErpStatusCard: React.FC<ErpStatusCardProps> = ({ instanceId, erpMeta, cardClassName }) => {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await oaApprovalApi.retryErpOperation(instanceId);
      message.success('ERP重试已触发，请稍后刷新查看');
    } catch (err: any) {
      message.error(err.message || '重试失败');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <Card title="ERP处理状态" className={cardClassName} size="small">
      {erpMeta.status === 'erp_failed' && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message="ERP处理失败"
          description={
            erpMeta.requestLog?.error
              ? String(erpMeta.requestLog.error)
              : '请点击重试按钮重新处理'
          }
          action={
            <Button
              size="small"
              danger
              icon={<RedoOutlined />}
              loading={retrying}
              onClick={handleRetry}
            >
              重试
            </Button>
          }
        />
      )}
      <Descriptions column={2} size="small">
        <Descriptions.Item label="处理状态">
          <ErpStatusTag status={erpMeta.status} />
        </Descriptions.Item>
        <Descriptions.Item label="申请编号">
          {erpMeta.applicationNo || '-'}
        </Descriptions.Item>
        {erpMeta.retries > 0 && (
          <Descriptions.Item label="重试次数">
            {erpMeta.retries}
          </Descriptions.Item>
        )}
      </Descriptions>
    </Card>
  );
};

export default ErpStatusCard;
