import React from 'react';
import styles from './ApprovalFlow.less';

interface TimelineItemProps {
  /** 左侧图标/头像 */
  icon: React.ReactNode;
  /** 节点标题 */
  title: string;
  /** 副标题（如角色名） */
  subtitle?: string;
  /** 状态文字（如“已同意”“待处理”） */
  status?: string;
  /** 状态文字颜色 */
  statusColor?: string;
  /** 右侧时间 */
  time?: string | null;
  /** 是否为第一项（控制竖线是否从顶部开始） */
  isFirst?: boolean;
  /** 是否为最后一项（控制竖线是否延续到底部） */
  isLast?: boolean;
  children?: React.ReactNode;
}

/** 计算连线的内联样式 */
function getLineStyle(
  isFirst?: boolean,
  isLast?: boolean,
): React.CSSProperties | undefined {
  if (isFirst && isLast) return undefined; // 唯一节点不渲染线
  if (isFirst) return { top: 20, bottom: 0 }; // 首节点：从 dot 中心开始
  if (isLast) return { top: 0, height: 20 };  // 末节点：到 dot 中心结束
  return undefined; // 中间节点：top:0; bottom:0 由 CSS 控制
}

const TimelineItem: React.FC<TimelineItemProps> = ({
  icon,
  title,
  subtitle,
  status,
  statusColor,
  time,
  isFirst,
  isLast,
  children,
}) => {
  const lineStyle = getLineStyle(isFirst, isLast);
  const showLine = !(isFirst && isLast);

  return (
    <div className={styles.timelineItem}>
      {showLine && (
        <div className={styles.timelineLine} style={lineStyle} />
      )}
      <div className={styles.timelineLeft}>
        <div className={styles.timelineDot}>{icon}</div>
      </div>
      <div className={styles.timelineContent}>
        <div className={styles.timelineHeader}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
            <span className={styles.timelineTitle}>{title}</span>
            {subtitle && <span className={styles.timelineSubtitle}>{subtitle}</span>}
            {status && (
              <span className={styles.timelineStatus} style={{ color: statusColor }}>{status}</span>
            )}
          </div>
          {time && <span className={styles.timelineTime}>{time}</span>}
        </div>
        {children}
      </div>
    </div>
  );
};

export default TimelineItem;
