/**
 * 更多信息折叠区域
 * 任务基本信息、延期状态提示、操作历史
 */
import React from 'react';
import { Collapse, Descriptions, Alert } from 'antd';
import { InfoCircleOutlined, HistoryOutlined, HourglassOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import ActionTimeline from '../../components/ActionTimeline';
import type { CollectionTask, CollectionAction } from '@/types/ar-collection';

interface MoreInfoProps {
  task: CollectionTask;
  actions: CollectionAction[];
}

/** 格式化时间为相对描述 */
const formatRelativeTime = (dateStr: string): string => {
  if (!dateStr) return '-';
  const diff = dayjs().diff(dayjs(dateStr), 'day');
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  return `${diff}天前`;
};

/** 计算延期剩余天数 */
const getExtensionRemaining = (until: string | null): number => {
  if (!until) return 0;
  return Math.max(0, dayjs(until).diff(dayjs(), 'day'));
};

const MoreInfo: React.FC<MoreInfoProps> = ({ task, actions }) => {
  const isExtension = task.status === 'extension' && task.extensionUntil;
  const extensionRemaining = getExtensionRemaining(task.extensionUntil);

  const items = [
    {
      key: 'basic',
      label: (
        <span>
          <InfoCircleOutlined style={{ marginRight: 6 }} />
          任务基本信息
        </span>
      ),
      children: (
        <div>
          {isExtension && (
            <Alert
              type="warning"
              icon={<HourglassOutlined />}
              showIcon
              message={
                <span>
                  延期至 {task.extensionUntil?.slice(0, 10)} (剩余{extensionRemaining}天)
                  {!task.canExtend && ' · 不允许再次延期'}
                </span>
              }
              style={{ marginBottom: 16 }}
            />
          )}
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="任务编号">{task.taskNo}</Descriptions.Item>
            <Descriptions.Item label="责任人">{task.managerUserName}</Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {task.createdAt?.slice(0, 10)}
            </Descriptions.Item>
            <Descriptions.Item label="单据数量">{task.billCount} 笔</Descriptions.Item>
            <Descriptions.Item label="延期次数">{task.extensionCount} 次</Descriptions.Item>
            <Descriptions.Item label="升级次数">{task.escalationCount} 次</Descriptions.Item>
            <Descriptions.Item label="催收次数">{task.collectionCount} 次</Descriptions.Item>
            <Descriptions.Item label="最后跟进">
              {formatRelativeTime(task.lastCollectionAt)}
            </Descriptions.Item>
          </Descriptions>
        </div>
      ),
    },
    {
      key: 'history',
      label: (
        <span>
          <HistoryOutlined style={{ marginRight: 6 }} />
          操作历史 ({actions.length}条)
        </span>
      ),
      children: <ActionTimeline actions={actions} />,
    },
  ];

  return (
    <div className="more-info-section">
      <Collapse items={items} defaultActiveKey={['basic', 'history']} ghost />
    </div>
  );
};

export default MoreInfo;
