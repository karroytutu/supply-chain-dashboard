/**
 * 法律催收进展时间线
 * 仅在 escalation_level=2 (财务处理) 时显示
 */
import React from 'react';
import { Timeline, Empty, Button, Space, Tag } from 'antd';
import {
  ArrowUpOutlined,
  SendOutlined,
  FileTextOutlined,
  SyncOutlined,
  PaperClipOutlined,
} from '@ant-design/icons';
import type { LegalProgress as LegalProgressType } from '@/types/ar-collection';
import type { ModalType } from '../hooks/useTaskDetail';

interface LegalProgressProps {
  progress: LegalProgressType[];
  onAction: (type: ModalType) => void;
}

/** 法律操作类型配置 */
const LEGAL_ACTION_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
  send_notice: {
    label: '发送催收函',
    color: '#ff7a45',
    icon: <SendOutlined />,
  },
  file_lawsuit: {
    label: '提起诉讼',
    color: '#ff4d4f',
    icon: <FileTextOutlined />,
  },
  update_progress: {
    label: '更新进展',
    color: '#1890ff',
    icon: <SyncOutlined />,
  },
};

/** 格式化时间 */
const formatDateTime = (dateStr: string): string => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
};

const LegalProgress: React.FC<LegalProgressProps> = ({ progress, onAction }) => {
  if (!progress || progress.length === 0) {
    return (
      <div className="legal-progress-section">
        <div className="section-title">
          <FileTextOutlined style={{ marginRight: 6 }} />
          法律催收进展
        </div>
        <Empty description="暂无法律催收进展" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        <div className="legal-actions">
          <Space>
            <Button size="small" onClick={() => onAction('sendNotice')}>
              发送催收函
            </Button>
            <Button size="small" onClick={() => onAction('lawsuit')}>
              提起诉讼
            </Button>
          </Space>
        </div>
      </div>
    );
  }

  const items = progress.map((item) => {
    const config = LEGAL_ACTION_CONFIG[item.action] || {
      label: item.action,
      color: '#8c8c8c',
      icon: <SyncOutlined />,
    };

    return {
      color: config.color,
      dot: config.icon,
      children: (
        <div className="legal-timeline-item">
          <div className="legal-item-header">
            <Tag color={config.color}>{config.label}</Tag>
            <span className="legal-item-time">{formatDateTime(item.createdAt)}</span>
          </div>
          {item.operatorName && (
            <div className="legal-item-operator">操作人: {item.operatorName}</div>
          )}
          {item.description && (
            <div className="legal-item-desc">{item.description}</div>
          )}
          {item.attachmentUrl && (
            <a
              href={item.attachmentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="legal-item-attachment"
            >
              <PaperClipOutlined /> 查看附件
            </a>
          )}
        </div>
      ),
    };
  });

  return (
    <div className="legal-progress-section">
      <div className="section-title">
        <FileTextOutlined style={{ marginRight: 6 }} />
        法律催收进展
      </div>
      <Timeline items={items} />
      <div className="legal-actions">
        <Space>
          <Button size="small" onClick={() => onAction('updateLegalProgress')}>
            更新进展
          </Button>
          <Button size="small" onClick={() => onAction('sendNotice')}>
            发送催收函
          </Button>
          <Button size="small" onClick={() => onAction('lawsuit')}>
            提起诉讼
          </Button>
        </Space>
      </div>
    </div>
  );
};

export default LegalProgress;
