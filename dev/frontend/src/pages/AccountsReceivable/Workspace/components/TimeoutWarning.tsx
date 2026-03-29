/**
 * 超时预警组件
 * 显示任务剩余时间或超时时长
 */
import React from 'react';
import { Alert, Tag } from 'antd';
import { ClockCircleOutlined, WarningOutlined } from '@ant-design/icons';
import styles from './TimeoutWarning.less';

interface TimeoutWarningProps {
  remainingHours?: number;
  timeoutDays?: number;
  penaltyAmount?: number;
}

const TimeoutWarning: React.FC<TimeoutWarningProps> = ({
  remainingHours,
  timeoutDays,
  penaltyAmount,
}) => {
  // 格式化剩余时间
  const formatRemainingTime = (hours: number): string => {
    if (hours <= 0) return '已超时';
    const days = Math.floor(hours / 24);
    const remainingHours = Math.floor(hours % 24);
    if (days > 0) {
      return `剩余 ${days} 天 ${remainingHours} 小时`;
    }
    return `剩余 ${remainingHours} 小时`;
  };

  // 格式化超时时间
  const formatTimeoutTime = (days: number): string => {
    return `已超时 ${days} 天`;
  };

  // 判断是否已超时
  const isTimeout = (timeoutDays && timeoutDays > 0) || (remainingHours !== undefined && remainingHours <= 0);

  if (isTimeout) {
    return (
      <div className={styles.timeoutWarning}>
        <Alert
          message={
            <div className={styles.alertContent}>
              <WarningOutlined className={styles.timeoutIcon} />
              <span className={styles.timeoutText}>
                {timeoutDays ? formatTimeoutTime(timeoutDays) : '已超时'}
              </span>
              {penaltyAmount !== undefined && penaltyAmount > 0 && (
                <Tag color="red" className={styles.penaltyTag}>
                  考核金额: ¥{penaltyAmount.toFixed(2)}
                </Tag>
              )}
            </div>
          }
          type="error"
          showIcon={false}
          banner
        />
      </div>
    );
  }

  // 剩余时间警告（小于24小时显示橙色）
  const isUrgent = remainingHours !== undefined && remainingHours < 24;

  return (
    <div className={styles.timeoutWarning}>
      <Alert
        message={
          <div className={styles.alertContent}>
            <ClockCircleOutlined className={isUrgent ? styles.urgentIcon : styles.normalIcon} />
            <span className={isUrgent ? styles.urgentText : styles.normalText}>
              {remainingHours !== undefined ? formatRemainingTime(remainingHours) : ''}
            </span>
          </div>
        }
        type={isUrgent ? 'warning' : 'info'}
        showIcon={false}
        banner
      />
    </div>
  );
};

export default TimeoutWarning;
