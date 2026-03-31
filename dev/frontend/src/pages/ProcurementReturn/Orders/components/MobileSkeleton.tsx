/**
 * 移动端卡片骨架屏组件
 */
import React from 'react';
import { Skeleton } from 'antd';
import styles from '../index.less';

interface MobileSkeletonProps {
  count?: number;
}

const MobileSkeleton: React.FC<MobileSkeletonProps> = ({ count = 3 }) => {
  return (
    <div className={styles.mobileCardList}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className={styles.mobileCard}>
          <div className={styles.mobileCardHeader}>
            <div className={styles.skeletonHeader}>
              <Skeleton.Input active size="small" style={{ width: 120, height: 16 }} />
              <Skeleton.Input active size="small" style={{ width: 180, height: 14, marginTop: 6 }} />
            </div>
            <Skeleton.Button active size="small" style={{ width: 60, height: 22 }} />
          </div>
          
          <div className={styles.mobileCardBody}>
            <div className={styles.mobileCardGrid}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className={styles.mobileCardGridItem}>
                  <Skeleton.Input active size="small" style={{ width: 50, height: 12 }} />
                  <Skeleton.Input active size="small" style={{ width: 60, height: 16, marginTop: 4 }} />
                </div>
              ))}
            </div>
          </div>
          
          <div className={styles.skeletonExpand}>
            <Skeleton.Input active size="small" style={{ width: 80, height: 14 }} />
          </div>
          
          <div className={styles.mobileCardActions}>
            <Skeleton.Button active size="default" style={{ width: '45%', height: 36 }} />
            <Skeleton.Button active size="default" style={{ width: '45%', height: 36 }} />
          </div>
        </div>
      ))}
    </div>
  );
};

export { MobileSkeleton };
export default MobileSkeleton;
