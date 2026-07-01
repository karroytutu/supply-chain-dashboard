/**
 * 错误边界组件
 * 捕获子组件渲染异常，展示降级 UI 而非白屏
 */
import React from 'react';
import { Button, Result } from 'antd';
import styles from './index.less';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class TargetErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[TargetManagement] Render error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.errorFallback}>
          <Result
            status="error"
            title="页面渲染异常"
            subTitle={this.state.error?.message || '未知错误'}
            extra={
              <Button type="primary" onClick={this.handleRetry}>
                重试
              </Button>
            }
          />
        </div>
      );
    }
    return this.props.children;
  }
}

export default TargetErrorBoundary;
