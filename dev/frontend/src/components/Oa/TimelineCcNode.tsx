import React, { useState } from 'react';
import { SendOutlined, UpOutlined, DownOutlined } from '@ant-design/icons';
import UserAvatar from '@/components/UserAvatar';
import type { CcUser } from '@/types/oa';
import styles from './ApprovalFlow.less';

interface TimelineCcNodeProps {
  ccUsers: CcUser[];
}

const TimelineCcNode: React.FC<TimelineCcNodeProps> = ({ ccUsers }) => {
  const [expanded, setExpanded] = useState(true);
  const readCount = ccUsers.filter((u) => u.readAt).length;

  return (
    <div className={styles.timelineCc}>
      <div
        className={styles.timelineCcHeader}
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
      >
        <span className={styles.timelineCcTitle}>
          <SendOutlined className={styles.timelineCcIcon} />
          抄送人
          <span className={styles.timelineCcCount}>（{ccUsers.length}人）</span>
        </span>
        <span className={styles.timelineCcStatus}>
          {readCount > 0 ? (
            <span>
              已读{readCount}人
            </span>
          ) : (
            <span>全部未读</span>
          )}
          {expanded ? (
            <UpOutlined className={styles.timelineCcArrow} />
          ) : (
            <DownOutlined className={styles.timelineCcArrow} />
          )}
        </span>
      </div>

      {expanded && (
        <div className={styles.timelineCcList}>
          {ccUsers.map((user) => (
            <div className={styles.timelineCcItem} key={user.id}>
              <UserAvatar
                size={32}
                src={user.avatar ?? undefined}
                name={user.userName ?? undefined}
              />
              <span className={styles.timelineCcName}>
                {user.userName || '未知'}
              </span>
              {user.readAt && (
                <span className={styles.timelineCcRead}>已读</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TimelineCcNode;
