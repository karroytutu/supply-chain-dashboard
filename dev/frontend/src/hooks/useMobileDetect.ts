/**
 * 移动端检测 Hook
 * @module hooks/useMobileDetect
 *
 * useMobileDetect: 基于 resize 事件，固定 768px 断点
 * useIsMobile: 基于 matchMedia（更高效），支持自定义断点
 */
import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;

export function useMobileDetect(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const checkMobile = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
      }, 150); // 防抖 150ms，避免窗口在断点边界反复抖动
    };

    // 初始检查（不防抖）
    setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    window.addEventListener('resize', checkMobile);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  return isMobile;
}

/**
 * 基于 matchMedia 的移动端检测（比 resize 更高效）
 * @param breakpoint 断点像素值，默认 768
 */
export function useIsMobile(breakpoint = MOBILE_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= breakpoint : false
  );
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

export default useMobileDetect;
