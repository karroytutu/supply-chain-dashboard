/**
 * 空状态组件
 * 列表无数据时显示
 */
import React from 'react';
import { Empty, Button } from 'antd';
import { FileSearchOutlined } from '@ant-design/icons';

interface EmptyStateProps {
  description?: string;
  showClearButton?: boolean;
  onClear?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  description = '当前筛选条件下没有数据',
  showClearButton = false,
  onClear,
}) => {
  return (
    <div className="empty-state">
      <Empty
        image={<FileSearchOutlined style={{ fontSize: 48, color: '#bfbfbf' }} />}
        description={
          <div className="empty-content">
            <p className="empty-title">暂无催收任务</p>
            <p className="empty-desc">{description}</p>
            {showClearButton && onClear && (
              <Button type="link" onClick={onClear}>
                清除筛选条件
              </Button>
            )}
          </div>
        }
      />
    </div>
  );
};

export default EmptyState;
