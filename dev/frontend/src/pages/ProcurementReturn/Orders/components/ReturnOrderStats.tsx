/**
 * 退货单统计卡片组件
 * 支持移动端滚动指示器和防误触
 */
import React, { useRef, useState, useEffect } from 'react';
import {
  ClockCircleOutlined,
  FileTextOutlined,
  HomeOutlined,
  ShoppingCartOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import type { ReturnOrderStats as ReturnOrderStatsType, ReturnOrderStatus } from '@/types/procurement-return';
import { useMobileDetect } from '../hooks/useMobileDetect';
import styles from '../index.less';

interface ReturnOrderStatsProps {
  stats: ReturnOrderStatsType;
  activeStatus?: ReturnOrderStatus;
  onStatusClick?: (status?: ReturnOrderStatus) => void;
}

const statusConfig: Array<{
  key: keyof ReturnOrderStatsType;
  status: ReturnOrderStatus | undefined;
  title: string;
  icon: React.ReactNode;
  color: string;
}> = [
  { key: 'pendingConfirm', status: 'pending_confirm', title: '待确认', icon: <ClockCircleOutlined />, color: '#1890ff' },
  { key: 'pendingErpFill', status: 'pending_erp_fill', title: '待填ERP', icon: <FileTextOutlined />, color: '#ff4d4f' },
  { key: 'pendingWarehouseExecute', status: 'pending_warehouse_execute', title: '待仓储退货', icon: <HomeOutlined />, color: '#fa8c16' },
  { key: 'pendingMarketingSale', status: 'pending_marketing_sale', title: '待营销销售', icon: <ShoppingCartOutlined />, color: '#722ed1' },
  { key: 'completed', status: 'completed', title: '已完成', icon: <CheckCircleOutlined />, color: '#52c41a' },
];

const ReturnOrderStats: React.FC<ReturnOrderStatsProps> = ({
  stats,
  activeStatus,
  onStatusClick,
}) => {
  const isMobile = useMobileDetect();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // 处理滚动进度
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    const maxScroll = scrollWidth - clientWidth;
    const progress = maxScroll > 0 ? scrollLeft / maxScroll : 0;
    setScrollProgress(progress);
    setIsScrolling(true);

    // 清除之前的定时器
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    // 滚动停止后 100ms 解除滚动状态
    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, 100);
  };

  // 清理定时器
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // 处理点击
  const handleClick = (status?: ReturnOrderStatus) => {
    // 滚动中不触发点击
    if (isScrolling) return;
    
    if (activeStatus === status) {
      onStatusClick?.(undefined);
    } else {
      onStatusClick?.(status);
    }
  };

  // 触摸开始记录位置
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  // 触摸结束判断是否为点击
  const handleTouchEnd = (e: React.TouchEvent, status?: ReturnOrderStatus) => {
    if (!touchStartRef.current) return;
    
    const touchEnd = {
      x: e.changedTouches[0].clientX,
      y: e.changedTouches[0].clientY,
    };
    
    const distance = Math.sqrt(
      Math.pow(touchEnd.x - touchStartRef.current.x, 2) +
      Math.pow(touchEnd.y - touchStartRef.current.y, 2)
    );
    
    // 移动距离小于 5px 才算点击
    if (distance < 5) {
      handleClick(status);
    }
    
    touchStartRef.current = null;
  };

  return (
    <div className={styles.statsRowWrapper}>
      <div 
        ref={scrollRef}
        className={styles.statsRow} 
        onScroll={isMobile ? handleScroll : undefined}
      >
        {statusConfig.map(({ key, status, title, icon, color }) => {
          const isActive = activeStatus === status;
          return (
            <div
              key={key}
              className={`${styles.statsCard} ${isActive ? styles.statsCardActive : ''}`}
              onClick={() => !isMobile && handleClick(status)}
              onTouchStart={isMobile ? handleTouchStart : undefined}
              onTouchEnd={isMobile ? (e) => handleTouchEnd(e, status) : undefined}
              style={{
                borderColor: isActive ? color : undefined,
                backgroundColor: isActive ? `${color}08` : undefined,
              }}
            >
              <span className={styles.statsCardIcon} style={{ color }}>
                {icon}
              </span>
              <span className={styles.statsCardValue} style={{ color }}>
                {stats[key]}
              </span>
              <span className={styles.statsCardTitle}>{title}</span>
              {isActive && (
                <div
                  className={styles.statsCardIndicator}
                  style={{ backgroundColor: color }}
                />
              )}
            </div>
          );
        })}
      </div>
      
      {/* 移动端滚动指示器 */}
      {isMobile && (
        <div className={styles.scrollIndicator}>
          <div 
            className={styles.scrollIndicatorBar}
            style={{ 
              width: `${Math.max(20, (scrollRef.current?.clientWidth || 0) / (scrollRef.current?.scrollWidth || 1) * 100)}%`,
              transform: `translateX(${scrollProgress * 100}%)` 
            }}
          />
        </div>
      )}
    </div>
  );
};

export { ReturnOrderStats, statusConfig };
export default ReturnOrderStats;
