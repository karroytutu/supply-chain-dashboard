/**
 * 移动端检测 Hook
 * 用于响应式布局切换
 */
import { useState, useEffect } from 'react';

interface UseMobileDetectOptions {
  /** 断点宽度，默认 768px */
  breakpoint?: number;
}

interface UseMobileDetectReturn {
  /** 是否为移动端 */
  isMobile: boolean;
  /** 当前屏幕宽度 */
  screenWidth: number;
}

/**
 * 检测当前是否为移动端设备
 * @param options 配置选项
 * @returns 移动端状态和屏幕宽度
 */
export function useMobileDetect(options?: UseMobileDetectOptions): UseMobileDetectReturn {
  const { breakpoint = 768 } = options || {};
  const [isMobile, setIsMobile] = useState(false);
  const [screenWidth, setScreenWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 0
  );

  useEffect(() => {
    const checkMobile = () => {
      const width = window.innerWidth;
      setScreenWidth(width);
      setIsMobile(width <= breakpoint);
    };

    // 初始检测
    checkMobile();

    // 监听窗口变化
    window.addEventListener('resize', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, [breakpoint]);

  return { isMobile, screenWidth };
}

export default useMobileDetect;
