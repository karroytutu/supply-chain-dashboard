/**
 * 问候横幅组件
 * 根据时段显示问候语 + 当前日期
 */

import React from 'react';
import { usePermission } from '@/hooks/usePermission';
import styles from './GreetingBanner.less';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 9) return '早上好';
  if (hour < 12) return '上午好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function formatDate(): { day: string; detail: string } {
  const now = new Date();
  const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const day = String(now.getDate()).padStart(2, '0');
  const detail = `${now.getFullYear()}年${now.getMonth() + 1}月 · ${weekDays[now.getDay()]}`;
  return { day, detail };
}

const GreetingBanner: React.FC<{ pendingCount: number }> = ({ pendingCount }) => {
  const { currentUser } = usePermission();
  const greeting = getGreeting();
  const { day, detail } = formatDate();
  const userName = currentUser?.name || '用户';

  return (
    <div className={styles.banner}>
      <div className={styles.left}>
        <h1 className={styles.title}>
          {greeting}，{userName}
        </h1>
        <div className={styles.subtitle}>
          {pendingCount > 0 ? (
            <>
              今天有 <strong className={styles.highlight}>{pendingCount}</strong> 项待办事项需要处理
            </>
          ) : (
            '暂无待办事项，一切就绪'
          )}
        </div>
      </div>
      <div className={styles.right}>
        <div className={styles.dateNum}>{day}</div>
        <div className={styles.dateDetail}>{detail}</div>
      </div>
    </div>
  );
};

export default GreetingBanner;
