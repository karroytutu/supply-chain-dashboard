import React from 'react';
import UserAvatar from '@/components/UserAvatar';
import styles from './ApprovalFlow.less';

interface TimelineStartNodeProps {
  applicantName?: string;
  applicantAvatar?: string | null;
}

const TimelineStartNode: React.FC<TimelineStartNodeProps> = ({
  applicantName,
}) => {
  return (
    <div className={styles.timelineMeta}>
      <span className={styles.timelineOperator}>{applicantName || '未知'}</span>
    </div>
  );
};

export const StartNodeIcon: React.FC<TimelineStartNodeProps> = ({
  applicantName,
  applicantAvatar,
}) => {
  return (
    <UserAvatar
      size={36}
      src={applicantAvatar ?? undefined}
      name={applicantName}
      style={applicantAvatar ? undefined : { backgroundColor: '#1890ff', color: '#fff' }}
    />
  );
};

export default TimelineStartNode;
