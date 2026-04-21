/**
 * 更多信息折叠区域
 * 操作历史
 */
import React from 'react';
import { Collapse } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import useMedia from '@/pages/Collection/Overview/hooks/useMedia';
import ActionTimeline from '../../components/ActionTimeline';
import type { CollectionAction } from '@/types/ar-collection';

interface MoreInfoProps {
  actions: CollectionAction[];
}

const MoreInfo: React.FC<MoreInfoProps> = ({ actions }) => {
  const { isMobile } = useMedia();

  const items = [
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
      <Collapse items={items} defaultActiveKey={isMobile ? [] : ['history']} ghost />
    </div>
  );
};

export default MoreInfo;
