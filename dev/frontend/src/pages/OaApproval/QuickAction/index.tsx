/**
 * OA审批快速操作页
 * 从钉钉ActionCard"同意"按钮跳转过来的轻量级审批页面
 * 支持：Token验证 → 确认弹窗 → 一键审批 → 结果展示
 */
import React from 'react';
import { history } from 'umi';
import { Button, Card, Result, Spin, Typography, Space } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { useQuickActionToken } from './useQuickActionToken';
import type { TokenData } from './useQuickActionToken';

const { Text, Title } = Typography;

/** 获取已处理审批的状态文本 */
const getStatusText = (status?: string): string => {
  switch (status) {
    case 'approved': return '已通过';
    case 'rejected': return '已拒绝';
    case 'withdrawn': return '已撤回';
    default: return status || '未知';
  }
};

/** 导航到审批详情页 */
const goToDetail = (tokenData: TokenData | null) => {
  if (tokenData?.instanceId) {
    history.push(`/oa/detail/${tokenData.instanceId}`);
  } else {
    history.push('/oa/center');
  }
};

/** 导航到审批中心 */
const goToCenter = () => {
  history.push('/oa/center');
};

const QuickAction: React.FC = () => {
  const { pageState, tokenData, errorMsg, handleConfirm, retry } = useQuickActionToken();

  // 渲染不同状态
  const renderContent = () => {
    switch (pageState) {
      case 'loading':
        return (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} />} />
            <div style={{ marginTop: 16, color: '#999' }}>正在验证链接...</div>
          </div>
        );

      case 'confirm':
        return (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <ExclamationCircleOutlined style={{ fontSize: 48, color: '#faad14' }} />
            <Title level={4} style={{ marginTop: 16 }}>
              确认通过此审批？
            </Title>
            {tokenData && (
              <div style={{ margin: '16px 0', color: '#666' }}>
                <div><Text type="secondary">审批标题：</Text>{tokenData.title}</div>
                <div><Text type="secondary">表单类型：</Text>{tokenData.formTypeName}</div>
                <div><Text type="secondary">审批编号：</Text>{tokenData.instanceNo}</div>
              </div>
            )}
            <Space>
              <Button type="primary" size="large" onClick={handleConfirm}>
                确认通过
              </Button>
              <Button size="large" onClick={() => goToDetail(tokenData)}>
                查看详情
              </Button>
            </Space>
          </div>
        );

      case 'executing':
        return (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} />} />
            <div style={{ marginTop: 16, color: '#999' }}>正在执行审批操作...</div>
          </div>
        );

      case 'success':
        return (
          <Result
            icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
            title="审批已通过"
            subTitle={tokenData?.title}
            extra={[
              <Button type="primary" key="detail" onClick={() => goToDetail(tokenData)}>
                查看详情
              </Button>,
              <Button key="center" onClick={goToCenter}>
                返回审批中心
              </Button>,
            ]}
          />
        );

      case 'expired':
        return (
          <Result
            icon={<CloseCircleOutlined style={{ color: '#999' }} />}
            title="链接已失效"
            subTitle="此操作链接已过期或已被使用，请在审批中心中操作"
            extra={
              <Button type="primary" onClick={goToCenter}>
                前往审批中心
              </Button>
            }
          />
        );

      case 'already_processed':
        return (
          <Result
            icon={<CheckCircleOutlined style={{ color: '#1890ff' }} />}
            title="该审批已处理"
            subTitle={`审批"${tokenData?.title}"当前状态为：${getStatusText(tokenData?.instanceStatus)}`}
            extra={[
              <Button type="primary" key="detail" onClick={() => goToDetail(tokenData)}>
                查看详情
              </Button>,
            ]}
          />
        );

      case 'error':
        return (
          <Result
            icon={<CloseCircleOutlined style={{ color: '#f5222d' }} />}
            title="操作失败"
            subTitle={errorMsg}
            extra={[
              <Button type="primary" key="retry" onClick={retry}>
                重试
              </Button>,
              <Button key="center" onClick={goToCenter}>
                前往审批中心
              </Button>,
            ]}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f5f7fa',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    }}>
      <Card
        style={{ maxWidth: 480, width: '100%' }}
        bodyStyle={{ padding: '32px 24px' }}
      >
        {renderContent()}
      </Card>
    </div>
  );
};

export default QuickAction;
