/**
 * 错误状态组件
 * 加载失败时显示
 */
import React from 'react';
import { Button } from 'antd';
import { ReloadOutlined, WarningOutlined } from '@ant-design/icons';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

const ErrorState: React.FC<ErrorStateProps> = ({
  message = '网络异常，请稍后重试',
  onRetry,
}) => {
  return (
    <div className="error-state">
      <WarningOutlined style={{ fontSize: 48, color: '#ff4d4f' }} />
      <p className="error-title">加载失败</p>
      <p className="error-desc">{message}</p>
      {onRetry && (
        <Button type="primary" icon={<ReloadOutlined />} onClick={onRetry}>
          重新加载
        </Button>
      )}
    </div>
  );
};

export default ErrorState;
