/**
 * Chunk 加载错误边界组件
 * 捕获 React.lazy() / loadable 动态导入的 chunk 加载失败错误
 */
import React from 'react';
import { Button, Result } from 'antd';
import { isChunkLoadError, handleChunkError } from '@/utils/chunk-error-handler';

interface ChunkErrorBoundaryState {
  hasError: boolean;
  isChunkError: boolean;
}

interface ChunkErrorBoundaryProps {
  children: React.ReactNode;
}

export default class ChunkErrorBoundary extends React.Component<
  ChunkErrorBoundaryProps,
  ChunkErrorBoundaryState
> {
  constructor(props: ChunkErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, isChunkError: false };
  }

  static getDerivedStateFromError(error: Error): ChunkErrorBoundaryState {
    const isChunk = isChunkLoadError(error);
    return { hasError: true, isChunkError: isChunk };
  }

  componentDidCatch(error: Error): void {
    if (isChunkLoadError(error)) {
      handleChunkError(error);
    }
  }

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.state.isChunkError) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
          <Result
            status="warning"
            title="页面需要更新"
            subTitle="应用已更新，请刷新页面加载最新版本"
            extra={
              <Button type="primary" onClick={() => window.location.reload()}>
                刷新页面
              </Button>
            }
          />
        </div>
      );
    }

    // 非 chunk 错误，抛出让 React 默认处理
    throw this.state;
  }
}
