/**
 * 批量操作栏组件
 * 显示选中任务数量和批量操作按钮
 */
import React from 'react';
import { Button, Space, Popconfirm } from 'antd';
import {
  DollarOutlined,
  ClockCircleOutlined,
  ArrowUpOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import type { CollectionTask } from '@/types/ar-collection';

interface BatchActionBarProps {
  selectedCount: number;
  selectedTasks: CollectionTask[];
  onBatchVerify: () => void;
  onBatchExtension: () => void;
  onBatchEscalate: () => void;
  onClearSelection: () => void;
}

const BatchActionBar: React.FC<BatchActionBarProps> = ({
  selectedCount,
  selectedTasks,
  onBatchVerify,
  onBatchExtension,
  onBatchEscalate,
  onClearSelection,
}) => {
  if (selectedCount === 0) return null;

  // 检查是否可以批量核销（相同状态且非已核销/已关闭）
  const canBatchVerify = selectedTasks.every(
    (t) => !['verified', 'closed', 'pending_verify'].includes(t.status),
  );

  // 检查是否可以批量延期（可延期）
  const canBatchExtension = selectedTasks.every(
    (t) => t.canExtend !== false && !['verified', 'closed', 'pending_verify'].includes(t.status),
  );

  // 检查是否可以批量升级
  const canBatchEscalate = selectedTasks.every(
    (t) => !['verified', 'closed', 'pending_verify'].includes(t.status),
  );

  return (
    <div className="batch-action-bar">
      <span className="selected-count">已选择 {selectedCount} 项</span>
      <Space size="small">
        <Button
          size="small"
          icon={<DollarOutlined />}
          disabled={!canBatchVerify}
          onClick={onBatchVerify}
        >
          批量核销
        </Button>
        <Button
          size="small"
          icon={<ClockCircleOutlined />}
          disabled={!canBatchExtension}
          onClick={onBatchExtension}
        >
          批量延期
        </Button>
        <Popconfirm
          title="确认批量升级？"
          description="选中的任务将统一升级处理"
          onConfirm={onBatchEscalate}
          disabled={!canBatchEscalate}
        >
          <Button
            size="small"
            icon={<ArrowUpOutlined />}
            disabled={!canBatchEscalate}
            danger
          >
            批量升级
          </Button>
        </Popconfirm>
        <Button
          size="small"
          icon={<CloseOutlined />}
          onClick={onClearSelection}
        >
          取消选择
        </Button>
      </Space>
    </div>
  );
};

export default BatchActionBar;
