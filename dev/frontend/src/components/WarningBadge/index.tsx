import React from 'react';
import type { WarningLevel } from '@/types/dashboard';
import { getWarningConfig } from '@/utils/warning';
import styles from './index.less';

interface WarningBadgeProps {
  level: WarningLevel;
  type?: 'expiring' | 'slowMoving';
  showLabel?: boolean;
  showIcon?: boolean;
}

const WarningBadge: React.FC<WarningBadgeProps> = ({
  level,
  type = 'expiring',
  showLabel = true,
  showIcon = true,
}) => {
  const config = getWarningConfig(type, level);

  return (
    <span
      className={`${styles.warningBadge} ${styles[level]}`}
      style={{
        backgroundColor: config.bgColor,
        color: config.color,
      }}
    >
      {showIcon && <span className={styles.icon}>{config.icon}</span>}
      {showLabel && <span className={styles.label}>{config.label}</span>}
    </span>
  );
};

export default WarningBadge;
